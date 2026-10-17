import asyncio
import copy
import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
from custom_components.dashboard_music.library import Library
from custom_components.dashboard_music.models import MusicError
from test_dashboard_music_gateway import P1, P2, TRACK

class Provider:
    def __init__(self):
        self.items = [{'uri': P1, 'title': 'Same', 'owner': 'Private'}, {'uri': P2, 'title': 'Same', 'owner': 'Collaborator'}]
        self.pages = []
        self.saved = False
        self.calls = []
    async def list_playlists(self, offset, limit):
        self.pages.append((offset, limit))
        return {'items': copy.deepcopy(self.items[offset:offset+limit]), 'nextOffset': offset+limit if offset+limit < len(self.items) else None, 'total': len(self.items)}
    async def track_saved(self, uri):
        self.calls.append(('read', uri))
        return self.saved
    async def set_track_saved(self, uri, saved):
        self.calls.append(('write', uri, saved))
        self.saved = saved

class LibraryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.now = 0
        self.provider = Provider()
        self.library = Library(self.provider, clock=lambda: self.now)
    async def test_private_and_collaborative_playlist_pages(self):
        first = await self.library.page(0, 1)
        second = await self.library.page(1, 1)
        self.assertEqual(first, {'items': [{'uri': P1, 'title': 'Same', 'owner': 'Private'}], 'nextOffset': 1, 'total': 2})
        self.assertEqual(second['items'][0]['uri'], P2)
        self.assertIsNone(second['nextOffset'])
        await self.library.page(0, 1)
        self.assertEqual(len(self.provider.pages), 2)
        self.now = 60
        await self.library.page(0, 1)
        self.assertEqual(len(self.provider.pages), 3)
    async def test_removed_renamed_and_duplicate_playlist_uris(self):
        await self.library.page(0, 1)
        self.provider.items = [{'uri': P2, 'title': 'Renamed', 'owner': 'Private'}, {'uri': P2, 'title': 'Renamed', 'owner': 'Private'}]
        self.assertFalse(await self.library.contains_playlist(P1))
        self.assertTrue(await self.library.contains_playlist(P2))
        page = await self.library.page(0, 50, refresh=True)
        self.assertEqual(page['items'], [{'uri': P2, 'title': 'Renamed', 'owner': 'Private'}])
        self.assertEqual(page['total'], 2)
    async def test_membership_cache_miss_refreshes_once(self):
        missing = 'spotify:playlist:' + 'z'*22
        self.assertFalse(await self.library.contains_playlist(missing))
        self.assertEqual(self.provider.pages, [(0, 50)])
    async def test_membership_refresh_bounded_without_truncating_library(self):
        async def endless(offset, limit):
            self.provider.pages.append((offset, limit))
            return {'items': [], 'nextOffset': offset+limit, 'total': 20000}
        self.provider.list_playlists = endless
        with self.assertRaises(MusicError) as caught:
            await self.library.contains_playlist(P1)
        self.assertEqual(caught.exception.code, 'unavailable')
        self.assertEqual(len(self.provider.pages), 200)
        page = await self.library.page(11000, 50)
        self.assertEqual(page['nextOffset'], 11050)
        self.assertLessEqual(len(self.library.pages), 200)
    async def test_set_saved_uses_explicit_state_and_reads_back(self):
        self.assertEqual(await self.library.set_saved_track(TRACK, True), {'track_uri': TRACK, 'saved': True})
        self.assertEqual(await self.library.set_saved_track(TRACK, True), {'track_uri': TRACK, 'saved': True})
        self.assertEqual(await self.library.set_saved_track(TRACK, False), {'track_uri': TRACK, 'saved': False})
        self.assertEqual(self.provider.calls, [('write', TRACK, True), ('read', TRACK), ('write', TRACK, True), ('read', TRACK), ('write', TRACK, False), ('read', TRACK)])
    async def test_saved_cache_expiry_cap_and_failed_write_invalidates(self):
        await self.library.saved_track(TRACK)
        await self.library.saved_track(TRACK)
        self.assertEqual(len(self.provider.calls), 1)
        self.now = 30
        await self.library.saved_track(TRACK)
        self.assertEqual(len(self.provider.calls), 2)
        for n in range(501):
            await self.library.saved_track('spotify:track:' + str(n).zfill(22))
        self.assertLessEqual(len(self.library.saved), 500)
        async def failure(*_):
            raise MusicError('unavailable')
        self.provider.set_track_saved = failure
        with self.assertRaises(MusicError):
            await self.library.set_saved_track(TRACK, True)
        before = len(self.provider.calls)
        await self.library.saved_track(TRACK)
        self.assertEqual(len(self.provider.calls), before+1)
    async def test_per_track_writes_and_reads_serialize(self):
        active = 0
        maximum = 0
        async def write(uri, saved):
            nonlocal active, maximum
            active += 1
            maximum = max(active, maximum)
            await asyncio.sleep(.001)
            self.provider.saved = saved
            active -= 1
        self.provider.set_track_saved = write
        results = await asyncio.gather(self.library.set_saved_track(TRACK, True), self.library.set_saved_track(TRACK, False))
        self.assertEqual(maximum, 1)
        self.assertEqual([r['saved'] for r in results], [True, False])
        self.assertEqual(len(self.library.track_locks), 0)

    async def test_readback_reports_actual_state_and_does_not_trust_write_success(self):
        async def ineffective_write(*_):
            pass
        self.provider.set_track_saved = ineffective_write
        result = await self.library.set_saved_track(TRACK, True)
        self.assertEqual(result, {'track_uri': TRACK, 'saved': False})
        async def invalid_saved(_):
            return None
        self.provider.track_saved = invalid_saved
        self.now = 31
        with self.assertRaises(MusicError):
            await self.library.saved_track(TRACK)

    async def test_page_cache_results_are_not_mutable_by_callers(self):
        page = await self.library.page(0, 1)
        page['items'].clear()
        page['nextOffset'] = None
        again = await self.library.page(0, 1)
        self.assertEqual(again['items'][0]['uri'], P1)
        self.assertEqual(again['nextOffset'], 1)

    async def test_failed_refresh_preserves_loaded_pages_and_cursor(self):
        first = await self.library.page(0, 1)
        original = self.provider.list_playlists
        async def failed(offset, limit):
            raise MusicError('unavailable')
        self.provider.list_playlists = failed
        with self.assertRaises(MusicError):
            await self.library.page(1, 1, refresh=True)
        self.assertEqual(await self.library.page(0, 1), first)
        self.assertEqual(first['nextOffset'], 1)
        self.provider.list_playlists = original
