"""The song heart reads a fresh track bound to the visible Sonos coordinator."""
from dataclasses import replace
from types import SimpleNamespace as NS
import unittest
from test_dashboard_music_playback import house, Provider
from test_dashboard_music_permissions import Connection
from test_dashboard_music_library import Provider as LibraryProvider
from test_dashboard_music_gateway import ENTITY, ACCOUNT, TRACK, P1
from custom_components.dashboard_music import Runtime
from custom_components.dashboard_music.library import Library
from custom_components.dashboard_music.models import PlaybackState
from custom_components.house_moods.sonos import SPEAKERS, SOURCE


class CurrentTrackTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.hass, self.states, self.user = house()
        self.runtime = Runtime(self.hass, ENTITY, SPEAKERS, library=Library(LibraryProvider()))
        self.provider = self.runtime.gateway = Provider()
        self.provider.state = PlaybackState(ACCOUNT, 'connect-id', P1, False, True, TRACK)
        self.connection = Connection()
        self.connection.user = self.user
        self.user.permissions.check_entity = lambda entity, permission: permission == 'read'
        self.states[SOURCE].state = 'paused'
        self.states[SOURCE].attributes['source'] = 'Spotify Connect'

    async def read(self, **extra):
        self.connection.result = self.connection.error = None
        await self.runtime.handle(self.connection, {'id': 1, 'type': 'dashboard_music/current_track', 'source_entity': SOURCE, **extra})
        return self.connection.result

    async def test_paused_connect_wrapper_uses_exact_fresh_cloud_track_with_read_permission(self):
        self.states[SOURCE].attributes['media_content_id'] = 'x-sonos-vli:RINCON:2,spotify:session-wrapper'
        result = await self.read()
        self.assertEqual(result, {'source_entity': SOURCE, 'track_uri': TRACK})
        self.assertEqual(self.provider.calls, [('resolve', SOURCE)])

    async def test_unrelated_account_device_or_unknown_connect_never_supplies_uri(self):
        for state in (replace(self.provider.state, account_id='other'), replace(self.provider.state, device_id='elsewhere'),
                      replace(self.provider.state, is_connect=None), replace(self.provider.state, is_playing=None)):
            self.provider.state = state
            self.assertEqual(await self.read(), {'source_entity': SOURCE, 'track_uri': None})

    async def test_retained_track_on_tv_or_local_source_is_not_saveable(self):
        for source in ('TV', None, 'Line-in'):
            self.states[SOURCE].attributes['source'] = source
            self.assertEqual(await self.read(), {'source_entity': SOURCE, 'track_uri': None})
        self.assertEqual(self.provider.calls, [])

    async def test_speaker_read_permission_is_required_and_client_cannot_choose_account(self):
        self.user.permissions.check_entity = lambda entity, permission: entity != SOURCE
        self.assertIsNone(await self.read())
        self.assertEqual(self.connection.error['code'], 'forbidden')
        self.assertEqual(self.provider.calls, [])
        await self.read(account_id='other')
        self.assertEqual(self.connection.error['code'], 'invalid_request')

    async def test_source_change_while_reading_discards_track(self):
        async def changed():
            self.states[SOURCE].attributes['source'] = 'TV'
            return self.provider.state
        self.provider.playback_state = changed
        self.assertEqual(await self.read(), {'source_entity': SOURCE, 'track_uri': None})
