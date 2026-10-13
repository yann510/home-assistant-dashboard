"""Real HA service error and durable legacy playback recovery boundaries."""
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from custom_components.house_moods.ha_adapter import HAAdapter, HAIO
from custom_components.house_moods.coordinator import MoodCoordinator
from custom_components.house_moods.storage import SessionStore
from test_failed_sonos_playback import legacy_session
from test_gym import HouseIO
from custom_components.house_moods.sonos import SOURCE


class FailedSonosPlaybackHATests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.temp.name)

    async def asyncTearDown(self):
        await self.hass.async_block_till_done()
        self.temp.cleanup()

    async def test_registered_failed_sonos_play_service_keeps_actual_error_and_cause(self):
        error = HomeAssistantError('Error calling SonosMediaPlayerEntity._play_media on media_player.living_room: UPnP Error 701: Transition not available')
        async def failed(call):
            raise error
        self.hass.services.async_register('media_player', 'play_media', failed)
        with self.assertRaises(RuntimeError) as caught:
            await HAIO(self.hass).call('media_player', 'play_media', [SOURCE], {}, 'session')
        self.assertIn('media_player.play_media', str(caught.exception))
        self.assertIn('UPnP Error 701: Transition not available', str(caught.exception))
        self.assertIs(caught.exception.__cause__, error)

    async def test_unrelated_service_or_untrusted_exception_stays_sanitized(self):
        for domain, service, target, error in [('light', 'turn_on', 'light.test', HomeAssistantError('secret token')),
                ('media_player', 'play_media', 'media_player.other', HomeAssistantError('secret token')),
                ('media_player', 'play_media', SOURCE, ValueError('secret token'))]:
            with self.subTest(domain=domain, target=target, error=type(error).__name__):
                async def failed(call):
                    raise error
                self.hass.services.async_register(domain, service, failed)
                with self.assertRaises(RuntimeError) as caught:
                    await HAIO(self.hass).call(domain, service, [target], {}, 'session')
                self.assertNotIn('secret token', str(caught.exception))

    async def test_durable_legacy_journal_recovers_after_restart_without_media_commands(self):
        store = SessionStore(self.hass)
        await store.save(legacy_session())
        # Reload the persisted deployed format through the real HA storage adapter.
        io = HouseIO()
        io.queues[SOURCE] = []
        adapter = HAAdapter(self.hass, io=io)
        engine = MoodCoordinator(adapter, SessionStore(self.hass))
        result = await engine.retry_restoration()
        self.assertTrue(result['success'], result)
        self.assertEqual(result['phase'], 'idle')
        self.assertEqual(io.calls, [])
        self.assertIsNone(await SessionStore(self.hass).load())
