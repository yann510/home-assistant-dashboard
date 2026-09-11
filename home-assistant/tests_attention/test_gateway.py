"""Gateway identity regressions: stale, renamed, and ambiguous registrations."""
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).parents[1] / 'custom_components/dashboard_attention/gateway.py'
spec = importlib.util.spec_from_file_location('gateway', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def entry(entity, config='home', **extra):
    return dict(entity_id=entity, platform='hilo', unique_id=entity + '-hilo_gateway',
                config_entry_id=config, **extra)


def state(value, **attributes):
    return dict(state=value, attributes=attributes)


class GatewayTests(unittest.TestCase):
    def test_renamed_active_gateway_ignores_restored_record(self):
        entries = [entry('sensor.hilo_gateway'), entry('sensor.hilo_gateway_2')]
        states = {'sensor.hilo_gateway': state('unavailable', restored=True),
                  'sensor.hilo_gateway_2': state('on')}
        self.assertEqual(module.gateway_state(entries, states, {'home'}), 'on')
        for value in ('off', 'unavailable'):
            states['sensor.hilo_gateway_2'] = state(value)
            self.assertEqual(module.gateway_state(entries, states, {'home'}), value)

    def test_unrelated_gateway_cannot_hide_outage(self):
        entries = [entry('sensor.other', config='elsewhere')]
        self.assertEqual(module.gateway_state(entries, {'sensor.other': state('on')}, {'home'}), 'unavailable')

    def test_restored_only_is_unknown_not_online(self):
        entries = [entry('sensor.old')]
        self.assertEqual(module.gateway_state(entries, {'sensor.old': state('on', restored=True)}, {'home'}), 'unavailable')

    def test_two_live_candidates_are_ambiguous(self):
        entries = [entry(name) for name in ('sensor.a', 'sensor.b')]
        states = {name: state('on') for name in ('sensor.a', 'sensor.b')}
        self.assertEqual(module.gateway_state(entries, states, {'home'}), 'unavailable')

    def test_disabled_gateway_is_excluded(self):
        entries = [entry('sensor.a', disabled_by='user')]
        self.assertEqual(module.gateway_state(entries, {'sensor.a': state('on')}, {'home'}), 'unavailable')
