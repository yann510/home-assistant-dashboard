"""Fixed-account, two-stage Connect launches with retained effect lifetimes."""
import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
import time
from .models import LIKED_SONGS_URI, validate_playback_context, MusicError, validate_uri


class TopologyBusy(Exception):
    pass


@dataclass(frozen=True)
class SpeakerSnapshot:
    source: str
    members: tuple
    groups: tuple
    follow: tuple


class SpeakerPort:
    def __init__(self, hass, account_entity, speakers):
        self.hass, self.account_entity = hass, account_entity
        self.speakers = frozenset(speakers)

    async def authorize(self, user_id, members, write=True):
        user = await self.hass.auth.async_get_user(user_id) if user_id else None
        if user is None or not getattr(user, 'is_active', False):
            raise MusicError('auth_required')
        permissions = getattr(user, 'permissions', None)
        if permissions is None or any(not permissions.check_entity(entity, permission)
                for entity in {self.account_entity, *members} for permission in (('read', 'control') if write else ('read',))):
            raise MusicError('forbidden')

    def _state(self, entity):
        state = self.hass.states.get(entity)
        if state is None or state.state in ('unavailable', 'unknown'):
            raise TopologyBusy
        return state

    def snapshot(self, selected):
        if not isinstance(selected, str) or selected not in self.speakers:
            raise MusicError('invalid_request')
        from ..house_moods.sonos import FOLLOW, FOLLOW_SOURCE, FOLLOW_SCRIPT
        if self._state(FOLLOW_SCRIPT).state != 'off':
            raise TopologyBusy
        following, source = self._state(FOLLOW).state, self._state(FOLLOW_SOURCE).state
        if following not in ('on', 'off') or source not in ('', *self.speakers) or (following == 'on' and not source):
            raise TopologyBusy
        reports = {}
        for entity in self.speakers:
            members = self._state(entity).attributes.get('group_members')
            if (not isinstance(members, list) or not members or entity not in members
                    or any(not isinstance(e, str) or e not in self.speakers for e in members)
                    or len(set(members)) != len(members)):
                raise TopologyBusy
            reports[entity] = (members[0], *sorted(members[1:]))
        if any(reports[member] != group for group in reports.values() for member in group):
            raise TopologyBusy
        group = reports[source if following == 'on' else selected]
        return SpeakerSnapshot(group[0], group, tuple(sorted(set(reports.values()))), (following, source))

    @asynccontextmanager
    async def supersede_mood(self, snapshot, context_id):
        runtime = self.hass.data.get('house_moods')
        if runtime is None:
            yield
        else:
            transaction = getattr(runtime, 'manual_playback', None)
            if transaction is None:
                raise MusicError('unavailable')
            async with transaction(snapshot.source, context_id):
                yield

    def confirm_sonos_playing(self, snapshot):
        return self._state(snapshot.source).state == 'playing'


@dataclass
class Request:
    payload: tuple
    future: asyncio.Future
    deadline: float
    source: str
    members: tuple = ()
    completed: float | None = None
    effect_started: bool = False


