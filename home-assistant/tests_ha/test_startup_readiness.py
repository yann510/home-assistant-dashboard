"""Startup telemetry readiness must not turn an intact mood into recovery."""
import asyncio
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from homeassistant.core import HomeAssistant, Context, SupportsResponse
from custom_components.house_moods import async_setup
from custom_components.house_moods.ha_adapter import HAAdapter, HAIO
from custom_components.house_moods.model import Session
from custom_components.house_moods.storage import SessionStore
from custom_components.house_moods.sonos import SOURCE, SPEAKERS, GROUPS

class StartupReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)
        self.calls = []
        self.ready()
        async def queue(call):
            self.calls.append('get_queue')
            return {SOURCE: [{'media_content_id': 'track'}]}
        self.hass.services.async_register('sonos', 'get_queue', queue, supports_response=SupportsResponse.ONLY)
        adapter = HAAdapter(self.hass, HAIO(self.hass))
        targets = [GROUPS, SOURCE+'#volume', SOURCE+'#playback']
        captured = await adapter.capture(targets)
        self.session = Session('persisted-session', 'unwind', 'active', baseline=deepcopy(captured), expected=deepcopy(captured), owned=set(targets))
        await SessionStore(self.hass).save(self.session)
        self.calls.clear()
    def ready(self):
        for entity in SPEAKERS:
            self.hass.states.async_set(entity, 'playing', {'group_members': [entity], 'volume_level': .2})
    def offline(self):
        for entity in SPEAKERS: self.hass.states.async_set(entity, 'unavailable')
    async def asyncTearDown(self):
        if 'house_moods' in self.hass.data: await self.hass.data['house_moods'].close()
        await self.hass.async_block_till_done()
        self.temp.cleanup()
    async def test_early_observation_and_service_wait_without_changing_persisted_session(self):
        self.offline()
        await async_setup(self.hass, {})
        runtime = self.hass.data['house_moods']
        runtime.observe(SOURCE+'#volume')
        call = SimpleNamespace(service='follow_leave', data={'room': 'media_player.invalid'}, context=Context())
        service = asyncio.create_task(runtime.handle(call))
        await asyncio.sleep(.02)
        self.assertFalse(runtime.engine._loaded)
        self.assertEqual((await SessionStore(self.hass).load()).to_dict(), self.session.to_dict())
        self.assertEqual(self.calls, [])
        self.ready()
        await asyncio.wait_for(service, 2)
        await self.hass.async_block_till_done()
        restored = runtime.engine.session
        self.assertEqual((restored.phase, restored.active_mood), ('active', 'unwind'))
        self.assertEqual(restored.owned, self.session.owned)
        self.assertEqual(restored.overridden, set())
        self.assertTrue(all(call == 'get_queue' for call in self.calls))
    async def test_expired_readiness_preserves_recovery_instead_of_promoting(self):
        self.offline()
        with patch('custom_components.house_moods.STARTUP_READINESS_TIMEOUT', .02, create=True), patch('custom_components.house_moods.STARTUP_READINESS_POLL', .005, create=True):
            await async_setup(self.hass, {})
            runtime = self.hass.data['house_moods']
            await asyncio.wait_for(runtime.ensure_startup_ready(), 1)
        self.assertEqual(runtime.engine.session.phase, 'recovery_required')
        self.ready()
        await runtime.ensure_startup_ready()
        self.assertEqual(runtime.engine.session.phase, 'recovery_required')
        self.assertTrue(all(call == 'get_queue' for call in self.calls))
    async def test_interrupted_session_is_not_promoted_when_telemetry_ready(self):
        self.session.phase = 'starting'
        await SessionStore(self.hass).save(self.session)
        await async_setup(self.hass, {})
        runtime = self.hass.data['house_moods']
        await runtime.ensure_startup_ready()
        self.assertEqual(runtime.engine.session.phase, 'recovery_required')
        self.assertTrue(all(call == 'get_queue' for call in self.calls))
    async def test_inconsistent_group_reports_remain_recovery_after_readiness_timeout(self):
        self.hass.states.async_set(SOURCE, 'playing', {'group_members': [SOURCE, 'media_player.bedroom'], 'volume_level': .2})
        with patch('custom_components.house_moods.STARTUP_READINESS_TIMEOUT', .02), patch('custom_components.house_moods.STARTUP_READINESS_POLL', .005):
            await async_setup(self.hass, {})
            runtime = self.hass.data['house_moods']
            await asyncio.wait_for(runtime.ensure_startup_ready(), 1)
        self.assertEqual(runtime.engine.session.phase, 'recovery_required')
        self.assertTrue(any(error['target'] == GROUPS for error in runtime.engine.session.errors))
        self.assertTrue(all(call == 'get_queue' for call in self.calls))
