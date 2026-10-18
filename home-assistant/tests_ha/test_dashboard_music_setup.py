"""Actual HA registration, service contexts and WS schemas; no real provider I/O."""
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from homeassistant.core import HomeAssistant, Context
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry, device_registry
from custom_components.dashboard_music import async_setup, SPEAKERS
from custom_components.dashboard_music.models import PlaybackState
from custom_components.house_moods.sonos import SOURCE, FOLLOW, FOLLOW_SOURCE, FOLLOW_SCRIPT

ACCOUNT = 'fixture-account'
ENTITY = 'media_player.spotifyplus_fixture'
PLAYLIST = 'spotify:playlist:' + 'p' * 22
TRACK = 'spotify:track:' + 't' * 22
RELAY = 'a' * 40


class Provider:
    def __init__(self, hass, *_, **__):
        self.hass = hass
        self.effects = []
        self.state = PlaybackState(ACCOUNT, 'target', PLAYLIST, False, True, TRACK)
    def verify_account(self):
        return ACCOUNT
    async def list_playlists(self, offset, limit):
        return {'items': [{'uri': PLAYLIST, 'title': 'Fixture playlist', 'owner': 'Fixture owner'}], 'nextOffset': None, 'total': 1}
    async def resolve_device(self, source):
        return 'target'
    async def resolve_relay(self):
        return RELAY
    async def playback_state(self):
        return self.state
    async def start_playlist(self, uri, relay):
        self.effects.append(('start', uri, relay))
        self.state = PlaybackState(ACCOUNT, relay, uri, True, True, TRACK)
    async def handoff(self, target, guard):
        if not guard():
            raise RuntimeError('Topology changed')
        self.effects.append(('handoff', target))
        self.state = PlaybackState(ACCOUNT, target, PLAYLIST, True, True, TRACK)
    async def wait_playback_settled(self):
        pass


class DashboardMusicSetupTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)
        if hasattr(device_registry, 'async_setup'):
            device_registry.async_setup(self.hass)
        await device_registry.async_load(self.hass)
        await entity_registry.async_load(self.hass)
        self.user = NS(id='authenticated-fixture', is_active=True,
                       permissions=NS(check_entity=lambda *_: True))
        async def user(user_id):
            return self.user if user_id == self.user.id else None
        self.auth = patch.object(self.hass, 'auth', NS(async_get_user=user), create=True)
        self.auth.start()
        self.hass.states.async_set(FOLLOW, 'off')
        self.hass.states.async_set(FOLLOW_SOURCE, '')
        self.hass.states.async_set(FOLLOW_SCRIPT, 'off')
        for entity in SPEAKERS:
            self.hass.states.async_set(entity, 'playing', {'source': 'Spotify Connect', 'group_members': [entity], 'volume_level': .2})
        with patch('custom_components.dashboard_music.SpotifyGateway', Provider):
            self.assertTrue(await async_setup(self.hass, {'dashboard_music': {
                'spotifyplus_entity': ENTITY, 'speakers': list(SPEAKERS), 'relay_device_id': RELAY}}))
        self.runtime = self.hass.data['dashboard_music']

    async def asyncTearDown(self):
        await self.runtime.close()
        await self.hass.async_block_till_done()
        self.auth.stop()
        self.temp.cleanup()

    async def test_response_service_retains_real_context_and_returns_verified_result(self):
        context = Context(user_id=self.user.id)
        data = {'playlist_uri': PLAYLIST, 'source_entity': SOURCE, 'request_id': 'one-intent'}
        with patch.object(self.runtime, 'handle_play', wraps=self.runtime.handle_play) as handler:
            result = await self.hass.services.async_call('dashboard_music', 'play_spotify', data,
                blocking=True, return_response=True, context=context)
            self.assertEqual(result['status'], 'confirmed')
            self.assertIs(handler.call_args.args[0].context, context)
            self.assertEqual(handler.call_args.args[0].context.user_id, self.user.id)
        self.assertEqual(self.runtime.gateway.effects, [('start', PLAYLIST, RELAY), ('handoff', 'target')])
        self.assertEqual(await self.hass.services.async_call('dashboard_music', 'play_spotify', data,
            blocking=True, return_response=True, context=context), result)
        self.assertEqual(len(self.runtime.gateway.effects), 2)
        with self.assertRaises(HomeAssistantError):
            await self.hass.services.async_call('dashboard_music', 'play_spotify', data, blocking=True, context=context)
        await self.runtime.close()
        self.assertFalse(self.hass.services.has_service('dashboard_music', 'play_spotify'))

    async def test_registered_ws_schema_routes_read_permission_and_rejects_client_identity(self):
        messages = []
        self.user.permissions.check_entity = lambda entity, permission: permission == 'read'
        connection = NS(user=self.user, send_result=lambda ident, result: messages.append({'result': result}),
                        send_message=messages.append)
        async def dispatch(command, **fields):
            name = 'dashboard_music/' + command
            handler, schema = self.runtime.ws_handlers[name]
            parsed = schema({'id': 1, 'type': name, **fields})
            handler(self.hass, connection, parsed)
            await self.hass.async_block_till_done()
            return messages[-1]
        answer = await dispatch('current_track', source_entity=SOURCE)
        self.assertEqual(answer['result'], {'source_entity': SOURCE, 'track_uri': TRACK})
        denied = await dispatch('set_track_saved', track_uri=TRACK, saved=True)
        self.assertEqual(denied['error']['code'], 'forbidden')
        rejected = await dispatch('current_track', source_entity=SOURCE, account_id='client-selected')
        self.assertEqual(rejected['error']['code'], 'invalid_request')
        self.assertEqual(self.runtime.gateway.effects, [])
        handlers = dict(self.runtime.ws_handlers)
        await self.runtime.close()
        self.assertTrue(all(self.hass.data['websocket_api'].get(name) is not pair for name, pair in handlers.items()))
