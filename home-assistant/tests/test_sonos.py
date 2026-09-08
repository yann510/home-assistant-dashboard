import asyncio
from copy import deepcopy
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from custom_components.house_moods.sonos import SonosControls, resolve_favorite, FOLLOW, GROUPS, SOURCE, SPEAKERS

class FakeIO:
    def __init__(self):
        self.states = {e: {'state': 'paused', 'attributes': {'volume_level': .8, 'group_members': [e]}} for e in SPEAKERS}
        self.states.update({FOLLOW: {'state':'off','attributes':{}}, 'input_text.speaker_follow_source': {'state':'','attributes':{}}, 'script.speaker_follow_motion': {'state':'off','attributes':{}}})
        self.calls=[];self.queue_items=[{'media_content_id':'old-track'}]
        self.favorites=[{'title':'Crush Radio','media_content_id':'FV:2/1','media_content_type':'favorite_item_id','can_play':True}]
    def state(self,e): return deepcopy(self.states.get(e, {'state':'unavailable','attributes':{}}))
    async def queue(self,e):return deepcopy(self.queue_items)
    async def browse(self,e,kind,ident):return {'children':deepcopy(self.favorites)}
    async def wait(self,predicate,timeout=15):
        if not predicate():raise TimeoutError('not confirmed')
    async def call(self,domain,service,targets,data,session_id,return_response=False):
        self.calls.append((domain,service,targets,deepcopy(data)))
        if domain=='media_player' and service=='volume_set':self.states[targets[0]]['attributes']['volume_level']=data['volume_level']
        elif domain=='media_player' and service=='play_media':
            self.states[targets[0]]['state']='playing';self.queue_items=[{'media_content_id':'new-track'}]
        elif domain=='media_player' and service=='media_stop':self.states[targets[0]]['state']='paused'
        elif domain=='input_boolean':self.states[targets[0]]['state']='on' if service=='turn_on' else 'off'
        elif domain=='input_text':self.states[targets[0]]['state']=data['value']
        elif domain=='script':
            if data['command']=='enable':self.states[FOLLOW]['state']='on';self.states['input_text.speaker_follow_source']['state']=data['source_entity']
            else:
                self.states[FOLLOW]['state']='off';self.states['input_text.speaker_follow_source']['state']=''
                for e in SPEAKERS:self.states[e]['attributes']['group_members']=[e]
            return {'success':True}
        return {}

class FavoriteTests(unittest.TestCase):
    def test_resolves_unique_title_but_rejects_ambiguous_or_missing(self):
        item={'title':'Crush Radio','media_content_id':'FV:2/99','media_content_type':'favorite_item_id','can_play':True}
        self.assertEqual(resolve_favorite([item], 'FV:2/1','Crush Radio'),item)
        for library in [[],[item,dict(item,media_content_id='FV:2/98')]]:
            with self.assertRaises(ValueError):resolve_favorite(library,'FV:2/1','Crush Radio')

class SonosTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):self.io=FakeIO();self.sonos=SonosControls(self.io)
    async def test_volume_is_confirmed_before_playback_and_following(self):
        await self.sonos.preflight('love')
        writes=await self.sonos.plan_apply('love')
        for write in writes:await self.sonos.apply_write(write,'session')
        actions=[c[1] for c in self.io.calls]
        self.assertLess(actions.index('volume_set'),actions.index('play_media'))
        self.assertLess(actions.index('play_media'),actions.index('speaker_follow_motion'))
        self.assertEqual(self.io.states[SOURCE]['attributes']['volume_level'],.25)
        self.assertEqual((await self.sonos.read(FOLLOW))['source'],SOURCE)
    async def test_track_progress_does_not_change_queue_identity(self):
        a=await self.sonos.read(SOURCE+'#playback')
        self.io.states[SOURCE]['attributes'].update(media_title='next',media_content_id='next-track',media_position=10)
        b=await self.sonos.read(SOURCE+'#playback');self.assertEqual(a,b)
        self.io.queue_items=[{'media_content_id':'manual-other-playlist'}]
        self.assertNotEqual(b,await self.sonos.read(SOURCE+'#playback'))
    async def test_existing_follow_source_cleanup_is_journaled_with_groups(self):
        self.io.states[FOLLOW]['state']='on';self.io.states['input_text.speaker_follow_source']['state']='media_player.bedroom'
        await self.sonos.preflight('love');writes=await self.sonos.plan_apply('love')
        self.assertEqual(writes[0].action,'sonos.follow_disable')
        self.assertIn(GROUPS,writes[0].targets);self.assertIn(FOLLOW,writes[0].targets)
    async def test_end_stops_without_replaying_queue_and_restores_follow_without_group_side_effects(self):
        baseline=await self.sonos.read(SOURCE+'#playback')
        await self.sonos.restore(SOURCE+'#playback',baseline,'s')
        self.assertEqual(self.io.calls[-1][1],'media_stop')
        await self.sonos.restore(FOLLOW,{'state':'on','source':SOURCE},'s')
        self.assertFalse(any(c[0]=='script' for c in self.io.calls))
        self.assertEqual(self.sonos.restoration_state(SOURCE+'#playback',baseline),{'state':'stopped'})
    async def test_unavailable_source_prevents_all_writes(self):
        self.io.states[SOURCE]['state']='unavailable'
        with self.assertRaises(ValueError):await self.sonos.preflight('love')
        self.assertEqual(self.io.calls,[])
    async def test_motion_join_is_a_single_owned_group_operation(self):
        self.io.states[FOLLOW]['state']='on';self.io.states['input_text.speaker_follow_source']['state']=SOURCE
        write=await self.sonos.plan_join('media_player.bathroom')
        self.assertEqual(write.targets,[GROUPS])
        self.assertEqual(write.requested[GROUPS]['groups'][0], [SOURCE,'media_player.bathroom'])

    async def test_corrupt_follow_source_is_rejected_before_any_write(self):
        self.io.states[FOLLOW]['state']='on'
        with self.assertRaisesRegex(ValueError, 'source'):
            await self.sonos.preflight('love')
        self.assertEqual(self.io.calls, [])

    async def test_volume_timeout_prevents_play_and_follow(self):
        original=self.io.call
        async def no_volume(domain,service,targets,data,session_id,return_response=False):
            if service=='volume_set': return {}
            return await original(domain,service,targets,data,session_id,return_response)
        self.io.call=no_volume
        await self.sonos.preflight('love')
        with self.assertRaises(TimeoutError):
            for write in await self.sonos.plan_apply('love'):
                await self.sonos.apply_write(write,'s')
        self.assertEqual(self.io.calls, [])

    async def test_follow_failure_is_not_confirmed(self):
        await self.sonos.preflight('love')
        write=(await self.sonos.plan_apply('love'))[-1]
        async def failure(*args,**kwargs): return {'success':False,'error':'cleanup incomplete'}
        self.io.call=failure
        with self.assertRaisesRegex(ValueError,'cleanup incomplete'):
            await self.sonos.apply_write(write,'s')

    async def test_favorite_cycles_are_bounded_and_duplicate_titles_fail(self):
        self.io.favorites=[{'can_expand':True,'media_content_type':'favorites','media_content_id':''}]
        with self.assertRaisesRegex(ValueError,'missing'):
            await self.sonos.preflight('love')
        self.io.favorites=[{'title':'Crush Radio','media_content_id':f'FV:2/{n}','media_content_type':'favorite_item_id','can_play':True} for n in (88,89)]
        with self.assertRaisesRegex(ValueError,'ambiguous'):
            await self.sonos.preflight('love')

    async def test_manual_follow_override_never_freezes_or_restores_groups(self):
        from types import SimpleNamespace
        self.io.states[FOLLOW]['state']='on'
        session=SimpleNamespace(owned={FOLLOW,GROUPS},overridden={FOLLOW,GROUPS})
        self.assertEqual(await self.sonos.prepare_restore(session),[])
        self.assertEqual(self.io.calls,[])

    async def test_group_restore_failure_propagates_for_durable_recovery(self):
        baseline={'groups':[[SOURCE,'media_player.bathroom'],['media_player.bedroom'],['media_player.gym']]}
        async def failure(*args,**kwargs):raise OSError('offline')
        self.io.call=failure
        with self.assertRaisesRegex(OSError,'offline'):
            await self.sonos.restore(GROUPS,baseline,'s')

    async def test_switch_semantically_retains_all_music_controls(self):
        self.assertIn(GROUPS, self.sonos.included_targets('party'))
        self.assertIn(FOLLOW, self.sonos.included_targets('dinner'))

    async def test_no_effect_play_cannot_confirm_already_playing_old_music(self):
        self.io.states[SOURCE]['state']='playing'
        original=self.io.call
        async def ignore_play(domain,service,targets,data,session_id,return_response=False):
            if service=='play_media':return {}
            return await original(domain,service,targets,data,session_id,return_response)
        self.io.call=ignore_play
        await self.sonos.preflight('love')
        with self.assertRaises(TimeoutError):
            for write in await self.sonos.plan_apply('love'):
                await self.sonos.apply_write(write,'s')
        self.assertEqual(self.io.states[FOLLOW]['state'],'off')

    async def test_already_enabled_follow_is_owned_for_safe_end(self):
        self.io.states[FOLLOW]['state']='on'
        self.io.states['input_text.speaker_follow_source']['state']=SOURCE
        await self.sonos.preflight('love')
        writes=await self.sonos.plan_apply('love')
        self.assertTrue(any(FOLLOW in w.targets for w in writes))

    async def test_restoring_one_group_preserves_unchanged_other_group(self):
        self.io.states[SOURCE]['attributes']['group_members']=[SOURCE,'media_player.bathroom']
        self.io.states['media_player.bathroom']['attributes']['group_members']=[SOURCE,'media_player.bathroom']
        self.io.states['media_player.bedroom']['attributes']['group_members']=['media_player.bedroom','media_player.gym']
        self.io.states['media_player.gym']['attributes']['group_members']=['media_player.bedroom','media_player.gym']
        desired={'groups':[[SOURCE],['media_player.bathroom'],['media_player.bedroom','media_player.gym']]}
        original=self.io.call
        async def unjoin(domain,service,targets,data,session_id,return_response=False):
            if service=='unjoin':
                for e in SPEAKERS:
                    group=self.io.states[e]['attributes']['group_members']
                    self.io.states[e]['attributes']['group_members']=[e] if e in targets else [s for s in group if s not in targets]
            return await original(domain,service,targets,data,session_id,return_response)
        self.io.call=unjoin
        await self.sonos.restore(GROUPS,desired,'s')
        self.assertEqual([(c[1],c[2]) for c in self.io.calls],[('unjoin',['media_player.bathroom'])])
