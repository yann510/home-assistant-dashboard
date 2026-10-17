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
        self.assertEqual([c[1] for c in self.hass.services.calls], ['check_track_favorites', 'save_track_favorites', 'check_track_favorites', 'remove_track_favorites'])
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

class ThreadedMutationServices(Services):
    """HA service awaits an executor operation cancellation cannot stop."""
    def __init__(self, fail_late=False):
        super().__init__()
        import threading
        self.started = threading.Event()
        self.release = threading.Event()
        self.effect_done = threading.Event()
        self.service_done = asyncio.Event()
        self.saved = False
        self.cancelled = 0
        self.fail_late = fail_late
        self.reads = 0
    async def async_call(self, domain, name, data, **kwargs):
        self.calls.append((domain, name, data, kwargs))
        if name == 'check_track_favorites':
            self.reads += 1
            return {'user_profile': {'id': ACCOUNT}, 'result': {TRACK: self.saved}}
        if name == 'remove_track_favorites':
            self.saved = False
            return None
        if name == 'save_track_favorites':
            def delayed_effect():
                self.started.set()
                if not self.release.wait(2):
                    raise RuntimeError('Test did not release delayed mutation')
                self.saved = True
                self.effect_done.set()
                if self.fail_late:
                    raise RuntimeError('sensitive late provider failure')
            try:
                return await asyncio.to_thread(delayed_effect)
            except asyncio.CancelledError:
                self.cancelled += 1
                raise
            finally:
                self.service_done.set()
        raise AssertionError(name)
    async def settle(self):
        self.release.set()
        await asyncio.wait_for(asyncio.to_thread(self.effect_done.wait, 1), 1.5)
        await asyncio.wait_for(self.service_done.wait(), 1)
        await asyncio.sleep(0)

class MutationLifetimeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.hass, registry, _, _ = make_hass()
        self.services = self.hass.services = ThreadedMutationServices()
        self.gateway = SpotifyGateway(self.hass, ENTITY, lambda _: registry)
        self.gateway.call_timeout = .01
    async def test_timed_out_executor_mutation_blocks_opposite_write_until_actual_settlement(self):
        try:
            with self.assertRaises(MusicError):
                await self.gateway.set_track_saved(TRACK, True)
            with self.assertRaises(MusicError):
                await self.gateway.set_track_saved(TRACK, False)
            with self.assertRaises(MusicError):
                await self.gateway.track_saved(TRACK)
            self.assertEqual([call[1] for call in self.services.calls], ['save_track_favorites'])
            self.assertEqual(self.services.cancelled, 0)
        finally:
            await self.services.settle()
        reads = self.services.reads
        await self.gateway.set_track_saved(TRACK, False)
        self.assertGreater(self.services.reads, reads)  # Fresh reconciliation before next mutation.
        self.assertFalse(await self.gateway.track_saved(TRACK))
        self.assertFalse(self.services.saved)
    async def test_caller_cancel_does_not_cancel_actual_mutation(self):
        request = asyncio.create_task(self.gateway.set_track_saved(TRACK, True))
        try:
            self.assertTrue(await asyncio.to_thread(self.services.started.wait, 1))
            request.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await request
            with self.assertRaises(MusicError):
                await self.gateway.set_track_saved(TRACK, False)
            self.assertEqual(self.services.cancelled, 0)
        finally:
            await self.services.settle()
        self.assertTrue(await self.gateway.track_saved(TRACK))
    async def test_late_failure_is_consumed_and_requires_fresh_readback(self):
        self.services.fail_late = True
        errors = []
        loop = asyncio.get_running_loop()
        previous = loop.get_exception_handler()
        loop.set_exception_handler(lambda _loop, context: errors.append(context))
        try:
            with self.assertRaises(MusicError):
                await self.gateway.set_track_saved(TRACK, True)
            await self.services.settle()
            self.assertTrue(await self.gateway.track_saved(TRACK))
            self.assertEqual(self.services.cancelled, 0)
            self.assertEqual(errors, [])
        finally:
            self.services.release.set()
            loop.set_exception_handler(previous)

    async def test_read_started_before_mutation_cannot_confirm_obsolete_state(self):
        read_started, return_read = asyncio.Event(), asyncio.Event()
        original = self.services.async_call
        async def stale_read(domain, name, data, **kwargs):
            if name == 'check_track_favorites' and not read_started.is_set():
                captured = self.services.saved
                read_started.set()
                await return_read.wait()
                return {'user_profile': {'id': ACCOUNT}, 'result': {TRACK: captured}}
            return await original(domain, name, data, **kwargs)
        self.services.async_call = stale_read
        self.gateway.call_timeout = 1
        request = asyncio.create_task(self.gateway.track_saved(TRACK))
        try:
            await read_started.wait()
            self.services.release.set()
            await self.gateway.set_track_saved(TRACK, True)
            return_read.set()
            with self.assertRaises(MusicError):
                await request
            self.assertTrue(await self.gateway.track_saved(TRACK))
        finally:
            return_read.set()
            await self.services.settle()

    async def test_pending_mutations_are_bounded_without_queuing_more_effects(self):
        release, finished = asyncio.Event(), asyncio.Event()
        calls = []
        ended = 0
        async def blocked_service(_domain, name, data, **kwargs):
            nonlocal ended
            calls.append(data['ids'])
            try:
                await release.wait()
            finally:
                ended += 1
                if ended == 2:
                    finished.set()
        self.hass.services.async_call = blocked_service
        self.gateway.max_pending_mutations = 2
        try:
            for suffix in ('b', 'c', 'd'):
                with self.assertRaises(MusicError):
                    await self.gateway.set_track_saved('spotify:track:' + suffix*22, True)
            self.assertEqual(calls, ['b'*22, 'c'*22])
        finally:
            release.set()
            await asyncio.wait_for(finished.wait(), 1)
            await asyncio.sleep(0)

    async def test_uncertain_tracks_are_bounded_and_fresh_read_frees_capacity(self):
        calls = []
        async def failed_service(_domain, name, data, **kwargs):
            if name == 'check_track_favorites':
                return {'user_profile': {'id': ACCOUNT}, 'result': {'spotify:track:' + data['ids']: False}}
            calls.append(data['ids'])
            raise RuntimeError('unknown mutation result')
        self.hass.services.async_call = failed_service
        self.gateway.max_uncertain_tracks = 2
        for suffix in ('b', 'c', 'd'):
            with self.assertRaises(MusicError):
                await self.gateway.set_track_saved('spotify:track:' + suffix*22, True)
        self.assertEqual(calls, ['b'*22, 'c'*22])
        await self.gateway.track_saved('spotify:track:' + 'b'*22)
        with self.assertRaises(MusicError):
            await self.gateway.set_track_saved('spotify:track:' + 'd'*22, True)
        self.assertEqual(calls, ['b'*22, 'c'*22, 'd'*22])
