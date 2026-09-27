"""Contract tests for the fixed Chill Assist action against HA's real service bus."""
import asyncio
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from homeassistant.core import Context, HomeAssistant, SupportsResponse
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.exceptions import HomeAssistantError
from custom_components.chill_assist.action import ChillAction


SUCCESS = {'success': True, 'phase': 'active', 'active_mood': 'unwind', 'errors': []}


class ChillActionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)
        self.calls = []
        self.response = dict(SUCCESS)
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.hold = False

        async def activate(call):
            self.calls.append(call)
            self.started.set()
            if self.hold:
                await self.release.wait()
            if isinstance(self.response, Exception):
                raise self.response
            return self.response

        self.hass.services.async_register(
            'house_moods', 'activate', activate,
            supports_response=SupportsResponse.ONLY,
        )
        self.action = ChillAction(self.hass, response_timeout=.02)

    async def asyncTearDown(self):
        self.release.set()
        await self.action.async_close()
        await self.hass.async_block_till_done()
        self.temp.cleanup()

    def status(self, phase='idle', mood=None, errors=None):
        self.hass.states.async_set('sensor.house_mood', phase, {
            'active_mood': mood, 'errors': [] if errors is None else errors,
        })

    async def test_idle_dispatches_fixed_mood_once_with_context(self):
        self.status()
        context = Context(user_id='voice-user')
        self.assertEqual(await self.action.async_start(context),
                         {'status': 'activated', 'mood': 'Chill'})
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0].data, {'mood': 'unwind'})
        self.assertIs(self.calls[0].context, context)

    async def test_clean_already_active_has_no_service_call(self):
        self.status('active', 'unwind')
        self.assertEqual(await self.action.async_start(None),
                         {'status': 'already_active', 'mood': 'Chill'})
        self.assertEqual(self.calls, [])

    async def test_other_active_mood_switches_once(self):
        self.status('active', 'love')
        self.assertEqual((await self.action.async_start(None))['status'], 'activated')
        self.assertEqual(len(self.calls), 1)

    async def test_busy_recovery_and_missing_status_never_dispatch(self):
        for phase in ('starting', 'restoring', 'recovery_required', 'unknown'):
            with self.subTest(phase=phase):
                self.status(phase)
                with self.assertRaises(HomeAssistantError):
                    await self.action.async_start(None)
        self.hass.states.async_remove('sensor.house_mood')
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        self.assertEqual(self.calls, [])

    async def test_active_sensor_with_errors_is_not_clean_success(self):
        self.status('active', 'unwind', [{'target': 'sonos', 'message': 'Failed'}])
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        self.assertEqual(self.calls, [])

    async def test_partial_wrong_and_malformed_responses_never_succeed(self):
        responses = [
            {'success': False, 'phase': 'recovery_required', 'active_mood': None,
             'errors': [{'target': 'sonos', 'message': 'Speaker unavailable'}]},
            {'success': False, 'phase': 'active', 'active_mood': 'unwind', 'errors': []},
            {'success': True, 'phase': 'active', 'active_mood': 'love', 'errors': []},
            {'success': True, 'phase': 'starting', 'active_mood': 'unwind', 'errors': []},
            {'success': True, 'phase': 'active', 'active_mood': 'unwind',
             'errors': [{'target': 'lights', 'message': 'Partial failure'}]},
            {'phase': 'active', 'active_mood': 'unwind', 'errors': []},
            None,
        ]
        for response in responses:
            with self.subTest(response=response):
                self.status()
                self.response = response
                action = ChillAction(self.hass, response_timeout=.02)
                try:
                    with self.assertRaises(HomeAssistantError):
                        await action.async_start(None)
                finally:
                    await action.async_close()

    async def test_service_exception_does_not_claim_success(self):
        self.status()
        self.response = HomeAssistantError('secret transport detail')
        with self.assertRaises(HomeAssistantError) as raised:
            await self.action.async_start(None)
        self.assertNotIn('secret', str(raised.exception))

    async def test_overlap_and_timeout_never_retry_pending_operation(self):
        self.status()
        self.hold = True
        first = asyncio.create_task(self.action.async_start(None))
        await self.started.wait()
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        with self.assertRaises(HomeAssistantError):
            await first
        self.assertEqual(len(self.calls), 1)
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        self.assertEqual(len(self.calls), 1)
        self.release.set()
        await asyncio.sleep(0)
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        self.assertEqual(len(self.calls), 1)

    async def test_completed_service_remains_owned_until_response_is_validated(self):
        for response, succeeds in ((dict(SUCCESS), True), (None, False)):
            with self.subTest(response=response):
                await self.action.async_close()
                self.action = ChillAction(self.hass, response_timeout=.02)
                self.calls.clear()
                self.status()
                self.response = response
                self.hold = True
                self.started.clear()
                self.release.clear()
                first = asyncio.create_task(self.action.async_start(None))
                await self.started.wait()
                competing = []
                self.action._operation.add_done_callback(
                    lambda _: competing.append(asyncio.create_task(
                        self.action.async_start(None), eager_start=True)))
                self.release.set()
                await asyncio.sleep(0)
                await asyncio.sleep(0)
                await asyncio.sleep(0)
                self.assertEqual(len(competing), 1)
                with self.assertRaises(HomeAssistantError):
                    await competing[0]
                if succeeds:
                    self.assertEqual((await first)['status'], 'activated')
                else:
                    with self.assertRaises(HomeAssistantError):
                        await first
                self.assertEqual(len(self.calls), 1)

    async def test_queued_pre_dispatch_event_cannot_reconcile_timeout(self):
        self.status('active', 'unwind')
        stale = self.hass.states.get('sensor.house_mood')
        self.status()
        self.hold = True
        first = asyncio.create_task(self.action.async_start(None))
        await self.started.wait()
        self.hass.bus.async_fire(EVENT_STATE_CHANGED, {
            'entity_id': 'sensor.house_mood', 'new_state': stale,
        })
        with self.assertRaises(HomeAssistantError):
            await first
        self.release.set()
        await asyncio.sleep(0)
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        self.assertEqual(len(self.calls), 1)

    async def test_delayed_older_event_cannot_replace_fresh_recovery(self):
        self.status()
        self.hold = True
        first = asyncio.create_task(self.action.async_start(None))
        await self.started.wait()
        with self.assertRaises(HomeAssistantError):
            await first
        self.release.set()
        await asyncio.sleep(0)
        self.status('active', 'unwind')
        old_active = self.hass.states.get('sensor.house_mood')
        self.status('recovery_required')
        await self.hass.async_block_till_done()
        self.hass.bus.async_fire(EVENT_STATE_CHANGED, {
            'entity_id': 'sensor.house_mood', 'new_state': old_active,
        })
        await self.hass.async_block_till_done()
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        self.assertEqual(len(self.calls), 1)

    async def test_uncertain_completion_requires_fresh_authoritative_status(self):
        self.status()
        self.hold = True
        first = asyncio.create_task(self.action.async_start(None))
        await self.started.wait()
        with self.assertRaises(HomeAssistantError):
            await first
        self.release.set()
        await asyncio.sleep(0)
        # An active state installed before dispatch cannot reconcile uncertainty.
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        self.status('active', 'unwind')
        await self.hass.async_block_till_done()
        self.assertEqual(await self.action.async_start(None),
                         {'status': 'already_active', 'mood': 'Chill'})
        self.assertEqual(len(self.calls), 1)

    async def test_fresh_recovery_after_uncertainty_reports_failure(self):
        self.status()
        self.hold = True
        first = asyncio.create_task(self.action.async_start(None))
        await self.started.wait()
        with self.assertRaises(HomeAssistantError):
            await first
        self.release.set()
        await asyncio.sleep(0)
        self.status('recovery_required')
        await self.hass.async_block_till_done()
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        self.assertEqual(len(self.calls), 1)

    async def test_shutdown_cancels_retained_operation(self):
        self.status()
        self.hold = True
        first = asyncio.create_task(self.action.async_start(None))
        await self.started.wait()
        with self.assertRaises(HomeAssistantError):
            await first
        await self.action.async_close()
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        self.assertEqual(len(self.calls), 1)

    async def test_cancelled_caller_keeps_service_owned_until_shutdown(self):
        self.status()
        self.hold = True
        caller = asyncio.create_task(self.action.async_start(None))
        await self.started.wait()
        operation = self.action._operation
        caller.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await caller
        self.assertFalse(operation.done())
        with self.assertRaises(HomeAssistantError):
            await self.action.async_start(None)
        self.assertEqual(len(self.calls), 1)
        await self.action.async_close()
        self.assertTrue(operation.cancelled())
