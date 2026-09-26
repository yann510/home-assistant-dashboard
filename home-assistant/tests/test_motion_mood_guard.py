"""Execute the HA python_script with fake services, never physical devices."""
import datetime
from pathlib import Path
from types import SimpleNamespace
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'python_scripts/toggle_lights_based_on_motion.py'
TARGETS=('light.office_bulbs','light.light_living_room_bulbs','light.light_toilet','light.light_bedroom','light.light_front_door','light.light_kitchen','light.light_laundry_room','light.bedroom_closet','light.gym')

class MotionGuardTests(unittest.TestCase):
    def run_script(self, phase='active', active='love', pending=None, motion='on', target='light.light_kitchen', second=None, after_sleep=None, restricted=False, wait=0, clock=datetime, after_light=None):
        states={target:SimpleNamespace(state='off'), 'binary_sensor.motion':SimpleNamespace(state=motion,last_changed=datetime.datetime(2026,9,26)), 'input_boolean.morning_mode':SimpleNamespace(state='on'), 'input_text.off_time':SimpleNamespace(state=''), 'sensor.house_mood':SimpleNamespace(state=phase,attributes={'active_mood':active,'pending_mood':pending})}
        calls=[]
        def call(domain,service,data):
            calls.append((domain,service,data))
            if domain=='input_text':states[data['entity_id']]=SimpleNamespace(state=data['value'])
            if domain=='light' and after_light:after_light(states)
        def sleep(seconds):
            if after_sleep:after_sleep(states)
        hass=SimpleNamespace(bus=SimpleNamespace(),states=SimpleNamespace(get=states.get),services=SimpleNamespace(call=call))
        data={'light_target_one':target,'light_target_two':second,'person_detected_entity':'binary_sensor.motion','time_off_text_entity':'input_text.off_time','no_motion_wait':wait}
        if restricted:
            from unittest.mock import patch
            from homeassistant.components.python_script import execute
            with patch('homeassistant.components.python_script.TimeWrapper.sleep',staticmethod(sleep),create=True), patch('homeassistant.components.python_script.datetime',clock):
                self.assertEqual(execute(hass,SCRIPT.name,SCRIPT.read_text(),data,return_response=True),{})
        else:
            exec(compile(SCRIPT.read_text(),str(SCRIPT),'exec'), {'hass':hass,'data':data,'datetime':clock,'time':SimpleNamespace(sleep=sleep),'logger':SimpleNamespace(info=lambda *args:None)})

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

    def test_delayed_off_does_not_switch_off_when_presence_returns_without_helper_update(self):
        def occupied(states):
            states['binary_sensor.motion']=SimpleNamespace(state='on',last_changed=datetime.datetime(2026,9,26,0,1))
        self.assertEqual(self.run_script('idle',None,motion='off',after_sleep=occupied),[])

    def test_unknown_and_unavailable_are_not_vacancy(self):
        for state in ('unknown','unavailable'):
            self.assertEqual(self.run_script('idle',None,motion=state),[])
            def unavailable(states):
                states['binary_sensor.motion']=SimpleNamespace(state=state,last_changed=datetime.datetime(2026,9,26,0,1))
            self.assertEqual(self.run_script('idle',None,motion='off',after_sleep=unavailable),[])

    def test_old_waiter_cannot_switch_off_during_a_new_vacancy_episode(self):
        def newer_vacancy(states):
            states['binary_sensor.motion']=SimpleNamespace(state='off',last_changed=datetime.datetime(2026,9,26,0,2))
        self.assertEqual(self.run_script('idle',None,motion='off',after_sleep=newer_vacancy),[])

    def test_cleared_or_replaced_deadline_cancels_delayed_off(self):
        for deadline in ('','00:00:00','unknown','unavailable'):
            def replaced(states):states['input_text.off_time']=SimpleNamespace(state=deadline)
            self.assertEqual(self.run_script('idle',None,motion='off',after_sleep=replaced),[])

    def test_missing_presence_after_wait_does_not_switch_off(self):
        def missing(states):states.pop('binary_sensor.motion')
        self.assertEqual(self.run_script('idle',None,motion='off',after_sleep=missing),[])

    def test_wait_spanning_midnight_uses_full_datetime(self):
        instants=iter([datetime.datetime(2026,9,26,23,59,58),datetime.datetime(2026,9,27,0,0,8)])
        clock=SimpleNamespace(datetime=SimpleNamespace(now=lambda:next(instants)),timedelta=datetime.timedelta)
        self.assertEqual(self.run_script('idle',None,motion='off',wait=10,clock=clock),[('turn_off','light.light_kitchen')])

    def test_wait_does_not_fire_early_before_midnight(self):
        instants=iter([datetime.datetime(2026,9,26,23,59,58),datetime.datetime(2026,9,26,23,59,59)])
        clock=SimpleNamespace(datetime=SimpleNamespace(now=lambda:next(instants)),timedelta=datetime.timedelta)
        self.assertEqual(self.run_script('idle',None,motion='off',wait=10,clock=clock),[])

    def test_presence_is_rechecked_before_secondary_target(self):
        def occupied(states):
            states['binary_sensor.motion']=SimpleNamespace(state='on',last_changed=datetime.datetime(2026,9,26,0,1))
        self.assertEqual(self.run_script('idle',None,motion='off',second='light.desk_led_strip',after_light=occupied),[('turn_off','light.light_kitchen')])

    def test_missing_deadline_after_wait_is_safe(self):
        def missing(states):states.pop('input_text.off_time')
        self.assertEqual(self.run_script('idle',None,motion='off',after_sleep=missing),[])
