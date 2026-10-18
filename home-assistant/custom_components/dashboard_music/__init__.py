"""Authenticated fixed-account Spotify library. HA imports remain lazy."""
import asyncio
import re
from .gateway import SpotifyGateway
from .library import Library
from .models import MusicError
from .playback import PlaybackController, SpeakerPort

DOMAIN = 'dashboard_music'
SPEAKERS = frozenset(('media_player.bathroom', 'media_player.bedroom', 'media_player.gym', 'media_player.living_room'))
COMMANDS = ('playlists', 'track_saved', 'set_track_saved', 'current_track')


def validate_config(value):
    if not isinstance(value, dict) or not {'spotifyplus_entity', 'speakers'} <= set(value) or set(value) - {'spotifyplus_entity', 'speakers', 'relay_device_id'}:
        raise MusicError('invalid_request')
    if 'relay_device_id' in value and (not isinstance(value['relay_device_id'], str) or re.fullmatch(r'[0-9a-f]{40}', value['relay_device_id']) is None):
        raise MusicError('invalid_request')
    entity, speakers = value['spotifyplus_entity'], value['speakers']
    if not isinstance(entity, str) or re.fullmatch(r'media_player\.[a-z0-9_]+', entity) is None:
        raise MusicError('invalid_request')
    if not isinstance(speakers, list) or len(speakers) != 4 or any(not isinstance(s, str) for s in speakers) or set(speakers) != SPEAKERS:
        raise MusicError('invalid_request')
    return value


class Runtime:
    def __init__(self, hass, entity_id, speakers, library=None, registry_get=None, relay_device_id=None, device_registry_get=None):
        self.hass = hass
        self.entity_id = entity_id
        self.speakers = frozenset(speakers)
        self.gateway = None if library else SpotifyGateway(hass, entity_id, registry_get,
            relay_device_id=relay_device_id, device_registry_get=device_registry_get)
        self.library = library or Library(self.gateway)
        self.playback = PlaybackController(self.library, self.gateway, SpeakerPort(hass, entity_id, speakers)) if self.gateway else None
        self.relay_device_id = relay_device_id
        self.service_registered = False
        self.tasks = set()
        self.unsubscribers = []
        self.closed = False
        self.ws_handlers = {}

    def authorize(self, connection, write=False):
        user = getattr(connection, 'user', None)
        if user is None or not getattr(user, 'is_active', False):
            raise MusicError('auth_required')
        permissions = getattr(user, 'permissions', None)
        if permissions is None or not permissions.check_entity(self.entity_id, 'read') or (write and not permissions.check_entity(self.entity_id, 'control')):
            raise MusicError('forbidden')

    async def handle(self, connection, message):
        task = asyncio.current_task()
        self.tasks.add(task)
        try:
            if self.closed:
                raise MusicError('unavailable')
            kind = message.get('type', '').removeprefix(DOMAIN + '/')
            allowed = {'id', 'type'} | ({'offset', 'limit', 'refresh'} if kind == 'playlists' else {'track_uri', 'saved'} if kind == 'set_track_saved' else {'source_entity'} if kind == 'current_track' else {'track_uri'})
            if message.get('type') != DOMAIN + '/' + kind or kind not in COMMANDS or set(message) - allowed:
                raise MusicError('invalid_request')
            self.authorize(connection, kind == 'set_track_saved')
            # Check identity even on cache hits: reload/account/scopes may change.
            if self.gateway:
                self.gateway.verify_account()
            async with asyncio.timeout(30):
                if kind == 'playlists':
                    result = await self.library.page(message.get('offset', 0), message.get('limit', 50), message.get('refresh', False))
                elif kind == 'current_track':
                    result = await self.current_track(message.get('source_entity'), connection.user.id)
                elif kind == 'track_saved':
                    result = await self.library.saved_track(message.get('track_uri'))
                else:
                    result = await self.library.set_saved_track(message.get('track_uri'), message.get('saved'))
            connection.send_result(message['id'], result)
        except Exception as error:
            public = error if isinstance(error, MusicError) else MusicError('unavailable')
            payload = {'code': public.code, 'message': str(public)}
            if public.retry_after is not None:
                payload['retry_after'] = public.retry_after
            connection.send_message({'id': message['id'], 'type': 'result', 'success': False, 'error': payload})
        finally:
            self.tasks.discard(task)

    async def current_track(self, selected, user_id):
        from .playback import TopologyBusy
        if self.gateway is None:
            raise MusicError('not_configured')
        port = SpeakerPort(self.hass, self.entity_id, self.speakers)
        try:
            snapshot = port.snapshot(selected)
            await port.authorize(user_id, snapshot.members, write=False)
            answer = {'source_entity': snapshot.source, 'track_uri': None}
            native = self.hass.states.get(snapshot.source)
            if native.state not in ('playing', 'paused') or native.attributes.get('source') != 'Spotify Connect':
                return answer
            target = await self.gateway.resolve_device(snapshot.source)
            state = await self.gateway.playback_state()
            native = self.hass.states.get(snapshot.source)
            if (port.snapshot(selected) == snapshot and native.state in ('playing', 'paused')
                    and native.attributes.get('source') == 'Spotify Connect' and state.account_id == self.gateway.verify_account()
                    and state.device_id == target and state.is_connect is True and type(state.is_playing) is bool):
                answer['track_uri'] = state.track_uri
            return answer
        except TopologyBusy:
            raise MusicError('unavailable') from None

    async def close(self, _event=None):
        if self.closed:
            return
        self.closed = True
        if self.playback:
            await self.playback.close()
        for unsubscribe in self.unsubscribers:
            unsubscribe()
        current = asyncio.current_task()
        pending = [task for task in self.tasks if task is not current]
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        self.library.clear()
        if self.service_registered:
            self.hass.services.async_remove(DOMAIN, 'play_spotify')
        # HA 2026.9 has no unregister API. Remove only our own registered pair.
        handlers = getattr(self.hass, 'data', {}).get('websocket_api', {})
        for name, registered in self.ws_handlers.items():
            if handlers.get(name) is registered:
                handlers.pop(name)
        if getattr(self.hass, 'data', {}).get(DOMAIN) is self:
            self.hass.data.pop(DOMAIN)

    async def handle_play(self, call):
        if self.closed:
            raise MusicError('unavailable')
        if set(call.data) != {'playlist_uri', 'source_entity', 'request_id'}:
            raise MusicError('invalid_request')
        if self.playback is None:
            raise MusicError('not_configured')
        task = asyncio.current_task()
        self.tasks.add(task)
        try:
            return await self.playback.play(call.data['playlist_uri'], call.data['source_entity'],
                call.data['request_id'], call.context.user_id, context_id=call.context.id)
        finally:
            self.tasks.discard(task)


