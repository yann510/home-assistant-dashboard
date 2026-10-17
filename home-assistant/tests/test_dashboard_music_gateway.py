import asyncio
import copy
import pathlib
import sys
import unittest
from types import SimpleNamespace as NS
sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
from custom_components.dashboard_music.gateway import SpotifyGateway, REQUIRED_SCOPES
from custom_components.dashboard_music.models import MusicError

ENTITY = 'media_player.spotifyplus_test'
ACCOUNT = 'backend-account'
TRACK = 'spotify:track:' + 'a' * 22
P1 = 'spotify:playlist:' + 'b' * 22
P2 = 'spotify:playlist:' + 'c' * 22

def playlist(uri=P1, title='Same title', **extra):
    return {'uri': uri, 'name': title, 'owner': {'display_name': 'Owner', 'id': 'owner'},
            'images': [{'url': 'https://i.scdn.co/image/test'}], 'public': False,
            'collaborative': True, **extra}

class Services:
    def __init__(self):
        self.calls = []
        self.result = {'offset': 0, 'limit': 50, 'total': 1, 'next': None, 'items': [playlist()]}
        self.account = ACCOUNT
        self.error = None
        self.block = None
    def has_service(self, domain, service):
        return service in ('get_playlist_favorites', 'check_track_favorites', 'save_track_favorites', 'remove_track_favorites')
    async def async_call(self, domain, name, data, **kwargs):
        self.calls.append((domain, name, data, kwargs))
        if self.block:
            await self.block.wait()
        if self.error:
            raise self.error
        return {'user_profile': {'id': self.account, 'email': 'NEVER EXPOSE'}, 'result': copy.deepcopy(self.result)}

def make_hass():
    services = Services()
    runtime = NS(spotifyClient=NS(UserProfile=NS(Id=ACCOUNT)), session=NS(token={'scope': ' '.join(REQUIRED_SCOPES)}))
    entry = NS(domain='spotifyplus', entry_id='entry', unique_id=ACCOUNT + '_spotifyplus', data={'id': ACCOUNT})
    registry = NS(platform='spotifyplus', config_entry_id='entry', unique_id=ACCOUNT + '_spotifyplus')
    hass = NS(services=services, data={'spotifyplus': {'entry': runtime}},
              config_entries=NS(async_get_entry=lambda _: entry),
              states=NS(get=lambda _: NS(attributes={'sp_user_id': ACCOUNT})))
    return hass, registry, entry, runtime

class GatewayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.hass, self.registry, self.entry, self.runtime = make_hass()
        self.gateway = SpotifyGateway(self.hass, ENTITY, lambda _: self.registry)
    async def test_fixed_account_cannot_be_selected_by_client(self):
        result = await self.gateway.list_playlists(0, 50)
        self.assertEqual(result['items'][0]['uri'], P1)
        self.assertEqual(self.hass.services.calls, [('spotifyplus', 'get_playlist_favorites',
            {'entity_id': ENTITY, 'offset': 0, 'limit': 50, 'sort_result': False},
            {'blocking': True, 'return_response': True})])
        self.assertNotIn('user_profile', result)
        with self.assertRaises(TypeError):
            await self.gateway.list_playlists(0, 50, account_id='other')
    async def test_account_mismatch_rejects_read_and_write(self):
        self.hass.services.account = 'other'
        with self.assertRaises(MusicError) as caught:
            await self.gateway.track_saved(TRACK)
        self.assertEqual(caught.exception.code, 'auth_required')
        self.runtime.spotifyClient.UserProfile.Id = 'other'
        before = len(self.hass.services.calls)
        with self.assertRaises(MusicError):
            await self.gateway.set_track_saved(TRACK, True)
        self.assertEqual(len(self.hass.services.calls), before)
    async def test_account_cannot_drift_after_pin(self):
        await self.gateway.list_playlists(0, 50)
        self.entry.data['id'] = 'other'
        self.entry.unique_id = self.registry.unique_id = 'other_spotifyplus'
        self.runtime.spotifyClient.UserProfile.Id = 'other'
        with self.assertRaises(MusicError):
            await self.gateway.list_playlists(0, 50)
        self.assertEqual(len(self.hass.services.calls), 1)
    async def test_missing_scopes_or_methods_fail_before_calls(self):
        self.runtime.session.token['scope'] = 'user-library-read'
        with self.assertRaises(MusicError):
            await self.gateway.list_playlists(0, 50)
        self.assertEqual(self.hass.services.calls, [])
        self.runtime.session.token['scope'] = ' '.join(REQUIRED_SCOPES)
        self.hass.services.has_service = lambda *_: False
        with self.assertRaises(MusicError):
            await self.gateway.list_playlists(0, 50)
        self.assertEqual(self.hass.services.calls, [])
    async def test_explicit_ids_and_boolean_response_required(self):
        self.hass.services.result = {TRACK: False}
        self.assertIs(await self.gateway.track_saved(TRACK), False)
        await self.gateway.set_track_saved(TRACK, True)
        await self.gateway.set_track_saved(TRACK, False)
        self.assertEqual([c[1] for c in self.hass.services.calls], ['check_track_favorites', 'save_track_favorites', 'remove_track_favorites'])
        self.assertTrue(all(c[2] == {'entity_id': ENTITY, 'ids': 'a' * 22} for c in self.hass.services.calls))
        self.hass.services.result = {}
        with self.assertRaises(MusicError):
            await self.gateway.track_saved(TRACK)
    async def test_timeout_and_provider_errors_are_sanitized(self):
        self.hass.services.block = asyncio.Event()
        self.gateway.call_timeout = .01
        with self.assertRaises(MusicError) as caught:
            await self.gateway.list_playlists(0, 50)
        self.assertEqual(caught.exception.code, 'unavailable')
        self.hass.services.block = None
        self.hass.services.error = RuntimeError('secret token email')
        with self.assertRaises(MusicError) as caught:
            await self.gateway.list_playlists(0, 50)
        self.assertNotIn('secret', str(caught.exception))
    async def test_rate_limit_respects_retry_after(self):
        self.now = 10
        self.gateway.clock = lambda: self.now
        self.hass.services.error = type('RateLimit', (Exception,), {'Status': 429, 'RetryAfter': 9999})()
        with self.assertRaises(MusicError) as caught:
            await self.gateway.list_playlists(0, 50)
        self.assertEqual(caught.exception.retry_after, 300)
        self.hass.services.error = None
        with self.assertRaises(MusicError):
            await self.gateway.list_playlists(0, 50)
        self.assertEqual(len(self.hass.services.calls), 1)
        self.now = 311
        await self.gateway.list_playlists(0, 50)
        self.assertEqual(len(self.hass.services.calls), 2)
    async def test_invalid_ids_and_pagination_never_reach_provider(self):
        for uri in ('', 'spotify:episode:' + 'a'*22, TRACK + ',other', 'https://open.spotify.com/track/abc'):
            with self.assertRaises(MusicError):
                await self.gateway.track_saved(uri)
        for offset, limit in ((True, 1), (-1, 2), (100001, 1), (0, 51), (0, '2')):
            with self.assertRaises(MusicError):
                await self.gateway.list_playlists(offset, limit)
        self.assertEqual(self.hass.services.calls, [])

    async def test_nulls_duplicate_titles_and_pagination_use_slots(self):
        self.hass.services.result = {'offset': 0, 'limit': 3, 'total': 4, 'next': 'https://api.spotify.com/v1/me/playlists?offset=3',
                                    'items': [playlist(), None, playlist(P2)]}
        first = await self.gateway.list_playlists(0, 3)
        self.assertEqual([p['uri'] for p in first['items']], [P1, P2])
        self.assertEqual(first['nextOffset'], 3)
        self.assertEqual(first['total'], 4)
        self.hass.services.result = {'offset': 3, 'limit': 3, 'total': 4, 'next': None, 'items': [playlist(P2, 'Renamed')]}
        second = await self.gateway.list_playlists(3, 3)
        self.assertEqual(second['items'][0]['title'], 'Renamed')
        self.assertIsNone(second['nextOffset'])

    async def test_provider_offset_limit_preserves_cursor_and_makes_no_call(self):
        self.hass.services.result = {'offset': 10000, 'limit': 50, 'total': 11000, 'next': 'https://api.spotify.com/next', 'items': []}
        page = await self.gateway.list_playlists(10000, 50)
        self.assertEqual(page['nextOffset'], 10050)
        with self.assertRaises(MusicError) as caught:
            await self.gateway.list_playlists(page['nextOffset'], 50)
        self.assertEqual(caught.exception.code, 'unavailable')
        self.assertIn('10000', str(caught.exception))
        self.assertEqual(len(self.hass.services.calls), 1)
        self.assertEqual(page['nextOffset'], 10050)

    async def test_wrapped_retry_after_is_bounded_and_missing_runtime_fails_closed(self):
        inner = type('RateLimit', (Exception,), {'Status': 429, 'RetryAfter': 0})()
        outer = RuntimeError('sensitive provider message')
        outer.__context__ = inner
        self.hass.services.error = outer
        with self.assertRaises(MusicError) as caught:
            await self.gateway.list_playlists(0, 50)
        self.assertEqual(caught.exception.retry_after, 1)
        self.assertNotIn('sensitive', str(caught.exception))
        self.hass.data['spotifyplus'].clear()
        with self.assertRaises(MusicError) as caught:
            await self.gateway.list_playlists(0, 50)
        self.assertEqual(caught.exception.code, 'unavailable')

    async def test_malformed_provider_envelopes_fail_without_false_saved_state(self):
        for result in (None, [], {TRACK: 'false'}, {'wrong': False}):
            self.hass.services.result = result
            with self.assertRaises(MusicError):
                await self.gateway.track_saved(TRACK)
        for result in (None, {'items': None}, {'offset': 0, 'limit': 50, 'total': -1, 'items': []},
                       {'offset': 1, 'limit': 50, 'total': 2, 'items': []}):
            self.hass.services.result = result
            with self.assertRaises(MusicError):
                await self.gateway.list_playlists(0, 50)
