"""Execute the HA python_script with fake services, never physical devices."""
import datetime
from pathlib import Path
from types import SimpleNamespace
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'python_scripts/toggle_lights_based_on_motion.py'
TARGETS=('light.office_bulbs','light.light_living_room_bulbs','light.light_toilet','light.light_bedroom','light.light_front_door','light.light_kitchen','light.light_laundry_room','light.bedroom_closet','light.gym')

class MotionGuardTests(unittest.TestCase):
    def run_script(self, phase='active', active='love', pending=None, motion='on', target='light.light_kitchen', second=None, after_sleep=None, restricted=False):
        states={target:SimpleNamespace(state='off'), 'binary_sensor.motion':SimpleNamespace(state=motion), 'input_boolean.morning_mode':SimpleNamespace(state='on'), 'input_text.off_time':SimpleNamespace(state=''), 'sensor.house_mood':SimpleNamespace(state=phase,attributes={'active_mood':active,'pending_mood':pending})}
        calls=[]
        def call(domain,service,data):
            calls.append((domain,service,data))
            if domain=='input_text':states[data['entity_id']]=SimpleNamespace(state=data['value'])
        def sleep(seconds):
            if after_sleep:after_sleep(states)
        hass=SimpleNamespace(bus=SimpleNamespace(),states=SimpleNamespace(get=states.get),services=SimpleNamespace(call=call))
        data={'light_target_one':target,'light_target_two':second,'person_detected_entity':'binary_sensor.motion','time_off_text_entity':'input_text.off_time','no_motion_wait':0}
        if restricted:
            from unittest.mock import patch
            from homeassistant.components.python_script import execute
            with patch('homeassistant.components.python_script.TimeWrapper.sleep',staticmethod(sleep),create=True):
                self.assertEqual(execute(hass,SCRIPT.name,SCRIPT.read_text(),data,return_response=True),{})
        else:
            exec(compile(SCRIPT.read_text(),str(SCRIPT),'exec'), {'hass':hass,'data':data,'datetime':datetime,'time':SimpleNamespace(sleep=sleep),'logger':SimpleNamespace(info=lambda *args:None)})

        return [(service,data['entity_id']) for domain,service,data in calls if domain=='light']

    def test_all_nine_lights_defer_on_and_off_during_active_or_pending_strip_mood(self):
        for target in TARGETS:
            for mood in ('love','party'):
                for motion in ('on','off'):
                    for phase,active,pending in [('active',mood,None),('starting',None,mood)]:
                        with self.subTest(target=target,mood=mood,motion=motion,phase=phase):
                            self.assertEqual(self.run_script(phase,active,pending,motion,target),[])

    def test_delayed_off_rechecks_mood_after_sleep(self):
        def start_party(states):states['sensor.house_mood']=SimpleNamespace(state='starting',attributes={'pending_mood':'party','active_mood':None})
        self.assertEqual(self.run_script('idle',None,motion='off',after_sleep=start_party),[])

    def test_other_moods_and_unprotected_lights_keep_original_behavior(self):
        for mood in (None,'unwind','dinner','gym'):
            for motion,service in [('on','turn_on'),('off','turn_off')]:
                self.assertEqual(self.run_script('idle' if mood is None else 'active',mood,motion=motion),[(service,'light.light_kitchen')])
        self.assertEqual(self.run_script(target='light.living_room_led_strip'),[('turn_on','light.living_room_led_strip')])

    def test_protected_secondary_target_is_filtered_independently(self):
        self.assertEqual(self.run_script(target='light.living_room_led_strip',second='light.gym'),[('turn_on','light.living_room_led_strip')])
