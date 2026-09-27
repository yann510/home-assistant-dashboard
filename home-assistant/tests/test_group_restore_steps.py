"""Regression for partially completed group restoration using production controls."""
import asyncio
from copy import deepcopy
import unittest
from test_coordinator import MemoryStore
from test_sonos import FakeIO
from custom_components.house_moods.coordinator import MoodCoordinator
from custom_components.house_moods.model import Session
from custom_components.house_moods.sonos import SonosControls, FOLLOW, FOLLOW_SOURCE, GROUPS, SPEAKERS

class GroupIO(FakeIO):
    def __init__(self):
        super().__init__()
        self.fail_join = True
    def groups(self, groups):
        for group in groups:
            for entity in group:
                self.states[entity]['attributes']['group_members'] = list(group)
    async def call(self, domain, service, targets, data, session_id, return_response=False):
        if service in ('join', 'unjoin'):
            self.calls.append((domain, service, targets, deepcopy(data)))
            if service == 'join':
                if self.fail_join:
                    raise RuntimeError('Transient join failure')
                self.groups([[targets[0], *data['group_members']]])
            else:
                member = targets[0]
                old = self.states[member]['attributes']['group_members']
                self.groups([[member], [e for e in old if e != member]])
            return {}
        return await super().call(domain, service, targets, data, session_id, return_response)

class GroupAdapter(SonosControls):
    async def capture(self, targets):
        return {t: await self.read(t) for t in targets}
    def restore_dependencies(self):
        return {GROUPS, FOLLOW}

class GroupRestoreTests(unittest.IsolatedAsyncioTestCase):
    async def seeded(self):
        io = GroupIO()
        living, bath, bed, gym = SPEAKERS
        io.groups([[living, bath], [bed], [gym]])
        io.states[FOLLOW]['state'] = 'on'
        io.states[FOLLOW_SOURCE]['state'] = living
        adapter = GroupAdapter(io)
        store = MemoryStore()
        store.value = Session('session', 'love', 'active',
            baseline={GROUPS: {'groups': [[living], [bath, bed], [gym]]}, FOLLOW: {'state': 'on', 'source': bath}},
            expected={t: await adapter.read(t) for t in (GROUPS, FOLLOW)}, owned={GROUPS, FOLLOW})
        return io, adapter, store, MoodCoordinator(adapter, store)

    async def test_partial_failure_retries_without_restart_and_holds_follow(self):
        io, adapter, store, engine = await self.seeded()
        baseline = deepcopy(store.value.baseline)
        self.assertEqual((await engine.end())['phase'], 'recovery_required')
        self.assertEqual((await adapter.read(FOLLOW))['state'], 'off')
        self.assertEqual(await adapter.read(GROUPS), {'groups': [[e] for e in SPEAKERS]})
        self.assertIn(GROUPS, store.value.owned)
        io.fail_join = False
        self.assertTrue((await engine.retry_restoration())['success'])
        self.assertIsNone(store.value)
        self.assertEqual(await adapter.read(GROUPS), baseline[GROUPS])
        self.assertEqual(await adapter.read(FOLLOW), baseline[FOLLOW])
        self.assertEqual(sum(c[1] == 'unjoin' for c in io.calls), 1)
        self.assertLess(max(i for i,c in enumerate(io.calls) if c[1] == 'join'), max(i for i,c in enumerate(io.calls) if c[1] == 'turn_on'))

    async def test_restart_reconciles_intermediate_progress(self):
        io, adapter, store, engine = await self.seeded()
        await engine.end()
        io.fail_join = False
        engine = MoodCoordinator(adapter, store)
        await engine.reconcile()
        self.assertIn(GROUPS, engine.session.owned)
        self.assertTrue((await engine.retry_restoration())['success'])

    async def test_manual_group_override_after_failure_is_not_replayed(self):
        io, adapter, store, engine = await self.seeded()
        await engine.end()
        io.groups([[SPEAKERS[0], SPEAKERS[3]], [SPEAKERS[1]], [SPEAKERS[2]]])
        current = await adapter.read(GROUPS)
        engine.note_external(GROUPS)
        await engine.observe(GROUPS)
        count = len([c for c in io.calls if c[1] in ('join','unjoin')])
        io.fail_join = False
        await engine.retry_restoration()
        self.assertEqual(await adapter.read(GROUPS), current)
        self.assertEqual(len([c for c in io.calls if c[1] in ('join','unjoin')]), count)

    async def test_cancelled_group_step_keeps_durable_progress_for_restart(self):
        io, adapter, store, engine = await self.seeded()
        entered = asyncio.Event()
        call = io.call
        async def blocked(domain, service, targets, data, session_id, return_response=False):
            if service == 'join':
                entry = store.value.journal[-1]
                self.assertEqual(entry['status'], 'planned')
                self.assertEqual(entry['before'][GROUPS], {'groups': [[e] for e in SPEAKERS]})
                entered.set()
                await asyncio.Event().wait()
            return await call(domain, service, targets, data, session_id, return_response)
        io.call = blocked
        task = asyncio.create_task(engine.end())
        await entered.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(store.value.journal[-1]['status'], 'planned')
        self.assertEqual((await adapter.read(FOLLOW))['state'], 'off')
        io.call = call
        io.fail_join = False
        restarted = MoodCoordinator(adapter, store)
        self.assertTrue((await restarted.retry_restoration())['success'])

    async def test_legacy_aggregate_partial_state_stays_paused_without_guessing(self):
        io, adapter, store, engine = await self.seeded()
        session = store.value
        session.phase = 'recovery_required'
        session.journal = [engine._entry('legacy', 'restore', [GROUPS],
            {GROUPS: session.baseline[GROUPS]}, {GROUPS: session.expected[GROUPS]})]
        io.groups([[e] for e in SPEAKERS])
        io.states[FOLLOW]['state'] = 'off'
        session.expected[FOLLOW]['state'] = 'off'
        result = await engine.retry_restoration()
        self.assertEqual(result['phase'], 'recovery_required')
        self.assertEqual(engine._pending_targets(), {GROUPS})
        self.assertEqual(io.calls, [])
        self.assertEqual((await adapter.read(FOLLOW))['state'], 'off')
