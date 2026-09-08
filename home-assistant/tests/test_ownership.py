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

    def test_native_capture_metadata_is_not_an_effect_change(self):
        expected = {'native': {'d2': 3, 'd60': 'opaque'}, 'snapshot': {'captured_at': 'before', 'sequence': 2}}
        observed = {'native': {'d2': 3, 'd60': 'opaque'}, 'snapshot': {'captured_at': 'after', 'sequence': 3}}
        self.assertTrue(matches('light.neon', expected, observed))
        observed['native']['d60'] = 'different'
        self.assertFalse(matches('light.neon', expected, observed))

    def test_standard_hs_rounding_tolerance_is_narrow(self):
        expected = {'hs_color': [340, 80]}
        self.assertTrue(matches('light.strip', expected, {'hs_color': [340.009, 79.991]}))
        self.assertFalse(matches('light.strip', expected, {'hs_color': [340.011, 80]}))
        self.assertFalse(matches('light.strip', expected, {'hs_color': [340, 80.011]}))
        self.assertFalse(matches('light.neon', {'native': {'hs_color': [340, 80]}}, {'native': {'hs_color': [340.001, 80]}}))
