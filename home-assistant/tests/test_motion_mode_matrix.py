"""The checked-in real python_script's documented policy, not universal suppression."""
from types import SimpleNamespace
import unittest
import test_motion_mood_guard as motion
from custom_components.house_moods.model import MOODS

class MotionModeMatrixTests(unittest.TestCase):
    def test_before_during_after_every_mood(self):
        for mood in MOODS:
            for phase in ('idle', 'active', 'restoring'):
                for detected, service in [('on', 'turn_on'), ('off', 'turn_off')]:
                    with self.subTest(mood=mood, phase=phase, motion=detected):
                        active = mood if phase == 'active' else None
                        calls = motion.MotionGuardTests().run_script(phase, active, motion=detected)
                        suppressed = phase == 'active' and mood in ('love', 'party')
                        self.assertEqual(calls, [] if suppressed else [(service, 'light.light_kitchen')])
    def test_delayed_off_uses_mood_at_wakeup_for_each_mood(self):
        for mood in MOODS:
            for destination in ('active', 'idle'):
                with self.subTest(mood=mood, destination=destination):
                    def change(states):
                        states['sensor.house_mood'] = SimpleNamespace(state=destination, attributes={'active_mood': mood if destination == 'active' else None})
                    calls = motion.MotionGuardTests().run_script('idle', None, motion='off', after_sleep=change)
                    suppressed = destination == 'active' and mood in ('love', 'party')
                    self.assertEqual(calls, [] if suppressed else [('turn_off', 'light.light_kitchen')])
