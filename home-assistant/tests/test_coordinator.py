import copy
import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
from custom_components.house_moods.model import ControlWrite, Session
from custom_components.house_moods.coordinator import MoodCoordinator

K = 'light.light_kitchen'
N = 'light.neon'

class MemoryStore:
    def __init__(self):
        self.value = None
        self.fail_next = False
        self.save_count = 0
        self.fail_at = None
    async def load(self):
        return copy.deepcopy(self.value)
    async def save(self, value):
        self.save_count += 1
        if self.fail_next or self.save_count == self.fail_at:
            self.fail_next = False
            raise OSError('storage unavailable')
        self.value = copy.deepcopy(value)

class FakeAdapter:
    def __init__(self, states=None):
        self.states = copy.deepcopy(states or {K: {'state': 'off'}, N: {'state': 'off'}})
        self.writes = []
        self.fail_on = set()
        self.fail_after = set()
        self.reject_on = set()
        self.preflight_error = None
        self.after_write = None
        self.plans = {'love': {K: {'state': 'on', 'brightness': 100}}, 'dinner': {K: {'state': 'on', 'brightness': 200}, N: {'state': 'on'}}, 'unwind': {N: {'state': 'on'}}, 'party': {K: {'state': 'on', 'brightness': 250}}}
    async def preflight(self, mood):
        if self.preflight_error:
            raise ValueError(self.preflight_error)
    async def capture(self, targets):
        return {t: await self.read(t) for t in targets}
    async def read(self, target):
        if target in self.fail_on:
            raise OSError('offline')
        return copy.deepcopy(self.states[target])
    async def plan_apply(self, mood):
        return [ControlWrite(str(i), 'apply', [t], {t: s}, {}) for i, (t, s) in enumerate(self.plans[mood].items())]
    async def apply_write(self, write, session_id):
        for t in write.targets:
            if t in self.fail_on or t in self.reject_on:
                raise OSError('offline')
            self.writes.append(('apply', t))
            self.states[t] = copy.deepcopy(write.requested[t])
            if self.after_write:
                self.after_write(t)
            if t in self.fail_after:
                raise OSError('lost acknowledgement')
        return await self.capture(write.targets)
    async def restore(self, target, state, session_id):
        if target in self.fail_on:
            raise OSError('offline')
        self.writes.append(('restore', target))
        self.states[target] = copy.deepcopy(state)

class CoordinatorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.store = MemoryStore()
        self.adapter = FakeAdapter()
        self.engine = MoodCoordinator(self.adapter, self.store)
    async def test_empty_timeout_has_actionable_public_error(self):
        async def timeout(*args):
            raise TimeoutError()
        self.adapter.apply_write = timeout
        result = await self.engine.activate('love')
        self.assertFalse(result['success'])
        self.assertEqual(result['errors'][0]['message'], 'A device did not respond in time. Please try again.')

    async def test_switch_keeps_first_baseline(self):
        await self.engine.activate('love')
        initial = (await self.store.load()).baseline
        await self.engine.activate('dinner')
        self.assertEqual((await self.store.load()).baseline[K], initial[K])
        await self.engine.end()
        self.assertEqual(self.adapter.states[K], {'state': 'off'})
    async def test_idempotent_and_preflight(self):
        self.adapter.preflight_error = 'favorite missing'
        self.assertFalse((await self.engine.activate('love'))['success'])
        self.assertEqual(self.adapter.writes, [])
        self.adapter.preflight_error = None
        await self.engine.activate('love')
        await self.engine.activate('love')
        self.assertEqual(self.adapter.writes, [('apply', K)])
        await self.engine.end()
        await self.engine.end()
        self.assertEqual(len(self.adapter.writes), 2)
    async def test_manual_override_survives(self):
        await self.engine.activate('love')
        self.adapter.states[K] = {'state': 'on', 'brightness': 25}
        await self.engine.observe(K, self.adapter.states[K], 'user-command')
        await self.engine.end()
        self.assertEqual(self.adapter.states[K]['brightness'], 25)
    async def test_dropped_manual_target_has_new_return_destination(self):
        await self.engine.activate('love')
        self.adapter.states[K] = {'state': 'on', 'brightness': 25}
        await self.engine.observe(K, self.adapter.states[K], 'day-night')
        await self.engine.activate('unwind')
        await self.engine.activate('love')
        await self.engine.end()
        self.assertEqual(self.adapter.states[K]['brightness'], 25)
        self.assertEqual(self.adapter.states[N], {'state': 'off'})
    async def test_failure_after_physical_write_rolls_back(self):
        self.adapter.fail_after.add(K)
        result = await self.engine.activate('love')
        self.assertFalse(result['success'])
        self.assertEqual(self.adapter.states[K], {'state': 'off'})
        self.assertEqual(self.adapter.writes, [('apply', K), ('restore', K)])
    async def test_failed_switch_restores_original_and_preserves_manual(self):
        await self.engine.activate('dinner')
        self.adapter.states[N] = {'state': 'manual'}
        await self.engine.observe(N, self.adapter.states[N], 'user')
        self.adapter.fail_after.add(K)
        result = await self.engine.activate('love')
        self.assertFalse(result['success'])
        self.assertIsNone(result['active_mood'])
        self.assertEqual(self.adapter.states[K], {'state': 'off'})
        self.assertEqual(self.adapter.states[N], {'state': 'manual'})
    async def test_offline_restore_other_targets_and_retry_preserves_new_manual(self):
        await self.engine.activate('dinner')
        self.adapter.fail_on.add(K)
        self.assertEqual((await self.engine.end())['phase'], 'recovery_required')
        self.assertEqual(self.adapter.states[N], {'state': 'off'})
        self.assertFalse((await self.engine.activate('party'))['success'])
        self.adapter.fail_on.clear()
        self.adapter.states[K] = {'state': 'manual'}
        await self.engine.retry_restoration()
        self.assertEqual(self.adapter.states[K], {'state': 'manual'})
        self.assertIsNone(await self.store.load())
    async def test_save_failure_prevents_write(self):
        self.store.fail_next = True
        self.assertFalse((await self.engine.activate('love'))['success'])
        self.assertEqual(self.adapter.writes, [])
    async def test_confirmation_save_failure_restart_uses_durable_planned_entry(self):
        self.adapter.after_write = lambda target: setattr(self.store, 'fail_next', True)
        result = await self.engine.activate('love')
        self.assertEqual(result['phase'], 'recovery_required')
        persisted = await self.store.load()
        self.assertEqual(persisted.journal[-1]['status'], 'planned')
        restarted = MoodCoordinator(self.adapter, self.store)
        await restarted.reconcile()
        self.assertEqual(self.adapter.writes, [('apply', K)])
        self.assertEqual((await self.store.load()).phase, 'recovery_required')
        await restarted.retry_restoration()
        self.assertEqual(self.adapter.states[K], {'state': 'off'})
    async def test_restart_active_reads_only(self):
        await self.engine.activate('love')
        restarted = MoodCoordinator(self.adapter, self.store)
        result = await restarted.reconcile()
        self.assertEqual(result['phase'], 'active')
        self.assertEqual(self.adapter.writes, [('apply', K)])
    async def test_serialization_roundtrip_and_invalid_version(self):
        await self.engine.activate('love')
        session = await self.store.load()
        self.assertEqual(Session.from_dict(session.to_dict()), session)
        data = session.to_dict()
        data['version'] = 999
        with self.assertRaises(ValueError):
            Session.from_dict(data)

    async def test_journal_save_failure_prevents_associated_device_write(self):
        self.store.fail_at = 2
        result = await self.engine.activate('love')
        self.assertEqual(result['phase'], 'recovery_required')
        self.assertEqual(self.adapter.states[K], {'state': 'off'})
        self.assertEqual(self.adapter.writes, [])
        self.assertEqual((await self.store.load()).phase, 'starting')

    async def test_reincluded_override_failure_after_write_restores_baseline(self):
        await self.engine.activate('love')
        self.adapter.states[K] = {'state': 'manual'}
        await self.engine.observe(K, self.adapter.states[K], 'user')
        self.adapter.fail_after.add(K)
        await self.engine.activate('party')
        self.assertEqual(self.adapter.states[K], {'state': 'off'})

    async def test_love_dinner_failure_on_neon_restores_kitchen(self):
        await self.engine.activate('love')
        self.adapter.reject_on.add(N)
        result = await self.engine.activate('dinner')
        self.assertFalse(result['success'])
        self.assertEqual(self.adapter.states[K], {'state': 'off'})
        self.assertIsNone(result['active_mood'])
        self.assertEqual(result['phase'], 'idle')

    async def test_ambiguous_unconfirmed_write_retains_snapshot_without_replay(self):
        self.adapter.after_write = lambda target: self.adapter.states.update({target: {'state': 'intermediate'}})
        self.adapter.fail_after.add(K)
        result = await self.engine.activate('love')
        self.assertEqual(result['phase'], 'recovery_required')
        self.assertEqual(self.adapter.writes, [('apply', K)])
        self.assertEqual((await self.store.load()).baseline[K], {'state': 'off'})
        await self.engine.retry_restoration()
        self.assertEqual(self.adapter.writes, [('apply', K)])
        await self.engine.observe(K, {'state': 'intermediate'}, 'user')
        await self.engine.retry_restoration()
        self.assertIsNone(await self.store.load())

    async def test_delayed_session_ack_does_not_reclaim_manual_override(self):
        await self.engine.activate('love')
        sid = self.engine.session.session_id
        self.adapter.states[K] = {'state': 'manual'}
        await self.engine.observe(K, self.adapter.states[K], 'user')
        await self.engine.observe(K, {'state': 'on', 'brightness': 100}, sid)
        await self.engine.end()
        self.assertEqual(self.adapter.states[K], {'state': 'manual'})

    async def test_observer_receives_durable_phases_without_private_snapshots(self):
        statuses = []
        engine = MoodCoordinator(self.adapter, self.store, on_status=statuses.append)
        await engine.activate('love')
        await engine.end()
        self.assertEqual(statuses[0]['phase'], 'starting')
        self.assertEqual(statuses[0]['pending_mood'], 'love')
        self.assertEqual(statuses[-1]['phase'], 'idle')
        self.assertTrue(all('baseline' not in s and 'journal' not in s for s in statuses))

    async def test_captures_collection_baseline_before_first_write(self):
        async def snapshot_targets():
            return [K, N]
        self.adapter.snapshot_targets = snapshot_targets
        await self.engine.activate('love')
        baseline = (await self.store.load()).baseline
        self.assertEqual(baseline, {K: {'state': 'off'}, N: {'state': 'off'}})
        self.assertEqual(self.adapter.writes, [('apply', K)])

    async def test_unobserved_manual_change_to_excluded_target_updates_destination(self):
        async def snapshot_targets():
            return [K, N]
        self.adapter.snapshot_targets = snapshot_targets
        await self.engine.activate('love')
        self.adapter.states[N] = {'state': 'manual'}
        await self.engine.activate('dinner')
        await self.engine.end()
        self.assertEqual(self.adapter.states[N], {'state': 'manual'})

    async def test_playback_restoration_confirms_stop_instead_of_resuming_old_queue(self):
        playback = 'media_player.living#playback'
        self.adapter.states[playback] = {'state': 'playing', 'queue_id': 'original'}
        self.adapter.plans['love'] = {playback: {'state': 'playing', 'queue_id': 'mood'}}
        original_restore = self.adapter.restore
        self.adapter.restoration_state = lambda target, baseline: {'state': 'idle'} if target.endswith('#playback') else baseline
        async def restore(target, baseline, session_id):
            await original_restore(target, self.adapter.restoration_state(target, baseline), session_id)
        self.adapter.restore = restore
        await self.engine.activate('love')
        result = await self.engine.end()
        self.assertEqual(result['phase'], 'idle')
        self.assertEqual(self.adapter.states[playback], {'state': 'idle'})

    async def test_failed_switch_store_confirmation_clears_published_active_mood(self):
        await self.engine.activate('love')
        self.adapter.after_write = lambda target: setattr(self.store, 'fail_next', True)
        result = await self.engine.activate('party')
        self.assertEqual(result['phase'], 'recovery_required')
        self.assertIsNone(result['active_mood'])
        self.assertEqual((await self.store.load()).journal[-1]['status'], 'planned')

    async def test_overlapping_activation_rejected_without_second_playback(self):
        import asyncio
        started, release = asyncio.Event(), asyncio.Event()
        original_apply = self.adapter.apply_write
        async def apply(write, session_id):
            started.set()
            await release.wait()
            return await original_apply(write, session_id)
        self.adapter.apply_write = apply
        first = asyncio.create_task(self.engine.activate('love'))
        await started.wait()
        try:
            result = await self.engine.activate('party')
            self.assertFalse(result['success'])
        finally:
            release.set()
            await first
        self.assertEqual(self.adapter.states[K]['brightness'], 100)
        self.assertEqual(self.adapter.writes, [('apply', K)])

    async def test_volume_override_does_not_relinquish_playback_or_follow(self):
        volume, playback, follow = 'media_player.living#volume', 'media_player.living#playback', 'input_boolean.speaker_follow_motion'
        self.adapter.states.update({volume: {'volume': .1}, playback: {'state': 'stopped'}, follow: {'state': 'off', 'source': ''}})
        self.adapter.plans['love'] = {volume: {'volume': .3}, playback: {'state': 'playing', 'queue_id': 'love'}, follow: {'state': 'on', 'source': 'living'}}
        await self.engine.activate('love')
        self.adapter.states[volume] = {'volume': .7}
        await self.engine.observe(volume, {'volume': .7}, 'user')
        await self.engine.end()
        self.assertEqual(self.adapter.states[volume], {'volume': .7})
        self.assertEqual(self.adapter.states[playback], {'state': 'stopped'})
        self.assertEqual(self.adapter.states[follow], {'state': 'off', 'source': ''})

    async def test_restore_success_store_failure_restart_does_not_repeat_restore(self):
        await self.engine.activate('love')
        original_restore = self.adapter.restore
        async def restore(target, state, session_id):
            await original_restore(target, state, session_id)
            self.store.fail_next = True
        self.adapter.restore = restore
        result = await self.engine.end()
        self.assertEqual(result['phase'], 'recovery_required')
        self.assertEqual((await self.store.load()).journal[-1]['status'], 'planned')
        restarted = MoodCoordinator(self.adapter, self.store)
        await restarted.reconcile()
        await restarted.retry_restoration()
        self.assertIsNone(await self.store.load())
        self.assertEqual(self.adapter.writes, [('apply', K), ('restore', K)])

    async def test_multi_target_failed_write_restores_only_actual_owned_effects(self):
        async def plan(mood):
            return [ControlWrite('multi', 'script', [K, N], {K: {'state': 'on'}, N: {'state': 'on'}}, {})]
        self.adapter.plan_apply = plan
        self.adapter.reject_on.add(N)
        result = await self.engine.activate('love')
        self.assertFalse(result['success'])
        self.assertEqual(self.adapter.states[K], {'state': 'off'})
        self.assertEqual(self.adapter.writes, [('apply', K), ('restore', K)])

    async def test_prepare_restore_is_journaled_and_follow_restored_last(self):
        follow = 'input_boolean.speaker_follow_motion'
        self.adapter.states[follow] = {'state': 'off'}
        self.adapter.plans['love'] = {follow: {'state': 'on'}, K: {'state': 'on'}}
        async def prepare(session):
            return [ControlWrite('freeze', 'freeze', [follow], {follow: {'state': 'off'}}, {})]
        self.adapter.prepare_restore = prepare
        original_apply = self.adapter.apply_write
        async def apply(write, session_id):
            if write.operation_id == 'freeze':
                saved = await self.store.load()
                self.assertEqual(saved.journal[-1]['requested'], {follow: {'state': 'off'}})
                self.assertEqual(saved.journal[-1]['status'], 'planned')
            return await original_apply(write, session_id)
        self.adapter.apply_write = apply
        await self.engine.activate('love')
        await self.engine.end()
        self.assertEqual(self.adapter.writes[-3:], [('apply', follow), ('restore', K), ('restore', follow)])

    async def test_motion_write_is_journaled_without_replacing_baseline(self):
        group = 'media_player.bathroom#group'
        self.adapter.states[group] = {'members': ['bathroom']}
        write = ControlWrite('motion', 'join', [group], {group: {'members': ['living', 'bathroom']}}, {})
        self.assertFalse((await self.engine.apply_owned_write(write))['success'])
        await self.engine.activate('love')
        await self.engine.apply_owned_write(write)
        self.assertEqual((await self.store.load()).baseline[group], {'members': ['bathroom']})
        await self.engine.end()
        self.assertEqual(self.adapter.states[group], {'members': ['bathroom']})

    async def test_motion_write_does_not_reclaim_overridden_control(self):
        await self.engine.activate('love')
        self.adapter.states[K] = {'state': 'manual'}
        await self.engine.observe(K, self.adapter.states[K], 'user')
        write = ControlWrite('motion', 'join', [K], {K: {'state': 'on'}}, {})
        self.assertFalse((await self.engine.apply_owned_write(write))['success'])
        self.assertEqual(self.adapter.states[K], {'state': 'manual'})

    async def test_corrupt_journal_rejected_before_recovery(self):
        await self.engine.activate('love')
        value = (await self.store.load()).to_dict()
        value['journal'][0]['resolved'] = None
        with self.assertRaises(ValueError):
            Session.from_dict(value)

    async def test_restart_rejected_write_records_failed_not_confirmed(self):
        async def reject(write, sid):
            self.adapter.fail_on.add(K)
            raise OSError('rejected')
        self.adapter.apply_write = reject
        await self.engine.activate('love')
        self.adapter.fail_on.clear()
        restarted = MoodCoordinator(self.adapter, self.store)
        await restarted.reconcile()
        self.assertEqual((await self.store.load()).journal[0]['status'], 'failed')

    async def test_switch_to_excluding_dinner_restores_attributed_motion(self):
        group = 'sonos#groups'
        self.adapter.states[group] = {'members': ['bathroom']}
        await self.engine.activate('love')
        await self.engine.apply_owned_write(ControlWrite('motion', 'join', [group], {group: {'members': ['living', 'bathroom']}}, {}))
        await self.engine.activate('dinner')
        self.assertEqual(self.adapter.states[group], {'members': ['bathroom']})

    async def test_semantic_inclusion_retains_motion_groups_without_rewriting(self):
        group, follow = 'sonos#groups', 'input_boolean.speaker_follow_motion'
        self.adapter.states.update({group: {'members': ['bathroom']}, follow: {'state': 'off'}})
        self.adapter.plans['love'][follow] = {'state': 'on'}
        self.adapter.plans['party'][follow] = {'state': 'on'}
        async def included(mood):
            return [*self.adapter.plans[mood], group]
        self.adapter.included_targets = included
        await self.engine.activate('love')
        self.assertEqual((await self.store.load()).baseline[group], {'members': ['bathroom']})
        self.assertNotIn(group, (await self.store.load()).owned)
        await self.engine.apply_owned_write(ControlWrite('motion', 'join', [group], {group: {'members': ['living', 'bathroom']}}, {}))
        await self.engine.activate('party')
        self.assertEqual(self.adapter.states[group], {'members': ['living', 'bathroom']})
        self.assertEqual([w for w in self.adapter.writes if w[1] == group], [('apply', group)])
        await self.engine.end()
        self.assertEqual(self.adapter.states[group], {'members': ['bathroom']})

    async def test_semantic_inclusion_does_not_reclaim_manually_changed_group(self):
        group = 'sonos#groups'
        self.adapter.states[group] = {'members': ['bathroom']}
        async def included(mood):
            return [*self.adapter.plans[mood], group]
        self.adapter.included_targets = included
        await self.engine.activate('love')
        await self.engine.apply_owned_write(ControlWrite('motion', 'join', [group], {group: {'members': ['living', 'bathroom']}}, {}))
        self.adapter.states[group] = {'members': ['bedroom', 'bathroom']}
        await self.engine.observe(group, self.adapter.states[group], 'user')
        await self.engine.activate('party')
        self.assertIn(group, self.engine.session.overridden)
        self.assertNotIn(group, self.engine.session.owned)
        await self.engine.end()
        self.assertEqual(self.adapter.states[group], {'members': ['bedroom', 'bathroom']})

    async def test_failed_follow_preparation_restores_independent_controls(self):
        group, follow = 'sonos#groups', 'input_boolean.speaker_follow_motion'
        volume, playback = 'media_player.living#volume', 'media_player.living#playback'
        self.adapter.states.update({group: {'members': ['bathroom']}, follow: {'state': 'off'}, volume: {'volume': .1}, playback: {'state': 'stopped'}})
        self.adapter.plans['love'].update({group: {'members': ['living', 'bathroom']}, follow: {'state': 'on'}, volume: {'volume': .3}, playback: {'state': 'playing'}})
        async def prepare(session):
            await self.adapter.read(follow)
            return [ControlWrite('freeze', 'freeze', [follow], {follow: {'state': 'off'}}, {})]
        self.adapter.prepare_restore = prepare
        self.adapter.restore_dependencies = lambda: {group, follow}
        await self.engine.activate('love')
        self.adapter.fail_on.add(follow)
        result = await self.engine.end()
        self.assertEqual(result['phase'], 'recovery_required')
        self.assertEqual(self.adapter.states[K], {'state': 'off'})
        self.assertEqual(self.adapter.states[volume], {'volume': .1})
        self.assertEqual(self.adapter.states[playback], {'state': 'stopped'})
        self.assertEqual(self.adapter.states[group], {'members': ['living', 'bathroom']})
        self.assertNotIn(('restore', group), self.adapter.writes)
        self.adapter.fail_on.clear()
        self.adapter.states[group] = {'members': ['bedroom', 'bathroom']}
        await self.engine.retry_restoration()
        self.assertEqual(self.adapter.states[group], {'members': ['bedroom', 'bathroom']})
        self.assertIsNone(await self.store.load())

    async def test_switch_to_excluding_mood_prepares_before_dropped_group_restore(self):
        group, follow = 'sonos#groups', 'input_boolean.speaker_follow_motion'
        self.adapter.states.update({group: {'members': ['bathroom']}, follow: {'state': 'off'}})
        self.adapter.plans['love'][follow] = {'state': 'on'}
        self.adapter.plans['dinner'][follow] = {'state': 'off'}
        async def included(mood):
            return [*self.adapter.plans[mood], *([group] if mood == 'love' else [])]
        async def prepare(session):
            return [ControlWrite('freeze', 'freeze', [follow], {follow: {'state': 'off'}}, {})]
        self.adapter.included_targets = included
        self.adapter.prepare_restore = prepare
        self.adapter.restore_dependencies = lambda: {group, follow}
        await self.engine.activate('love')
        await self.engine.apply_owned_write(ControlWrite('motion', 'join', [group], {group: {'members': ['living', 'bathroom']}}, {}))
        original_restore = self.adapter.restore
        async def restore(target, baseline, sid):
            if target == group:
                self.assertEqual(self.adapter.states[follow], {'state': 'off'})
            await original_restore(target, baseline, sid)
        self.adapter.restore = restore
        result = await self.engine.activate('dinner')
        self.assertTrue(result['success'])
        self.assertEqual(self.adapter.states[group], {'members': ['bathroom']})

    async def test_failed_freeze_write_keeps_journal_and_restores_independent_light(self):
        group, follow = 'sonos#groups', 'input_boolean.speaker_follow_motion'
        self.adapter.states.update({group: {'members': ['bathroom']}, follow: {'state': 'off'}})
        self.adapter.plans['love'].update({group: {'members': ['living', 'bathroom']}, follow: {'state': 'on'}})
        async def prepare(session):
            return [ControlWrite('freeze', 'freeze', [follow], {follow: {'state': 'off'}}, {})]
        self.adapter.prepare_restore = prepare
        self.adapter.restore_dependencies = lambda: {group, follow}
        await self.engine.activate('love')
        self.adapter.reject_on.add(follow)
        result = await self.engine.end()
        self.assertEqual(result['phase'], 'recovery_required')
        self.assertEqual(self.adapter.states[K], {'state': 'off'})
        self.assertNotIn(('restore', group), self.adapter.writes)
        self.assertTrue(any(e['operation_id'] == 'freeze' and e['status'] == 'planned' for e in (await self.store.load()).journal))
        self.adapter.reject_on.clear()
        await self.engine.retry_restoration()
        self.assertEqual(self.adapter.states[group], {'members': ['bathroom']})
        self.assertIsNone(await self.store.load())

    async def test_unknown_preparer_failure_blocks_unknown_controls_only(self):
        unknown = 'custom.script_control'
        self.adapter.states[unknown] = {'state': 'before'}
        self.adapter.plans['love'][unknown] = {'state': 'mood'}
        async def prepare(session):
            raise OSError('quiescence unavailable')
        self.adapter.prepare_restore = prepare
        await self.engine.activate('love')
        result = await self.engine.end()
        self.assertEqual(result['phase'], 'recovery_required')
        self.assertEqual(self.adapter.states[K], {'state': 'off'})
        self.assertEqual(self.adapter.states[unknown], {'state': 'mood'})
        self.assertEqual((await self.store.load()).baseline[unknown], {'state': 'before'})

    async def test_unreadable_initial_store_is_recovery_and_never_allows_activation(self):
        async def unreadable():raise ValueError('invalid recovery data')
        self.store.load=unreadable
        for operation in (lambda:self.engine.activate('love'), self.engine.reconcile, lambda:self.engine.activate('party')):
            result=await operation()
            self.assertFalse(result['success'])
            self.assertEqual(result['phase'],'recovery_required')
        self.assertEqual(self.adapter.writes,[])

    async def test_deferred_observation_reads_current_state_under_lock(self):
        import asyncio
        await self.engine.activate('love')
        self.engine._clock = lambda: 10**20
        async with self.engine._lock:
            self.adapter.states[K] = {'state':'on', 'brightness':50}
            observation = asyncio.create_task(self.engine.observe(K))
            await asyncio.sleep(0)
            self.adapter.states[K] = {'state':'on', 'brightness':100}
        await observation
        self.assertIn(K, self.engine.session.owned)
        self.assertNotIn(K, self.engine.session.overridden)