class PlaybackController:
    deadline = 30
    poll_interval = .5
    retention = 300
    max_results = 128

    def __init__(self, library, gateway, speakers, clock=time.monotonic):
        self.library, self.gateway, self.speakers = library, gateway, speakers
        self.clock = clock
        self.requests = {}
        self._active = None
        self.closed = False

    def _result(self, request_id, request, status, message=None):
        result = {'request_id': request_id, 'status': status, 'source_entity': request.source,
                  'playlist_uri': request.payload[0]}
        if message:
            result['message'] = message
        return result

    def _finish(self, request_id, request, status, message=None):
        if not request.future.done():
            request.completed = self.clock()
            request.future.set_result(self._result(request_id, request, status, message))
        return request.future.result()

    def _current(self, request, selected, snapshot):
        return (not self.closed and not request.future.done() and asyncio.get_running_loop().time() < request.deadline
                and self.speakers.snapshot(selected) == snapshot)

    @staticmethod
    def _matches(state, account, device, uri):
        return (state.account_id == account and state.device_id == device and state.context_uri == uri
                and state.is_playing is True and state.is_connect is True)

    async def play(self, playlist_uri, source_entity, request_id, user_id, context_id=None):
        if self.closed:
            raise MusicError('unavailable')
        validate_playback_context(playlist_uri)
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 256:
            raise MusicError('invalid_request')
        if not isinstance(user_id, str) or not user_id:
            raise MusicError('auth_required')
        await self.speakers.authorize(user_id, ())
        account = self.gateway.verify_account()
        key, payload = (account, user_id, request_id), (playlist_uri, source_entity)
        for old_key, old in tuple(self.requests.items()):
            if old.completed is not None and self.clock() - old.completed >= self.retention:
                self.requests.pop(old_key)
        request = self.requests.get(key)
        if request is not None:
            if request.payload != payload:
                raise MusicError('invalid_request')
            await self.speakers.authorize(user_id, request.members)
        else:
            request = Request(payload, asyncio.get_running_loop().create_future(),
                              asyncio.get_running_loop().time() + self.deadline, source_entity)
            if (self._active is not None and not self._active.done()) or len(self.requests) >= self.max_results:
                if len(self.requests) < self.max_results:
                    self.requests[key] = request
                    return self._finish(request_id, request, 'busy', 'An earlier Spotify request is still finishing. Please try again.')
                return self._result(request_id, request, 'busy', 'An earlier Spotify request is still finishing. Please try again.')
            try:
                snapshot = self.speakers.snapshot(source_entity)
            except TopologyBusy:
                self.requests[key] = request
                return self._finish(request_id, request, 'busy', 'Speakers are updating. Please try again once they settle.')
            await self.speakers.authorize(user_id, snapshot.members)
            # Authorization may yield; reserve the account only after it returns.
            existing = self.requests.get(key)
            if existing is not None:
                if existing.payload != payload:
                    raise MusicError('invalid_request')
                request = existing
            elif (self._active is not None and not self._active.done()) or len(self.requests) >= self.max_results:
                if len(self.requests) < self.max_results:
                    self.requests[key] = request
                    return self._finish(request_id, request, 'busy', 'An earlier Spotify request is still finishing. Please try again.')
                return self._result(request_id, request, 'busy', 'An earlier Spotify request is still finishing. Please try again.')
            else:
                request.source = snapshot.source
                request.members = snapshot.members
                self.requests[key] = request
                self._active = asyncio.create_task(self._run(request_id, request, account, user_id, snapshot, context_id or request_id))
        try:
            async with asyncio.timeout(max(0, request.deadline - asyncio.get_running_loop().time())):
                return await asyncio.shield(request.future)
        except TimeoutError:
            return self._finish(request_id, request, 'unconfirmed', 'Spotify has not confirmed this request. Refresh playback before retrying.')
        except asyncio.CancelledError:
            self._finish(request_id, request, 'unconfirmed', 'The request was interrupted. Refresh playback before retrying.')
            raise

    async def _confirm(self, request, selected, snapshot, account, device, uri, sonos=False):
        while self._current(request, selected, snapshot):
            async with asyncio.timeout_at(request.deadline):
                state = await self.gateway.playback_state()
            if self._matches(state, account, device, uri) and (not sonos or self.speakers.confirm_sonos_playing(snapshot)):
                return self._current(request, selected, snapshot)
            await asyncio.sleep(self.poll_interval)
        return False

    async def _run(self, request_id, request, account, user_id, snapshot, context_id):
        uri, selected = request.payload
        try:
            async with asyncio.timeout_at(request.deadline):
                if not await self.library.contains_playlist(uri):
                    raise MusicError('unavailable', 'This playlist is no longer in your Spotify library. Refresh playlists and try again.')
                if not self._current(request, selected, snapshot):
                    self._finish(request_id, request, 'unconfirmed')
                    return
                target = await self.gateway.resolve_device(snapshot.source)
                if not self._current(request, selected, snapshot):
                    self._finish(request_id, request, 'unconfirmed')
                    return
                state = await self.gateway.playback_state()
                already = self._matches(state, account, target, uri) and self.speakers.confirm_sonos_playing(snapshot)
                # A missing relay must not relinquish a mood when no launch can run.
                # Positively confirmed no-op requests need no relay at all.
                relay = None if already else await self.gateway.resolve_relay()
                if not self._current(request, selected, snapshot):
                    self._finish(request_id, request, 'unconfirmed')
                    return
            async with self.speakers.supersede_mood(snapshot, context_id):
                try:
                    await self.speakers.authorize(user_id, snapshot.members)
                    state = await self.gateway.playback_state()
                    if not self._current(request, selected, snapshot):
                        self._finish(request_id, request, 'unconfirmed')
                    elif self._matches(state, account, target, uri) and self.speakers.confirm_sonos_playing(snapshot):
                        self._finish(request_id, request, 'already_playing')
                    else:
                        relay = relay or await self.gateway.resolve_relay()
                        if not self._current(request, selected, snapshot):
                            self._finish(request_id, request, 'unconfirmed')
                            return
                        request.effect_started = True
                        await self.gateway.start_playlist(uri, relay, guard=lambda: self._current(request, selected, snapshot))
                        if not await self._confirm(request, selected, snapshot, account, relay, uri):
                            self._finish(request_id, request, 'unconfirmed')
                            return
                        await self.speakers.authorize(user_id, snapshot.members)
                        if not self._current(request, selected, snapshot):
                            self._finish(request_id, request, 'unconfirmed')
                            return
                        await self.gateway.handoff(target, guard=lambda: self._current(request, selected, snapshot))
                        confirmed = await self._confirm(request, selected, snapshot, account, target, uri, sonos=True)
                        self._finish(request_id, request, 'confirmed' if confirmed else 'unconfirmed')
                finally:
                    # Keep the mood and account gates even when an adapter's
                    # shorter deadline expires before its actual HA service.
                    await self.gateway.wait_playback_settled()
        except asyncio.CancelledError:
            self._finish(request_id, request, 'unconfirmed')
            raise
        except Exception as error:
            message = str(error) if isinstance(error, MusicError) else 'Spotify could not complete this request. Please try again.'
            self._finish(request_id, request, 'unconfirmed' if request.effect_started else 'failed', message)

    async def wait_settled(self):
        if self._active:
            await asyncio.shield(self._active)

    async def close(self):
        self.closed = True
        for key, request in self.requests.items():
            self._finish(key[2], request, 'unconfirmed', 'Home Assistant is stopping. Refresh playback after restart.')
