"""Offline HA API compatibility tests; skips outside the isolated HA environment."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))
try:
    from homeassistant.core import HomeAssistant, CoreState
    from custom_components.dashboard_attention import async_setup
    AVAILABLE = True
except ImportError:
    AVAILABLE = False

@unittest.skipUnless(AVAILABLE, 'Run with .venv-ha/bin/python for actual HA APIs')
class HATests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)
        from homeassistant.helpers import entity_registry as er
        self.hass.state = CoreState.running
        await er.async_load(self.hass)
        await async_setup(self.hass, {'dashboard_attention': {}})
        self.runtime = self.hass.data['dashboard_attention']
        self.now = self.runtime.clock() + 130
        self.runtime.clock = lambda: self.now
    async def asyncTearDown(self):
        await self.runtime.stop()
        await self.hass.async_block_till_done()
        self.temp.cleanup()
    async def test_real_event_capture_and_shared_persistent_dismissal(self):
        self.hass.states.async_set('sensor.dishwasher_dishwasher_job_state', 'washing')
        await self.hass.async_block_till_done()
        self.now += 1
        self.hass.states.async_set('sensor.dishwasher_dishwasher_job_state', 'finish')
        await self.hass.async_block_till_done()
        sensor = self.hass.states.get('sensor.dashboard_attention')
        item = next(i for i in sensor.attributes['items'] if i['id'] == 'complete:dishwasher')
        self.assertTrue(sensor.attributes['ready'])
        self.assertEqual(json.loads((Path(self.temp.name)/'.storage/dashboard_attention').read_text())['data']['events'][item['id']]['episode'], item['episode'])
        await self.hass.services.async_call('dashboard_attention', 'dismiss', {'id': item['id'], 'episode': item['episode']}, blocking=True)
        self.assertFalse(self.hass.states.get('sensor.dashboard_attention').attributes['items'])

@unittest.skipUnless(AVAILABLE, 'Run with .venv-ha/bin/python for actual HA APIs')
class StartupTests(unittest.IsolatedAsyncioTestCase):
    async def test_event_pulse_queued_during_initial_store_load(self):
        import asyncio
        from unittest.mock import patch
        class DelayedStore:
            def __init__(self): self.loading = asyncio.Event(); self.release = asyncio.Event(); self.saved = None
            async def async_load(self):
                self.loading.set()
                await self.release.wait()
                return None
            async def async_save(self, value): self.saved = value
        with tempfile.TemporaryDirectory() as directory:
            hass = HomeAssistant(directory)
            from homeassistant.helpers import entity_registry as er
            hass.state = CoreState.running
            await er.async_load(hass)
            store = DelayedStore()
            with patch('homeassistant.helpers.storage.Store', return_value=store):
                setup = asyncio.create_task(async_setup(hass, {'dashboard_attention': {}}))
                await store.loading.wait()
                hass.states.async_set('sensor.dryer_dryer_job_state', 'drying')
                await asyncio.sleep(0)
                hass.states.async_set('sensor.dryer_dryer_job_state', 'finished')
                await asyncio.sleep(0)
                hass.states.async_set('sensor.dryer_dryer_job_state', 'none')
                store.release.set()
                await setup
                await hass.async_block_till_done()
                items = hass.states.get('sensor.dashboard_attention').attributes['items']
                self.assertEqual([i['id'] for i in items], ['complete:dryer'])
                await hass.data['dashboard_attention'].stop()
                await hass.async_block_till_done()
