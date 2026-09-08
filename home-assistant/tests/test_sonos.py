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

class SonosTelemetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_incomplete_controls_are_not_authoritative(self):
        cases = [
            (SOURCE, SOURCE+'#volume', {'state':'unavailable','attributes':{}}),
            (SOURCE, SOURCE+'#volume', {'state':'unknown','attributes':{'volume_level':.25}}),
            (SOURCE, SOURCE+'#volume', {'state':'paused','attributes':{}}),
            (SOURCE, SOURCE+'#volume', {'state':'paused','attributes':{'volume_level':None}}),
            (SOURCE, SOURCE+'#volume', {'state':'paused','attributes':{'volume_level':float('nan')}}),
            (SOURCE, SOURCE+'#volume', {'state':'paused','attributes':{'volume_level':True}}),
            (FOLLOW, FOLLOW, {'state':'unavailable','attributes':{}}),
            ('input_text.speaker_follow_source', FOLLOW, {'state':'unknown','attributes':{}}),
            ('input_text.speaker_follow_source', FOLLOW, {'attributes':{}}),
            (SOURCE, GROUPS, {'state':'paused','attributes':{}}),
            (SOURCE, GROUPS, {'state':'paused','attributes':{'group_members':[]}}),
            (SOURCE, GROUPS, {'state':'unavailable','attributes':{'group_members':[SOURCE]}}),
        ]
        for entity, target, state in cases:
            with self.subTest(entity=entity,target=target,state=state):
                io=FakeIO();io.states[entity]=state
                with self.assertRaises(ValueError):await SonosControls(io).read(target)

    async def test_group_reports_must_form_one_consistent_partition(self):
        for report in ([SOURCE,'media_player.bathroom'], ['media_player.bathroom'], [SOURCE,SOURCE]):
            with self.subTest(report=report):
                io=FakeIO();io.states[SOURCE]['attributes']['group_members']=report
                with self.assertRaises(ValueError):await SonosControls(io).read(GROUPS)

    async def test_stopped_speakers_and_disabled_empty_follow_are_valid(self):
        io=FakeIO();sonos=SonosControls(io)
        for state in ('idle','paused','off','stopped'):
            io.states[SOURCE]['state']=state
            self.assertEqual(await sonos.read(SOURCE+'#volume'),{'volume_level':.8})
            self.assertEqual(len((await sonos.read(GROUPS))['groups']),4)
        self.assertEqual(await sonos.read(FOLLOW),{'state':'off','source':''})

    async def test_optional_speaker_baselines_fail_closed_before_commands(self):
        for missing in ('volume_level','group_members'):
            io=FakeIO();del io.states['media_player.gym']['attributes'][missing]
            with self.subTest(missing=missing):
                with self.assertRaises(ValueError):await SonosControls(io).preflight('love')
                self.assertEqual(io.calls,[])


