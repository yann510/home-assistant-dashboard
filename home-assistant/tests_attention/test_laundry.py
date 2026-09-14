"""Laundry updates are bounded recent completions, not inferred unload alerts."""
import unittest

import test_engine


class LaundryTests(unittest.TestCase):
    setUp = test_engine.EngineTests.setUp
    appliance = test_engine.EngineTests.appliance
    state = test_engine.EngineTests.state

    def finish(self, kind, now=140):
        self.appliance(kind, 'job', 'drying' if kind == 'dryer' else 'wash', now - 1)
        self.appliance(kind, 'job', 'finished' if kind == 'dryer' else 'finish', now)
        return self.e.events[f'complete:{kind}'].copy()

    def test_laundry_expires_at_two_hours_from_finish(self):
        for kind in ('washer', 'dryer'):
            with self.subTest(kind=kind):
                self.setUp()
                self.finish(kind)
                self.e.tick(140 + 7200 - 1)
                self.assertIn(f'complete:{kind}', self.e.events)
                self.e.tick(140 + 7200)
                self.assertNotIn(f'complete:{kind}', self.e.events)

    def test_existing_saved_reminder_gets_new_copy_without_resetting_age(self):
        item = self.finish('washer')
        self.e.events[item['id']]['detail'] = 'Old reminder wording'
        restored = test_engine.Engine(7000, self.e.serialize())
        restored.prime(dict(self.e.states), 7000)
        current = restored.events[item['id']]
        self.assertEqual(current['episode'], item['episode'])
        self.assertEqual(current['occurred_at'], item['occurred_at'])
        self.assertIn('2 hours', current['detail'])
        self.assertIn('Done', current['detail'])
        restored.tick(7340)
        self.assertNotIn(item['id'], restored.events)

    def test_expired_saved_reminder_clears_during_startup_grace(self):
        item = self.finish('dryer')
        restored = test_engine.Engine(8000, self.e.serialize())
        restored.prime(dict(self.e.states), 8000)
        self.assertNotIn(item['id'], restored.events)

    def test_snoozing_does_not_extend_the_completion_window(self):
        item = self.finish('washer')
        self.e.action('snooze', item['id'], item['episode'], 7300)
        self.e.tick(7340)
        self.assertNotIn(item['id'], self.e.events)

    def test_dishwasher_keeps_its_full_day_window(self):
        item = self.finish('dishwasher')
        self.e.tick(7340)
        self.assertIn(item['id'], self.e.events)
        self.e.tick(140 + 86400)
        self.assertNotIn(item['id'], self.e.events)

    def test_done_survives_restart_and_a_repeated_finish(self):
        for kind in ('washer', 'dryer'):
            with self.subTest(kind=kind):
                self.setUp()
                item = self.finish(kind)
                self.assertTrue(self.e.action('dismiss', item['id'], item['episode'], 141))
                self.appliance(kind, 'job', 'none', 142)
                restored = test_engine.Engine(150, self.e.serialize())
                restored.prime(dict(self.e.states), 150)
                restored.update(f'sensor.{kind}_{kind}_job_state', 'finished', {}, 160)
                self.assertNotIn(item['id'], restored.events)

    def test_power_off_and_unavailability_are_not_unloading(self):
        item = self.finish('washer')
        self.appliance('washer', 'machine', 'stop', 170)
        self.appliance('washer', 'job', 'none', 171)
        self.state('binary_sensor.washer_power', 'off', 172)
        self.appliance('washer', 'machine', 'unavailable', 200)
        self.appliance('washer', 'job', 'unavailable', 201)
        self.assertEqual(self.e.events[item['id']]['episode'], item['episode'])

    def test_new_cycle_replaces_update_with_new_completion_episode(self):
        first = self.finish('dryer')
        self.appliance('dryer', 'job', 'drying', 200)
        self.assertNotIn(first['id'], self.e.events)
        self.appliance('dryer', 'job', 'finished', 250)
        self.assertNotEqual(self.e.events[first['id']]['episode'], first['episode'])
