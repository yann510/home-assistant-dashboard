"""Gym source isolation and session restoration across house moods."""
from copy import deepcopy
import unittest
from test_sonos import FakeIO
from test_lights import IO, Bridge, LightControls, NEON, FIELDS
from test_coordinator import MemoryStore
from custom_components.house_moods.sonos import SonosControls, SOURCE, SPEAKERS, FOLLOW, GROUPS
from custom_components.house_moods.coordinator import MoodCoordinator

GYM='media_player.gym'
GYM_LIGHT='light.gym'

class HouseIO(FakeIO):
    def __init__(self):
        super().__init__()
        self.states.update(IO().states)
        self.states[GYM_LIGHT]={'state':'off','attributes':{'brightness':77,'color_mode':'brightness','supported_color_modes':['brightness']}}
        self.favorites += [dict(self.favorites[0],title=title,media_content_id=ident) for title,ident in [('Bangers Workout Mix','FV:2/2'),('Chill House Mix','FV:2/4'),('Cozy Dinner Mix','FV:2/3'),('Electro House Mix','FV:2/7')]]
        self.queues={e:[{'media_content_id':'old-'+e}] for e in SPEAKERS}
    async def queue(self,e):return deepcopy(self.queues[e])
    async def call(self,domain,service,targets,data,session_id,return_response=False):
        if domain=='light':
            self.calls.append((domain,service,targets,deepcopy(data)))
            state=self.states[targets[0]];state['state']='on' if service=='turn_on' else 'off';state['attributes'].update(data)
            return {}
        if service=='unjoin':
            for e in SPEAKERS:
                group=self.states[e]['attributes']['group_members']
                self.states[e]['attributes']['group_members']=[e] if e in targets else [s for s in group if s not in targets]
        if service=='join':
            members=[targets[0],*data['group_members']]
            for e in members:self.states[e]['attributes']['group_members']=members.copy()
        if service=='play_media':self.queues[targets[0]]=[{'media_content_id':data['media_content_id']}]
        return await super().call(domain,service,targets,data,session_id,return_response)

class Adapter:
    def __init__(self,io,bridge):self.lights=LightControls(io,bridge,'754063076');self.sonos=SonosControls(io)
    def control(self,t):return self.lights if t.startswith('light.') else self.sonos
    async def snapshot_targets(self):return self.lights.snapshot_targets()+self.sonos.snapshot_targets()
    async def included_targets(self,m):return self.lights.included_targets(m)+self.sonos.included_targets(m)
    async def preflight(self,m):await self.lights.preflight(m);await self.sonos.preflight(m)
    async def plan_apply(self,m):return await self.lights.plan_apply(m)+await self.sonos.plan_apply(m)
    async def read(self,t):return await self.control(t).read(t)
    async def capture(self,ts):return {t:await self.read(t) for t in ts}
    async def apply_write(self,w,s):return await self.control(w.targets[0]).apply_write(w,s)
    async def restore(self,t,b,s):return await self.control(t).restore(t,b,s)
    def restoration_state(self,t,b):return self.control(t).restoration_state(t,b)
    def restore_dependencies(self):return {FOLLOW,GROUPS}
    async def prepare_restore(self,s):return await self.sonos.prepare_restore(s)

