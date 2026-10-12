import asyncio
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from custom_components.dashboard_spotify.search import SearchError, SearchGateway, normalize_search, validate_query

TRACK = {'name':'One More Time','uri':'spotify:track:0DiWol3AO6WpXZgp0goxAV','artists':[{'name':'Daft Punk'}], 'album':{'images':[{'url':'https://i.scdn.co/image/cover'}]}, 'access_token':'MUST_NOT_LEAK'}

class SearchTests(unittest.TestCase):
    def test_normalization_exposes_only_playable_track_metadata_and_pagination(self):
        result = normalize_search({'tracks':{'items':[TRACK, None, {'uri':'https://evil.test'}], 'total':14,'next':'https://api.spotify.com/v1/search?offset=10'}}, 0, 10)
        self.assertEqual(result['items'], [{'title':'One More Time','subtitle':'Daft Punk','media_content_id':TRACK['uri'],'media_content_type':'music','can_play':True,'can_expand':False,'thumbnail':'https://i.scdn.co/image/cover'}])
        self.assertEqual(result['next_offset'],10)
        self.assertEqual(result['total'],14)
        self.assertNotIn('MUST_NOT_LEAK',json.dumps(result))
    def test_no_next_page_is_inferred_from_bad_remote_url(self):
        self.assertIsNone(normalize_search({'tracks':{'items':[TRACK],'total':14,'next':None}},0,10)['next_offset'])
    def test_query_bounds_reject_invalid_payloads(self):
        for query,limit,offset in [('',10,0),('a'*201,10,0),('ok',11,0),('ok',True,0),('ok',10,-1),('ok',10,1001),('ok',10,1.5),('bad\x00query',10,0)]:
            with self.subTest(query=query):
                with self.assertRaises(SearchError): validate_query(query,limit,offset)
        self.assertEqual(validate_query('  Daft Punk ',10,0),('Daft Punk',10,0))

class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_shared_searches_are_cached_without_storing_credentials(self):
        calls=[]
        async def fetch(query,limit,offset):
            calls.append(query);await asyncio.sleep(0.01)
            return {'tracks':{'items':[TRACK],'total':1,'next':None}}
        gateway=SearchGateway()
        results=await asyncio.gather(*(gateway.search('account','Daft Punk',10,0,fetch) for _ in range(3)))
        self.assertEqual(len(calls),1)
        self.assertEqual(results[0]['items'][0]['title'],'One More Time')
        self.assertNotIn('MUST_NOT_LEAK',str(gateway.cache))
    async def test_rate_limit_cooldown_prevents_more_network_requests(self):
        calls=[]
        async def fetch(*args):
            calls.append(1);raise SearchError('rate_limited','Spotify is busy. Try again shortly.',3)
        gateway=SearchGateway()
        for _ in range(2):
            with self.assertRaises(SearchError) as result: await gateway.search('account','Daft Punk',10,0,fetch)
            self.assertGreaterEqual(result.exception.retry_after,1)
        self.assertEqual(len(calls),1)
    async def test_upstream_exceptions_are_sanitized(self):
        async def fetch(*args): raise RuntimeError('secret-access-token')
        with self.assertRaises(SearchError) as result: await SearchGateway().search('account','song',10,0,fetch)
        self.assertNotIn('secret-access-token',str(result.exception))
    async def test_network_concurrency_is_bounded_and_extra_requests_are_rejected(self):
        release=asyncio.Event();active=0;peak=0
        async def fetch(*args):
            nonlocal active,peak
            active+=1;peak=max(peak,active)
            await release.wait();active-=1
            return {'tracks':{'items':[]}}
        gateway=SearchGateway()
        tasks=[asyncio.create_task(gateway.search('account',f'query{i}',10,0,fetch)) for i in range(4)]
        await asyncio.sleep(0.01)
        with self.assertRaises(SearchError):await gateway.search('account','extra',10,0,fetch)
        release.set();await asyncio.gather(*tasks)
        self.assertEqual(peak,2)

class TypedSearchTests(unittest.TestCase):
    def test_grouped_results_keep_independent_pagination_and_authorized_wrappers(self):
        playlist = {'name': 'Mix', 'uri': 'spotify:playlist:0DiWol3AO6WpXZgp0goxAV', 'owner': {'display_name': 'Owner'}, 'images': [None, {'url': 'http://unsafe'}]}
        album = {'name': 'Album', 'uri': 'spotify:album:0DiWol3AO6WpXZgp0goxAV', 'artists': [{'name': 'Actual Artist'}]}
        artist = {'name': 'Actual Artist', 'uri': 'spotify:artist:0DiWol3AO6WpXZgp0goxAV'}
        payload = {'tracks': {'items': [TRACK], 'total': 100, 'next': 'next'}, 'playlists': {'items': [None, playlist], 'total': 21, 'next': 'next'}, 'albums': {'items': [album], 'total': 1}, 'artists': {'items': [artist], 'total': 12, 'next': 'next'}}
        result = normalize_search(payload, 0, 10, kind='all', account='AUTHORIZED')
        self.assertEqual(result['groups']['track']['next_offset'], 10)
        self.assertEqual(result['groups']['playlist']['total'], 21)
        self.assertIsNone(result['groups']['album']['next_offset'])
        p = result['groups']['playlist']['items'][0]
        self.assertEqual(p['media_content_id'], 'spotify://authorized/spotify:playlist:0DiWol3AO6WpXZgp0goxAV')
        self.assertEqual(p['media_content_type'], 'spotify://playlist')
        self.assertEqual(p['subtitle'], 'Owner')
        self.assertIsNone(p['thumbnail'])
        self.assertTrue(p['can_play']); self.assertTrue(p['can_expand'])
        a = result['groups']['artist']['items'][0]
        self.assertFalse(a['can_play']); self.assertTrue(a['can_expand'])
        self.assertEqual(result['groups']['album']['items'][0]['subtitle'], 'Actual Artist')

    def test_typed_metadata_and_malformed_matching_uri(self):
        track = {**TRACK, 'duration_ms': 123456, 'explicit': True, 'album': {'name': 'Discovery'}}
        page = normalize_search({'tracks': {'items': [track, {**track, 'uri': 'spotify:album:0DiWol3AO6WpXZgp0goxAV'}, {**track, 'artists': None, 'album': None}]}}, 0, 10, kind='track', account='account')
        self.assertEqual(len(page['items']), 2)
        self.assertEqual(page['items'][0]['duration_ms'], 123456)
        self.assertEqual(page['items'][0]['album'], 'Discovery')
        self.assertTrue(page['items'][0]['explicit'])
        self.assertEqual(page['items'][0]['kind'], 'track')
        with self.assertRaises(SearchError): validate_query('ok', kind='episode')

class TypedGatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_kind_and_account_have_distinct_cache_and_inflight_keys(self):
        calls = []
        async def fetch(*args):
            calls.append(args); await asyncio.sleep(0.01)
            return {'tracks': {'items': [TRACK]}, 'albums': {'items': []}}
        gateway = SearchGateway()
        await asyncio.gather(gateway.search('a', 'q', 10, 0, fetch, kind='track'), gateway.search('a', 'q', 10, 0, fetch, kind='album'), gateway.search('b', 'q', 10, 0, fetch, kind='track'))
        self.assertEqual(len(calls), 3)
        await gateway.search('a', 'q', 10, 0, fetch, kind='album')
        self.assertEqual(len(calls), 3)
        await gateway.close()
