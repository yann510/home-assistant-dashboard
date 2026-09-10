import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).parents[1] / 'custom_components/dashboard_attention/engine.py'
spec = importlib.util.spec_from_file_location('attention_engine', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Engine = module.Engine

class EngineTests(unittest.TestCase):
    def setUp(self):
        self.e = Engine(0)
        for entity in module.ENTITIES:
            value = 'off'
            if entity in module.BATTERIES: value = '80'
            if entity in module.DEVICES: value = 'heat' if entity.startswith('climate.') else 'off'
            if entity.endswith('wan_status') or entity == 'sensor.hilo_gateway': value = 'on'
            if entity.endswith('_job_state'): value = 'none'
            if entity.endswith('_machine_state'): value = 'stop'
            self.e.update(entity, value, {}, 0)
    def state(self, entity, value, now, **attrs):
        self.e.update(entity, value, attrs, now)
    def appliance(self, kind, field, value, now):
        self.state(f'sensor.{kind}_{kind}_{field}_state', value, now)
    def test_finish_pulse_and_dismiss_episode(self):
        self.appliance('dishwasher', 'job', 'washing', 130)
        self.appliance('dishwasher', 'job', 'finish', 140)
        item = self.e.items(141)[0]
        self.appliance('dishwasher', 'job', 'none', 145)
        self.assertEqual(len(self.e.items(146)), 1)
        self.assertFalse(self.e.action('dismiss', item['id'], 'stale', 146))
        self.assertTrue(self.e.action('dismiss', item['id'], item['episode'], 146))
        self.appliance('dishwasher', 'job', 'finish', 147)
        self.assertEqual(self.e.items(148), [])
    def test_no_backfill_or_finish_after_unknown_gap(self):
        self.appliance('washer', 'job', 'finish', 0)
        self.assertEqual(self.e.items(1), [])
        self.appliance('washer', 'job', 'wash', 130)
        self.appliance('washer', 'job', 'unavailable', 140)
        self.appliance('washer', 'job', 'finish', 800)
        self.assertEqual(self.e.items(801), [])
    def test_restart_keeps_completion_not_continuous_dwell(self):
        self.appliance('dryer', 'job', 'drying', 130)
        self.appliance('dryer', 'job', 'finished', 140)
        item = self.e.items(141)[0]
        self.e.action('snooze', item['id'], item['episode'], 142)
        restored = Engine(1000, self.e.serialize())
        self.assertEqual(restored.items(1001)[0]['episode'], item['episode'])
    def test_bin_debounce_unknown_not_recovery_and_snooze(self):
        self.state('binary_sensor.roomba_bin_full', 'on', 130)
        self.e.tick(189)
        self.assertEqual(self.e.items(189), [])
        self.e.tick(190)
        item = self.e.items(190)[0]
        self.assertTrue(self.e.action('snooze', item['id'], item['episode'], 191))
        self.assertFalse(self.e.action('dismiss', item['id'], item['episode'], 191))
        self.state('binary_sensor.roomba_bin_full', 'unknown', 192)
        self.e.tick(300)
        self.assertEqual(len(self.e.items(300)), 1)
        self.state('binary_sensor.roomba_bin_full', 'off', 301)
        self.e.tick(361)
        self.assertEqual(self.e.items(361), [])
    def test_battery_hysteresis_and_escalation(self):
        entity = 'sensor.hue_motion_sensor_1_battery'
        self.state(entity, '19', 130)
        self.e.tick(1930)
        item = self.e.items(1930)[0]
        self.e.action('snooze', item['id'], item['episode'], 1931)
        self.state(entity, '9', 1940)
        self.assertIsNone(self.e.items(1940)[0]['snoozed_until'])
        self.state(entity, '23', 1950)
        self.e.tick(4000)
        self.assertEqual(len(self.e.items(4000)), 1)
        self.state(entity, '25', 4001)
        self.e.tick(5801)
        self.assertEqual(self.e.items(5801), [])
    def test_wan_suppresses_cloud_not_local(self):
        self.state('binary_sensor.coda_4680_fiz_wan_status', 'off', 130)
        self.state('climate.thermostat_office', 'unavailable', 130)
        self.state('binary_sensor.rpi_power_status', 'on', 130)
        self.e.tick(800)
        ids = [x['id'] for x in self.e.items(800)]
        self.assertIn('wan', ids)
        self.assertIn('power', ids)
        self.assertNotIn('offline:climate.thermostat_office', ids)
    def test_new_job_cycle_without_machine_change(self):
        self.appliance('dryer', 'machine', 'run', 130)
        self.appliance('dryer', 'job', 'drying', 131)
        self.appliance('dryer', 'job', 'finished', 140)
        old = self.e.items(141)[0]['episode']
        self.appliance('dryer', 'job', 'drying', 150)
        self.assertEqual(self.e.items(151), [])
        self.appliance('dryer', 'job', 'finished', 160)
        self.assertNotEqual(self.e.items(161)[0]['episode'], old)

if __name__ == '__main__': unittest.main()

class RecoveryTests(unittest.TestCase):
    setUp = EngineTests.setUp
    state = EngineTests.state
    appliance = EngineTests.appliance
    def test_recovery_predicates_and_script_dwell(self):
        self.state('sensor.house_mood', 'recovery_required', 130)
        self.assertIn('mood_recovery', [i['id'] for i in self.e.items(130)])
        self.state('sensor.house_mood', 'restoring', 131)
        self.assertNotIn('mood_recovery', [i['id'] for i in self.e.items(131)])
        self.state('input_text.speaker_follow_source', 'media_player.office', 132)
        self.state('script.speaker_follow_motion', 'on', 133)
        self.e.tick(150)
        self.assertNotIn('speaker_recovery', [i['id'] for i in self.e.items(150)])
        self.state('script.speaker_follow_motion', 'off', 151)
        self.e.tick(155)
        self.assertNotIn('speaker_recovery', [i['id'] for i in self.e.items(155)])
        self.e.tick(156)
        self.assertIn('speaker_recovery', [i['id'] for i in self.e.items(156)])
    def test_restart_unfinished_cycle_remembers_uncertainty(self):
        self.appliance('dryer', 'machine', 'run', 130)
        restored = Engine(1000, self.e.serialize())
        restored.prime({**{entity: 'off' for entity in module.ENTITIES}, 'binary_sensor.coda_4680_fiz_wan_status': 'on'}, 1000)
        restored.update('sensor.dryer_dryer_job_state', 'unavailable', {}, 1120)
        restored.update('sensor.dryer_dryer_machine_state', 'unavailable', {}, 1120)
        restored.tick(1720)
        self.assertIn('lost:dryer', [i['id'] for i in restored.items(1720) if i['id'] != 'wan'])

class RegressionTests(unittest.TestCase):
    setUp = EngineTests.setUp
    state = EngineTests.state
    appliance = EngineTests.appliance
    def test_blank_source_resolves_speaker_recovery(self):
        self.state('input_text.speaker_follow_source', 'media_player.office', 130)
        self.e.tick(135)
        self.assertIn('speaker_recovery', [i['id'] for i in self.e.items(135)])
        self.state('input_text.speaker_follow_source', '', 136)
        self.assertNotIn('speaker_recovery', [i['id'] for i in self.e.items(136)])
    def test_same_state_update_does_not_rearm_finished_cycle(self):
        self.appliance('dryer', 'machine', 'run', 130)
        self.appliance('dryer', 'job', 'drying', 131)
        self.appliance('dryer', 'job', 'finished', 140)
        episode = self.e.items(140)[0]['episode']
        self.appliance('dryer', 'machine', 'run', 141)
        self.appliance('dryer', 'machine', 'stop', 142)
        self.appliance('dryer', 'machine', 'run', 143)
        self.assertEqual(self.e.items(143)[0]['episode'], episode)
    def test_faults_precede_completions(self):
        self.appliance('dryer', 'job', 'drying', 130)
        self.appliance('dryer', 'job', 'finished', 131)
        self.state('binary_sensor.rpi_power_status', 'on', 132)
        self.e.tick(192)
        self.assertEqual(self.e.items(192)[0]['id'], 'power')

class BatteryEpisodeTests(unittest.TestCase):
    setUp = EngineTests.setUp
    state = EngineTests.state
    def test_severity_fluctuations_do_not_break_snooze_twice(self):
        entity = 'sensor.hue_motion_sensor_1_battery'
        self.state(entity, '9', 130)
        self.e.tick(1930)
        item = self.e.items(1930)[0]
        self.e.action('snooze', item['id'], item['episode'], 1931)
        self.state(entity, '11', 1932)
        self.state(entity, '9', 1933)
        current = self.e.items(1933)[0]
        self.assertEqual(current['episode'], item['episode'])
        self.assertIsNotNone(current['snoozed_until'])

class GapTests(unittest.TestCase):
    setUp = EngineTests.setUp
    appliance = EngineTests.appliance
    state = EngineTests.state
    def test_machine_reconnect_alone_does_not_prove_gap_completion(self):
        self.appliance('washer', 'job', 'wash', 130)
        self.appliance('washer', 'machine', 'run', 131)
        self.appliance('washer', 'job', 'unavailable', 140)
        self.appliance('washer', 'machine', 'unavailable', 141)
        self.appliance('washer', 'machine', 'run', 800)
        self.appliance('washer', 'job', 'finish', 801)
        self.assertNotIn('complete:washer', [i['id'] for i in self.e.items(801)])

class VacuumSessionTests(unittest.TestCase):
    setUp = EngineTests.setUp
    state = EngineTests.state
    def test_active_startup_snapshot_allows_subsequent_pause(self):
        self.e.prime({**self.e.states, 'vacuum.roomba': 'cleaning'}, 0)
        self.state('vacuum.roomba', 'paused', 130)
        self.e.tick(730)
        self.assertIn('vacuum_paused', [i['id'] for i in self.e.items(730)])
    def test_paused_startup_snapshot_does_not_backfill_session(self):
        self.e.prime({**self.e.states, 'vacuum.roomba': 'paused'}, 0)
        self.e.tick(130)
        self.e.tick(730)
        self.assertNotIn('vacuum_paused', [i['id'] for i in self.e.items(730)])
    def test_idle_does_not_clear_pause_and_error_supersedes_it(self):
        self.state('vacuum.roomba', 'cleaning', 130)
        self.state('vacuum.roomba', 'paused', 131)
        self.e.tick(731)
        self.state('vacuum.roomba', 'idle', 732)
        self.e.tick(800)
        self.assertIn('vacuum_paused', [i['id'] for i in self.e.items(800)])
        self.state('vacuum.roomba', 'error', 801)
        self.e.tick(861)
        ids = [i['id'] for i in self.e.items(861)]
        self.assertIn('vacuum_error', ids)
        self.assertNotIn('vacuum_paused', ids)
        self.assertIn('vacuum_paused', self.e.events)
        self.state('vacuum.roomba', 'docked', 862)
        self.e.tick(922)
        self.assertNotIn('vacuum_paused', self.e.events)
        self.assertNotIn('vacuum_error', self.e.events)
