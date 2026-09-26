"""Exercise the saved departure rule with HA's real template trigger and scripts.

Only the trigger clock and hardware service are substituted; template tracking,
timer cancellation, conditions, and action execution use Home Assistant itself.
"""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from homeassistant.components.template import trigger as template_trigger
from homeassistant.core import Context, HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.script import Script


PERSON = "person.yann_thibodeau"
OFFICE = "binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_2"
CONFIG = json.loads(
    (Path(__file__).resolve().parents[1] / "office-presence-safety.json").read_text()
)


class OfficePresenceSafetyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)
        self.calls = []
        self.timers = []
        self.now = 0
        self.hass.states.async_set(PERSON, "home")
        self.hass.states.async_set(OFFICE, "off")

        async def turn_off(call):
            self.calls.append(dict(call.data))

        self.hass.services.async_register("light", "turn_off", turn_off)
        self.script = Script(
            self.hass,
            cv.SCRIPT_SCHEMA(CONFIG["conditions"] + CONFIG["actions"]),
            CONFIG["alias"],
            "automation",
            script_mode=CONFIG["mode"],
        )

        async def action(variables, context):
            await self.script.async_run(variables, context or Context())

        def schedule(hass, seconds, callback):
            timer = {"at": self.now + seconds, "callback": callback, "cancelled": False}
            self.timers.append(timer)

            def cancel():
                timer["cancelled"] = True

            return cancel

        self.clock = patch.object(template_trigger, "async_call_later", schedule)
        self.clock.start()
        raw = dict(CONFIG["triggers"][0])
        raw["platform"] = raw.pop("trigger")
        trigger = template_trigger.TRIGGER_SCHEMA(raw)
        trigger["value_template"].hass = self.hass
        self.detach = await template_trigger.async_attach_trigger(
            self.hass,
            trigger,
            action,
            {"trigger_data": {"id": "0", "idx": "0"}, "variables": {}, "name": CONFIG["alias"]},
        )
        await self.hass.async_block_till_done()

    async def asyncTearDown(self):
        self.detach()
        self.clock.stop()
        await self.script.async_stop()
        await self.hass.async_block_till_done()
        self.temp.cleanup()

    async def state(self, entity, value):
        self.hass.states.async_set(entity, value)
        await self.hass.async_block_till_done()

    async def advance(self, seconds):
        self.now += seconds
        for timer in self.timers:
            if not timer["cancelled"] and timer["at"] <= self.now:
                timer["cancelled"] = True
                timer["callback"]()
        await self.hass.async_block_till_done()

    async def test_unknown_bounce_never_schedules_departure(self):
        for state in ["unknown", "home", "unavailable", "home"]:
            await self.state(PERSON, state)
        await self.advance(600)
        self.assertEqual(self.timers, [])
        self.assertEqual(self.calls, [])

    async def test_brief_away_and_return_home_cancel_countdown(self):
        await self.state(PERSON, "not_home")
        await self.advance(299)
        self.assertEqual(self.calls, [])
        await self.state(PERSON, "home")
        await self.advance(301)
        self.assertEqual(self.calls, [])
        self.assertTrue(self.timers[0]["cancelled"])

    async def test_sustained_away_and_vacant_office_send_original_targets(self):
        await self.state(PERSON, "not_home")
        await self.advance(299)
        self.assertEqual(self.calls, [])
        await self.advance(1)
        self.assertEqual(self.calls, [CONFIG["actions"][0]["target"]])
        await self.advance(600)
        self.assertEqual(len(self.calls), 1)

    async def test_named_zone_is_known_away(self):
        await self.state(PERSON, "Work")
        await self.advance(300)
        self.assertEqual(len(self.calls), 1)

    async def test_occupied_or_unknown_office_blocks_turn_off(self):
        for office in ["on", "unknown", "unavailable"]:
            with self.subTest(office=office):
                await self.state(PERSON, "home")
                await self.state(OFFICE, office)
                await self.state(PERSON, "not_home")
                await self.advance(300)
                self.assertEqual(self.calls, [])

    async def test_missing_office_blocks_turn_off(self):
        self.hass.states.async_remove(OFFICE)
        await self.state(PERSON, "not_home")
        await self.advance(300)
        self.assertEqual(self.calls, [])

    async def test_unknown_interrupts_countdown_and_requires_fresh_five_minutes(self):
        await self.state(PERSON, "not_home")
        await self.advance(299)
        await self.state(PERSON, "unknown")
        await self.advance(1)
        self.assertEqual(self.calls, [])
        await self.state(PERSON, "not_home")
        await self.advance(299)
        self.assertEqual(self.calls, [])
        await self.advance(1)
        self.assertEqual(len(self.calls), 1)

    async def test_action_rechecks_current_person_state(self):
        for state in ["home", "unknown", "unavailable"]:
            with self.subTest(state=state):
                await self.state(PERSON, state)
                await self.script.async_run({}, Context())
                self.assertEqual(self.calls, [])

    async def test_late_vacancy_or_sensor_recovery_starts_fresh_countdown(self):
        for initial in ["on", "unknown", "unavailable"]:
            with self.subTest(initial=initial):
                await self.state(PERSON, "home")
                await self.state(OFFICE, initial)
                await self.state(PERSON, "not_home")
                previous_calls = len(self.calls)
                await self.advance(600)
                self.assertEqual(len(self.calls), previous_calls)
                await self.state(OFFICE, "off")
                await self.advance(299)
                self.assertEqual(len(self.calls), previous_calls)
                await self.advance(1)
                self.assertEqual(len(self.calls), previous_calls + 1)

    async def test_occupancy_bounce_restarts_continuous_vacancy_period(self):
        await self.state(PERSON, "not_home")
        await self.advance(299)
        await self.state(OFFICE, "on")
        await self.advance(1)
        self.assertEqual(self.calls, [])
        await self.state(OFFICE, "off")
        await self.advance(299)
        self.assertEqual(self.calls, [])
        await self.advance(1)
        self.assertEqual(len(self.calls), 1)

    async def test_action_rechecks_current_office_state(self):
        await self.state(PERSON, "not_home")
        for state in ["on", "unknown", "unavailable"]:
            with self.subTest(state=state):
                await self.state(OFFICE, state)
                await self.script.async_run({}, Context())
                self.assertEqual(self.calls, [])
