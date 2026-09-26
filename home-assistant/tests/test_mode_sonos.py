"""Mode arbitration composed with production SonosControls and LightControls."""
from copy import deepcopy
import unittest
from test_gym import HouseIO, Adapter, Bridge
from test_coordinator import MemoryStore
from custom_components.house_moods.coordinator import MoodCoordinator
from custom_components.house_moods.modes import ModeControls, MODE_ENTITIES
from custom_components.house_moods.sonos import FOLLOW, GROUPS, SOURCE, SPEAKERS

class ModeAdapter(Adapter):
    def __init__(self, io, bridge):
        super().__init__(io, bridge)
        self.modes = ModeControls(io)
        # Only deployment eligibility is simulated here; actual service effects,
        # restoration planning and Sonos state comparisons use production code.
        async def eligible(mode):
            if mode not in MODE_ENTITIES: raise ValueError('Unknown mode')
        self.modes.preflight = eligible
    async def preflight_mode(self, mode): await self.modes.preflight(mode)
    def mode_targets(self, mode): return self.modes.targets(mode)
    def mode_steps(self, mode): return self.modes.steps(mode)
    def mode_step_target(self, mode, step): return self.modes.target(mode, step)
    async def apply_mode_step(self, mode, step, session): await self.modes.apply(mode, step, session)

class ModeSonosTests(unittest.IsolatedAsyncioTestCase):
    def make_engine(self):
        io = HouseIO()
        io.states.update({entity: {'state': 'off', 'attributes': {}} for entity in MODE_ENTITIES.values()})
        adapter = ModeAdapter(io, Bridge())
        return io, adapter, MoodCoordinator(adapter, MemoryStore())
    async def test_night_quiesces_follow_restores_groups_and_stops_owned_mood_music(self):
        io, adapter, engine = self.make_engine()
        baseline_groups = await adapter.read(GROUPS)
        self.assertTrue((await engine.activate('love'))['success'])
        self.assertEqual(io.states[FOLLOW]['state'], 'on')
        result = await engine.apply_mode('night')
        self.assertTrue(result['success'], result)
        self.assertEqual(io.states[FOLLOW]['state'], 'off')
        self.assertEqual(await adapter.read(GROUPS), baseline_groups)
        self.assertEqual(io.states[SOURCE]['state'], 'paused')
        self.assertEqual(io.states[SOURCE]['attributes']['volume_level'], .8)
        mode_index = next(i for i, call in enumerate(io.calls) if call[0] == 'localtuya')
        self.assertTrue(all(i < mode_index for i, call in enumerate(io.calls) if call[1] in ('media_stop', 'join', 'unjoin')))
    async def test_night_preserves_manually_selected_groups_volume_pause_and_follow(self):
        io, adapter, engine = self.make_engine()
        await engine.activate('love')
        group = [SPEAKERS[1], SOURCE]
        for entity in group: io.states[entity]['attributes']['group_members'] = group.copy()
        io.states[SOURCE]['attributes']['volume_level'] = .67
        io.states[SOURCE]['state'] = 'paused'
        io.states[FOLLOW]['state'] = 'off'
        for target in (GROUPS, FOLLOW, SOURCE + '#volume', SOURCE + '#playback'):
            engine.note_external(target)
            await engine.observe(target, {}, 'external:manual')
        groups = await adapter.read(GROUPS)
        before = len(io.calls)
        result = await engine.apply_mode('night')
        self.assertTrue(result['success'], result)
        self.assertEqual(await adapter.read(GROUPS), groups)
        self.assertEqual(io.states[SOURCE]['attributes']['volume_level'], .67)
        self.assertEqual(io.states[FOLLOW]['state'], 'off')
        self.assertFalse(any(call[0] in ('media_player', 'script') for call in io.calls[before:]))
