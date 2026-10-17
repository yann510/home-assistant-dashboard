"""Adapter for the pinned SpotifyPlus HA services and one trusted account."""
import asyncio
import math
import time
from .models import MusicError, PlaybackState, validate_page, validate_uri

REQUIRED_SCOPES = frozenset(('playlist-read-private', 'playlist-read-collaborative', 'user-library-read', 'user-library-modify'))
LIBRARY_SERVICES = ('get_playlist_favorites', 'check_track_favorites', 'save_track_favorites', 'remove_track_favorites')


def _provider_error(error):
    """SpotifyPlus wraps exceptions; inspect structured causes, never parse secrets."""
    seen = set()
    while error is not None and id(error) not in seen:
        seen.add(id(error))
        status = getattr(error, 'Status', getattr(error, 'status', getattr(error, 'status_code', None)))
        if status == 429:
            headers = getattr(error, 'headers', {}) or {}
            return MusicError('rate_limited', retry_after=getattr(error, 'RetryAfter', headers.get('Retry-After', 1)))
        if status in (401, 403):
            return MusicError('auth_required')
        error = error.__cause__ or error.__context__
    return MusicError('unavailable')


def _result(response, account_id):
    """In-process HA response is {user_profile,result}, not REST service_response."""
    if not isinstance(response, dict):
        raise MusicError('unavailable')
    profile = response.get('user_profile')
    if not isinstance(profile, dict) or profile.get('id') != account_id:
        raise MusicError('auth_required')
    return response.get('result')


def _playlist_page(result, offset, limit):
    if not isinstance(result, dict) or not isinstance(result.get('items'), list):
        raise MusicError('unavailable')
    total = result.get('total')
    if type(total) is not int or total < 0 or result.get('offset') != offset or result.get('limit') != limit:
        raise MusicError('unavailable')
    if len(result['items']) > limit or (result.get('next') and offset + limit > 100000):
        raise MusicError('unavailable')
    items, seen = [], set()
    for raw in result['items']:
        if raw is None:  # Spotify can return inaccessible/deleted playlist slots.
            continue
        if not isinstance(raw, dict):
            raise MusicError('unavailable')
        uri = raw.get('uri')
        try:
            validate_uri(uri, 'playlist')
        except MusicError:
            raise MusicError('unavailable') from None
        if uri in seen:
            continue
        seen.add(uri)
        owner = raw.get('owner') or {}
        if not isinstance(owner, dict):
            raise MusicError('unavailable')
        item = {'uri': uri, 'title': raw.get('name') or 'Untitled playlist',
                'owner': owner.get('display_name') or owner.get('id') or ''}
        if not isinstance(item['title'], str) or not isinstance(item['owner'], str):
            raise MusicError('unavailable')
        images = raw.get('images') or []
        thumbnail = raw.get('image_url') or (images[0].get('url') if images and isinstance(images[0], dict) else None)
        if isinstance(thumbnail, str) and thumbnail.startswith('https://'):
            item['thumbnail'] = thumbnail
        items.append(item)
    # Preserve upstream slot-based pagination, including nulls and duplicates.
    # Never fetch an upstream URL; clients supply integer offsets only.
    return {'items': items, 'nextOffset': offset + limit if result.get('next') else None, 'total': total}


