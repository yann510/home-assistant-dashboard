from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('lights_native_fixture', ROOT / 'lepro-extension/native_state.py')
native = importlib.util.module_from_spec(spec); sys.modules[spec.name] = native; spec.loader.exec_module(native)
try:
    from custom_components.house_moods.lights import LightControls
except ImportError:
    LightControls = None
STRIP='light.living_room_led_strip'; BULBS='light.light_living_room_bulbs'; KITCHEN='light.light_kitchen'; NEON='light.neon_light_led_strip'
FIELDS=json.loads((ROOT/'tests/fixtures/office-neon-original-effect.json').read_text())['service_data']['payload']
EFFECTS={
'love':'N01:P10001FF3377F2100010019U3V3000640000E40088000000881664;',
'unwind':'N01:P10001FFAA44F2100010019U3V3000640000E1;',
'dinner':'N01:P10001FFC070F2100010019U3V3000640000E1;',
'party':'N01:P10001FFFFFFF2100010019U3V3100640000E3004BC2O6004B;'}
class IO:
    def __init__(self):
        self.states={e:{'state':'on','attributes':{'brightness':100,'color_mode':mode,'supported_color_modes':[mode], 'supported_features':0}} for e,mode in [(STRIP,'rgb'),(BULBS,'brightness'),(KITCHEN,'color_temp'),(NEON,'rgb')]}
        self.states[STRIP]['attributes']['rgb_color']=[2,3,4]
        self.states[KITCHEN]['attributes'].update(color_temp_kelvin=3500,min_color_temp_kelvin=3000,max_color_temp_kelvin=6000)
        self.calls=[];self.ignore=False;self.wrong_mode=False
    def state(self,target):return deepcopy(self.states[target])
    async def wait(self,predicate,timeout=15):
        if not predicate():raise TimeoutError('readback did not match')
    async def call(self,domain,service,targets,data,session_id,return_response=False):
        self.calls.append((domain,service,targets,deepcopy(data)))
        if self.ignore:return
        state=self.states[targets[0]];state['state']='on' if service=='turn_on' else 'off'
        state['attributes'].update({k:v for k,v in data.items() if k!='transition'})
        for key,mode in [('rgb_color','rgb'),('hs_color','hs'),('xy_color','xy'),('color_temp_kelvin','color_temp')]:
            if key in data:state['attributes']['color_mode']='white' if self.wrong_mode else mode
class Bridge:
    def __init__(self):self.value=native.NativeSnapshot(1,'754063076',1,deepcopy(FIELDS),{'d30':42});self.sent=[]
    async def capture(self,device_id):return native.NativeSnapshot.from_dict(self.value.to_dict())
    async def replay(self,value):
        native.validate_snapshot(value);self.sent.append(value.to_dict());self.value=native.NativeSnapshot.from_dict(value.to_dict());return await self.capture(value.device_id)
class LightsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.assertIsNotNone(LightControls,'LightControls implementation missing')
        self.io=IO();self.bridge=Bridge();self.adapter=LightControls(self.io,self.bridge,'754063076')
    async def test_all_native_recipes_restore_original_bytes_without_generic_light_write(self):
        baseline=await self.adapter.read(NEON);original=deepcopy(baseline)
        for mood,brightness in [('love',349),('unwind',250),('dinner',200),('party',698)]:
            writes=await self.adapter.plan_apply(mood)
            write=next(w for w in writes if NEON in w.targets)
            observed=await self.adapter.apply_write(write,'session')
            self.assertEqual(observed[NEON]['native']['d50'],EFFECTS[mood]);self.assertEqual(observed[NEON]['native']['d52'],brightness)
            await self.adapter.restore(NEON,baseline,'session')
            self.assertEqual(self.bridge.sent[-1]['fields'],FIELDS)
            self.assertEqual(self.bridge.sent[-1]['extra_observed'],{'d30':42})
        self.assertEqual(baseline,original);self.assertEqual(self.io.calls,[])
    async def test_exact_standard_presets_and_exclusions(self):
        for mood,rgb,strip,bulbs,kitchen in [('love',[255,51,119],89,38,None),('unwind',[255,170,68],64,64,None),('dinner',[255,192,112],51,89,140),('party',[170,68,255],178,64,102)]:
            writes=await self.adapter.plan_apply(mood);targets={w.targets[0] for w in writes}
            self.assertEqual(targets,{STRIP,BULBS,NEON}|({KITCHEN} if kitchen else set()))
            for write in writes:
                if NEON not in write.targets:await self.adapter.apply_write(write,'s')
            self.assertEqual(self.io.states[STRIP]['attributes']['rgb_color'],rgb)
            self.assertEqual(self.io.states[STRIP]['attributes']['brightness'],strip)
            self.assertEqual(self.io.states[BULBS]['attributes']['brightness'],bulbs)
            if kitchen:self.assertEqual(self.io.states[KITCHEN]['attributes']['brightness'],kitchen);self.assertEqual(self.io.states[KITCHEN]['attributes']['color_temp_kelvin'],3000)
        for _,_,targets,data in self.io.calls:
            self.assertNotIn('transition',data)
            if targets==[BULBS]:self.assertEqual(set(data),{'brightness'})
    async def test_supported_transition_and_off_restore(self):
        self.io.states[STRIP]['attributes']['supported_features']=32
        self.io.states[STRIP]['state']='off';baseline=await self.adapter.read(STRIP)
        write=next(w for w in await self.adapter.plan_apply('love') if w.targets==[STRIP])
        await self.adapter.apply_write(write,'s');self.assertEqual(self.io.calls[-1][3]['transition'],3)
        await self.adapter.restore(STRIP,baseline,'s');self.assertEqual(self.io.states[STRIP]['state'],'off')
        self.assertEqual(self.adapter.restoration_state(STRIP,baseline),{'state':'off'})
    async def test_readback_failure_never_returns_requested_state(self):
        write=next(w for w in await self.adapter.plan_apply('love') if w.targets==[STRIP])
        self.io.ignore=True
        with self.assertRaises(TimeoutError):await self.adapter.apply_write(write,'s')
        self.io.ignore=False;self.io.wrong_mode=True
        with self.assertRaises(TimeoutError):await self.adapter.apply_write(write,'s')
    async def test_preflight_checks_collection_availability_and_capabilities_without_writes(self):
        self.assertEqual(set(self.adapter.snapshot_targets()),{STRIP,BULBS,KITCHEN,NEON})
        self.assertTrue(self.adapter.owns(NEON));self.assertFalse(self.adapter.owns('light.office'))
        self.io.states[KITCHEN]['state']='unavailable'
        with self.assertRaises(ValueError):await self.adapter.preflight('love')
        self.assertEqual(self.io.calls,[]);self.assertEqual(self.bridge.sent,[])
    async def test_restore_mode_appropriate_baselines(self):
        for mode,key,value in [('rgb','rgb_color',[9,8,7]),('hs','hs_color',[180,25]),('xy','xy_color',[.3,.4]),('color_temp','color_temp_kelvin',3200)]:
            self.io.states[STRIP]['attributes'].update(color_mode=mode,supported_color_modes=[mode]);self.io.states[STRIP]['attributes'][key]=value
            baseline=await self.adapter.read(STRIP)
            await self.adapter.restore(STRIP,baseline,'s')
            self.assertEqual(self.io.calls[-1][3],{'brightness':100,key:value})
    async def test_included_targets_excludes_kitchen_for_love(self):
        self.assertEqual(set(self.adapter.included_targets('love')),{STRIP,BULBS,NEON})
        self.assertEqual(set(self.adapter.included_targets('dinner')),{STRIP,BULBS,KITCHEN,NEON})
    async def test_missing_active_color_cannot_be_captured_as_complete_baseline(self):
        del self.io.states[STRIP]['attributes']['rgb_color']
        with self.assertRaises(ValueError):await self.adapter.preflight('love')
    async def test_missing_brightness_cannot_be_captured_as_complete_baseline(self):
        del self.io.states[BULBS]['attributes']['brightness']
        with self.assertRaises(ValueError):await self.adapter.preflight('love')
    async def test_neon_replay_preserves_arbitrary_mode_three_snapshot(self):
        self.bridge.value=native.NativeSnapshot(1,'754063076',1,{'d1':0,'d2':3,'d52':621,'d60':'opaque:wave-speed-sensitivity;','d50':'inactive;'}, {'d30':99})
        original=self.bridge.value.to_dict();baseline=await self.adapter.read(NEON)
        write=next(w for w in await self.adapter.plan_apply('party') if w.targets==[NEON])
        await self.adapter.apply_write(write,'s');await self.adapter.restore(NEON,baseline,'s')
        self.assertEqual(self.bridge.sent[-1],original)
    async def test_unsupported_capability_and_range_fail_preflight_without_writes(self):
        self.io.states[KITCHEN]['attributes']['min_color_temp_kelvin']=None
        with self.assertRaises(ValueError):await self.adapter.preflight('dinner')
        self.assertEqual(self.io.calls,[])
        self.io.states[STRIP]['attributes']['supported_color_modes']=['onoff']
        with self.assertRaises(ValueError):await self.adapter.preflight('love')
        self.assertEqual(self.io.calls,[])
