"""Adapter for the pinned SpotifyPlus HA services and one trusted account."""
import asyncio
import math
import time
import ipaddress
import re
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

    def __init__(self, hass, entity_id, registry_get, clock=time.monotonic, relay_device_id=None, device_registry_get=None):
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
        self.relay_device_id = relay_device_id
        self.device_registry_get = device_registry_get
        self._devices = {}
        self._targets = {}
        self._pending_playback = set()

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

    def _verify_playback(self, write=False):
        account = self.verify_account()
        runtime = self.hass.data['spotifyplus'][self._entry_id]
        scope = runtime.session.token.get('scope', '')
        required = {'user-read-playback-state', 'user-read-private'} | ({'user-modify-playback-state'} if write else set())
        if not required <= set(scope.split()):
            raise MusicError('auth_required')
        services = {'get_spotify_connect_devices', 'get_player_playback_state'}
        if write:
            services.update(('player_media_play_context', 'zeroconf_device_connect', 'player_transfer_playback'))
        if any(not self.hass.services.has_service('spotifyplus', name) for name in services):
            raise MusicError('unavailable')
        return account

    async def _discovery(self):
        self._verify_playback()
        result = await self._call('get_spotify_connect_devices', {'refresh': True})
        if not isinstance(result, dict) or not isinstance(result.get('Items'), list):
            raise MusicError('unavailable')
        devices, aliases = {}, {}
        for raw in result['Items']:
            if not isinstance(raw, dict) or not isinstance(raw.get('DeviceInfo'), dict):
                raise MusicError('unavailable')
            ident = raw.get('Id')
            if not isinstance(ident, str) or not re.fullmatch('[0-9a-f]{40}', ident) or ident in devices:
                raise MusicError('unavailable')
            names = {name.strip().casefold() for name in (raw.get('Name'), raw['DeviceInfo'].get('RemoteName')) if isinstance(name, str) and name.strip()}
            if not names:
                raise MusicError('unavailable')
            for name in names:
                if name in aliases and aliases[name] != ident:
                    # SpotifyPlus normalizes restricted IDs using device names.
                    # Ambiguous dynamic, Sonos or alias entries cannot confirm.
                    raise MusicError('unavailable')
                aliases[name] = ident
            devices[ident] = raw
        self._devices = devices
        return devices

    def _sonos_device(self, source_entity, devices):
        entity = self.registry_get(source_entity)
        device = self.device_registry_get(entity.device_id) if entity and getattr(entity, 'platform', None) == 'sonos' and self.device_registry_get else None
        identifiers = [ident for domain, ident in getattr(device, 'identifiers', ()) if domain == 'sonos' and isinstance(ident, str) and re.fullmatch('RINCON_[0-9A-Fa-f]+', ident)]
        if len(identifiers) != 1:
            raise MusicError('unavailable')
        rincon = identifiers[0].casefold()
        candidates = []
        for raw in devices.values():
            discovery = raw.get('DiscoveryResult') or {}
            name = discovery.get('Name')
            match = re.fullmatch(r'sonos(RINCON_[0-9A-Fa-f]+)\._spotify-connect\._tcp\.local\.', name) if isinstance(name, str) else None
            if raw.get('IsSonos') is True and match and match[1].casefold() == rincon:
                if (raw['DeviceInfo'].get('DeviceId') != raw['Id']
                        or raw['DeviceInfo'].get('TokenType') != 'authorization_code'
                        or discovery.get('Key', '').casefold() != name.casefold()):
                    raise MusicError('unavailable')
                candidates.append(raw)
        if len(candidates) != 1:
            raise MusicError('unavailable')
        return candidates[0]

    async def resolve_device(self, source_entity: str) -> str:
        from ..house_moods.sonos import SPEAKERS
        if source_entity not in SPEAKERS:
            raise MusicError('invalid_request')
        raw = self._sonos_device(source_entity, await self._discovery())
        self._targets[raw['Id']] = source_entity
        return raw['Id']

    def _relay(self, devices):
        if not isinstance(self.relay_device_id, str) or not re.fullmatch('[0-9a-f]{40}', self.relay_device_id):
            raise MusicError('not_configured', 'Spotify playback relay is not configured.')
        raw = devices.get(self.relay_device_id)
        if (not raw or raw.get('IsSonos') is not False or raw.get('IsRestricted') is not False
                or raw.get('IsInDeviceList') is not True or raw['DeviceInfo'].get('DeviceId') != self.relay_device_id
                or raw['DeviceInfo'].get('IsAvailable') is not True):
            raise MusicError('unavailable', 'The configured Spotify playback relay is unavailable.')
        return raw

    async def resolve_relay(self):
        self._verify_playback(write=True)
        if self.relay_device_id is None:
            raise MusicError('not_configured', 'Spotify playback relay is not configured.')
        return self._relay(await self._discovery())['Id']

    async def _playback_mutation(self, name, data, response=False, guard=lambda: True):
        self._verify_playback(write=True)
        if self._pending_playback:
            raise MusicError('unavailable', 'An earlier Spotify playback command is still finishing.')
        async def execute():
            # Task scheduling and the preceding discovery both yield. Recheck
            # intent in the delegated task, with no await before service dispatch.
            if not guard():
                raise MusicError('unavailable')
            return await self._execute_call(name, data, response)
        operation = asyncio.create_task(execute())
        self._pending_playback.add(operation)
        def settled(done):
            self._pending_playback.discard(done)
            if not done.cancelled():
                done.exception()
        operation.add_done_callback(settled)
        try:
            async with asyncio.timeout(self.call_timeout):
                return await asyncio.shield(operation)
        except TimeoutError:
            raise MusicError('unavailable') from None

    async def wait_playback_settled(self):
        while self._pending_playback:
            await asyncio.gather(*(asyncio.shield(task) for task in tuple(self._pending_playback)), return_exceptions=True)

    async def start_playlist(self, playlist_uri: str, device_id: str, guard=lambda: True) -> None:
        validate_uri(playlist_uri, 'playlist')
        relay = self._relay(await self._discovery())
        if device_id != relay['Id']:
            raise MusicError('invalid_request')
        # Never send context-play to Sonos: this pinned provider would use its
        # local queue. The verified non-Sonos relay takes the Connect API route.
        await self._playback_mutation('player_media_play_context', {'context_uri': playlist_uri, 'device_id': device_id, 'delay': .5}, guard=guard)

    async def handoff(self, device_id, guard=lambda: True):
        source = self._targets.get(device_id)
        if source is None:
            raise MusicError('invalid_request')
        devices = await self._discovery()
        target, relay = self._sonos_device(source, devices), self._relay(devices)
        if target['Id'] != device_id or not guard():
            raise MusicError('unavailable')
        network = self._sonos_network(target)
        account = self._verify_playback(write=True)
        activated = await self._playback_mutation('zeroconf_device_connect', {
            **network, 'username': account, 'password': '', 'loginid': account, 'pre_disconnect': False,
            'verify_device_list_entry': False, 'delay': .5}, response=True, guard=guard)
        if not isinstance(activated, dict) or activated.get('Status') != 101 or activated.get('SpotifyError') != 0 or not guard():
            raise MusicError('unavailable')
        # force_activate_device is retained for the verified service payload;
        # it does not substitute for the unconditional Zeroconf step above.
        await self._playback_mutation('player_transfer_playback', {'device_id': device_id, 'device_id_from': relay['Id'],
            'play': True, 'delay': .5, 'force_activate_device': True}, guard=guard)

    @staticmethod
    def _sonos_network(raw):
        discovery = raw.get('DiscoveryResult') or {}
        try:
            host = str(ipaddress.IPv4Address(discovery.get('HostIpAddress')))
        except ipaddress.AddressValueError:
            raise MusicError('unavailable') from None
        port, path, version = discovery.get('HostIpPort'), discovery.get('SpotifyConnectCPath'), discovery.get('SpotifyConnectVersion')
        if type(port) is not int or not 1 <= port <= 65535 or path != '/spotifyzc' or version != '1' or not ipaddress.ip_address(host).is_private:
            raise MusicError('unavailable')
        return {'host_ipv4_address': host, 'host_ip_port': port, 'cpath': path, 'version': version, 'use_ssl': False}

    async def _native_sonos_names(self, devices):
        """Read actual group names; discovery names can remain the solo names."""
        from ..house_moods.sonos import SPEAKERS
        sonos = []
        for raw in devices.values():
            if raw.get('IsSonos') is not True:
                continue
            matches = []
            for entity in SPEAKERS:
                try:
                    self._sonos_device(entity, {raw['Id']: raw})
                    matches.append(entity)
                except MusicError:
                    pass
            if len(matches) != 1:
                raise MusicError('unavailable')
            source = matches[0]
            state = self.hass.states.get(source)
            group = state.attributes.get('group_members') if state else None
            if (not isinstance(group, list) or not group or source not in group or len(set(group)) != len(group)
                    or any(member not in SPEAKERS for member in group)):
                raise MusicError('unavailable')
            for member in group:
                reported = self.hass.states.get(member)
                members = reported.attributes.get('group_members') if reported else None
                if not isinstance(members, list) or not members or members[0] != group[0] or set(members) != set(group):
                    raise MusicError('unavailable')
            if group[0] == source:
                sonos.append(raw)
            # Stale discovery may still list a just-joined follower. Its Connect
            # endpoint is disabled; only the actual HA coordinator is an output.
        if len(sonos) > 16 or not self.hass.services.has_service('spotifyplus', 'zeroconf_device_getinfo'):
            raise MusicError('unavailable')
        semaphore = asyncio.Semaphore(4)
        async def read(raw):
            async with semaphore:
                info = await self._call('zeroconf_device_getinfo', self._sonos_network(raw))
                if (not isinstance(info, dict) or info.get('Status') != 101 or info.get('DeviceId') != raw['Id']
                        or info.get('BrandDisplayName') != 'Sonos' or info.get('TokenType') != 'authorization_code'
                        or not isinstance(info.get('RemoteName'), str) or not info['RemoteName'].strip()
                        or not isinstance(info.get('Aliases'), list)):
                    raise MusicError('unavailable')
                return raw, info
        async with asyncio.timeout(self.call_timeout):
            responses = await asyncio.gather(*(read(raw) for raw in sonos))
        names = {}
        def record(name, ident):
            key = name.strip().casefold()
            if not key or (key in names and names[key] != ident):
                raise MusicError('unavailable')
            names[key] = ident
        for raw in devices.values():
            if raw.get('IsSonos') is not True:
                for name in (raw.get('Name'), raw['DeviceInfo'].get('RemoteName')):
                    if isinstance(name, str) and name.strip():
                        record(name, raw['Id'])
        for raw, info in responses:
            record(info['RemoteName'], raw['Id'])
            for alias in info['Aliases']:
                if not isinstance(alias, dict) or not isinstance(alias.get('Name'), str):
                    raise MusicError('unavailable')
                record(alias['Name'], raw['Id'])
        # Match exact native RemoteName only. Aliases guard ambiguity but cannot
        # guess a different native target or invent the provider's group suffix.
        return {info['RemoteName']: raw['Id'] for raw, info in responses}

    async def playback_state(self) -> PlaybackState:
        account = self._verify_playback()
        devices = await self._discovery()
        result = await self._call('get_player_playback_state', {})
        if not isinstance(result, dict):
            raise MusicError('unavailable')
        device, context, item = result.get('device') or {}, result.get('context') or {}, result.get('item') or {}
        if any(not isinstance(value, dict) for value in (device, context, item)):
            raise MusicError('unavailable')
        ident, connect = device.get('id'), None
        native_names = {}
        if device.get('is_restricted') is True and result.get('is_device_state') is not True:
            native_names = await self._native_sonos_names(devices)
            native_id = native_names.get(device.get('name'))
            if native_id and ident in (None, '', native_id):
                ident = native_id
        known = devices.get(ident) if isinstance(ident, str) else None
        if known and result.get('is_device_state') is not True:
            if known.get('IsSonos') is True and ident in self._targets:
                source = self._targets[ident]
                resolved = self._sonos_device(source, devices)
                native = self.hass.states.get(source)
                name_matches = (native_names.get(device.get('name')) == ident if device.get('is_restricted') is True
                                else device.get('name') == resolved.get('Name'))
                connect = (resolved['Id'] == ident and name_matches and native is not None
                           and native.attributes.get('source') == 'Spotify Connect'
                           and result.get('device_music_source') in (None, 'SPOTIFY_CONNECT'))
            elif known.get('IsSonos') is False:
                connect = (known.get('IsRestricted') is False and known.get('IsInDeviceList') is True
                           and device.get('is_restricted') is False)
        track = None
        if item.get('type') == 'track' and item.get('is_local') is not True:
            try:
                track = validate_uri(item.get('uri'), 'track')
            except MusicError:
                pass
        return PlaybackState(account, ident, context.get('uri'), result.get('is_playing') if type(result.get('is_playing')) is bool else None,
                             connect, track)
