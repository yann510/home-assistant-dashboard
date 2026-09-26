"""Mode arbitration contracts using controllable device boundaries, never hardware."""
import asyncio
import copy
import unittest
from test_coordinator import FakeAdapter, MemoryStore, K, N
from custom_components.house_moods.coordinator import MoodCoordinator
from custom_components.house_moods.model import MOODS

class ModeAdapter(FakeAdapter):
    def __init__(self):
        super().__init__()
        self.plans['gym'] = {K: {'state': 'on', 'brightness': 255}}
        self.mode_writes = []
        self.mode_fail = None
    async def preflight_mode(self, mode):
        if mode not in ('day', 'night'):
            raise ValueError('Unknown mode')
    def mode_targets(self, mode):
        return [K, N]
    def mode_step_target(self, mode, step):
        return K if step == "brightness" else None
    def mode_steps(self, mode):
        return ['opposite_off', 'brightness', 'selected_on']
    async def apply_mode_step(self, mode, step, session_id):
        if step == self.mode_fail:
            raise OSError('mode offline')
        self.mode_writes.append((mode, step))
        if step == 'brightness':
            for value in self.states.values():
                value['brightness'] = 32 if mode == 'night' else 255

class ModeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.adapter, self.store = ModeAdapter(), MemoryStore()
        self.engine = MoodCoordinator(self.adapter, self.store)
    async def test_night_supersedes_every_mood_without_light_restore(self):
        for mood in MOODS:
            with self.subTest(mood=mood):
                self.setUp()
                await self.engine.activate(mood)
                result = await self.engine.apply_mode('night')
                self.assertTrue(result['success'])
                self.assertEqual(result['phase'], 'idle')
                self.assertEqual(result['mode_result'], 'accepted')
                self.assertFalse(any(action == 'restore' for action, _ in self.adapter.writes))
                writes = copy.deepcopy(self.adapter.writes)
                await self.engine.end()
                self.assertEqual(self.adapter.writes, writes)
    async def test_mode_during_start_is_rejected_and_cannot_overtake_activation(self):
        started, release = asyncio.Event(), asyncio.Event()
        original = self.adapter.apply_write
        async def blocked(*args):
            started.set()
            await release.wait()
            return await original(*args)
        self.adapter.apply_write = blocked
        task = asyncio.create_task(self.engine.activate('love'))
        await started.wait()
        result = await self.engine.apply_mode('night')
        self.assertFalse(result['success'])
        self.assertEqual(self.adapter.mode_writes, [])
        release.set()
        await task
    async def test_failed_mode_survives_restart_and_retry_only_unresolved_steps(self):
        await self.engine.activate('dinner')
        self.adapter.mode_fail = 'brightness'
        result = await self.engine.apply_mode('night')
        self.assertEqual(result['phase'], 'recovery_required')
        baseline = copy.deepcopy(self.engine.session.baseline)
        engine = MoodCoordinator(self.adapter, self.store)
        await engine.reconcile()
        self.assertEqual(engine.session.baseline, baseline)
        self.adapter.mode_fail = None
        result = await engine.retry_restoration()
        self.assertTrue(result['success'])
        self.assertEqual(self.adapter.mode_writes.count(('night', 'opposite_off')), 1)
        self.assertFalse(any(action == 'restore' for action, _ in self.adapter.writes))
    async def test_recovery_rejects_a_different_mode(self):
        self.adapter.mode_fail = 'brightness'
        await self.engine.apply_mode('night')
        self.assertFalse((await self.engine.apply_mode('day'))['success'])
        self.assertFalse((await self.engine.activate('love'))['success'])
    async def test_manual_intent_during_first_write_prevents_later_mood_write(self):
        def manual(_):
            self.engine.note_external(N)
            self.adapter.states[N] = {'state': 'off'}
        self.adapter.after_write = manual
        await self.engine.activate('dinner')
        self.assertEqual(self.adapter.states[N], {'state': 'off'})
        self.assertNotIn(('apply', N), self.adapter.writes)
        await self.engine.end()
        self.assertEqual(self.adapter.states[N], {'state': 'off'})
    async def test_manual_mode_change_at_persistence_boundary_is_not_overwritten(self):
        save = self.store.save
        async def intervene(session):
            await save(session)
            if session and 'brightness' in session.mode_before and 'brightness' not in session.mode_completed:
                self.engine.note_external(K)
                self.adapter.states[K] = {'state': 'on', 'brightness': 77}
        self.store.save = intervene
        result = await self.engine.apply_mode('night')
        self.assertTrue(result['success'])
        self.assertNotIn(('night', 'brightness'), self.adapter.mode_writes)
        self.assertEqual(self.adapter.states[K]['brightness'], 77)

    async def test_manual_change_after_mode_failure_survives_retry_and_restart(self):
        self.adapter.mode_fail = 'brightness'
        await self.engine.apply_mode('night')
        self.adapter.states[K] = {'state': 'on', 'brightness': 77}
        self.engine.note_external(K)
        await self.engine.observe(K, {}, 'external:user')
        self.engine = MoodCoordinator(self.adapter, self.store)
        await self.engine.reconcile()
        self.adapter.mode_fail = None
        await self.engine.retry_restoration()
        self.assertEqual(self.adapter.states[K]['brightness'], 77)
        self.assertNotIn(('night', 'brightness'), self.adapter.mode_writes)

    async def test_all_moods_reject_mode_requests_in_recovery_and_restore_phases(self):
        for mood in MOODS:
            for phase in ('starting', 'restoring', 'recovery_required'):
                with self.subTest(mood=mood, phase=phase):
                    self.setUp()
                    await self.engine.activate(mood)
                    self.engine.session.phase = phase
                    self.assertFalse((await self.engine.apply_mode('night'))['success'])
                    self.assertEqual(self.adapter.mode_writes, [])

    async def test_manual_controls_survive_activation_switch_and_end_save_boundaries(self):
        controls = {
            'brightness': (K, {'state': 'on', 'brightness': 77}),
            'all_lights_off': (K, {'state': 'off'}),
            'pause': ('media_player.living_room#playback', {'state': 'paused'}),
            'group_volume': ('media_player.bedroom#volume', {'volume': .66}),
            'speaker_selection': ('sonos#groups', {'groups': [['media_player.bedroom']]}),
            'follow_me': ('input_boolean.speaker_follow_motion', {'state': 'off'}),
        }
        for action in ('activate', 'switch', 'end'):
            for name, (target, manual) in controls.items():
                with self.subTest(action=action, control=name):
                    self.setUp()
                    self.adapter.states[target] = {'state': 'off'}
                    self.adapter.plans['love'] = {target: {'state': 'on'}}
                    self.adapter.plans['dinner'] = {target: {'state': 'on', 'new': True}}
                    if action != 'activate':
                        await self.engine.activate('love')
                    save = self.store.save
                    interrupted = False
                    async def intervene(session):
                        nonlocal interrupted
                        await save(session)
                        if session and session.journal and session.journal[-1]['status'] == 'planned' and not interrupted:
                            interrupted = True
                            self.engine.note_external(target)
                            self.adapter.states[target] = copy.deepcopy(manual)
                    self.store.save = intervene
                    if action == 'end':
                        await self.engine.end()
                    else:
                        await self.engine.activate('dinner' if action == 'switch' else 'love')
                    # Reversed old/new reports cannot reclaim explicit manual ownership.
                    await self.engine.observe(target, {'state': 'on'})
                    await self.engine.observe(target, manual)
                    await self.engine.end()
                    self.assertEqual(self.adapter.states[target], manual)
                    self.assertTrue(interrupted)
    async def test_every_mood_restores_steady_day_and_night_baseline(self):
        for mode in ('day', 'night'):
            for mood in MOODS:
                with self.subTest(mode=mode, mood=mood):
                    self.setUp()
                    await self.engine.apply_mode(mode)
                    baseline = copy.deepcopy(self.adapter.states)
                    mode_calls = list(self.adapter.mode_writes)
                    await self.engine.activate(mood)
                    await self.engine.end()
                    self.assertEqual(self.adapter.states, baseline)
                    self.assertEqual(self.adapter.mode_writes, mode_calls)

    async def test_every_mood_pair_preserves_original_mode_baseline(self):
        for mode in ('day', 'night'):
            for first in MOODS:
                for second in MOODS:
                    with self.subTest(mode=mode, first=first, second=second):
                        self.setUp()
                        await self.engine.apply_mode(mode)
                        baseline = copy.deepcopy(self.adapter.states)
                        await self.engine.activate(first)
                        await self.engine.activate(second)
                        await self.engine.end()
                        self.assertEqual(self.adapter.states, baseline)
    async def test_end_during_start_is_rejected_without_queuing_a_late_restore(self):
        started, release = asyncio.Event(), asyncio.Event()
        original = self.adapter.apply_write
        async def blocked(*args):
            started.set()
            await release.wait()
            return await original(*args)
        self.adapter.apply_write = blocked
        activation = asyncio.create_task(self.engine.activate('love'))
        await started.wait()
        result = await self.engine.end()
        self.assertFalse(result['success'])
        release.set()
        await activation
        self.assertEqual(self.engine.session.active_mood, 'love')
        self.assertFalse(any(action == 'restore' for action, _ in self.adapter.writes))