async def async_setup(hass, config):
    from homeassistant.components import websocket_api
    from homeassistant.const import EVENT_HOMEASSISTANT_STOP
    from homeassistant.helpers import entity_registry as er
    from homeassistant.helpers import device_registry as dr
    from homeassistant.core import SupportsResponse
    from homeassistant.exceptions import HomeAssistantError
    # Strict request validation lives in handle so errors keep our stable codes
    # (HA's general schema rejection uses invalid_format).
    import voluptuous as vol
    settings = validate_config(config.get(DOMAIN))
    registry = er.async_get(hass)
    devices = dr.async_get(hass)
    runtime = Runtime(hass, settings['spotifyplus_entity'], settings['speakers'], registry_get=registry.async_get,
                      relay_device_id=settings.get('relay_device_id'), device_registry_get=devices.async_get)
    hass.data[DOMAIN] = runtime
    async def play(call):
        try:
            return await runtime.handle_play(call)
        except MusicError as error:
            raise HomeAssistantError(str(error)) from None
    hass.services.async_register(DOMAIN, 'play_spotify', play, supports_response=SupportsResponse.ONLY)
    runtime.service_registered = True
    for command in COMMANDS:
        name = DOMAIN + '/' + command
        async def handle(_hass, connection, message):
            await runtime.handle(connection, message)
        handler = websocket_api.async_response(handle)
        websocket_api.async_register_command(hass, name, handler,
            websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend({}, extra=vol.ALLOW_EXTRA))
        runtime.ws_handlers[name] = hass.data['websocket_api'][name]
    runtime.unsubscribers.append(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, runtime.close))
    return True
