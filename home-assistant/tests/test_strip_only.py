from copy import deepcopy
import unittest
from test_lights import IO, Bridge, LightControls, CoordinatorLightAdapter, STRIP, NEON
from test_coordinator import MemoryStore
from custom_components.house_moods.coordinator import MoodCoordinator

OFF_LIGHTS=('light.office_bulbs','light.light_living_room_bulbs','light.light_toilet','light.light_bedroom','light.light_front_door','light.light_kitchen','light.light_laundry_room','light.bedroom_closet','light.gym')

class StripOnlyTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self):
        io=IO()
        for index,entity in enumerate(OFF_LIGHTS):
            io.states[entity]={'state':'on' if index % 2 else 'off','attributes':{'brightness':90+index,'color_mode':'brightness','supported_color_modes':['brightness']}}
        io.states['light.office_bulbs']={'state':'on','attributes':{'color_mode':'onoff','supported_color_modes':['onoff']}}
        bridge=Bridge();controls=LightControls(io,bridge,'754063076')
        return io,bridge,controls

    async def test_love_and_party_turn_off_every_individual_nonstrip_light(self):
        for mood in ('love','party'):
            with self.subTest(mood=mood):
                io,bridge,controls=self.fixture()
                engine=MoodCoordinator(CoordinatorLightAdapter(controls),MemoryStore())
                result=await engine.activate(mood);self.assertTrue(result['success'],result)
                self.assertEqual({e for _,service,entities,_ in io.calls if service=='turn_off' for e in entities},set(OFF_LIGHTS))
                self.assertTrue(all(io.states[e]['state']=='off' for e in OFF_LIGHTS))
                self.assertEqual(io.states[STRIP]['state'],'on')
                self.assertEqual(bridge.value.fields['d1'],1)

    async def test_repeated_switches_and_end_restore_original_owned_lights(self):
        io,bridge,controls=self.fixture()
        original=deepcopy(io.states);store=MemoryStore()
        engine=MoodCoordinator(CoordinatorLightAdapter(controls),store)
        baseline=None
        for mood in ('love','party','unwind','love','dinner','party'):
            result=await engine.activate(mood);self.assertTrue(result['success'],result)
            if baseline is None:baseline=deepcopy(store.value.baseline)
            self.assertEqual(store.value.baseline,baseline)
            if mood=='unwind':
                for entity in OFF_LIGHTS:self.assertEqual(io.states[entity]['state'],original[entity]['state'])
        # A user's manual power change after Party is preserved.
        io.states['light.light_bedroom']['state']='on'
        await engine.observe('light.light_bedroom', 'external:manual')
        result=await engine.end();self.assertTrue(result['success'],result)
        for entity in OFF_LIGHTS:
            self.assertEqual(io.states[entity]['state'],'on' if entity=='light.light_bedroom' else original[entity]['state'])
        self.assertIsNone(store.value)
