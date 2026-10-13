"""Run the night policy using HA scripts, templates, and the real helper trigger.

Only device services are replaced: they record writes and update light state.
"""
import json
from pathlib import Path
import tempfile
import unittest

from homeassistant.components.homeassistant.triggers import state as state_trigger
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant import loader
from homeassistant.components.automation.config import async_validate_config_item as validate_automation
from homeassistant.components.script.config import async_validate_config_item as validate_script
from homeassistant.helpers import config_validation as cv, trigger
from homeassistant.helpers.script import Script

PATH = Path(__file__).resolve().parents[1] / 'night-presence.json'
BUNDLE = json.loads(PATH.read_text())
ROOMS = [
    ('binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_2', ['light.office_bulbs', 'light.neon_light_led_strip']),
    ('binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_3', ['light.light_kitchen', 'light.kitchen_range_light']),
    ('binary_sensor.aqara_fp2_bathroom_presence_sensor_1', ['light.light_toilet']),
    ('binary_sensor.hue_motion_sensor_1_motion', ['light.light_bedroom']),
    ('binary_sensor.hue_motion_sensor_1_motion_3', ['light.bedroom_closet']),
    ('binary_sensor.hue_motion_sensor_1_motion_2', ['light.gym']),
    ('binary_sensor.hue_motion_sensor_2_motion', ['light.light_front_door', 'light.light_laundry_room']),
]
LIVING = ['light.light_living_room_bulbs', 'light.living_room_led_strip']
ATTRS = {'brightness': 64, 'rgb_color': (22, 44, 66), 'effect': 'Original'}


class NightPresenceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)
        self.calls = []
        self.after_write = None
        self.fail_light = None
        self.scripts = []
        self.detach = None
        self.hass.states.async_set('input_boolean.night_mode', 'off')
        self.hass.states.async_set('input_boolean.morning_mode', 'on')
        for sensor, lights in ROOMS:
            self.hass.states.async_set(sensor, 'on')
            for light in lights:
                self.hass.states.async_set(light, 'on', ATTRS)
        for light in LIVING:
            self.hass.states.async_set(light, 'on', ATTRS)

        async def light_write(call):
            self.calls.append((call.domain, call.service, dict(call.data)))
            if call.data.get('entity_id') == [self.fail_light]:
                raise HomeAssistantError('Device write failed')
            if call.service == 'turn_off':
                entity = call.data['entity_id']
                for light in [entity] if isinstance(entity, str) else entity:
                    self.hass.states.async_set(light, 'off', ATTRS)
            if self.after_write:
                self.after_write(call)

        for domain, service in [('light', 'turn_off'), ('light', 'turn_on'), ('localtuya', 'set_dp')]:
            self.hass.services.async_register(domain, service, light_write)

        async def helper(call):
            for entity in call.data['entity_id']:
                self.hass.states.async_set(entity, 'on' if call.service == 'turn_on' else 'off')

        for service in ['turn_on', 'turn_off']:
            self.hass.services.async_register('input_boolean', service, helper)
        self.policy = self.make_script(BUNDLE['script']['config']['sequence'])
        self.policy_runs = 0

        async def policy(call):
            self.policy_runs += 1
            await self.policy.async_run({}, Context())

        self.hass.services.async_register('script', 'night_presence_lights', policy)

    def make_script(self, actions):
        script = Script(self.hass, cv.SCRIPT_SCHEMA(actions), 'Night presence test', 'automation')
        self.scripts.append(script)
        return script

    async def asyncTearDown(self):
        if self.detach:
            self.detach()
        for script in self.scripts:
            await script.async_stop()
        await self.hass.async_block_till_done()
        self.temp.cleanup()

    def targets(self):
        self.assertTrue(all(domain == 'light' and service == 'turn_off' for domain, service, _ in self.calls), self.calls)
        self.assertTrue(all(set(data) == {'entity_id'} for _, _, data in self.calls), self.calls)
        return [entity for _, _, data in self.calls for entity in data['entity_id']]

    def unchanged(self, lights):
        for light in lights:
            state = self.hass.states.get(light)
            self.assertEqual(state.state, 'on')
            self.assertEqual(dict(state.attributes), ATTRS)

    async def run_policy(self):
        self.hass.states.async_set('input_boolean.night_mode', 'on')
        await self.policy.async_run({}, Context())

    async def test_office_occupied_kitchen_vacant(self):
        self.hass.states.async_set(ROOMS[1][0], 'off')
        await self.run_policy()
        self.assertEqual(self.targets(), ['light.light_kitchen', 'light.kitchen_range_light'] + LIVING)
        self.unchanged(ROOMS[0][1])

    async def test_kitchen_occupied_office_vacant(self):
        self.hass.states.async_set(ROOMS[0][0], 'off')
        await self.run_policy()
        self.assertEqual(self.targets(), ['light.office_bulbs', 'light.neon_light_led_strip'] + LIVING)
        self.unchanged(ROOMS[1][1])

    async def test_occupied_rooms_keep_all_attributes_living_still_off(self):
        await self.run_policy()
        self.assertEqual(self.targets(), LIVING)
        self.unchanged([light for _, lights in ROOMS for light in lights])

    async def test_missing_unknown_unavailable_presence_is_preserved(self):
        for i, (sensor, _) in enumerate(ROOMS):
            if i % 3 == 0:
                self.hass.states.async_remove(sensor)
            else:
                self.hass.states.async_set(sensor, 'unknown' if i % 3 == 1 else 'unavailable')
        await self.run_policy()
        self.assertEqual(self.targets(), LIVING)
        self.unchanged([light for _, lights in ROOMS for light in lights])

    async def test_only_currently_on_lights_are_written_and_repeat_is_inert(self):
        for sensor, _ in ROOMS:
            self.hass.states.async_set(sensor, 'off')
        self.hass.states.async_set('light.office_bulbs', 'off')
        self.hass.states.async_set('light.light_kitchen', 'unavailable')
        self.hass.states.async_remove('light.light_toilet')
        await self.run_policy()
        self.assertEqual(self.targets(), [
            'light.neon_light_led_strip', 'light.kitchen_range_light', 'light.light_bedroom',
            'light.bedroom_closet', 'light.gym', 'light.light_front_door', 'light.light_laundry_room',
        ] + LIVING)
        self.calls.clear()
        await self.run_policy()
        self.assertEqual(self.calls, [])

    async def test_reoccupancy_rechecked_before_each_later_light(self):
        self.hass.states.async_set(ROOMS[0][0], 'off')
        self.hass.states.async_set(ROOMS[1][0], 'off')

        def reoccupy(call):
            if call.data['entity_id'] == ['light.office_bulbs']:
                self.hass.states.async_set(ROOMS[0][0], 'on')
                self.hass.states.async_set(ROOMS[1][0], 'on')
        self.after_write = reoccupy
        await self.run_policy()
        self.assertEqual(self.targets(), ['light.office_bulbs'] + LIVING)
        self.unchanged(['light.neon_light_led_strip'] + ROOMS[1][1])

    async def test_leaving_night_stops_later_writes(self):
        self.hass.states.async_set(ROOMS[0][0], 'off')
        def leave_night(call):
            self.hass.states.async_set('input_boolean.night_mode', 'off')
        self.after_write = leave_night
        await self.run_policy()
        self.assertEqual(self.targets(), ['light.office_bulbs'])

    async def test_failed_light_does_not_block_other_vacant_rooms(self):
        self.hass.states.async_set(ROOMS[0][0], 'off')
        self.hass.states.async_set(ROOMS[1][0], 'off')
        self.fail_light = 'light.office_bulbs'
        with self.assertLogs('homeassistant.helpers.script', level='ERROR'):
            await self.run_policy()
        self.assertEqual(self.targets(), [
            'light.office_bulbs', 'light.neon_light_led_strip',
            'light.light_kitchen', 'light.kitchen_range_light',
        ] + LIVING)

    async def test_policy_inert_outside_night(self):
        for sensor, _ in ROOMS:
            self.hass.states.async_set(sensor, 'off')
        await self.policy.async_run({}, Context())
        self.assertEqual(self.calls, [])

    async def test_light_state_rechecked_before_each_write(self):
        self.hass.states.async_set(ROOMS[0][0], 'off')
        def turn_other_off(call):
            if call.data['entity_id'] == ['light.office_bulbs']:
                self.hass.states.async_set('light.neon_light_led_strip', 'off')
        self.after_write = turn_other_off
        await self.run_policy()
        self.assertEqual(self.targets(), ['light.office_bulbs'] + LIVING)

    async def test_full_configs_validate_against_installed_ha(self):
        loader.async_setup(self.hass)
        await trigger.async_setup(self.hass)
        self.assertIsNotNone(await validate_script(self.hass, BUNDLE['script']['id'], BUNDLE['script']['config']))
        for automation in BUNDLE['automations']:
            self.assertIsNotNone(await validate_automation(self.hass, 'automation', automation['config']))

    async def attach_apply(self):
        apply = next((a['config'] for a in BUNDLE['automations'] if a['entity_id'] == 'automation.apply_night_mode'),
                     {'actions': [], 'triggers': [{'trigger': 'state', 'entity_id': 'input_boolean.night_mode', 'from': 'off', 'to': 'on'}]})
        script = self.make_script(apply['actions'])
        async def action(variables, context):
            await script.async_run(variables, context or Context())
        raw = dict(apply['triggers'][0])
        raw['platform'] = raw.pop('trigger')
        self.detach = await state_trigger.async_attach_trigger(
            self.hass, await state_trigger.async_validate_trigger_config(self.hass, raw), action,
            {'trigger_data': {'id': '0', 'idx': '0'}, 'variables': {}, 'name': 'Apply Night Mode'},
        )

    async def run_schedule(self):
        config = next((a['config'] for a in BUNDLE['automations'] if a['entity_id'] == 'automation.reset_morning_mode_at_9_30pm'), {'actions': []})
        await self.make_script(config['actions']).async_run({}, Context())
        await self.hass.async_block_till_done()

    async def test_schedule_with_night_already_on_runs_vacancy_once(self):
        self.hass.states.async_set('input_boolean.night_mode', 'on')
        await self.attach_apply()
        await self.run_schedule()
        self.assertEqual(self.policy_runs, 1)
        self.assertEqual(self.hass.states.get('input_boolean.morning_mode').state, 'off')
        self.assertEqual(self.targets(), LIVING)

    async def test_schedule_enables_night_and_apply_runs_once(self):
        await self.attach_apply()
        await self.run_schedule()
        self.assertEqual(self.hass.states.get('input_boolean.night_mode').state, 'on')
        self.assertEqual(self.hass.states.get('input_boolean.morning_mode').state, 'off')
        self.assertEqual(self.policy_runs, 1)
        self.assertEqual(self.targets(), LIVING)

    async def test_manual_night_uses_same_policy_preserving_occupied_bathroom(self):
        await self.attach_apply()
        self.hass.states.async_set('input_boolean.night_mode', 'on')
        await self.hass.async_block_till_done()
        self.assertEqual(self.policy_runs, 1)
        self.assertEqual(self.targets(), LIVING)
        self.unchanged(['light.light_toilet'])

    async def test_retired_10pm_actions_are_inert_even_on_manual_trigger(self):
        config = next((a['config'] for a in BUNDLE['automations'] if a['entity_id'] == 'automation.wind_down_stage_2_dim_lights_to_10_at_10_00pm'), None)
        self.assertIsNotNone(config, 'Retired safety rule must ship with inert saved actions')
        await self.make_script(config['actions']).async_run({}, Context())
        self.assertEqual(self.calls, [])
