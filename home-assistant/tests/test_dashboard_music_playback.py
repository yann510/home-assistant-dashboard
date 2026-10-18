"""Manual launches serialize actual effects and require exact cloud identity."""
import asyncio
from contextlib import asynccontextmanager
from dataclasses import replace
import pathlib
import sys
import unittest
from types import SimpleNamespace as NS
sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
from custom_components.dashboard_music.models import MusicError, PlaybackState
from custom_components.dashboard_music.playback import PlaybackController, SpeakerPort
from test_dashboard_music_gateway import ACCOUNT, ENTITY, P1, P2
from custom_components.house_moods.sonos import SOURCE, SPEAKERS, FOLLOW, FOLLOW_SOURCE, FOLLOW_SCRIPT
GYM = 'media_player.gym'


class Provider:
    account_id = ACCOUNT
    def __init__(self):
        self.calls = []
        self.state = PlaybackState(ACCOUNT, 'connect-id', P1, False, True)
        self.started, self.release = asyncio.Event(), asyncio.Event()
        self.release.set()
        self.change = None
        self.final_state = None
    def verify_account(self):
        return ACCOUNT
    async def resolve_device(self, source):
        self.calls.append(('resolve', source))
        return 'connect-id'
    async def playback_state(self):
        return self.state
    async def start_playlist(self, uri, device, guard=lambda: True):
        if not guard():
            raise MusicError('unavailable')
        self.calls.append(('start', uri, device))
        self.started.set()
        await self.release.wait()
        self.state = PlaybackState(ACCOUNT, device, uri, True, True)
        if self.change:
            self.change()
    async def resolve_relay(self):
        self.calls.append(('relay',))
        return 'relay-id'
    async def handoff(self, device, guard=lambda: True):
        if not guard():
            raise MusicError('unavailable')
        self.calls.append(('handoff', device))
        self.state = self.final_state or replace(self.state, device_id=device)
    async def wait_playback_settled(self):
        pass


class Listed:
    async def contains_playlist(self, uri):
        return uri in (P1, P2)


def house():
    states = {e: NS(state='playing', attributes={'group_members': [e], 'volume_level': .35}) for e in SPEAKERS}
    states.update({FOLLOW: NS(state='off', attributes={}), FOLLOW_SOURCE: NS(state='', attributes={}), FOLLOW_SCRIPT: NS(state='off', attributes={})})
    user = NS(id='user', is_active=True, permissions=NS(check_entity=lambda *_: True))
    async def get_user(uid):
        return user if uid == user.id else None
    return NS(states=NS(get=states.get), data={}, auth=NS(async_get_user=get_user)), states, user


class PlaybackTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.hass, self.states, self.user = house()
        self.provider = Provider()
        self.port = SpeakerPort(self.hass, ENTITY, SPEAKERS)
        self.player = PlaybackController(Listed(), self.provider, self.port)
        self.player.deadline = .12
        self.player.poll_interval = .005
    async def launch(self, request='request', source=SOURCE, uri=P1, user='user'):
        return await self.player.play(uri, source, request, user)
    async def test_follower_resolves_to_coordinator(self):
        group = [GYM, SOURCE]
        for e in group:
            self.states[e].attributes['group_members'] = group.copy()
        before = {e: dict(s.attributes) for e, s in self.states.items()}
        result = await self.launch()
        self.assertEqual(result['status'], 'confirmed')
        self.assertEqual(result['source_entity'], GYM)
        self.assertIn(('start', P1, 'relay-id'), self.provider.calls)
        self.assertEqual(self.provider.calls[-1], ('handoff', 'connect-id'))
        self.assertEqual(before, {e: dict(s.attributes) for e, s in self.states.items()})
    async def test_follow_source_wins(self):
        self.states[FOLLOW].state = 'on'
        self.states[FOLLOW_SOURCE].state = GYM
        result = await self.launch()
        self.assertEqual(result['source_entity'], GYM)
        self.assertEqual(self.provider.calls[0], ('resolve', GYM))
        self.assertEqual(self.states[FOLLOW].state, 'on')
        self.assertEqual(self.states[FOLLOW_SOURCE].state, GYM)
    async def test_topology_transition_is_busy(self):
        self.states[FOLLOW_SCRIPT].state = 'on'
        self.assertEqual((await self.launch())['status'], 'busy')
        self.assertEqual(self.provider.calls, [])
        self.states[FOLLOW_SCRIPT].state = 'off'
        self.states[SOURCE].attributes['group_members'] = [SOURCE, GYM]
        self.assertEqual((await self.launch('inconsistent'))['status'], 'busy')
        self.assertEqual(self.provider.calls, [])
    async def test_duplicate_request_shares_result(self):
        self.provider.release.clear()
        first = asyncio.create_task(self.launch())
        await self.provider.started.wait()
        duplicate = asyncio.create_task(self.launch())
        self.provider.release.set()
        self.assertEqual(await first, await duplicate)
        self.assertEqual(sum(c[0] == 'start' for c in self.provider.calls), 1)
        self.assertEqual(await self.launch(), await duplicate)
    async def test_reused_request_changed_payload_is_invalid(self):
        await self.launch()
        with self.assertRaises(MusicError) as caught:
            await self.launch(uri=P2)
        self.assertEqual(caught.exception.code, 'invalid_request')
    async def test_new_request_is_busy_until_late_command_settles(self):
        self.provider.release.clear()
        first = await self.launch()
        self.assertEqual(first['status'], 'unconfirmed')
        self.assertEqual((await self.launch('next'))['status'], 'busy')
        self.provider.release.set()
        await self.player.wait_settled()
        self.assertEqual(await self.launch(), first)
        self.assertFalse(any(c[0] == 'handoff' for c in self.provider.calls))
        self.assertEqual((await self.launch('next'))['status'], 'busy')
        self.assertEqual((await self.launch('new-attempt'))['status'], 'confirmed')
        self.assertEqual(sum(c[0] == 'start' for c in self.provider.calls), 2)
    async def test_cancelled_caller_does_not_release_effect_guard(self):
        self.provider.release.clear()
        request = asyncio.create_task(self.launch())
        await self.provider.started.wait()
        request.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await request
        self.assertEqual((await self.launch('other'))['status'], 'busy')
        self.provider.release.set()
        await self.player.wait_settled()
        self.assertEqual(sum(c[0] == 'start' for c in self.provider.calls), 1)

    async def test_adapter_timeout_keeps_mood_gate_until_actual_service_settles(self):
        from test_dashboard_music_moods import runtime
        mood = runtime()
        self.assertTrue((await mood.engine.activate('unwind'))['success'])
        self.hass.data['house_moods'] = mood
        finished = asyncio.Event()
        async def delegated_start(uri, device, guard):
            if not guard():
                raise MusicError('unavailable')
            self.provider.calls.append(('start', uri, device))
            self.provider.started.set()
            raise MusicError('unavailable')  # HA handler timed out; service is still running.
        self.provider.start_playlist = delegated_start
        self.provider.wait_playback_settled = finished.wait
        result = await self.launch()
        self.assertEqual(result['status'], 'unconfirmed')
        self.assertFalse((await mood.engine.activate('dinner'))['success'])
        self.assertFalse(mood.engine._lock.locked())
        self.assertEqual((await self.launch('another'))['status'], 'busy')
        finished.set()
        await self.player.wait_settled()
        self.assertFalse(mood.engine._manual_playback_active)

    async def test_unavailable_relay_does_not_relinquish_existing_mood_playback(self):
        from test_dashboard_music_moods import runtime
        mood = runtime()
        self.assertTrue((await mood.engine.activate('unwind'))['success'])
        self.hass.data['house_moods'] = mood
        async def unavailable():
            raise MusicError('not_configured')
        self.provider.resolve_relay = unavailable
        self.assertEqual((await self.launch())['status'], 'failed')
        self.assertIn(SOURCE + '#playback', mood.engine.session.owned)
        self.assertFalse(any(call[0] == 'start' for call in self.provider.calls))

    async def test_cancelled_before_dispatch_does_not_start_late_music(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def membership(_):
            entered.set()
            await release.wait()
            return True
        self.player.library.contains_playlist = membership
        request = asyncio.create_task(self.launch())
        await entered.wait()
        request.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await request
        release.set()
        await self.player.wait_settled()
        self.assertFalse(any(call[0] == 'start' for call in self.provider.calls))

    async def test_deadline_cancels_read_only_preflight_without_leaving_account_busy(self):
        release = asyncio.Event()
        async def membership(_):
            await release.wait()
            return True
        self.player.library.contains_playlist = membership
        try:
            result = await self.launch()
            self.assertIn(result['status'], ('failed', 'unconfirmed'))
            await asyncio.wait_for(self.player.wait_settled(), .05)
            self.assertFalse(any(call[0] == 'start' for call in self.provider.calls))
        finally:
            release.set()
            await self.player.wait_settled()
    async def test_unrelated_track_or_local_queue_does_not_confirm(self):
        for evidence in (PlaybackState(ACCOUNT, 'other-device', P1, True, True),
                         PlaybackState('other-account', 'connect-id', P1, True, True),
                         PlaybackState(ACCOUNT, 'connect-id', P2, True, True),
                         PlaybackState(ACCOUNT, 'connect-id', P1, True, False),
                         PlaybackState(ACCOUNT, 'connect-id', P1, True, None)):
            self.provider.final_state = evidence
            self.assertEqual((await self.launch(str(evidence)))['status'], 'unconfirmed')
            await self.player.wait_settled()

    async def test_simultaneous_preflights_cannot_both_dispatch(self):
        async def yielding_user(_):
            await asyncio.sleep(0)
            return self.user
        self.hass.auth.async_get_user = yielding_user
        self.provider.release.clear()
        first, second = await asyncio.gather(self.launch('first'), self.launch('second'))
        self.assertEqual({first['status'], second['status']}, {'unconfirmed', 'busy'})
        self.provider.release.set()
        await self.player.wait_settled()
        self.assertEqual(sum(c[0] == 'start' for c in self.provider.calls), 1)

    async def test_duplicate_requests_share_result_even_during_authorization(self):
        async def yielding_user(_):
            await asyncio.sleep(0)
            return self.user
        self.hass.auth.async_get_user = yielding_user
        first, duplicate = await asyncio.gather(self.launch(), self.launch())
        self.assertEqual(first, duplicate)
        self.assertEqual(sum(c[0] == 'start' for c in self.provider.calls), 1)

    async def test_duplicate_result_survives_later_topology_transition(self):
        result = await self.launch()
        self.states[FOLLOW_SCRIPT].state = 'on'
        self.assertEqual(await self.launch(), result)
    async def test_changed_coordinator_does_not_replay(self):
        def regroup():
            for e in (SOURCE, GYM):
                self.states[e].attributes['group_members'] = [GYM, SOURCE]
        self.provider.change = regroup
        self.assertEqual((await self.launch())['status'], 'unconfirmed')
        self.assertEqual(sum(c[0] == 'start' for c in self.provider.calls), 1)
        self.assertFalse(any(c[0] == 'handoff' for c in self.provider.calls))
    async def test_already_playing_skips_relay(self):
        self.provider.state = replace(self.provider.state, is_playing=True)
        self.assertEqual((await self.launch())['status'], 'already_playing')
        self.assertEqual(self.provider.calls, [('resolve', SOURCE)])
    async def test_coordinator_changes_during_handoff_never_transfer_or_restart_again(self):
        entered, release = asyncio.Event(), asyncio.Event()
        original_handoff = self.provider.handoff
        async def delayed_handoff(device, guard):
            await original_handoff(device, guard)
            entered.set()
            await release.wait()
        self.provider.handoff = delayed_handoff
        request = asyncio.create_task(self.launch())
        await entered.wait()
        for entity in (SOURCE, GYM):
            self.states[entity].attributes['group_members'] = [GYM, SOURCE]
        release.set()
        result = await request
        await self.player.wait_settled()
        self.assertEqual(result['status'], 'unconfirmed')
        self.assertEqual(result['source_entity'], SOURCE)
        self.assertEqual(await self.launch(), result)
        self.assertEqual([call for call in self.provider.calls if call[0] in ('start', 'handoff')],
                         [('start', P1, 'relay-id'), ('handoff', 'connect-id')])

    async def test_external_manual_follow_handoff_during_relay_start_prevents_sonos_transfer(self):
        self.states[FOLLOW].state = 'on'
        self.states[FOLLOW_SOURCE].state = SOURCE
        self.provider.release.clear()
        request = asyncio.create_task(self.launch())
        await self.provider.started.wait()
        self.states[FOLLOW].state = 'off'
        self.states[FOLLOW_SOURCE].state = ''
        self.provider.release.set()
        result = await request
        await self.player.wait_settled()
        self.assertEqual(result['status'], 'unconfirmed')
        self.assertEqual(sum(call[0] == 'start' for call in self.provider.calls), 1)
        self.assertFalse(any(call[0] == 'handoff' for call in self.provider.calls))
        self.assertEqual(self.states[FOLLOW].state, 'off')
        self.assertEqual(self.states[FOLLOW_SOURCE].state, '')

    async def test_failed_preflight_recovery_does_not_replay_retained_request(self):
        resolve = self.provider.resolve_relay
        async def disconnected():
            raise MusicError('unavailable')
        self.provider.resolve_relay = disconnected
        failed = await self.launch()
        await self.player.wait_settled()
        self.assertEqual(failed['status'], 'failed')
        self.provider.resolve_relay = resolve
        self.assertEqual(await self.launch(), failed)
        self.assertFalse(any(call[0] == 'start' for call in self.provider.calls))
        self.assertEqual((await self.launch('explicit-retry'))['status'], 'confirmed')
        self.assertEqual(sum(call[0] == 'start' for call in self.provider.calls), 1)
    async def test_permissions_cover_account_and_every_affected_speaker_before_effect(self):
        for e in (SOURCE, GYM):
            self.states[e].attributes['group_members'] = [GYM, SOURCE]
        for denied in (ENTITY, SOURCE, GYM):
            self.user.permissions.check_entity = lambda entity, permission: entity != denied
            with self.assertRaises(MusicError) as caught:
                await self.launch(denied)
            self.assertEqual(caught.exception.code, 'forbidden')
        self.assertEqual(self.provider.calls, [])
    async def test_request_retention_is_account_user_bound_bounded_and_expires(self):
        self.player.max_results = 2
        self.player.clock = lambda: self.now
        self.now = 0
        await self.launch('one')
        await self.launch('two')
        self.assertEqual((await self.launch('three'))['status'], 'busy')
        self.now = 301
        self.assertEqual((await self.launch('three'))['status'], 'already_playing')
        self.user.id = 'other'
        with self.assertRaises(MusicError):
            await self.launch('three', user='user')
    async def test_shutdown_does_not_cancel_effect_or_replay(self):
        self.provider.release.clear()
        request = asyncio.create_task(self.launch())
        await self.provider.started.wait()
        await self.player.close()
        with self.assertRaises(MusicError):
            await self.launch('other')
        self.provider.release.set()
        await request
        await self.player.wait_settled()
        self.assertEqual(sum(c[0] == 'start' for c in self.provider.calls), 1)
    async def test_missing_loaded_mood_api_or_persistence_failure_prevents_launch(self):
        self.hass.data['house_moods'] = object()
        self.assertEqual((await self.launch())['status'], 'failed')
        self.assertFalse(any(c[0] == 'start' for c in self.provider.calls))

    async def test_invalid_source_and_missing_authenticated_user_fail_before_provider_calls(self):
        for source in ([], None, 'media_player.office'):
            with self.subTest(source=source), self.assertRaises(MusicError) as caught:
                await self.launch(source=source)
            self.assertEqual(caught.exception.code, 'invalid_request')
        with self.assertRaises(MusicError) as caught:
            await self.launch(user=None)
        self.assertEqual(caught.exception.code, 'auth_required')
        self.assertEqual(self.provider.calls, [])