class GymTests(unittest.IsolatedAsyncioTestCase):
    async def test_gym_plays_only_gym_preserves_volume_and_restores_group_after_end(self):
        for group in ([GYM],[SOURCE,GYM],[SOURCE,'media_player.bathroom',GYM],[GYM,SOURCE,'media_player.bathroom']):
            with self.subTest(group=group):
                io=HouseIO();bridge=Bridge();adapter=Adapter(io,bridge);store=MemoryStore();engine=MoodCoordinator(adapter,store)
                for e in group:io.states[e]['attributes']['group_members']=group.copy()
                baseline=deepcopy(io.states);groups=await adapter.read(GROUPS)
                result=await engine.activate('gym');self.assertTrue(result['success'],result)
                self.assertEqual(io.states[GYM_LIGHT]['attributes']['brightness'],255)
                self.assertEqual(io.states[GYM]['state'],'playing')
                self.assertEqual(io.states[GYM]['attributes']['group_members'],[GYM])
                if group[0] != GYM:
                    self.assertEqual(io.states[SOURCE]['attributes']['group_members'],[e for e in group if e != GYM])
                self.assertEqual(io.states[GYM]['attributes']['volume_level'],.8)
                self.assertEqual(io.states[FOLLOW]['state'],'off')
                self.assertEqual([c[2] for c in io.calls if c[1]=='play_media'],[[GYM]])
                self.assertFalse(any(c[1]=='volume_set' for c in io.calls))
                self.assertEqual(bridge.sent,[])
                result=await engine.end();self.assertTrue(result['success'],result)
                self.assertEqual(io.states[GYM_LIGHT]['state'],'off')
                self.assertEqual(io.states[GYM]['state'],'paused')
                self.assertEqual(await adapter.read(GROUPS),groups)
                self.assertIsNone(store.value)

    async def test_repeated_switches_restore_dropped_lights_and_stop_previous_source(self):
        io=HouseIO();bridge=Bridge();adapter=Adapter(io,bridge);store=MemoryStore();engine=MoodCoordinator(adapter,store)
        baseline=None
        for mood in ['love','gym','unwind','gym','dinner','gym','party','gym','love','gym']:
            result=await engine.activate(mood);self.assertTrue(result['success'],result)
            if baseline is None:baseline=deepcopy(store.value.baseline)
            if mood == 'gym' and GYM_LIGHT not in baseline:
                baseline[GYM_LIGHT]={'state':'off','brightness':77,'color_mode':'brightness'}
            self.assertEqual(store.value.baseline,baseline)
            if mood=='gym':
                self.assertEqual(bridge.value.fields,FIELDS)
                self.assertEqual(io.states[SOURCE]['state'],'paused')
            else:
                self.assertEqual(io.states[GYM]['state'],'paused')
                self.assertEqual(io.states[GYM_LIGHT]['state'],'off')
        result=await engine.end();self.assertTrue(result['success'],result)
        self.assertEqual(bridge.value.fields,FIELDS)
        self.assertEqual(io.states[GYM]['state'],'paused')
        self.assertEqual(io.states[GYM_LIGHT]['state'],'off')
        self.assertEqual(io.states[SOURCE]['attributes']['volume_level'],.8)

    async def test_old_active_journal_acquires_gym_baseline_and_survives_restart(self):
        io=HouseIO();bridge=Bridge();adapter=Adapter(io,bridge);store=MemoryStore();engine=MoodCoordinator(adapter,store)
        self.assertTrue((await engine.activate('love'))['success'])
        # Model a journal from the deployed four-mood version.
        for target in (GYM_LIGHT,GYM+'#playback'):
            store.value.baseline.pop(target,None)
        session_id=store.value.session_id
        engine=MoodCoordinator(adapter,store)
        result=await engine.activate('gym');self.assertTrue(result['success'],result)
        self.assertEqual(store.value.session_id,session_id)
        self.assertEqual(store.value.baseline[GYM_LIGHT]['state'],'off')
        self.assertEqual(bridge.value.fields,FIELDS)
        engine=MoodCoordinator(adapter,store)
        await engine.reconcile()
        result=await engine.end();self.assertTrue(result['success'],result)
        self.assertEqual(io.states[GYM_LIGHT]['state'],'off')
        self.assertEqual(io.states[GYM]['state'],'paused')

    async def test_manual_gym_playback_and_light_changes_are_preserved_on_end(self):
        io=HouseIO();bridge=Bridge();adapter=Adapter(io,bridge);store=MemoryStore();engine=MoodCoordinator(adapter,store)
        result=await engine.activate('gym');self.assertTrue(result['success'],result)
        io.queues[GYM]=[{'media_content_id':'manual-workout'}]
        io.states[GYM_LIGHT]['attributes']['brightness']=80
        await engine.observe(GYM+'#playback')
        await engine.observe(GYM_LIGHT)
        result=await engine.end();self.assertTrue(result['success'],result)
        self.assertEqual(io.states[GYM]['state'],'playing')
        self.assertEqual(io.states[GYM_LIGHT]['attributes']['brightness'],80)

    async def test_unavailable_gym_light_only_blocks_gym_before_writes(self):
        io=HouseIO();io.states[GYM_LIGHT]['state']='unavailable'
        bridge=Bridge();adapter=Adapter(io,bridge);store=MemoryStore();engine=MoodCoordinator(adapter,store)
        result=await engine.activate('gym');self.assertFalse(result['success'])
        self.assertEqual(io.calls,[])
        self.assertEqual(bridge.sent,[])
        self.assertIsNone(store.value)
        result=await engine.activate('love');self.assertTrue(result['success'],result)
        self.assertNotIn(GYM_LIGHT,store.value.baseline)
