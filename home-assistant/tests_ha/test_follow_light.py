"""Real HA scripts and templates for light-driven Follow me departure."""
import asyncio
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from homeassistant import loader
from homeassistant.helpers import trigger
from homeassistant.core import HomeAssistant, Context
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.script import Script
from homeassistant.components.automation.config import async_validate_config_item
from custom_components.house_moods import async_setup
from custom_components.house_moods.model import Session
from custom_components.house_moods.sonos import SOURCE, SPEAKERS, FOLLOW, FOLLOW_SOURCE, GROUPS

BUNDLE = json.loads((Path(__file__).resolve().parents[1] / 'speaker-follow.json').read_text())
LIGHTS = {'media_player.bathroom': 'light.light_toilet', 'media_player.bedroom': 'light.light_bedroom', 'media_player.gym': 'light.gym'}

class FollowLightTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)
        self.calls = []
        self.script = Script(self.hass, cv.SCRIPT_SCHEMA(BUNDLE['script']['config']['sequence']), 'follow', 'script', script_mode='queued')
        self.hass.states.async_set(FOLLOW, 'on')
        self.hass.states.async_set(FOLLOW_SOURCE, SOURCE)
        self.set_group([SOURCE, 'media_player.bathroom', 'media_player.bedroom'])
        self.hass.states.async_set('media_player.gym', 'paused', {'group_members': ['media_player.gym'], 'volume_level': .2})
        for light in LIGHTS.values(): self.hass.states.async_set(light, 'off')
        async def unjoin(call):
            self.calls.append(call)
            room = call.data['entity_id'][0]
            members = self.hass.states.get(room).attributes['group_members']
            for entity in members:
                self.hass.states.async_set(entity, 'playing' if entity != room else 'paused', {'group_members': [room] if entity == room else [e for e in members if e != room], 'volume_level': .2}, context=call.context)
        self.hass.services.async_register('media_player', 'unjoin', unjoin)
    def set_group(self, members):
        for entity in members:
            self.hass.states.async_set(entity, 'playing', {'group_members': members, 'volume_level': .2})
    async def asyncTearDown(self):
        if 'house_moods' in self.hass.data: await self.hass.data['house_moods'].close()
        await self.hass.async_block_till_done()
        self.temp.cleanup()
    async def run_leave(self, room):
        return await self.script.async_run({'command': 'leave', 'room': room}, Context())
    async def test_light_off_removes_only_follower_and_keeps_source(self):
        result = await self.run_leave('media_player.bathroom')
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0].data['entity_id'], ['media_player.bathroom'])
        self.assertEqual(self.hass.states.get(SOURCE).attributes['group_members'], [SOURCE, 'media_player.bedroom'])
        self.assertEqual(self.hass.states.get(FOLLOW_SOURCE).state, SOURCE)
        self.assertEqual(self.hass.states.get(FOLLOW).state, 'on')
        self.assertTrue(result.service_response['success'])
    async def test_disabled_stale_unrelated_invalid_and_original_are_noops(self):
        await self.run_leave(SOURCE)
        await self.run_leave('media_player.gym')
        await self.run_leave('media_player.other')
        self.hass.states.async_set(LIGHTS['media_player.bathroom'], 'on')
        await self.run_leave('media_player.bathroom')
        self.hass.states.async_set(LIGHTS['media_player.bathroom'], 'off')
        self.hass.states.async_set(FOLLOW, 'off')
        await self.run_leave('media_player.bathroom')
        self.assertEqual(self.calls, [])
    async def test_room_in_another_group_and_unknown_light_are_protected(self):
        self.set_group([SOURCE])
        self.set_group(['media_player.gym', 'media_player.bathroom'])
        await self.run_leave('media_player.bathroom')
        self.assertEqual(self.calls, [])
        self.set_group(['media_player.gym'])
        self.set_group([SOURCE, 'media_player.bathroom'])
        for state in ('unknown', 'unavailable'):
            self.hass.states.async_set(LIGHTS['media_player.bathroom'], state)
            await self.run_leave('media_player.bathroom')
        self.assertEqual(self.calls, [])
    async def test_paused_source_still_allows_follower_departure_and_duplicates_are_safe(self):
        self.hass.states.async_set(SOURCE, 'paused', {'group_members': [SOURCE, 'media_player.bathroom', 'media_player.bedroom']})
        await self.run_leave('media_player.bathroom')
        await self.run_leave('media_player.bathroom')
        self.assertEqual(len(self.calls), 1)
    async def test_room_source_is_protected_even_with_its_light_off(self):
        self.hass.states.async_set(FOLLOW_SOURCE, 'media_player.bedroom')
        self.set_group(['media_player.bedroom', 'media_player.bathroom'])
        await self.run_leave('media_player.bedroom')
        await self.run_leave('media_player.bathroom')
        self.assertEqual([c.data['entity_id'] for c in self.calls], [['media_player.bathroom']])
    async def test_active_mood_leave_is_journaled_and_preserves_ownership(self):
        await async_setup(self.hass, {})
        runtime = self.hass.data['house_moods']
        s = Session('session', 'love', 'active')
        s.baseline = {GROUPS: await runtime.adapter.read(GROUPS)}
        runtime.engine.session = s; runtime.engine._loaded = True
        await runtime.engine._save()
        await self.run_leave('media_player.bathroom')
        await self.hass.async_block_till_done()
        self.assertEqual(len(self.calls), 1)
        self.assertIn(GROUPS, s.owned)
        self.assertNotIn(GROUPS, s.overridden)
        self.assertEqual(s.journal[-1]['status'], 'confirmed')
        async with runtime.engine._lock:
            result = await self.run_leave('media_player.bedroom')
        self.assertFalse(result.service_response['success'])
        self.assertEqual(len(self.calls), 1)
    async def test_manual_mood_override_leave_preserves_original_room_source(self):
        await async_setup(self.hass, {})
        runtime = self.hass.data['house_moods']
        self.hass.states.async_set(FOLLOW_SOURCE, 'media_player.bedroom')
        self.set_group([SOURCE])
        self.set_group(['media_player.bedroom', 'media_player.bathroom'])
        await self.hass.async_block_till_done()
        s = Session('session', 'love', 'active')
        s.baseline = {GROUPS: await runtime.adapter.read(GROUPS), FOLLOW: await runtime.adapter.read(FOLLOW)}
        s.overridden = {GROUPS, FOLLOW}
        runtime.engine.session = s; runtime.engine._loaded = True
        await runtime.engine._save()
        await self.run_leave('media_player.bathroom')
        await self.hass.async_block_till_done()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(s.journal, [])
        self.assertEqual(s.owned, set())
        self.assertEqual(self.hass.states.get(FOLLOW_SOURCE).state, 'media_player.bedroom')
    async def test_room_automation_routes_motion_and_light_events_with_queue(self):
        loader.async_setup(self.hass)
        await trigger.async_setup(self.hass)
        for automation in BUNDLE['automations']:
            config = automation['config']
            self.assertIsNotNone(await async_validate_config_item(self.hass, 'automation', deepcopy(config)))
            self.assertEqual(config['mode'], 'queued')
            triggers = {t['id']: t for t in config['trigger']}
            room = config['action'][0]['data']['room']
            self.assertEqual(triggers['join']['from'], 'off')
            self.assertEqual(triggers['join']['to'], 'on')
            self.assertEqual(triggers['leave']['entity_id'], [LIGHTS[room]])
            self.assertEqual((triggers['leave']['from'], triggers['leave']['to']), ('on', 'off'))
            calls = []
            async def dispatch(call): calls.append(call)
            self.hass.services.async_register('script', 'speaker_follow_motion', dispatch)
            script = Script(self.hass, cv.SCRIPT_SCHEMA(config['action']), 'room', 'automation', script_mode=config['mode'])
            for command in ('join', 'leave'):
                await script.async_run({'trigger': {'id': command}}, Context())
            self.assertEqual([c.data['command'] for c in calls], ['join', 'leave'])
    async def test_light_off_during_join_is_queued_and_then_leaves(self):
        room = 'media_player.gym'
        entered, release = asyncio.Event(), asyncio.Event()
        async def join(call):
            entered.set()
            await release.wait()
            self.set_group([SOURCE, room])
        async def dispatch(call):
            await self.script.async_run(dict(call.data), call.context)
        self.hass.services.async_register('media_player', 'join', join)
        self.hass.services.async_register('script', 'speaker_follow_motion', dispatch)
        config = next(a['config'] for a in BUNDLE['automations'] if a['config']['action'][0]['data']['room'] == room)
        room_script = Script(self.hass, cv.SCRIPT_SCHEMA(config['action']), 'gym', 'automation', script_mode=config['mode'])
        joining = asyncio.create_task(room_script.async_run({'trigger': {'id': 'join'}}, Context()))
        await asyncio.wait_for(entered.wait(), 1)
        leaving = asyncio.create_task(room_script.async_run({'trigger': {'id': 'leave'}}, Context()))
        await asyncio.sleep(0)
        self.assertEqual(self.calls, [])
        release.set()
        await asyncio.wait_for(asyncio.gather(joining, leaving), 1)
        self.assertEqual([c.data['entity_id'] for c in self.calls], [[room]])
        self.assertEqual(self.hass.states.get(SOURCE).attributes['group_members'], [SOURCE])
