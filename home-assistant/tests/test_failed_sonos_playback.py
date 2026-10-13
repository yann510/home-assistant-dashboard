"""Failed favorite playback must finish safe recovery without replaying a queue."""
from copy import deepcopy
import unittest
from test_gym import Adapter, Bridge, HouseIO
from test_coordinator import MemoryStore
from custom_components.house_moods.coordinator import MoodCoordinator
from custom_components.house_moods.model import OperationTimeout, Session
from custom_components.house_moods.sonos import SOURCE

PLAYBACK = SOURCE + '#playback'


def legacy_session(target=PLAYBACK):
    before = {'state': 'stopped', 'queue': ['old-track'], 'source': None, 'stream': None}
    session = Session('existing-session', None, 'recovery_required')
    session.baseline = {target: dict(before, state='playing')}
    session.expected = {target: deepcopy(before)}
    session.owned = {target}
    # Existing deployment has no write action/failure metadata; keep its shape.
    session.journal = [{'operation_id': 'failed-play', 'action': 'apply', 'targets': [target],
        'requested': {target: {'state': 'playing', 'source': None}}, 'before': {target: before},
        'status': 'planned', 'observed': {target: {'state': 'stopped', 'queue': [], 'source': None, 'stream': None}},
        'resolved': [], 'until': 0}]
    return session


class RecoveryAdapter(Adapter):
    def failed_apply_is_restored(self, target, entry, current):
        return self.sonos.failed_apply_is_restored(target, entry, current)


class FailedSonosPlaybackTests(unittest.IsolatedAsyncioTestCase):
    def setup_engine(self):
        io = HouseIO()
        adapter = RecoveryAdapter(io, Bridge())
        store = MemoryStore()
        return io, adapter, store, MoodCoordinator(adapter, store)

    async def test_failed_play_that_clears_queue_rolls_back_lights_volume_and_finishes(self):
        io, adapter, store, engine = self.setup_engine()
        lights = {e: deepcopy(raw) for e, raw in io.states.items() if e.startswith('light.')}
        call = io.call
        async def failed_play(domain, service, targets, data, session_id, return_response=False):
            if service == 'play_media':
                io.queues[targets[0]] = []
                raise RuntimeError('Sonos rejected favorite')
            return await call(domain, service, targets, data, session_id, return_response)
        io.call = failed_play
        result = await engine.activate('unwind')
        self.assertFalse(result['success'])
        self.assertEqual(result['phase'], 'idle', result)
        self.assertIsNone(store.value)
        self.assertEqual(io.states[SOURCE]['attributes']['volume_level'], .8)
        self.assertEqual({e: raw for e, raw in io.states.items() if e.startswith('light.')}, lights)
        self.assertEqual(io.queues[SOURCE], [])
        self.assertEqual(sum(c[1] == 'media_stop' for c in io.calls), 1)  # activation's stop only
        self.assertEqual(io.states['input_boolean.speaker_follow_motion']['state'], 'off')

    async def test_restart_legacy_journal_accepts_empty_or_partial_queue_without_writes(self):
        for source in (SOURCE, 'media_player.gym'):
            for queue in ([], [{'media_content_id': 'partial-new-track'}]):
                with self.subTest(source=source, queue=queue):
                    io, adapter, store, engine = self.setup_engine()
                    io.queues[source] = queue
                    store.value = Session.from_dict(legacy_session(source + '#playback').to_dict())
                    result = await engine.retry_restoration()
                    self.assertTrue(result['success'], result)
                    self.assertEqual(result['phase'], 'idle')
                    self.assertIsNone(store.value)
                    self.assertEqual(io.calls, [])
                    self.assertEqual(io.queues[source], queue)

    async def test_uncertain_timeout_stays_pending_even_when_queue_is_empty(self):
        io, adapter, store, engine = self.setup_engine()
        io.queues[SOURCE] = []
        store.value = legacy_session()
        store.value.journal[0]['uncertain'] = True
        result = await engine.retry_restoration()
        self.assertFalse(result['success'])
        self.assertEqual(result['phase'], 'recovery_required')
        self.assertEqual(store.value.journal[0]['status'], 'planned')
        self.assertEqual(io.calls, [])

    async def test_play_service_timeout_that_clears_queue_retains_uncertain_ownership(self):
        io, adapter, store, engine = self.setup_engine()
        call = io.call
        async def timed_out_play(domain, service, targets, data, session_id, return_response=False):
            if service == 'play_media':
                io.queues[targets[0]] = []
                raise OperationTimeout('Remote play effect is unconfirmed')
            return await call(domain, service, targets, data, session_id, return_response)
        io.call = timed_out_play
        result = await engine.activate('unwind')
        self.assertEqual(result['phase'], 'recovery_required', result)
        pending = [entry for entry in store.value.journal if entry['status'] == 'planned']
        self.assertEqual(len(pending), 1)
        self.assertTrue(pending[0]['uncertain'])
        self.assertIn(PLAYBACK, store.value.owned)
        before_retry = len(io.calls)
        self.assertFalse((await engine.retry_restoration())['success'])
        self.assertEqual(io.calls[before_retry:], [])

    async def test_manual_command_relinquishes_failed_play_without_device_writes(self):
        io, adapter, store, engine = self.setup_engine()
        io.queues[SOURCE] = [{'media_content_id': 'manual-music'}]
        io.states[SOURCE]['state'] = 'playing'
        store.value = legacy_session()
        store.value.overridden = {PLAYBACK}
        result = await engine.retry_restoration()
        self.assertTrue(result['success'], result)
        self.assertEqual(io.calls, [])
        self.assertEqual(io.states[SOURCE]['state'], 'playing')

    async def test_unexpected_external_source_or_offline_remains_pending(self):
        for state, attributes in [('playing', {'source': 'TV'}), ('paused', {'source': 'TV'}),
                ('paused', {'media_content_id': 'manual-stream'}), ('unavailable', {})]:
            with self.subTest(state=state, attributes=attributes):
                io, adapter, store, engine = self.setup_engine()
                io.queues[SOURCE] = []
                io.states[SOURCE]['state'] = state
                io.states[SOURCE]['attributes'].update(attributes)
                store.value = legacy_session()
                result = await engine.retry_restoration()
                self.assertFalse(result['success'], result)
                self.assertEqual(result['phase'], 'recovery_required')
                self.assertEqual(store.value.journal[0]['status'], 'planned')
                self.assertEqual(io.calls, [])

    async def test_other_apply_or_restore_requests_cannot_use_failed_play_recovery(self):
        for action, request in [('restore', {'state': 'playing', 'source': None}),
                ('apply', {'state': 'playing'}), ('apply', {'state': 'stopped', 'queue': ['expected-track']})]:
            with self.subTest(action=action, request=request):
                io, adapter, store, engine = self.setup_engine()
                io.queues[SOURCE] = []
                store.value = legacy_session()
                store.value.journal[0].update(action=action, requested={PLAYBACK: request})
                result = await engine.retry_restoration()
                self.assertEqual(result['phase'], 'recovery_required', result)
                self.assertEqual(io.calls, [])
