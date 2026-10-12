"""Exercise HA's real websocket schemas, entity registry and permission policies."""
import asyncio
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from homeassistant.core import HomeAssistant
from homeassistant import loader
from homeassistant.config_entries import ConfigEntries, ConfigEntry, ConfigEntryState
from homeassistant.helpers import entity_registry as er, device_registry as dr
from homeassistant.auth.permissions import PolicyPermissions, PermissionLookup
import voluptuous as vol
from custom_components.dashboard_spotify import async_setup

class Connection:
    def __init__(self,user): self.user=user;self.messages=[]
    def send_message(self,message): self.messages.append(message)
    def send_result(self,id,result): self.messages.append({'id':id,'success':True,'result':result})
    def send_error(self,id,code,message): self.messages.append({'id':id,'success':False,'error':{'code':code,'message':message}})

class HATests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory();self.hass=HomeAssistant(self.temp.name)
        loader.async_setup(self.hass)
        self.hass.config_entries=ConfigEntries(self.hass,{})
        dr.async_setup(self.hass)
        await dr.async_load(self.hass)
        await er.async_load(self.hass)
        registry=er.async_get(self.hass)
        entity=registry.async_get_or_create('media_player','spotify','test-account',config_entry=None)
        self.entity=entity.entity_id
        self.entry=ConfigEntry(domain='spotify',entry_id='account',title='Test account',data={},options={},source='user',version=1,minor_version=1,unique_id='account',discovery_keys={},subentries_data=[],state=ConfigEntryState.LOADED)
        self.entry.runtime_data=SimpleNamespace()
        with patch.object(self.hass.config_entries,'async_get_entry',return_value=self.entry):
            registry.async_update_entity(self.entity,config_entry_id='account')
        self.lookup=PermissionLookup(registry,dr.async_get(self.hass))
        await async_setup(self.hass,{})
        self.handler,self.schema=self.hass.data['websocket_api']['dashboard_spotify/search']
    async def asyncTearDown(self):
        await self.hass.data['dashboard_spotify'].close()
        await self.hass.async_stop();await self.hass.async_block_till_done();self.temp.cleanup()
    async def request(self,policy,entries=None,**payload):
        user=SimpleNamespace(permissions=PolicyPermissions(policy,self.lookup))
        connection=Connection(user)
        message=self.schema({'id':1,'type':'dashboard_spotify/search','query':'Daft Punk',**payload})
        with patch.object(self.hass.config_entries,'async_entries',return_value=[self.entry] if entries is None else entries):
            self.handler(self.hass,connection,message)
            # Websocket responders are background tasks in HA, so wait for result.
            for _ in range(100):
                if connection.messages: break
                await asyncio.sleep(0.001)
        return connection.messages[0]
    async def test_actual_ha_registration_schema_and_missing_spotify(self):
        self.assertEqual(self.schema({'id':1,'type':'dashboard_spotify/search','query':'q'})['limit'],10)
        with self.assertRaises(vol.Invalid): self.schema({'id':1,'type':'dashboard_spotify/search','query':'q','token':'secret'})
        response=await self.request({'entities':True},entries=[])
        self.assertEqual(response['error']['code'],'spotify_not_configured')
    async def test_ha_entity_read_permission_blocks_catalog_access(self):
        response=await self.request({'entities':False})
        self.assertEqual(response['error']['code'],'unauthorized')
    async def test_authorized_entry_oauth_refresh_and_normalized_response(self):
        from custom_components.dashboard_spotify import SearchError
        calls=[]
        async def ensure(): calls.append('refreshed')
        self.entry.runtime_data.session=SimpleNamespace(async_ensure_token_valid=ensure,token={'access_token':'server-secret'})
        class Response:
            status=200
            async def __aenter__(self):return self
            async def __aexit__(self,*args): pass
            async def json(self):return {'tracks':{'items':[{'name':'Music','uri':'spotify:track:0DiWol3AO6WpXZgp0goxAV','artists':[{'name':'Artist'}]}],'total':1,'next':None}}
        def get(url,**kwargs):
            calls.append(kwargs);return Response()
        with patch('homeassistant.helpers.aiohttp_client.async_get_clientsession',return_value=SimpleNamespace(get=get)):
            result=await self.request({'entities':{'entity_ids':{self.entity:{'read':True}}}})
        self.assertTrue(result['success'],result)
        self.assertEqual(calls[0],'refreshed')
        self.assertEqual(calls[1]['params'],{'q':'Daft Punk','type':'track','limit':10,'offset':0})
        self.assertNotIn('server-secret',str(result))
        self.assertEqual(result['result']['items'][0]['subtitle'],'Artist')
    async def test_invalid_bounds_return_clear_error_before_network(self):
        result=await self.request({'entities':True},offset=-1)
        self.assertEqual(result['error']['code'],'invalid_query')
    async def test_429_response_has_safe_retry_delay_and_never_exposes_body(self):
        async def ensure(): pass
        self.entry.runtime_data.session=SimpleNamespace(async_ensure_token_valid=ensure,token={'access_token':'server-secret'})
        class Response:
            status=429
            headers={'Retry-After':'7'}
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            async def json(self):raise RuntimeError('secret response body')
        with patch('homeassistant.helpers.aiohttp_client.async_get_clientsession',return_value=SimpleNamespace(get=lambda *a,**kw:Response())):
            result=await self.request({'entities':True})
        self.assertEqual(result['error']['code'],'rate_limited')
        self.assertEqual(result['error']['retry_after'],7)
        self.assertNotIn('secret',str(result))
    async def test_disabled_spotify_entity_is_not_authorized(self):
        registry=er.async_get(self.hass)
        registry.async_update_entity(self.entity,disabled_by=er.RegistryEntryDisabler.USER)
        result=await self.request({'entities':True})
        self.assertEqual(result['error']['code'],'unauthorized')
