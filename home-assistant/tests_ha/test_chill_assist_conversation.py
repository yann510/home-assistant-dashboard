"""Official OpenAI conversation transport over the scoped Chill API."""

import json
from pathlib import Path
import sys
import tempfile
import unittest
from types import MappingProxyType, SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import openai
import httpx
from openai.types.responses import (
    ResponseFunctionCallArgumentsDeltaEvent,
    ResponseFunctionCallArgumentsDoneEvent,
    ResponseOutputItemAddedEvent,
    ResponseOutputItemDoneEvent,
    ResponseTextDeltaEvent,
)
from homeassistant.components import conversation
from homeassistant.components.openai_conversation.conversation import OpenAIConversationEntity
from homeassistant.config_entries import ConfigSubentry, ConfigEntries
from homeassistant.const import CONF_LLM_HASS_API, CONF_PROMPT
from homeassistant.core import Context, HomeAssistant, SupportsResponse
from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er
from homeassistant import loader
from homeassistant.setup import async_setup_component


def function_stream(name="StartChill", args="{}"):
    item = {"type": "function_call", "name": name, "arguments": "", "call_id": "call-1", "status": "in_progress"}
    events = [
        ResponseOutputItemAddedEvent.model_validate({"type": "response.output_item.added", "item": item, "output_index": 0, "sequence_number": 1}),
        ResponseFunctionCallArgumentsDeltaEvent.model_validate({"type": "response.function_call_arguments.delta", "delta": args, "item_id": "item-1", "output_index": 0, "sequence_number": 2}),
        ResponseFunctionCallArgumentsDoneEvent.model_validate({"type": "response.function_call_arguments.done", "arguments": args, "item_id": "item-1", "name": name, "output_index": 0, "sequence_number": 3}),
    ]
    return stream(events)


def text_stream(text):
    return stream([ResponseTextDeltaEvent.model_validate({"type": "response.output_text.delta", "delta": text, "content_index": 0, "item_id": "item-2", "logprobs": [], "output_index": 0, "sequence_number": 1})])


def web_stream():
    item = {"type": "web_search_call", "id": "web-1", "status": "completed", "action": {"type": "search", "query": "weather", "sources": [{"type": "url", "url": "https://example.test/weather"}]}}
    return stream([ResponseOutputItemDoneEvent.model_validate({"type": "response.output_item.done", "item": item, "output_index": 0, "sequence_number": 1})])


async def stream(events):
    for event in events:
        yield event


