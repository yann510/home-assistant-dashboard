import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'lepro-extension/native_state.py'
if MODULE.exists():
    spec = importlib.util.spec_from_file_location('native_state', MODULE)
    native = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = native
    spec.loader.exec_module(native)
else:
    native = None
FIELDS = json.loads((ROOT / 'tests/fixtures/office-neon-original-effect.json').read_text())['service_data']['payload']
DID = '754063076'

class NativeStateTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.assertIsNotNone(native, 'NativeStateBridge implementation is missing')
        self.sent = []
        async def publish(topic, payload):
            self.sent.append((topic, json.loads(payload)))
        self.bridge = native.NativeStateBridge(publish=publish, clock=lambda: 1.0)

    async def start_capture(self, **kwargs):
        pending = asyncio.create_task(self.bridge.capture(DID, **kwargs))
        await asyncio.sleep(0)
        return pending

    def report(self, fields=None, kind='getr', at=3):
        self.bridge.ingest(DID, kind, FIELDS if fields is None else fields, at)

    async def test_unload_cancels_suspended_publish_and_queued_transaction(self):
        for replay in (False, True):
            with self.subTest(replay=replay):
                entered, release = asyncio.Event(), asyncio.Event()
                sent = []
                async def suspended(topic, payload):
                    entered.set()
                    await release.wait()
                    sent.append(topic)
                bridge = native.NativeStateBridge(publish=suspended)
                first = asyncio.create_task(bridge.replay(native.NativeSnapshot(1, DID, 1, FIELDS, {})) if replay else bridge.capture(DID))
                await entered.wait()
                queued = asyncio.create_task(bridge.capture(DID))
                await asyncio.sleep(0)
                bridge.close()
                release.set()
                outcomes = await asyncio.gather(first, queued, return_exceptions=True)
                self.assertEqual(sent, [], 'No suspended broker publish may resume after unload')
                self.assertTrue(all(isinstance(result, asyncio.CancelledError) for result in outcomes))

    async def test_set_echo_cannot_complete_capture(self):
        pending = await self.start_capture()
        self.report(kind='set')
        self.assertFalse(pending.done())
        self.report()
        self.assertEqual((await pending).fields, FIELDS)

    async def test_stale_and_partial_reports_cannot_complete_capture(self):
        self.report()
        pending = await self.start_capture()
        self.report(at=0)
        self.report({'d1': 1, 'd2': 2, 'd52': 1000})
        self.report({'d50': FIELDS['d50']})
        self.assertFalse(pending.done())
        self.report()
        self.assertEqual((await pending).fields, FIELDS)

    async def test_unsupported_mode(self):
        pending = await self.start_capture()
        self.report({'d1': 1, 'd2': 4})
        with self.assertRaises(ValueError):
            await pending
        snapshot = native.NativeSnapshot(1, DID, 1, {'d1': 1, 'd2': 4}, {})
        with self.assertRaises(ValueError):
            await self.bridge.replay(snapshot)
        self.assertEqual(len(self.sent), 1)

    async def test_two_captures_are_serial(self):
        first = await self.start_capture()
        second = await self.start_capture()
        self.assertEqual(len(self.sent), 1)
        self.report()
        await first
        await asyncio.sleep(0)
        self.assertEqual(len(self.sent), 2)
        self.assertFalse(second.done())
        self.report()
        await second

    async def test_publish_exception_propagates_and_releases_waiter(self):
        async def broken(*args):
            raise OSError('publish failed')
        self.bridge = native.NativeStateBridge(publish=broken)
        for operation in (self.bridge.capture(DID), self.bridge.replay(native.NativeSnapshot(1, DID, 1, FIELDS, {}))):
            with self.assertRaises(OSError):
                await operation
        self.assertEqual(self.bridge._waiters, {})

    async def test_exact_off_state_replay_and_extra_observed(self):
        fields = dict(FIELDS, d1=0)
        pending = await self.start_capture()
        self.report(dict(fields, d30='unknown', online=1, id=7))
        snapshot = await pending
        self.assertEqual(snapshot.fields, fields)
        self.assertEqual(snapshot.extra_observed['d30'], 'unknown')
        self.assertEqual(native.NativeSnapshot.from_dict(json.loads(json.dumps(snapshot.to_dict()))), snapshot)
        replay = asyncio.create_task(self.bridge.replay(snapshot))
        await asyncio.sleep(0)
        self.assertEqual(self.sent[-2][1]['d'], fields)
        self.assertTrue(self.sent[-1][0].endswith('/get'))
        self.report(fields, kind='set')
        self.assertFalse(replay.done())
        self.report(fields)
        self.assertEqual((await replay).fields, fields)

    async def test_mismatching_replay_fails(self):
        pending = asyncio.create_task(self.bridge.replay(native.NativeSnapshot(1, DID, 1, FIELDS, {})))
        await asyncio.sleep(0)
        self.report(dict(FIELDS, d52=42))
        with self.assertRaises(ValueError):
            await pending

    async def test_mode_three_and_allowlist(self):
        fields = {'d1': 1, 'd2': 3, 'd60': 'opaque;ABC', 'd52': 300}
        pending = await self.start_capture()
        self.report(fields)
        self.assertEqual((await pending).fields, fields)
        with self.assertRaises(ValueError):
            await self.bridge.replay(native.NativeSnapshot(1, DID, 1, dict(fields, d30='x'), {}))
        self.assertEqual(len(self.sent), 1)

    async def test_incremental_observation_unsubscribe_and_timeout_unload(self):
        seen = []
        unsubscribe = self.bridge.subscribe(lambda *args: seen.append(args))
        self.report({'d1': 0}, kind='rpt')
        self.assertEqual(seen[0][2], {'d1': 0})
        unsubscribe()
        self.report()
        self.assertEqual(len(seen), 1)
        with self.assertRaises(TimeoutError):
            await self.bridge.capture(DID, timeout=.001)
        pending = await self.start_capture()
        self.bridge.close()
        with self.assertRaises(asyncio.CancelledError):
            await pending
        self.assertEqual(self.bridge._waiters, {})


class NativeServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_target_and_snapshot_identity_checked_before_publish(self):
        path = ROOT / 'lepro-extension/native_services.py'
        self.assertTrue(path.exists(), 'Native service handlers are missing')
        spec = importlib.util.spec_from_file_location('native_services', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        from types import SimpleNamespace
        entity = SimpleNamespace(_did=DID, entity_id='light.office_neon')
        calls = []
        class Bridge:
            async def replay(self, snapshot):
                calls.append(snapshot)
                return snapshot
            async def capture(self, device_id):
                calls.append(device_id)
                return native.NativeSnapshot(1, device_id, 1, FIELDS, {})
        hass = SimpleNamespace(data={'lepro_led': {'entry': {'entities': [entity], 'native_state': Bridge()}}})
        handler = module.NativeServiceHandlers(hass, 'lepro_led', native.NativeSnapshot)
        captured = await handler.capture(SimpleNamespace(data={'entity_id': 'light.office_neon'}))
        self.assertEqual(captured['device_id'], DID)
        for target in ({'device_id': '999', 'entry_id': 'entry'}, {'entity_id': 'light.other'}, {'device_id': DID, 'entity_id': 'light.other'}):
            with self.assertRaises(ValueError):
                await handler.capture(SimpleNamespace(data=target))
        wrong = dict(captured, device_id='999')
        with self.assertRaises(ValueError):
            await handler.restore(SimpleNamespace(data={'device_id': DID, 'snapshot': wrong}))
        self.assertEqual(calls, [DID])
        restored = await handler.restore(SimpleNamespace(data={'device_id': DID, 'snapshot': captured}))
        self.assertEqual(restored, captured)

class IntegrationPatchTests(unittest.TestCase):
    def test_patch_applies_to_installed_baseline_and_preserves_customizations(self):
        patch_path = ROOT / 'lepro-extension/integration.patch'
        self.assertTrue(patch_path.exists(), 'Integration patch is missing')
        baseline = Path('/tmp/lepro-installed-light.py')
        if not baseline.exists():
            self.skipTest('Installed source baseline not present on this machine')
        import subprocess
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            for name in ('light.py', '__init__.py', 'services.yaml'):
                (target / name).write_bytes(Path('/tmp/lepro-installed-' + name).read_bytes())
            result = subprocess.run(['patch', '-p1', '-i', str(patch_path)], cwd=target, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            light = (target / 'light.py').read_text()
            init = (target / '__init__.py').read_text()
            compile(light, 'light.py', 'exec')
            compile(init, '__init__.py', 'exec')
            self.assertIn('native_state.ingest(did, message_type, data, time.monotonic())', light)
            self.assertLess(light.index('native_state.ingest'), light.index("if entity.is_b_model:", light.index('async def handle_mqtt_message')))
            self.assertIn('supports_response=SupportsResponse.ONLY', init)
            self.assertIn('is_se1_model', light)
            reverse = subprocess.run(['patch', '-R', '-p1', '-i', str(patch_path)], cwd=target, capture_output=True, text=True)
            self.assertEqual(reverse.returncode, 0)
            for name in ('light.py', '__init__.py', 'services.yaml'):
                self.assertEqual((target / name).read_bytes(), Path('/tmp/lepro-installed-' + name).read_bytes())


if __name__ == '__main__':
    unittest.main()