class SonosRecoveryTests(unittest.IsolatedAsyncioTestCase):
    def seeded(self, target):
        from test_coordinator import MemoryStore
        from custom_components.house_moods.model import Session
        from custom_components.house_moods.coordinator import MoodCoordinator
        io=FakeIO();sonos=SonosControls(io)
        baseline = {SOURCE+'#volume':{'volume_level':.8}, FOLLOW:{'state':'off','source':''},
                    GROUPS:{'groups':[[e] for e in SPEAKERS]}}
        baseline[GROUPS]['groups'].sort(key=lambda g:SPEAKERS.index(g[0]))
        expected = {SOURCE+'#volume':{'volume_level':.25},FOLLOW:{'state':'on','source':SOURCE},
                    GROUPS:{'groups':[[SOURCE,'media_player.bathroom'],['media_player.bedroom'],['media_player.gym']]}}
        io.states[SOURCE]['attributes']['volume_level']=.25
        if target == FOLLOW:
            io.states[FOLLOW]['state']='on';io.states['input_text.speaker_follow_source']['state']=SOURCE
        if target == GROUPS:
            for e in (SOURCE,'media_player.bathroom'):
                io.states[e]['attributes']['group_members']=[SOURCE,'media_player.bathroom']
        light='light.independent'
        class Composite:
            light_state={'state':'on'}
            async def read(self,t):return deepcopy(self.light_state) if t==light else await sonos.read(t)
            async def capture(self,targets):return {t:await self.read(t) for t in targets}
            async def restore(self,t,b,s):
                if t==light:self.light_state=deepcopy(b)
                else:await sonos.restore(t,b,s)
            def restore_dependencies(self):return {FOLLOW,GROUPS}
            async def prepare_restore(self,s):return await sonos.prepare_restore(s)
            async def apply_write(self,w,s):return await sonos.apply_write(w,s)
        adapter=Composite();store=MemoryStore()
        store.value=Session('s','love','active',baseline={target:baseline[target],light:{'state':'off'}},
                            expected={target:expected[target],light:{'state':'on'}},owned={target,light})
        original_call=io.call
        async def call(domain,service,targets,data,session_id,return_response=False):
            if service=='unjoin':
                for e in SPEAKERS:
                    members=io.states[e]['attributes']['group_members']
                    io.states[e]['attributes']['group_members']=[e] if e in targets else [m for m in members if m not in targets]
            return await original_call(domain,service,targets,data,session_id,return_response)
        io.call=call
        return io,adapter,store,MoodCoordinator(adapter,store),light

    async def test_disconnect_observation_end_restart_and_retry_preserve_owned_baseline(self):
        from custom_components.house_moods.coordinator import MoodCoordinator
        for target, entity in ((SOURCE+'#volume',SOURCE),(FOLLOW,FOLLOW),(GROUPS,SOURCE)):
            for restart_first in (False,True):
                with self.subTest(target=target,restart_first=restart_first):
                    io,adapter,store,engine,light=self.seeded(target)
                    baseline=deepcopy(store.value.baseline[target]);available=deepcopy(io.states[entity])
                    io.states[entity]={'state':'unavailable','attributes':{}}
                    if restart_first:
                        await engine.reconcile()
                    else:
                        with self.assertRaises(ValueError):await engine.observe(target)
                    self.assertIn(target,store.value.owned)
                    self.assertFalse((await engine.end())['success'])
                    self.assertEqual(adapter.light_state,{'state':'off'})
                    self.assertEqual(store.value.baseline[target],baseline)
                    self.assertIn(target,store.value.owned)
                    engine=MoodCoordinator(adapter,store);await engine.reconcile()
                    self.assertIn(target,store.value.owned)
                    io.states[entity]=available
                    self.assertTrue((await engine.retry_restoration())['success'])
                    self.assertIsNone(store.value)
                    self.assertEqual(await adapter.read(target),baseline)

    async def test_transient_group_overlap_retains_ownership_until_graph_returns(self):
        io,adapter,store,engine,_=self.seeded(GROUPS)
        io.states['media_player.bathroom']['attributes']['group_members']=['media_player.bathroom']
        self.assertFalse((await engine.end())['success'])
        self.assertIn(GROUPS,store.value.owned)
        io.states['media_player.bathroom']['attributes']['group_members']=[SOURCE,'media_player.bathroom']
        self.assertTrue((await engine.retry_restoration())['success'])

    async def test_genuine_manual_change_after_reconnection_is_preserved(self):
        for target, entity in ((SOURCE+'#volume',SOURCE),(FOLLOW,FOLLOW),(GROUPS,SOURCE)):
            with self.subTest(target=target):
                io,adapter,store,engine,_=self.seeded(target)
                available=deepcopy(io.states[entity]);io.states[entity]={'state':'unavailable','attributes':{}}
                self.assertFalse((await engine.end())['success'])
                io.states[entity]=available
                if target.endswith('#volume'):io.states[entity]['attributes']['volume_level']=.6
                elif target==FOLLOW:io.states[FOLLOW]['state']='off'
                else:
                    for e in SPEAKERS:io.states[e]['attributes']['group_members']=[e]
                current=await adapter.read(target)
                self.assertTrue((await engine.retry_restoration())['success'])
                self.assertEqual(await adapter.read(target),current)

    async def test_unrelated_offline_speaker_does_not_block_owned_volume_or_light(self):
        target=SOURCE+'#volume'
        io,adapter,store,engine,_=self.seeded(target)
        io.states['media_player.gym']={'state':'unavailable','attributes':{}}
        self.assertTrue((await engine.end())['success'])
        self.assertEqual(await adapter.read(target),{'volume_level':.8})
        self.assertEqual(adapter.light_state,{'state':'off'})
        self.assertIsNone(store.value)
