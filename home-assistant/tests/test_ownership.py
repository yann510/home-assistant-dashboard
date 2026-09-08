import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
from custom_components.house_moods.ownership import matches, classify

class OwnershipTests(unittest.TestCase):
    def test_standard_brightness_tolerance_native_exact(self):
        self.assertTrue(matches('light.k', {'brightness': 100}, {'brightness': 102}))
        self.assertFalse(matches('light.k', {'brightness': 100}, {'brightness': 103}))
        self.assertFalse(matches('light.n', {'native': {'d3': 100}}, {'native': {'d3': 101}}))
    def test_playback_progress_ignored_replacement_not_ignored(self):
        self.assertTrue(matches('media_player.living#playback', {'queue_id': 'a', 'media_position': 1, 'media_title': 'one'}, {'queue_id': 'a', 'media_position': 3, 'media_title': 'two'}))
        self.assertFalse(matches('media_player.living#playback', {'queue_id': 'a'}, {'queue_id': 'b'}))
    def test_window_defers_unknown_but_not_explicit_external(self):
        journal = [{'targets': ['light.k'], 'requested': {'light.k': {'state': 'on'}}, 'until': 10}]
        self.assertEqual(classify('light.k', {'state': 'off'}, {'state': 'on'}, journal, 'session', None, 5), 'pending')
        self.assertEqual(classify('light.k', {'state': 'off'}, {'state': 'on'}, journal, 'session', 'day-night', 5), 'external')
        self.assertEqual(classify('light.k', {'state': 'off'}, {'state': 'on'}, journal, 'session', None, 11), 'external')
    def test_stale_session_ack_never_reclaims_override(self):
        self.assertEqual(classify('light.k', {'state': 'on'}, {'state': 'off'}, [], 'session', 'session', 20), 'ack')
