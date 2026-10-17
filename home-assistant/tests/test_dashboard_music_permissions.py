import pathlib
import sys
import unittest
from types import SimpleNamespace as NS
sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
from custom_components.dashboard_music import Runtime, validate_config
from custom_components.dashboard_music.library import Library
from custom_components.dashboard_music.models import MusicError
from test_dashboard_music_gateway import ENTITY, TRACK, P1
from test_dashboard_music_library import Provider

SPEAKERS = ['media_player.bathroom', 'media_player.bedroom', 'media_player.gym', 'media_player.living_room']

class Connection:
    def __init__(self, control=False):
        self.user = NS(id='user', is_active=True, permissions=NS(check_entity=lambda entity, permission: entity == ENTITY and (permission == 'read' or control)))
        self.result = None
        self.error = None
    def send_result(self, msg_id, result):
        self.result = result
    def send_message(self, message):
        self.error = message['error']

class PermissionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.provider = Provider()
        self.runtime = Runtime(NS(), ENTITY, SPEAKERS, library=Library(self.provider))
    async def test_read_permission_cannot_write(self):
        connection = Connection()
        await self.runtime.handle(connection, {'id': 1, 'type': 'dashboard_music/set_track_saved', 'track_uri': TRACK, 'saved': True})
        self.assertEqual(connection.error['code'], 'forbidden')
        self.assertEqual(self.provider.calls, [])
        await self.runtime.handle(connection, {'id': 2, 'type': 'dashboard_music/playlists', 'offset': 0, 'limit': 50})
        self.assertEqual(connection.result['items'][0]['uri'], P1)
    async def test_fixed_account_cannot_be_selected_by_client(self):
        for extra in ({'account_id': 'other'}, {'user_id': 'admin'}, {'device_id': 'other'}, {'entity_id': ENTITY}, {'next': 'https://evil'}):
            connection = Connection(True)
            await self.runtime.handle(connection, {'id': 1, 'type': 'dashboard_music/playlists', 'offset': 0, **extra})
            self.assertEqual(connection.error['code'], 'invalid_request')
        self.assertEqual(self.provider.pages, [])
    async def test_missing_inactive_or_denied_identity_rejected(self):
        for user in (None, NS(is_active=False), NS(is_active=True, permissions=NS(check_entity=lambda *_: False))):
            connection = Connection(True)
            connection.user = user
            await self.runtime.handle(connection, {'id': 1, 'type': 'dashboard_music/track_saved', 'track_uri': TRACK})
            self.assertIn(connection.error['code'], ('auth_required', 'forbidden'))
        self.assertEqual(self.provider.calls, [])
    async def test_unknown_commands_bad_booleans_and_ranges_rejected(self):
        for message in ({'type': 'dashboard_music/play_spotify'}, {'type': 'dashboard_music/set_track_saved', 'track_uri': TRACK, 'saved': 'false'}, {'type': 'dashboard_music/playlists', 'offset': -1}, {'type': 'dashboard_music/track_saved', 'track_uri': 'spotify:track:invalid'}):
            connection = Connection(True)
            await self.runtime.handle(connection, {'id': 1, **message})
            self.assertEqual(connection.error['code'], 'invalid_request')
        self.assertEqual(self.provider.calls, [])
    async def test_configuration_allows_exact_one_account_and_four_fixed_rooms(self):
        self.assertEqual(validate_config({'spotifyplus_entity': ENTITY, 'speakers': SPEAKERS})['spotifyplus_entity'], ENTITY)
        for config in ({'spotifyplus_entity': [ENTITY], 'speakers': SPEAKERS}, {'spotifyplus_entity': ENTITY, 'speakers': SPEAKERS[:-1]}, {'spotifyplus_entity': ENTITY, 'speakers': SPEAKERS + ['media_player.office']}, {'spotifyplus_entity': ENTITY, 'speakers': SPEAKERS, 'account_id': 'other'}):
            with self.assertRaises(MusicError):
                validate_config(config)
    async def test_sanitized_rate_limit_and_shutdown(self):
        async def limited(*_):
            raise MusicError('rate_limited', retry_after=999)
        self.runtime.library.page = limited
        connection = Connection(True)
        await self.runtime.handle(connection, {'id': 1, 'type': 'dashboard_music/playlists', 'offset': 0})
        self.assertEqual(connection.error['retry_after'], 300)
        await self.runtime.close()
        connection.error = None
        await self.runtime.handle(connection, {'id': 1, 'type': 'dashboard_music/playlists', 'offset': 0})
        self.assertEqual(connection.error['code'], 'unavailable')

    async def test_socket_registration_routes_to_permissions_and_cleanup_preserves_replacement(self):
        from unittest.mock import patch
        import types
        from custom_components.dashboard_music import async_setup
        registrations = {}
        listeners = []
        class Schema:
            def extend(self, *_, **__):
                return self
        ws = types.ModuleType('homeassistant.components.websocket_api')
        ws.BASE_COMMAND_MESSAGE_SCHEMA = Schema()
        ws.async_response = lambda handler: handler
        def register(hass, name, handler, schema):
            hass.data.setdefault('websocket_api', {})[name] = (handler, schema)
            registrations[name] = handler
        ws.async_register_command = register
        constants = types.ModuleType('homeassistant.const')
        constants.EVENT_HOMEASSISTANT_STOP = 'stop'
        registry = types.ModuleType('homeassistant.helpers.entity_registry')
        registry.async_get = lambda _: NS(async_get=lambda _: None)
        vol = types.ModuleType('voluptuous')
        vol.ALLOW_EXTRA = object()
        modules = {'homeassistant': types.ModuleType('homeassistant'), 'homeassistant.components': types.ModuleType('homeassistant.components'),
                   'homeassistant.components.websocket_api': ws, 'homeassistant.const': constants,
                   'homeassistant.helpers': types.ModuleType('homeassistant.helpers'), 'homeassistant.helpers.entity_registry': registry, 'voluptuous': vol}
        hass = NS(data={}, bus=NS(async_listen_once=lambda event, handler: listeners.append((event, handler)) or (lambda: None)))
        with patch.dict(sys.modules, modules):
            self.assertTrue(await async_setup(hass, {'dashboard_music': {'spotifyplus_entity': ENTITY, 'speakers': SPEAKERS}}))
            self.assertEqual(set(registrations), {'dashboard_music/playlists', 'dashboard_music/track_saved', 'dashboard_music/set_track_saved'})
            runtime = hass.data['dashboard_music']
            runtime.gateway = None
            runtime.library = Library(self.provider)
            connection = Connection()
            await registrations['dashboard_music/set_track_saved'](hass, connection, {'id': 3, 'type': 'dashboard_music/set_track_saved', 'track_uri': TRACK, 'saved': True})
            self.assertEqual(connection.error['code'], 'forbidden')
            replacement = (object(), object())
            hass.data['websocket_api']['dashboard_music/playlists'] = replacement
            await listeners[0][1]()
            self.assertEqual(hass.data['websocket_api'], {'dashboard_music/playlists': replacement})
            self.assertNotIn('dashboard_music', hass.data)

    async def test_shutdown_cancels_pending_provider_operation_and_clears_cache(self):
        import asyncio
        entered = asyncio.Event()
        async def blocked(*_):
            entered.set()
            await asyncio.Event().wait()
        self.provider.list_playlists = blocked
        task = asyncio.create_task(self.runtime.handle(Connection(), {'id': 1, 'type': 'dashboard_music/playlists', 'offset': 0}))
        await entered.wait()
        await self.runtime.close()
        self.assertTrue(task.cancelled())
        self.assertEqual(self.runtime.tasks, set())
        self.assertEqual(self.runtime.library.pages, {})
