"""Manual playback relinquishes only its group and leaves Follow me responsive."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace as NS
import unittest
import importlib
import sys
import threading
import types
import uuid
from unittest.mock import patch
from test_coordinator import MemoryStore
from test_gym import HouseIO, Adapter
from test_lights import Bridge
from custom_components.house_moods import Runtime
from custom_components.house_moods.coordinator import MoodCoordinator, PersistenceError
from custom_components.house_moods.sonos import SOURCE, SPEAKERS, FOLLOW, FOLLOW_SOURCE, GROUPS

GYM = 'media_player.gym'
BATHROOM = 'media_player.bathroom'


class RuntimeIO(HouseIO):
    def __init__(self):
        super().__init__()
        self.settled = asyncio.Event()
        self.settled.set()
    def check_open(self):
        pass
    async def settle_pending(self):
        await self.settled.wait()
    async def call(self, domain, service, targets, data, session_id=None, return_response=False):
        return await super().call(domain, service, targets, data, session_id, return_response)


def runtime():
    result = Runtime.__new__(Runtime)
    result.io = RuntimeIO()
    result.adapter = Adapter(result.io, Bridge())
    result.engine = MoodCoordinator(result.adapter, MemoryStore())
    result.tasks = set()
    result._startup_ready = True
    result.closed = False
    return result


class ManualMoodTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.runtime = runtime()
        self.engine = self.runtime.engine
        self.io = self.runtime.io
        self.assertTrue((await self.engine.activate('unwind'))['success'])

    async def test_manual_launch_survives_end_mood_with_owned_follower(self):
        for entity in (SOURCE, GYM):
            self.io.states[entity]['attributes']['group_members'] = [GYM, SOURCE]
        controls = deepcopy(self.engine.session.owned)
        async with self.runtime.manual_playback(GYM, 'manual-context'):
            self.io.states[GYM]['state'] = self.io.states[SOURCE]['state'] = 'playing'
            self.io.queues[GYM] = self.io.queues[SOURCE] = [{'media_content_id': 'manual-track'}]
            self.assertEqual(self.engine.session.owned, controls - {SOURCE + '#playback'})
            self.assertEqual(self.engine.store.value.owned, controls - {SOURCE + '#playback'})
        calls = len(self.io.calls)
        await self.engine.end()
        self.assertFalse(any(c[1] == 'media_stop' for c in self.io.calls[calls:]))
        self.assertEqual(self.io.states[GYM]['state'], 'playing')
        self.assertEqual(self.io.states[SOURCE]['state'], 'playing')

    async def test_unrelated_separate_mood_speaker_keeps_ownership(self):
        async with self.runtime.manual_playback(GYM, 'manual-context'):
            self.assertIn(SOURCE + '#playback', self.engine.session.owned)
        await self.engine.end()
        self.assertEqual(self.io.states[SOURCE]['state'], 'paused')

    async def test_new_activation_end_retry_and_mode_are_busy_until_effect_finishes(self):
        async with self.runtime.manual_playback(SOURCE, 'manual-context'):
            self.assertFalse(self.engine._lock.locked())
            before = deepcopy(self.io.calls)
            for operation in (self.engine.activate('dinner'), self.engine.end(), self.engine.retry_restoration(), self.engine.apply_mode('night')):
                result = await operation
                self.assertFalse(result['success'])
                self.assertEqual(result['errors'][0]['target'], 'coordinator')
            self.assertEqual(self.io.calls, before)
            await self.engine.observe(SOURCE + '#playback', {}, 'external:observation')
        self.assertTrue((await self.engine.activate('dinner'))['success'])

    async def test_follow_join_and_light_off_leave_during_manual_effect(self):
        # Same path as current speaker-follow automation: a mood still owns its
        # lights, group and Follow me after relinquishing playback.
        self.assertTrue((await self.engine.activate('love'))['success'])
        self.io.states['light.light_toilet']['state'] = 'off'
        async with self.runtime.manual_playback(SOURCE, 'manual-context'):
            joined = await self.runtime.handle(NS(service='follow_join', data={'room': BATHROOM}))
            self.assertTrue(joined['success'], joined)
            self.assertEqual(self.io.states[BATHROOM]['attributes']['group_members'], [SOURCE, BATHROOM])
            left = await self.runtime.handle(NS(service='follow_leave', data={'room': BATHROOM}))
            self.assertTrue(left['success'], left)
            self.assertEqual(self.io.states[BATHROOM]['attributes']['group_members'], [BATHROOM])
            self.assertIn(FOLLOW, self.engine.session.owned)
            self.assertIn(GROUPS, self.engine.session.owned)

    async def test_inflight_mood_effect_settles_before_manual_launch(self):
        # Model a delegated service that outlives its HAIO deadline and engine lock.
        self.io.settled.clear()
        entered = asyncio.Event()
        async def launch():
            async with self.runtime.manual_playback(SOURCE, 'manual-context'):
                entered.set()
        pending = asyncio.create_task(launch())
        await asyncio.sleep(0)
        self.assertFalse(entered.is_set())
        self.assertIn(SOURCE + '#playback', self.engine.session.overridden)
        self.assertFalse((await self.engine.activate('dinner'))['success'])
        self.io.settled.set()
        await pending
        self.assertTrue(entered.is_set())

    async def test_persistence_failure_prevents_launch_and_releases_gate(self):
        self.engine.store.fail_next = True
        with self.assertRaises(PersistenceError):
            async with self.runtime.manual_playback(SOURCE, 'manual-context'):
                self.fail('Playback must not launch after failed ownership persistence')
        self.assertFalse(self.engine._manual_playback_active)
        self.assertFalse(self.engine._lock.locked())

    async def test_cancellation_while_waiting_old_effect_cleans_gate_without_launch(self):
        self.io.settled.clear()
        async def launch():
            async with self.runtime.manual_playback(SOURCE, 'manual-context'):
                self.fail('Unsettled older effect must prevent launch')
        pending = asyncio.create_task(launch())
        await asyncio.sleep(0)
        pending.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await pending
        self.assertFalse(self.engine._manual_playback_active)
        self.assertFalse(self.engine._lock.locked())


class ServiceLifetimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_keeps_executor_effect_and_manual_launch_guarded(self):
        core = types.ModuleType('homeassistant.core')
        core.Context = lambda: NS(id=uuid.uuid4().hex, parent_id=None)
        core.CoreState = NS(stopping='stopping', final_write='final_write', stopped='stopped')
        errors = types.ModuleType('homeassistant.exceptions')
        errors.HomeAssistantError = type('HomeAssistantError', (Exception,), {})
        with patch.dict(sys.modules, {'homeassistant': types.ModuleType('homeassistant'), 'homeassistant.core': core, 'homeassistant.exceptions': errors}):
            module = importlib.import_module('custom_components.house_moods.ha_adapter')
        started, release, finished = threading.Event(), threading.Event(), threading.Event()
        effects, cancelled = [], []
        async def service(*_, **__):
            def execute():
                started.set()
                if release.wait(2):
                    effects.append('old-playback')
                finished.set()
            try:
                await asyncio.to_thread(execute)
            except asyncio.CancelledError:
                cancelled.append(True)
                raise
        io = module.HAIO(NS(state='running', services=NS(async_call=service)))
        r = runtime()
        r.io = io
        pending = None
        try:
            from custom_components.house_moods.model import OperationTimeout
            with patch.object(module, 'SERVICE_TIMEOUT', .01):
                with self.assertRaises(OperationTimeout):
                    await io.call('media_player', 'play_media', [SOURCE], {}, 'old-session')
            self.assertTrue(started.is_set())
            entered = asyncio.Event()
            async def launch():
                async with r.manual_playback(SOURCE, 'manual-context'):
                    effects.append('manual-playback')
                    entered.set()
            pending = asyncio.create_task(launch())
            await asyncio.sleep(0)
            self.assertFalse(entered.is_set())
            self.assertFalse((await r.engine.activate('love'))['success'])
            self.assertEqual(cancelled, [])
            release.set()
            await asyncio.wait_for(pending, 1)
            self.assertEqual(effects, ['old-playback', 'manual-playback'])
        finally:
            release.set()
            await asyncio.to_thread(finished.wait, 1)
            if pending and not pending.done():
                pending.cancel()
                await asyncio.gather(pending, return_exceptions=True)
