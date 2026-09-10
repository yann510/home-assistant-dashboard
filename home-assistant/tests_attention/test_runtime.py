import asyncio
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

root = Path(__file__).parents[1] / 'custom_components/dashboard_attention'
spec = importlib.util.spec_from_file_location('dashboard_attention', root / '__init__.py', submodule_search_locations=[str(root)])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

class Store:
    def __init__(self): self.saved = None
    async def async_load(self): return self.saved
    async def async_save(self, value): self.saved = value

class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_publish_save_short_event_and_stale_service(self):
        published = {}
        hass = SimpleNamespace(states=SimpleNamespace(async_set=lambda e,s,a: published.update(entity=e,state=s,attrs=a)))
        store = Store()
        now = [0]
        runtime = module.Runtime(hass, store, lambda: now[0])
        await runtime.start({})
        now[0] = 130
        await runtime.change('sensor.dishwasher_dishwasher_job_state', 'washing', {}, 130)
        await runtime.change('sensor.dishwasher_dishwasher_job_state', 'finish', {}, 131)
        now[0] = 132
        await runtime.change('sensor.dishwasher_dishwasher_job_state', 'none', {}, 132)
        item = published['attrs']['items'][0]
        self.assertTrue(published['attrs']['ready'])
        self.assertEqual(store.saved['events'][item['id']]['episode'], item['episode'])
        self.assertFalse(await runtime.action('dismiss', item['id'], 'old'))
        self.assertTrue(await runtime.action('dismiss', item['id'], item['episode']))
        self.assertEqual(published['attrs']['items'], [])
    async def test_failed_persistence_does_not_publish_false_success(self):
        class FailedStore(Store):
            async def async_save(self, value): raise OSError('disk full')
        published = []
        hass = SimpleNamespace(states=SimpleNamespace(async_set=lambda *args: published.append(args)))
        runtime = module.Runtime(hass, FailedStore(), lambda: 130)
        with self.assertRaises(OSError): await runtime.start({})
        self.assertEqual(published[-1][1], 'unavailable')
        self.assertFalse(published[-1][2]['ready'])

class FailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_save_failure_marks_unavailable_then_recovers(self):
        class FlakyStore(Store):
            fail = False
            async def async_save(self, value):
                if self.fail: raise OSError('disk full')
                await super().async_save(value)
        published = {}
        hass = SimpleNamespace(states=SimpleNamespace(async_set=lambda e,s,a: published.update(state=s,attrs=a)))
        store = FlakyStore()
        now = [0]
        runtime = module.Runtime(hass, store, lambda: now[0])
        await runtime.start({})
        now[0] = 130
        store.fail = True
        with self.assertRaises(OSError):
            await runtime.change('sensor.dryer_dryer_job_state', 'drying', {}, 130)
        self.assertEqual(published['state'], 'unavailable')
        self.assertFalse(published['attrs']['ready'])
        store.fail = False
        await runtime.tick()
        self.assertTrue(published['attrs']['ready'])
