"""Off-state HA attributes hide DP22: exercise raw storage independently."""
from copy import deepcopy
import unittest
from test_lights import IO, Bridge, LightControls, CoordinatorLightAdapter, STRIP
from test_coordinator import MemoryStore
from custom_components.house_moods.coordinator import MoodCoordinator
from custom_components.house_moods.modes import TUYA_LIGHTS, MODE_ENTITIES

class RawIO(IO):
    def __init__(self, mode='night'):
        super().__init__()
        self.raw = {device: 126 if mode == 'night' else 1000 for device in TUYA_LIGHTS.values()}
        self.states[STRIP]['state'] = 'off'
        self.states[STRIP]['attributes'].update(brightness=None, color_mode=None)
        self.states.update({entity: {'state': 'on' if name == mode else 'off', 'attributes': {}} for name, entity in MODE_ENTITIES.items()})
        self.fail_stage = False
        self.power_at_stage = []
    async def call(self, domain, service, targets, data, session_id, return_response=False):
        if domain == 'localtuya':
            self.calls.append((domain, service, targets, deepcopy(data)))
            self.power_at_stage.append(self.states[STRIP]['state'])
            if self.fail_stage: raise OSError('DP offline')
            self.raw[data['device_id']] = data['value']
            return
        await super().call(domain, service, targets, data, session_id, return_response)
        if domain == 'light' and service == 'turn_on' and 'brightness' in data and targets[0] in TUYA_LIGHTS:
            self.raw[TUYA_LIGHTS[targets[0]]] = data['brightness'] * 3  # Deliberately distinct from normalized HA brightness.
        if domain == 'light' and service == 'turn_off':
            self.states[targets[0]]['attributes'].update(brightness=None, color_mode=None)

class OffModeBaselineTests(unittest.IsolatedAsyncioTestCase):
    def make(self, mode='night'):
        io = RawIO(mode)
        controls = LightControls(io, Bridge(), '754063076')
        store = MemoryStore()
        return io, controls, store, MoodCoordinator(CoordinatorLightAdapter(controls), store)
    async def test_off_owned_strip_restores_captured_mode_default_without_power_on(self):
        for mode, raw in [('day', 1000), ('night', 126)]:
            with self.subTest(mode=mode):
                io, _, _, engine = self.make(mode)
                await engine.activate('unwind')
                self.assertNotEqual(io.raw[TUYA_LIGHTS[STRIP]], raw)
                result = await engine.end()
                self.assertTrue(result['success'], result)
                self.assertEqual(io.raw[TUYA_LIGHTS[STRIP]], raw)
                self.assertEqual(io.power_at_stage, ['off'])
    async def test_failed_stage_retains_recovery_and_retries_after_restart(self):
        io, controls, store, engine = self.make()
        await engine.activate('unwind')
        io.fail_stage = True
        self.assertEqual((await engine.end())['phase'], 'recovery_required')
        restarted = MoodCoordinator(CoordinatorLightAdapter(controls), store)
        await restarted.reconcile()
        io.fail_stage = False
        result = await restarted.retry_restoration()
        self.assertTrue(result['success'], result)
        self.assertEqual(io.raw[TUYA_LIGHTS[STRIP]], 126)
        self.assertTrue(all(state == 'off' for state in io.power_at_stage))
    async def test_manual_override_during_mood_skips_staging(self):
        io, _, _, engine = self.make()
        await engine.activate('unwind')
        io.raw[TUYA_LIGHTS[STRIP]] = 555
        engine.note_external(STRIP)
        await engine.observe(STRIP, {}, 'external:manual')
        await engine.end()
        self.assertEqual(io.raw[TUYA_LIGHTS[STRIP]], 555)
        self.assertEqual(io.power_at_stage, [])
    async def test_changed_base_mode_skips_old_staging_default(self):
        io, _, _, engine = self.make()
        await engine.activate('unwind')
        io.states[MODE_ENTITIES['night']]['state'] = 'off'
        io.states[MODE_ENTITIES['day']]['state'] = 'on'
        io.raw[TUYA_LIGHTS[STRIP]] = 1000
        await engine.end()
        self.assertEqual(io.raw[TUYA_LIGHTS[STRIP]], 1000)
        self.assertEqual(io.power_at_stage, [])
    async def test_only_brightness_changed_owned_devices_are_restaged(self):
        io, _, _, engine = self.make()
        office = 'light.office_bulbs'
        io.raw[TUYA_LIGHTS[office]] = 555
        await engine.activate('love')
        await engine.end()
        self.assertEqual(io.raw[TUYA_LIGHTS[office]], 555)
        self.assertEqual([data['device_id'] for domain, _, _, data in io.calls if domain == 'localtuya'], [TUYA_LIGHTS[STRIP]])
    async def test_unseen_custom_pre_mood_raw_uses_documented_mode_default_policy(self):
        io, _, _, engine = self.make()
        io.raw[TUYA_LIGHTS[STRIP]] = 555  # Hidden by HA; no supported readback.
        await engine.activate('unwind')
        await engine.end()
        self.assertEqual(io.raw[TUYA_LIGHTS[STRIP]], 126)
    async def test_manual_override_after_failed_staging_survives_retry(self):
        io, _, _, engine = self.make()
        await engine.activate('unwind')
        io.fail_stage = True
        await engine.end()
        io.raw[TUYA_LIGHTS[STRIP]] = 555
        engine.note_external(STRIP)
        await engine.observe(STRIP, {}, 'external:manual')
        io.fail_stage = False
        result = await engine.retry_restoration()
        self.assertTrue(result['success'], result)
        self.assertEqual(io.raw[TUYA_LIGHTS[STRIP]], 555)