class SpotifyGateway:
    call_timeout = 12
    max_pending_mutations = 8
    max_uncertain_tracks = 500

    def __init__(self, hass, entity_id, registry_get, clock=time.monotonic):
        self.hass = hass
        self.entity_id = entity_id
        self.registry_get = registry_get
        self.clock = clock
        self.account_id = None
        self._blocked_until = 0
        self._entry_id = None
        self._pending_mutations = {}
        self._uncertain_tracks = set()
        self._track_reads = {}

    def verify_account(self):
        entity = self.registry_get(self.entity_id)
        if entity is None or entity.platform != 'spotifyplus' or not entity.config_entry_id:
            raise MusicError('not_configured')
        entry = self.hass.config_entries.async_get_entry(entity.config_entry_id)
        if entry is None or entry.domain != 'spotifyplus':
            raise MusicError('not_configured')
        account = entry.data.get('id')
        if not isinstance(account, str) or not account or entry.unique_id != account + '_spotifyplus' or entity.unique_id != entry.unique_id:
            raise MusicError('auth_required')
        if self.account_id is not None and (account != self.account_id or entry.entry_id != self._entry_id):
            raise MusicError('auth_required')
        runtime = self.hass.data.get('spotifyplus', {}).get(entry.entry_id)
        if runtime is None:
            raise MusicError('unavailable')
        profile = getattr(getattr(runtime, 'spotifyClient', None), 'UserProfile', None)
        if getattr(profile, 'Id', None) != account:
            raise MusicError('auth_required')
        state = self.hass.states.get(self.entity_id)
        if state and state.attributes.get('sp_user_id') not in (None, account):
            raise MusicError('auth_required')
        token = getattr(getattr(runtime, 'session', None), 'token', {})
        scope = token.get('scope', '') if isinstance(token, dict) else ''
        if not isinstance(scope, str) or not REQUIRED_SCOPES <= set(scope.split()):
            raise MusicError('auth_required')
        if any(not self.hass.services.has_service('spotifyplus', name) for name in LIBRARY_SERVICES):
            raise MusicError('unavailable')
        self.account_id, self._entry_id = account, entry.entry_id
        return account

    async def _execute_call(self, name, data, response=True):
        account = self.verify_account()
        remaining = self._blocked_until - self.clock()
        if remaining > 0:
            raise MusicError('rate_limited', retry_after=math.ceil(remaining))
        try:
            result = await self.hass.services.async_call('spotifyplus', name,
                {'entity_id': self.entity_id, **data}, blocking=True, return_response=response)
        except Exception as error:
            public = _provider_error(error)
            if public.code == 'rate_limited':
                self._blocked_until = self.clock() + public.retry_after
            raise public from None
        self.verify_account()
        return _result(result, account) if response else None

    async def _call(self, name, data, response=True):
        try:
            async with asyncio.timeout(self.call_timeout):
                return await self._execute_call(name, data, response)
        except TimeoutError:
            raise MusicError('unavailable') from None

    def _check_track_settled(self, uri):
        pending = self._pending_mutations.get(uri)
        if pending is not None and not pending.done():
            raise MusicError('unavailable', 'Spotify is still finishing an earlier song save. Refresh before trying again.')

    def saved_state_current(self, uri):
        """A cached confirmation cannot hide pending or late provider effects."""
        pending = self._pending_mutations.get(uri)
        return uri not in self._uncertain_tracks and (pending is None or pending.done())

    async def _mutate_track(self, uri, name, data):
        self._check_track_settled(uri)
        if (len(self._pending_mutations) >= self.max_pending_mutations
                or (uri not in self._uncertain_tracks and len(self._uncertain_tracks) >= self.max_uncertain_tracks)):
            raise MusicError('unavailable')
        # Invalidate reads already in flight before any provider effect can run.
        for read in self._track_reads.get(uri, ()):
            read.set()
        self._uncertain_tracks.add(uri)
        operation = asyncio.create_task(self._execute_call(name, data, response=False))
        self._pending_mutations[uri] = operation
        def settled(done):
            if self._pending_mutations.get(uri) is done:
                self._pending_mutations.pop(uri)
            # Completion only establishes that no effect is still in flight.
            # A fresh successful read must establish the resulting saved state.
            if not done.cancelled():
                done.exception()
        operation.add_done_callback(settled)
        try:
            async with asyncio.timeout(self.call_timeout):
                # The service may await a non-cancellable executor operation.
                # Caller cancellation/deadline must not cancel that lifetime.
                await asyncio.shield(operation)
        except TimeoutError:
            raise MusicError('unavailable') from None

    async def list_playlists(self, offset: int, limit: int) -> dict:
        validate_page(offset, limit)
        if offset > 10000:
            raise MusicError('unavailable', 'SpotifyPlus cannot read playlist offsets above 10000. Your loaded playlists are still available.')
        result = await self._call('get_playlist_favorites', {'offset': offset, 'limit': limit, 'sort_result': False})
        return _playlist_page(result, offset, limit)

    async def track_saved(self, track_uri: str) -> bool:
        validate_uri(track_uri, 'track')
        self._check_track_settled(track_uri)
        read = asyncio.Event()
        reads = self._track_reads.setdefault(track_uri, set())
        reads.add(read)
        try:
            result = await self._call('check_track_favorites', {'ids': track_uri.rsplit(':', 1)[1]})
            if read.is_set() or not isinstance(result, dict) or type(result.get(track_uri)) is not bool:
                raise MusicError('unavailable')
            self._check_track_settled(track_uri)
            self._uncertain_tracks.discard(track_uri)
            return result[track_uri]
        finally:
            reads.discard(read)
            if not reads:
                self._track_reads.pop(track_uri)

    async def set_track_saved(self, track_uri: str, saved: bool) -> None:
        validate_uri(track_uri, 'track')
        if type(saved) is not bool:
            raise MusicError('invalid_request')
        self._check_track_settled(track_uri)
        if track_uri in self._uncertain_tracks:
            await self.track_saved(track_uri)
        await self._mutate_track(track_uri, 'save_track_favorites' if saved else 'remove_track_favorites',
                                 {'ids': track_uri.rsplit(':', 1)[1]})

    # Task 3 supplies the Connect orchestration after real-device acceptance.
    async def resolve_device(self, source_entity: str) -> str:
        raise MusicError('not_configured')

    async def start_playlist(self, playlist_uri: str, device_id: str) -> None:
        raise MusicError('not_configured')

    async def playback_state(self) -> PlaybackState:
        raise MusicError('not_configured')
