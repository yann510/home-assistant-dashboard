"""Real HA service registry/event loop with simulated hardware endpoints."""
import asyncio
import tempfile
import unittest
from unittest.mock import patch
from homeassistant.core import HomeAssistant
from custom_components.house_moods import async_setup
from custom_components.house_moods.ha_adapter import HAIO
from custom_components.house_moods.modes import ModeControls, MODE_ENTITIES, LEGACY_AUTOMATIONS, TUYA_LIGHTS
from test_integration import Adapter

class ModeAdapter(Adapter):
    def __init__(self, hass, io):
        super().__init__()
        self.modes = ModeControls(io)
        self.states.update({target: {'state': 'off'} for target in TUYA_LIGHTS})
    async def preflight_mode(self, mode): await self.modes.preflight(mode)
    def mode_targets(self, mode): return self.modes.targets(mode)
    def mode_steps(self, mode): return self.modes.steps(mode)
    def mode_step_target(self, mode, step): return self.modes.target(mode, step)
    async def apply_mode_step(self, mode, step, session): await self.modes.apply(mode, step, session)

class ModeRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)
        self.calls = []
        for entity in LEGACY_AUTOMATIONS:
            self.hass.states.async_set(entity, 'off')
        for entity in MODE_ENTITIES.values():
            self.hass.states.async_set(entity, 'off')
        async def service(call):
            self.calls.append((call.domain, call.service, dict(call.data)))
            if call.domain == 'input_boolean':
                ids = call.data['entity_id']
                for entity in [ids] if isinstance(ids, str) else ids:
                    self.hass.states.async_set(entity, 'on' if call.service == 'turn_on' else 'off', context=call.context)
        for domain, name in [('input_boolean', 'turn_on'), ('input_boolean', 'turn_off'), ('localtuya', 'set_dp'), ('light', 'turn_off')]:
            self.hass.services.async_register(domain, name, service)
    async def setup(self, enabled=True):
        with patch('custom_components.house_moods.HAAdapter', ModeAdapter):
            await async_setup(self.hass, {'house_moods': {'coordinated_modes': enabled}})
        return self.hass.data['house_moods']
    async def asyncTearDown(self):
        if 'house_moods' in self.hass.data:
            await self.hass.data['house_moods'].close()
        await self.hass.async_block_till_done()
        self.temp.cleanup()
    async def call_mode(self, mode):
        return await self.hass.services.async_call('house_moods', 'apply_mode', {'mode': mode}, blocking=True, return_response=True)
    async def test_night_and_day_match_captured_routines_without_powering_on_lights(self):
        runtime = await self.setup()
        for mode, raw in [('night', 126), ('day', 1000)]:
            with self.subTest(mode=mode):
                self.calls.clear()
                result = await self.call_mode(mode)
                await self.hass.async_block_till_done()
                self.assertTrue(result['success'])
                self.assertEqual(result['mode_result'], 'accepted')
                dp = [data for domain, service, data in self.calls if domain == 'localtuya']
                self.assertEqual(dp, [{'device_id': device, 'dp': 22, 'value': raw} for device in TUYA_LIGHTS.values()])
                lights = [(service, data['entity_id']) for domain, service, data in self.calls if domain == 'light']
                self.assertEqual(lights, [('turn_off', ['light.light_toilet'])] if mode == 'night' else [])
                self.assertEqual(self.hass.states.get(MODE_ENTITIES[mode]).state, 'on')
                self.assertEqual(self.hass.states.get(MODE_ENTITIES['day' if mode == 'night' else 'night']).state, 'off')
                self.assertIsNone(runtime.engine.session)
    async def test_unmigrated_server_never_advertises_or_executes_coordinated_modes(self):
        await self.setup(False)
        self.assertIsNone(self.hass.states.get('sensor.house_mood').attributes['mode_control'])
        self.assertFalse((await self.call_mode('night'))['success'])
        self.assertEqual(self.calls, [])
    async def test_reenabled_legacy_automation_fails_closed_before_any_write(self):
        await self.setup()
        self.hass.states.async_set(LEGACY_AUTOMATIONS[0], 'on')
        self.assertFalse((await self.call_mode('night'))['success'])
        self.assertEqual(self.calls, [])
    async def test_same_state_external_helper_call_runs_routine_once_without_recursion(self):
        runtime = await self.setup()
        self.hass.states.async_set(MODE_ENTITIES['night'], 'on')
        await runtime.engine.activate('love')
        await self.hass.services.async_call('input_boolean', 'turn_on', {'entity_id': MODE_ENTITIES['night']}, blocking=True)
        await self.hass.async_block_till_done()
        self.assertIsNone(runtime.engine.session)
        self.assertEqual(len([call for call in self.calls if call[0] == 'localtuya']), 7)
    async def test_missing_helper_rejects_without_touching_devices(self):
        await self.setup()
        self.hass.states.async_remove(MODE_ENTITIES['day'])
        self.assertFalse((await self.call_mode('night'))['success'])
        self.assertEqual(self.calls, [])
    async def test_external_night_during_start_repairs_helper_truth_without_running_night(self):
        self.hass.states.async_set(MODE_ENTITIES['day'], 'on')
        runtime = await self.setup()
        started, release = asyncio.Event(), asyncio.Event()
        original = runtime.adapter.apply_write
        async def blocked(*args):
            started.set()
            await release.wait()
            return await original(*args)
        runtime.adapter.apply_write = blocked
        activation = asyncio.create_task(runtime.engine.activate('love'))
        await started.wait()
        await self.hass.services.async_call('input_boolean', 'turn_on', {'entity_id': MODE_ENTITIES['night']}, blocking=True)
        # Give the external intent handler a chance to reject and wait on the lock.
        await asyncio.sleep(0)
        release.set()
        await activation
        await self.hass.async_block_till_done()
        self.assertEqual(self.hass.states.get(MODE_ENTITIES['night']).state, 'off')
        self.assertEqual(self.hass.states.get(MODE_ENTITIES['day']).state, 'on')
        self.assertFalse(any(domain == 'localtuya' for domain, _, _ in self.calls))
        self.assertEqual(runtime.engine.session.active_mood, 'love')
        self.assertFalse(self.hass.states.get('sensor.house_mood').attributes['success'])
    async def test_null_yaml_configuration_preserves_legacy_setup_without_capability(self):
        with patch('custom_components.house_moods.HAAdapter', ModeAdapter):
            self.assertTrue(await async_setup(self.hass, {'house_moods': None}))
        self.assertIsNone(self.hass.states.get('sensor.house_mood').attributes['mode_control'])
        self.assertFalse((await self.call_mode('night'))['success'])
        self.assertEqual(self.calls, [])