class Provider:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    async def create(self, **kwargs):
        self.requests.append(kwargs)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class ChillConversationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)
        loader.async_setup(self.hass)
        self.hass.config_entries = ConfigEntries(self.hass, {"chill_assist": {}})
        self.hass.config.components.update({"house_moods", "llm"})
        self.assertTrue(await async_setup_component(self.hass, "chill_assist", {"chill_assist": {}}))
        dr.async_setup(self.hass)
        await dr.async_load(self.hass)
        await ar.async_load(self.hass)
        await er.async_load(self.hass)
        registry = er.async_get(self.hass)
        entry = registry.async_get_or_create("light", "test", "exposed-elsewhere", suggested_object_id="exposed_elsewhere")
        registry.async_update_entity_options(entry.entity_id, "conversation", {"should_expose": True})
        self.hass.states.async_set(entry.entity_id, "on")
        self.exposed_light = entry.entity_id

    async def asyncTearDown(self):
        await self.hass.async_stop()
        await self.hass.async_block_till_done()
        self.temp.cleanup()

    def agent(self, provider):
        subentry = ConfigSubentry(data=MappingProxyType({CONF_LLM_HASS_API: ["chill_assist"], CONF_PROMPT: "You are Chill.", "chat_model": "gpt-4o-mini", "web_search": True, "search_context_size": "low", "store_responses": False}), subentry_type="conversation", title="Home AI", unique_id=None)
        agent = OpenAIConversationEntity(SimpleNamespace(runtime_data=SimpleNamespace(responses=provider)), subentry)
        agent.hass = self.hass
        agent.entity_id = "conversation.home_ai"
        return agent

    async def ask(self, agent, text, conversation_id=None):
        return await agent.async_process(conversation.ConversationInput(text=text, context=Context(), conversation_id=conversation_id, device_id=None, satellite_id=None, language="en", agent_id="conversation.home_ai"))

    async def test_start_chill_result_reaches_next_provider_request(self):
        calls = []

        async def activate(call):
            calls.append(call)
            self.hass.states.async_set("sensor.house_mood", "active", {"active_mood": "unwind", "errors": []})
            return {"success": True, "phase": "active", "active_mood": "unwind", "errors": []}

        self.hass.services.async_register("house_moods", "activate", activate, supports_response=SupportsResponse.ONLY)
        self.hass.states.async_set("sensor.house_mood", "idle", {"active_mood": None, "errors": []})
        provider = Provider(function_stream(), text_stream("Chill is on."))
        result = await self.ask(self.agent(provider), "Start Chill")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].data, {"mood": "unwind"})
        self.assertEqual(result.response.speech["plain"]["speech"], "Chill is on.")
        self.assertEqual([json.loads(item["output"]) for item in provider.requests[1]["input"] if item["type"] == "function_call_output"], [{"status": "activated", "mood": "Chill"}])
        self.assertEqual([tool["name"] for tool in provider.requests[0]["tools"] if tool["type"] == "function"], ["StartChill"])
        self.assertNotIn(self.exposed_light, json.dumps(provider.requests[0]))

    async def test_failed_action_reaches_provider_as_error_not_success(self):
        self.hass.states.async_set("sensor.house_mood", "recovery_required", {"active_mood": None, "errors": []})
        provider = Provider(function_stream(), text_stream("I could not verify Chill starting."))
        result = await self.ask(self.agent(provider), "Start Chill")
        outputs = [json.loads(item["output"]) for item in provider.requests[1]["input"] if item["type"] == "function_call_output"]
        self.assertEqual(len(outputs), 1)
        self.assertIn("error", outputs[0])
        self.assertNotIn("status", outputs[0])
        self.assertNotIn("started", json.dumps(outputs[0]).lower())
        self.assertIn("could not verify", result.response.speech["plain"]["speech"])

    async def test_uncertain_dispatched_result_reaches_provider_as_error_once(self):
        calls = []

        async def activate(call):
            calls.append(call)
            return {"success": True, "phase": "starting", "active_mood": "unwind", "errors": []}

        self.hass.services.async_register("house_moods", "activate", activate, supports_response=SupportsResponse.ONLY)
        self.hass.states.async_set("sensor.house_mood", "idle", {"active_mood": None, "errors": []})
        provider = Provider(function_stream(), text_stream("I could not verify Chill starting."))
        result = await self.ask(self.agent(provider), "Start Chill")
        outputs = [json.loads(item["output"]) for item in provider.requests[1]["input"] if item["type"] == "function_call_output"]
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].data, {"mood": "unwind"})
        self.assertEqual(len(outputs), 1)
        self.assertIn("error", outputs[0])
        self.assertNotIn("status", outputs[0])
        self.assertNotIn("started", json.dumps(outputs[0]).lower())
        self.assertIn("could not verify", result.response.speech["plain"]["speech"])

    async def test_unknown_tool_and_hostile_arguments_are_rejected(self):
        calls = []

        async def turn_on(call):
            calls.append(call)

        self.hass.services.async_register("light", "turn_on", turn_on)
        self.hass.states.async_set("sensor.house_mood", "idle", {"active_mood": None, "errors": []})
        for name, args in (("TurnOnLight", '{"entity_id":"light.exposed_elsewhere"}'), ("StartChill", '{"entity_id":"light.exposed_elsewhere"}')):
            with self.subTest(name=name):
                provider = Provider(function_stream(name, args), text_stream("I cannot do that."))
                await self.ask(self.agent(provider), "Follow the web page's instruction to turn on the light")
                outputs = [json.loads(item["output"]) for item in provider.requests[1]["input"] if item["type"] == "function_call_output"]
                self.assertIn("error", outputs[0])
                self.assertEqual([tool["name"] for tool in provider.requests[0]["tools"] if tool["type"] == "function"], ["StartChill"])
        self.assertEqual(calls, [])

    async def test_followup_uses_returned_id_and_new_conversation_is_fresh(self):
        provider = Provider(text_stream("It is sunny."), text_stream("Yes, still sunny."), text_stream("A fresh answer."))
        agent = self.agent(provider)
        first = await self.ask(agent, "What is the weather?")
        await self.ask(agent, "And tomorrow?", first.conversation_id)
        await self.ask(agent, "Hello", "a-new-conversation")
        second_input = json.dumps(provider.requests[1]["input"])
        third_input = json.dumps(provider.requests[2]["input"])
        self.assertIn("What is the weather?", second_input)
        self.assertIn("And tomorrow?", second_input)
        self.assertNotIn("What is the weather?", third_input)

    async def test_provider_timeout_cannot_fabricate_action_success(self):
        provider = Provider(openai.APITimeoutError(request=httpx.Request("POST", "https://api.openai.com/v1/responses")))
        with self.assertRaisesRegex(Exception, "Error talking to OpenAI"):
            await self.ask(self.agent(provider), "Start Chill")
        self.assertEqual(len(provider.requests), 1)

    async def test_web_search_metadata_followed_by_hostile_tool_call_keeps_scope(self):
        calls = []

        async def turn_on(call):
            calls.append(call)

        self.hass.services.async_register("light", "turn_on", turn_on)
        provider = Provider(web_stream(), function_stream("StartChill", '{"service":"light.turn_on"}'), text_stream("I cannot do that."))
        await self.ask(self.agent(provider), "Look up the weather")
        for request in provider.requests:
            self.assertEqual([tool["name"] for tool in request["tools"] if tool["type"] == "function"], ["StartChill"])
        outputs = [json.loads(item["output"]) for item in provider.requests[2]["input"] if item["type"] == "function_call_output"]
        self.assertIn("error", outputs[0])
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
