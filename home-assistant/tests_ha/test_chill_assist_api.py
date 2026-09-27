"""Scoped Chill LLM API tests using the Home Assistant registry and service bus."""

from pathlib import Path
import sys
import tempfile
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from homeassistant.components import llm
from homeassistant.core import Context, HomeAssistant, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component
from homeassistant.helpers import llm as llm_helper
from homeassistant import loader
from homeassistant.config_entries import ConfigEntries


class ChillAPITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)
        loader.async_setup(self.hass)
        self.hass.config_entries = ConfigEntries(self.hass, {'chill_assist': {}})
        # The dependencies' own setup needs HTTP and hardware. Mark them ready
        # while still exercising HA's manifest, YAML and Chill setup lifecycle.
        self.hass.config.components.update({'house_moods', 'llm'})
        self.context = llm.LLMContext(
            platform='test', context=Context(user_id='voice-user'),
            language='en', assistant='test', device_id=None,
        )

    async def asyncTearDown(self):
        await self.hass.async_stop()
        await self.hass.async_block_till_done()
        self.temp.cleanup()

    async def setup_chill(self):
        self.assertTrue(await async_setup_component(
            self.hass, 'chill_assist', {'chill_assist': {}},
        ))
        return await llm_helper.async_get_api(self.hass, 'chill_assist', self.context)

    async def call_tool(self, instance, name, args):
        # The HA test venv omits hassil, imported only by conversation tracing.
        conversation = ModuleType('homeassistant.components.conversation')
        conversation.ConversationTraceEventType = SimpleNamespace(TOOL_CALL='tool_call')
        conversation.async_conversation_trace_append = lambda *_: None
        with patch.dict(sys.modules, {'homeassistant.components.conversation': conversation}):
            return await instance.async_call_tool(llm_helper.ToolInput(name, args))

    async def test_yaml_setup_registers_only_chill_and_stop_closes_it(self):
        instance = await self.setup_chill()
        registered = [api for api in llm_helper.async_get_apis(self.hass)
                      if api.id == 'chill_assist']
        self.assertEqual(len(registered), 1)
        self.assertEqual(registered[0].name, 'Chill assistant')
        self.assertEqual([tool.name for tool in instance.tools], ['StartChill'])
        self.assertIn('Chill', instance.api_prompt)
        self.assertNotIn('entity', instance.api_prompt.lower())
        self.assertNotIn('intent', instance.api_prompt.lower())
        self.hass.states.async_set('light.exposed_elsewhere', 'on')
        again = await llm_helper.async_get_api(self.hass, 'chill_assist', self.context)
        self.assertEqual([tool.name for tool in again.tools], ['StartChill'])
        self.assertNotIn('light.exposed_elsewhere', again.api_prompt)
        await self.hass.async_start()
        await self.hass.async_stop()
        self.assertFalse(any(api.id == 'chill_assist' for api in llm_helper.async_get_apis(self.hass)))
        with self.assertRaises(HomeAssistantError):
            await instance.tools[0].async_call(
                self.hass, llm_helper.ToolInput('StartChill', {}), self.context,
            )

    async def test_only_empty_arguments_dispatch_and_response_is_unchanged(self):
        instance = await self.setup_chill()
        calls = []
        response = {'success': True, 'phase': 'active', 'active_mood': 'unwind', 'errors': []}

        async def activate(call):
            calls.append(call)
            return response

        self.hass.services.async_register(
            'house_moods', 'activate', activate, supports_response=SupportsResponse.ONLY,
        )
        self.hass.states.async_set('sensor.house_mood', 'idle', {
            'active_mood': None, 'errors': [],
        })
        tool = instance.tools[0]
        for args in ({'mood': 'party'}, {'entity_id': 'light.test'},
                     {'service': 'light.turn_on'}, {'unexpected': 1}):
            with self.subTest(args=args):
                with self.assertRaises(HomeAssistantError):
                    await tool.async_call(
                        self.hass, llm_helper.ToolInput('StartChill', args), self.context,
                    )
        with self.assertRaises(HomeAssistantError):
            await tool.async_call(
                self.hass, llm_helper.ToolInput('OtherTool', {}), self.context,
            )
        with self.assertRaises(HomeAssistantError):
            await self.call_tool(instance, 'OtherTool', {})
        self.assertEqual(calls, [])
        result = await self.call_tool(instance, 'StartChill', {})
        self.assertEqual(result, {'status': 'activated', 'mood': 'Chill'})
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].data, {'mood': 'unwind'})
        self.assertIs(calls[0].context, self.context.context)

    async def test_action_failure_reaches_model_as_error(self):
        instance = await self.setup_chill()
        self.hass.states.async_set('sensor.house_mood', 'recovery_required', {
            'active_mood': None, 'errors': [],
        })
        with self.assertRaises(HomeAssistantError):
            await self.call_tool(instance, 'StartChill', {})
