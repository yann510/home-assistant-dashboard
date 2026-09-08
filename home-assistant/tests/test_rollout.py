import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('mood_rollout',Path(__file__).resolve().parents[1]/'rollout/install.py')
rollout=importlib.util.module_from_spec(spec);spec.loader.exec_module(rollout)

class RolloutTests(unittest.TestCase):
    def test_frontend_publish_keeps_previous_entry_until_assets_are_ready(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);source=root/'source';live=root/'live';source.mkdir();live.mkdir()
            (source/'assets').mkdir();(source/'assets/new.js').write_text('new');(source/'index.html').write_text('new html')
            (live/'index.html').write_text('old html');(live/'keep.js').write_text('old asset')
            rollout.publish_dashboard(source,live)
            self.assertEqual((live/'index.html').read_text(),'new html')
            self.assertEqual((live/'assets/new.js').read_text(),'new')
            self.assertEqual((live/'keep.js').read_text(),'old asset')
    def test_asset_name_collision_refuses_before_touching_serving_entry(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);source=root/'source';live=root/'live';source.mkdir();live.mkdir()
            for folder in (source,live):(folder/'assets').mkdir()
            (source/'assets/same.js').write_text('new');(live/'assets/same.js').write_text('old')
            (source/'index.html').write_text('new');(live/'index.html').write_text('old')
            with self.assertRaises(ValueError):rollout.publish_dashboard(source,live)
            self.assertEqual((live/'index.html').read_text(),'old')
    def test_content_drift_blocks_apply(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);(root/'configuration.yaml').write_text('before')
            expected=rollout.fingerprint(root,['configuration.yaml'])
            (root/'configuration.yaml').write_text('after')
            with self.assertRaises(ValueError):rollout.check_fingerprint(root,expected)
    def test_configuration_is_minimal_and_refuses_existing_nonempty_settings(self):
        self.assertEqual(rollout.enable_configuration('default_config:\n'),'default_config:\n\nhouse_moods: {}\n')
        self.assertEqual(rollout.enable_configuration('house_moods: {}\n'),'house_moods: {}\n')
        with self.assertRaises(ValueError):rollout.enable_configuration('house_moods:\n  other: true\n')
    def test_changed_follow_script_is_not_overwritten(self):
        original={'alias':'Follow','sequence':[{'service':'media_player.join','data':{}}]}
        normalized={'alias':'Follow','sequence':[{'action':'media_player.join','data':{}}]}
        self.assertEqual(rollout.normalized_script(original),rollout.normalized_script(normalized))
        with self.assertRaises(ValueError):rollout.verify_script({'alias':'Changed'},original)
