import asyncio
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from custom_components.dashboard_spotify.collection import validate_collection, normalize_collection, fetch_collection
from custom_components.dashboard_spotify.search import SearchError, SearchGateway

ID='0DiWol3AO6WpXZgp0goxAV'
TRACK={'name':'Song','uri':'spotify:track:'+ID,'artists':[{'name':'Real Artist'}],'duration_ms':123456}
ALBUM={'name':'Album','uri':'spotify:album:'+ID,'images':[{'url':'https://i.scdn.co/cover'}],'artists':[{'name':'Real Artist'}]}

class CollectionTests(unittest.TestCase):
    def test_native_ids_are_bound_to_authorized_account_and_strictly_validated(self):
        self.assertEqual(validate_collection('spotify://account/spotify:album:'+ID,'ACCOUNT',50,50,None),('album',ID,50,50,None))
        for uri in ['spotify://other/current_user_saved_tracks','spotify:album:'+ID,'spotify://account/../current_user_saved_tracks','spotify://account/current_user_saved_tracks?token=x','spotify://account/spotify:album:invalid','spotify://user:secret@account/current_user_saved_tracks','spotify://account:22/current_user_saved_tracks','spotify://account/%63urrent_user_saved_tracks']:
            with self.subTest(uri=uri), self.assertRaises(SearchError):validate_collection(uri,'account',50,0,None)
        for limit,offset,cursor in [(True,0,None),(51,0,None),(10,-1,None),(10,10001,None),(10,0,'evil'),(10,0,'1')]:
            with self.assertRaises(SearchError):validate_collection('spotify://account/current_user_saved_tracks','account',limit,offset,cursor)

    def test_album_tracks_keep_real_metadata_and_paginate_past_native48(self):
        payload={'page':{'items':[TRACK,{'is_local':True,**TRACK},None], 'total':130,'next':'untrusted'},'metadata':ALBUM}
        result=normalize_collection(payload,'album',ID,'account',50,50)
        self.assertEqual(result['next_offset'],100)
        self.assertEqual(result['total'],130)
        item=result['items'][0]
        self.assertEqual(item['subtitle'],'Real Artist');self.assertEqual(item['duration_ms'],123456)
        self.assertEqual(item['album'],'Album');self.assertEqual(item['thumbnail'],'https://i.scdn.co/cover')
        self.assertEqual(len(result['items']),1)
        self.assertTrue(result['collection']['can_play'])

    def test_current_and_legacy_playlist_items_and_missing_contents(self):
        for key in ['item','track']:
            result=normalize_collection({'page':{'items':[{key:TRACK}],'total':1},'metadata':{'name':'Mix','uri':'spotify:playlist:'+ID}},'playlist',ID,'account',0,50)
            self.assertEqual(result['items'][0]['title'],'Song')
        with self.assertRaises(SearchError) as error: normalize_collection({'metadata':{'name':'Restricted'}},'playlist',ID,'account',0,50)
        self.assertEqual(error.exception.code,'spotify_collection_restricted')

    def test_cursor_pages_preserve_unknown_recent_total_and_real_followed_total(self):
        result=normalize_collection({'page':{'items':[{'track':TRACK}],'cursors':{'before':'1720000000000'},'next':'next'}},'current_user_recently_played',None,'account',0,50)
        self.assertIsNone(result['total']);self.assertIsNone(result['next_offset']);self.assertEqual(result['next_cursor'],'1720000000000')
        result=normalize_collection({'page':{'items':[],'total':55,'cursors':{'after':ID},'next':'next'}},'current_user_followed_artists',None,'account',0,50)
        self.assertEqual(result['total'],55);self.assertEqual(result['next_cursor'],ID)

class CollectionGatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_reads_share_cache_cooldown_and_shutdown_with_search(self):
        gateway=SearchGateway();calls=[]
        async def fetch(*args):calls.append(args);return {'page':{'items':[{'track':TRACK}],'total':130,'next':'next'}}
        uri='spotify://account/current_user_saved_tracks'
        await asyncio.gather(*(gateway.collection('account',uri,50,50,None,fetch) for _ in range(3)))
        self.assertEqual(len(calls),1)
        async def limited(*args):raise SearchError('rate_limited','busy',3)
        with self.assertRaises(SearchError):await gateway.collection('account',uri,50,100,None,limited)
        with self.assertRaises(SearchError):await gateway.search('account','song',10,0,limited)
        await gateway.close()
        with self.assertRaises(SearchError):await gateway.collection('account',uri,50,50,None,fetch)

    async def test_playlist_fetch_uses_new_items_endpoint_and_actual_metadata(self):
        calls=[]
        async def get(path,params):
            calls.append((path,params))
            if path=='playlists/'+ID:return {'name':'Mix','uri':'spotify:playlist:'+ID,'items':{'total':130}}
            return {'items':[{'item':TRACK}],'total':130,'next':'next'}
        result=await fetch_collection('playlist',ID,50,50,None,get)
        self.assertEqual(calls[1],('playlists/'+ID+'/items',{'limit':50,'offset':50}))
        self.assertEqual(result['metadata']['name'],'Mix')
        async def restricted(path,params):return {'name':'Public Mix','uri':'spotify:playlist:'+ID}
        with self.assertRaises(SearchError) as error:await fetch_collection('playlist',ID,50,0,None,restricted)
        self.assertEqual(error.exception.code,'spotify_collection_restricted')

class CollectionLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_collection_and_search_use_same_concurrency_budget_and_cancel_on_shutdown(self):
        gateway=SearchGateway();release=asyncio.Event();active=0;peak=0;cancelled=[]
        async def fetch(*args):
            nonlocal active,peak
            active+=1;peak=max(peak,active)
            try:await release.wait()
            except asyncio.CancelledError:cancelled.append(True);raise
            finally:active-=1
            return {'page':{'items':[],'total':0}}
        tasks=[asyncio.create_task(gateway.collection('account','spotify://account/current_user_saved_tracks',50,i*50,None,fetch)) for i in range(3)]
        await asyncio.sleep(.01)
        search=asyncio.create_task(gateway.search('account','song',10,0,fetch))
        await asyncio.sleep(.01)
        self.assertEqual(peak,2)
        with self.assertRaises(SearchError):await gateway.collection('account','spotify://account/current_user_playlists',50,0,None,fetch)
        await gateway.close();await asyncio.gather(*tasks,search,return_exceptions=True)
        self.assertEqual(len(cancelled),2);self.assertEqual(gateway.cache,{});self.assertEqual(gateway.inflight,{})

    async def test_duplicate_playlist_tracks_keep_positions_and_unsafe_metadata_is_filtered(self):
        result=normalize_collection({'page':{'items':[{'item':TRACK},{'item':TRACK}],'total':2},'metadata':{'name':'Mix','uri':'spotify:playlist:'+ID,'access_token':'secret','images':[{'url':'https://secret@evil.test/x'}]}},'playlist',ID,'account',0,50)
        self.assertEqual([item['position'] for item in result['items']],[0,1]);self.assertNotIn('secret',str(result));self.assertIsNone(result['collection']['thumbnail'])
        result=normalize_collection({'page':{'items':[{'album':ALBUM}],'total':1}},'current_user_saved_albums',None,'account',0,50)
        self.assertEqual(result['items'][0]['subtitle'],'Real Artist')
        self.assertEqual(result['items'][0]['thumbnail'],'https://i.scdn.co/cover')
