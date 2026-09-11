"""Run with the isolated HA 2025.5.3 Python environment, without real devices."""
import asyncio
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from homeassistant.core import HomeAssistant, Context, CoreState, SupportsResponse
from custom_components.house_moods import async_setup
from custom_components.house_moods.storage import SessionStore
from custom_components.house_moods.model import Session, ControlWrite
from custom_components.house_moods.ha_adapter import HAIO

class Adapter:
    def __init__(self,*args):self.states={'light.test':{'state':'off'}};self.writes=[]
    async def preflight(self,mood):pass
    async def snapshot_targets(self):return list(self.states)
    async def capture(self,targets):return {t:deepcopy(self.states[t]) for t in targets}
    async def read(self,t):return deepcopy(self.states[t])
    async def plan_apply(self,mood):return [ControlWrite('test','light',['light.test'],{'light.test':{'state':'on'}},{})]
    async def apply_write(self,w,s):
        self.writes.append(w);self.states.update(deepcopy(w.requested));return deepcopy(w.requested)
    async def restore(self,t,b,s):self.writes.append(t);self.states[t]=b
    def observation_targets(self,entity):return [entity] if entity in self.states else []
    def native_subscribe(self,callback):return lambda:None

class IntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory();self.hass=HomeAssistant(self.temp.name)
    async def asyncTearDown(self):
        if 'house_moods' in self.hass.data:await self.hass.data['house_moods'].close()
        await self.hass.async_block_till_done()
        self.temp.cleanup()
    async def test_real_registration_response_and_private_atomic_store(self):
        with patch('custom_components.house_moods.HAAdapter',Adapter):
            await async_setup(self.hass,{'house_moods':{}})
        result=await self.hass.services.async_call('house_moods','activate',{'mood':'love'},blocking=True,return_response=True)
        self.assertEqual(result['phase'],'active')
        sensor=self.hass.states.get('sensor.house_mood')
        self.assertEqual(sensor.state,'active');self.assertNotIn('baseline',sensor.attributes)
        value=json.loads((Path(self.temp.name)/'.storage/house_moods.session').read_text())
        self.assertEqual(value['data']['session']['baseline'],{'light.test':{'state':'off'}})
        result=await self.hass.services.async_call('house_moods','end',blocking=True,return_response=True)
        self.assertEqual(result['phase'],'idle')
    async def test_corrupt_storage_is_recovery_not_a_new_empty_session(self):
        path=Path(self.temp.name)/'.storage/house_moods.session';path.parent.mkdir();path.write_text('{broken')
        with patch('custom_components.house_moods.HAAdapter',Adapter):await async_setup(self.hass,{'house_moods':{}})
        result=await self.hass.services.async_call('house_moods','activate',{'mood':'love'},blocking=True,return_response=True)
        self.assertFalse(result['success']);self.assertEqual(result['phase'],'recovery_required')
        self.assertEqual(self.hass.data['house_moods'].adapter.writes,[])
        self.assertEqual(path.read_text(),'{broken')
    async def test_store_write_error_propagates_instead_of_logging_success(self):
        store=SessionStore(self.hass)
        await store.save(None)
        from homeassistant.util.file import WriteError
        with patch.object(store.store,'_write_data',side_effect=WriteError('disk full')):
            with self.assertRaises(RuntimeError):await store.save(Session('session',None,'starting'))
        self.assertIsNone(await store.load())
    async def test_queue_and_browse_use_existing_ha_interfaces(self):
        async def queue(call):return {'media_player.living_room':[{'media_content_id':'track'}]}
        self.hass.services.async_register('sonos','get_queue',queue,supports_response=SupportsResponse.ONLY)
        io=HAIO(self.hass)
        self.assertEqual(await io.queue('media_player.living_room'),[{'media_content_id':'track'}])
    async def test_service_write_context_is_registered_before_event(self):
        io=HAIO(self.hass);seen=[]
        async def handler(call):seen.append(io.origin(call.context))
        self.hass.services.async_register('light','turn_on',handler)
        await io.call('light','turn_on',['light.test'],{},'session')
        self.assertEqual(seen,['session'])

    async def test_store_rejects_version_and_invalid_journal(self):
        path=Path(self.temp.name)/'.storage/house_moods.session';path.parent.mkdir()
        for raw in ({'version':2,'data':{'session':None}}, {'version':1,'data':{'session':{'version':1,'journal':[{}]}}}):
            path.write_text(json.dumps(raw))
            with self.assertRaises((ValueError,RuntimeError)):
                await SessionStore(self.hass).load()
            self.assertEqual(json.loads(path.read_text()),raw)

    async def test_restart_planned_write_reconciles_without_commands(self):
        s=Session('session',None,'starting')
        s.baseline={'light.test':{'state':'off'}}
        s.journal=[{'operation_id':'test','action':'apply','targets':['light.test'],'requested':{'light.test':{'state':'on'}},'before':{'light.test':{'state':'off'}},'status':'planned','observed':{},'resolved':[],'until':0}]
        await SessionStore(self.hass).save(s)
        with patch('custom_components.house_moods.HAAdapter',Adapter):await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods']
        result=await runtime.engine.reconcile()
        self.assertEqual(result['phase'],'recovery_required')
        self.assertEqual(runtime.adapter.writes,[])
        self.assertEqual(runtime.engine.session.journal[0]['status'],'failed')

    async def test_shutdown_cancels_pending_service_and_keeps_planned_journal(self):
        class Waiting(Adapter):
            async def apply_write(self,w,s):
                self.started.set()
                await asyncio.Event().wait()
                self.writes.append(w)
        with patch('custom_components.house_moods.HAAdapter',Waiting):await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods'];runtime.adapter.started=asyncio.Event()
        task=asyncio.create_task(self.hass.services.async_call('house_moods','activate',{'mood':'love'},blocking=True,return_response=True))
        await runtime.adapter.started.wait()
        await runtime.close()
        await asyncio.gather(task,return_exceptions=True)
        self.assertEqual(runtime.adapter.writes,[])
        saved=await SessionStore(self.hass).load()
        self.assertEqual(saved.journal[-1]['status'],'planned')
        self.assertFalse(self.hass.services.has_service('house_moods','activate'))
        with self.assertRaises(asyncio.CancelledError):await runtime.io.call('light','turn_on',[],{},'session')

    async def test_browse_calls_media_entity_and_sanitizes_service_errors(self):
        from types import SimpleNamespace
        from homeassistant.components.media_player import DATA_COMPONENT
        from unittest.mock import AsyncMock
        result=SimpleNamespace(as_dict=lambda:{'children':[]})
        player=SimpleNamespace(async_browse_media=AsyncMock(return_value=result))
        self.hass.data[DATA_COMPONENT]=SimpleNamespace(get_entity=lambda entity:player)
        io=HAIO(self.hass)
        self.assertEqual(await io.browse('media_player.living_room','favorites',''),{'children':[]})
        player.async_browse_media.assert_awaited_once_with('favorites','')
        async def broken(call):raise ValueError('secret token')
        self.hass.services.async_register('light','turn_on',broken)
        with self.assertRaisesRegex(RuntimeError,r'^light.turn_on did not complete\.$'):
            await io.call('light','turn_on',[],{},'session')

    async def test_real_service_event_relinquishes_identical_manual_light(self):
        with patch('custom_components.house_moods.HAAdapter',Adapter):await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods']
        await self.hass.services.async_call('house_moods','activate',{'mood':'love'},blocking=True,return_response=True)
        async def light(call):pass
        self.hass.services.async_register('light','turn_on',light)
        await self.hass.services.async_call('light','turn_on',{'entity_id':'light.test'},blocking=True)
        await self.hass.async_block_till_done()
        self.assertIn('light.test',runtime.engine.session.overridden)
        self.assertNotIn('light.test',runtime.engine.session.owned)

    async def test_script_child_context_inherits_before_nested_command(self):
        with patch('custom_components.house_moods.HAAdapter',Adapter):await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods']
        await self.hass.services.async_call('house_moods','activate',{'mood':'love'},blocking=True,return_response=True)
        async def light(call):pass
        async def script(call):
            child=Context(parent_id=call.context.id)
            await self.hass.services.async_call('light','turn_on',{'entity_id':'light.test'},blocking=True,context=child)
        self.hass.services.async_register('light','turn_on',light)
        self.hass.services.async_register('script','test',script)
        await runtime.io.call('script','test',[],{},runtime.engine.session.session_id)
        await self.hass.async_block_till_done()
        self.assertIn('light.test',runtime.engine.session.owned)

    async def test_real_ha_script_join_idle_active_and_busy(self):
        from homeassistant.helpers import config_validation as cv
        from homeassistant.helpers.script import Script
        from custom_components.house_moods.ha_adapter import HAAdapter as RealAdapter
        from custom_components.house_moods.sonos import SPEAKERS,SOURCE,FOLLOW,FOLLOW_SOURCE,GROUPS
        await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods']
        self.hass.states.async_set(FOLLOW,'on')
        self.hass.states.async_set(FOLLOW_SOURCE,SOURCE)
        for speaker in SPEAKERS:self.hass.states.async_set(speaker,'playing',{'group_members':[speaker],'volume_level':.2})
        calls=[]
        async def join(call):
            calls.append(call)
            members=[SOURCE,*call.data['group_members']]
            for entity in members:self.hass.states.async_set(entity,'playing',{'group_members':members,'volume_level':.2},context=call.context)
        self.hass.services.async_register('media_player','join',join)
        config=json.loads((Path(__file__).resolve().parents[1]/'speaker-follow.json').read_text())['script']['config']
        script=Script(self.hass,cv.SCRIPT_SCHEMA(config['sequence']),'follow','script',script_mode='queued')
        await script.async_run({'command':'join','room':'media_player.bathroom'},Context())
        self.assertEqual(len(calls),1)
        self.assertIsNone(runtime.engine.session)
        for speaker in SPEAKERS:self.hass.states.async_set(speaker,'playing',{'group_members':[speaker],'volume_level':.2})
        await self.hass.async_block_till_done()
        s=Session('session','love','active')
        s.baseline={GROUPS:await runtime.adapter.read(GROUPS)}
        runtime.engine.session=s;runtime.engine._loaded=True
        await runtime.engine._save()
        await script.async_run({'command':'join','room':'media_player.bathroom'},Context())
        await self.hass.async_block_till_done()
        self.assertEqual(len(calls),2)
        self.assertIn(GROUPS,s.owned)
        self.assertEqual(s.journal[-1]['status'],'confirmed')
        self.assertEqual(s.journal[-1]['requested'][GROUPS]['groups'][0],[SOURCE,'media_player.bathroom'])
        async with runtime.engine._lock:
            result=await asyncio.wait_for(script.async_run({'command':'join','room':'media_player.gym'},Context()),1)
        self.assertEqual(len(calls),2)
        self.assertFalse(result.service_response['success'])

    async def test_native_reports_coalesce_and_own_capture_does_not_loop(self):
        from types import SimpleNamespace
        from custom_components.house_moods.ha_adapter import LazyBridge,DEVICE,ENTRY
        from custom_components.house_moods.presets import NEON
        class Bridge:
            def __init__(self):self.callback=None;self.count=0
            def subscribe(self,callback):
                self.callback=callback
                return lambda:setattr(self,'callback',None)
            async def capture(self,device):
                self.count+=1
                self.callback(device,'getr',{'d2':2},1)
                return SimpleNamespace(fields={'d2':2})
        bridge=Bridge()
        self.hass.data['lepro_led']={ENTRY:{'entities':[SimpleNamespace(_did=DEVICE,entity_id=NEON)],'native_state':bridge}}
        lazy=LazyBridge(self.hass);reports=[];lazy.callback=lambda:reports.append(True)
        await lazy.capture(DEVICE)
        self.assertEqual(reports,[])
        bridge.callback(DEVICE,'rpt',{'d50':'manual'},2)
        self.assertEqual(reports,[True])
        lazy.close();self.assertIsNone(bridge.callback)

    async def test_explicit_service_scope_and_area_resolution(self):
        from homeassistant.core import Event
        from homeassistant.helpers import area_registry,entity_registry,device_registry
        from custom_components.house_moods.sonos import SOURCE,FOLLOW,FOLLOW_SOURCE,GROUPS
        from custom_components.house_moods.presets import STRIP
        await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods'];seen=[]
        runtime.observe=lambda target,origin=None:seen.append((target,origin))
        def emit(domain,service,data):
            seen.clear()
            runtime.service_called(Event('call_service',{'domain':domain,'service':service,'service_data':data},context=Context()))
            return {t for t,o in seen}
        gym = 'media_player.gym'
        self.assertEqual(runtime.adapter.observation_targets(gym), [gym+'#volume',GROUPS,gym+'#playback'])
        self.assertEqual(emit('sonos','play_queue',{'entity_id':gym}),{gym+'#playback'})
        self.assertEqual(emit('media_player','media_pause',{'entity_id':gym}),{gym+'#playback'})
        self.assertEqual(emit('media_player','volume_set',{'entity_id':SOURCE,'volume_level':.2}),{SOURCE+'#volume'})
        self.assertEqual(emit('sonos','remove_from_queue',{'entity_id':SOURCE,'queue_position':0}),{SOURCE+'#playback'})
        self.assertEqual(emit('sonos','play_queue',{'entity_id':SOURCE}),{SOURCE+'#playback'})
        self.assertEqual(emit('media_player','media_next_track',{'entity_id':SOURCE}),set())
        self.assertEqual(emit('media_player','media_seek',{'entity_id':SOURCE,'seek_position':5}),set())
        self.assertEqual(emit('media_player','media_pause',{'entity_id':SOURCE}),{SOURCE+'#playback'})
        self.assertEqual(emit('input_text','set_value',{'entity_id':FOLLOW_SOURCE,'value':SOURCE}),{FOLLOW,GROUPS})
        self.assertEqual(emit('script','speaker_follow_motion',{'command':'disable'}),{FOLLOW,GROUPS})
        await device_registry.async_get(self.hass).async_load()
        areas=area_registry.async_get(self.hass);await areas.async_load();area=areas.async_create('Mood room')
        registry=entity_registry.async_get(self.hass);await registry.async_load()
        entity=registry.async_get_or_create('light','test','strip',suggested_object_id=STRIP.split('.')[1])
        registry.async_update_entity(entity.entity_id,area_id=area.id)
        self.assertEqual(emit('light','turn_on',{'area_id':area.id}),{STRIP})

    async def test_generic_state_context_is_not_treated_as_external(self):
        from homeassistant.core import Event
        with patch('custom_components.house_moods.HAAdapter',Adapter):await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods'];seen=[]
        runtime.observe=lambda target,origin=None:seen.append((target,origin))
        runtime.state_changed(Event('state_changed',{'entity_id':'light.test'},context=Context()))
        self.assertEqual(seen,[('light.test',None)])

    async def test_service_schema_rejects_unknown_mood_and_sensor_no_secrets(self):
        with patch('custom_components.house_moods.HAAdapter',Adapter):await async_setup(self.hass,{})
        import voluptuous as vol
        with self.assertRaises(vol.Invalid):
            await self.hass.services.async_call('house_moods','activate',{'mood':'other'},blocking=True,return_response=True)
        runtime=self.hass.data['house_moods']
        self.assertEqual(runtime.adapter.writes,[])
        self.assertEqual(set(self.hass.states.get('sensor.house_mood').attributes),{'success','session_id','active_mood','pending_mood','affected_devices','errors'})

    async def test_native_bridge_attaches_when_entry_arrives_after_yaml_setup(self):
        from types import SimpleNamespace
        from custom_components.house_moods.ha_adapter import DEVICE,ENTRY
        from custom_components.house_moods.presets import NEON
        await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods'];callbacks=[]
        def subscribe(callback):
            callbacks.append(callback)
            return lambda:callbacks.remove(callback)
        self.hass.data['lepro_led']={ENTRY:{'entities':[SimpleNamespace(_did=DEVICE,entity_id=NEON)],'native_state':SimpleNamespace(subscribe=subscribe)}}
        self.hass.states.async_set(NEON,'on')
        await self.hass.async_block_till_done()
        self.assertEqual(len(callbacks),1)
        await runtime.close()
        self.assertEqual(callbacks,[])

    async def test_coalesced_report_reads_after_operation_lock(self):
        with patch('custom_components.house_moods.HAAdapter',Adapter):await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods']
        await runtime.engine.activate('love')
        runtime.engine._clock=lambda:10**20
        async with runtime.engine._lock:
            runtime.adapter.states['light.test']={'state':'off'}
            runtime.observe('light.test')
            await asyncio.sleep(.02)
            runtime.adapter.states['light.test']={'state':'on'}
            runtime.observe('light.test')
        await self.hass.async_block_till_done()
        self.assertIn('light.test',runtime.engine.session.owned)

    async def test_actual_number_collection_and_read_only_native_intent(self):
        from types import SimpleNamespace
        from homeassistant.core import Event
        from custom_components.house_moods.ha_adapter import DEVICE,ENTRY
        from custom_components.house_moods.presets import NEON
        await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods'];seen=[]
        runtime.observe=lambda target,origin=None:seen.append(target)
        light=SimpleNamespace(_did=DEVICE,entity_id=NEON)
        self.hass.data['lepro_led']={ENTRY:{'entities':[light],'numbers':{DEVICE:[SimpleNamespace(entity_id='number.neon_speed',_light=light),SimpleNamespace(entity_id='number.neon_sensitivity',_light=light)]}}}
        for entity in ('number.neon_speed','number.neon_sensitivity'):
            seen.clear()
            runtime.service_called(Event('call_service',{'domain':'number','service':'set_value','service_data':{'entity_id':entity,'value':50}},context=Context()))
            self.assertEqual(seen,[NEON])
        seen.clear()
        runtime.service_called(Event('call_service',{'domain':'lepro_led','service':'request_debug_state','service_data':{'device_id':'754063076','keys':['d2']}},context=Context()))
        self.assertEqual(seen,[])

    async def test_read_only_native_request_preserves_ownership(self):
        from homeassistant.core import Event
        from custom_components.house_moods.presets import NEON
        await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods'];seen=[];runtime.observe=lambda target,origin=None:seen.append(target)
        runtime.service_called(Event('call_service',{'domain':'lepro_led','service':'request_debug_state','service_data':{'device_id':'754063076','keys':['d2']}},context=Context()))
        self.assertEqual(seen,[])

    async def test_real_script_manual_follow_override_keeps_normal_source(self):
        from homeassistant.helpers import config_validation as cv
        from homeassistant.helpers.script import Script
        from custom_components.house_moods.sonos import SPEAKERS,SOURCE,FOLLOW,FOLLOW_SOURCE,GROUPS
        await async_setup(self.hass,{})
        runtime=self.hass.data['house_moods'];calls=[]
        async def join(call):calls.append(call)
        self.hass.services.async_register('media_player','join',join)
        config=json.loads((Path(__file__).resolve().parents[1]/'speaker-follow.json').read_text())['script']['config']
        script=Script(self.hass,cv.SCRIPT_SCHEMA(config['sequence']),'follow','script',script_mode='queued')
        for source in (SOURCE,'media_player.bedroom'):
            self.hass.states.async_set(FOLLOW,'on');self.hass.states.async_set(FOLLOW_SOURCE,source)
            for speaker in SPEAKERS:self.hass.states.async_set(speaker,'playing',{'group_members':[speaker],'volume_level':.2})
            await self.hass.async_block_till_done()
            s=Session('session','love','active');s.baseline={GROUPS:await runtime.adapter.read(GROUPS),FOLLOW:await runtime.adapter.read(FOLLOW)};s.overridden={GROUPS,FOLLOW}
            runtime.engine.session=s;runtime.engine._loaded=True;await runtime.engine._save()
            result=await asyncio.wait_for(script.async_run({'command':'join','room':'media_player.bathroom'},Context()),1)
            self.assertTrue(result.service_response['success'])
            self.assertEqual(calls[-1].data['entity_id'],[source])
            self.assertEqual(s.journal,[]);self.assertEqual(s.owned,set())
            async with runtime.engine._lock:
                busy=await asyncio.wait_for(script.async_run({'command':'join','room':'media_player.gym'},Context()),1)
                self.assertFalse(busy.service_response['success'])
        self.assertEqual(len(calls),2)
