"""Full local-copy installation exercise; requires PyYAML like the installer."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import yaml
spec=importlib.util.spec_from_file_location('rollout',Path(__file__).resolve().parents[1]/'install.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.config=self.root/'config';self.repo=self.root/'repo';self.dist=self.root/'dist';self.bundle=self.root/'bundle'
        lepro=self.config/'custom_components/lepro_led';lepro.mkdir(parents=True)
        (self.config/'configuration.yaml').write_text('default_config:\nscript: !include scripts.yaml\n')
        original={'alias':'Follow','sequence':[{'service':'media_player.join','data':{'entity_id':'media_player.living_room'}}]}
        (self.config/'scripts.yaml').write_text(yaml.safe_dump({'speaker_follow_motion':original,'unrelated':{'alias':'Keep'}}))
        (self.config/'www/dashboard').mkdir(parents=True);(self.config/'www/dashboard/index.html').write_text('old')
        extension=self.repo/'home-assistant/lepro-extension';extension.mkdir(parents=True)
        for name in ('light.py','number.py','__init__.py','manifest.json','services.yaml'):(lepro/name).write_text('original\n')
        (extension/'baseline-sha256.json').write_text(json.dumps({p.name:r.digest(p) for p in lepro.iterdir()}))
        (extension/'integration.patch').write_text('--- a/light.py\n+++ b/light.py\n@@ -1 +1,2 @@\n original\n+patched\n')
        for name in ('native_state.py','native_services.py'):(extension/name).write_text('# native\n')
        (self.repo/'home-assistant/rollout').mkdir();(self.repo/'home-assistant/rollout/speaker-follow-baseline.json').write_text(json.dumps({'script':{'config':original}}))
        updated={**original,'description':'Mood owned join'}
        (self.repo/'home-assistant/speaker-follow.json').write_text(json.dumps({'script':{'config':updated}}))
        component=self.repo/'home-assistant/custom_components/house_moods';component.mkdir(parents=True);(component/'manifest.json').write_text('{}')
        (self.dist/'assets').mkdir(parents=True);(self.dist/'assets/new.js').write_text('new');(self.dist/'index.html').write_text('new html')
        self.patch=patch.object(r,'REPO',self.repo);self.patch.start()
    def tearDown(self):self.patch.stop();self.temp.cleanup()
    def test_dry_run_then_backup_apply_changes_only_prepared_files(self):
        before=r.fingerprint(self.config,r.PATHS)
        r.stage(self.config,self.bundle,self.dist)
        self.assertEqual(before,r.fingerprint(self.config,r.PATHS))
        self.assertEqual(r.apply(self.bundle)['status'],'installed')
        self.assertEqual(r.fingerprint(self.bundle/'backup',r.PATHS),before)
        self.assertEqual((self.config/'www/dashboard/index.html').read_text(),'new html')
        self.assertEqual(yaml.safe_load((self.config/'scripts.yaml').read_text())['unrelated'],{'alias':'Keep'})
        with self.assertRaises(ValueError):r.apply(self.bundle)
    def test_apply_refuses_config_drift_before_creating_backup_or_writing(self):
        r.stage(self.config,self.bundle,self.dist)
        (self.config/'configuration.yaml').write_text('user changed it')
        with self.assertRaises(ValueError):r.apply(self.bundle)
        self.assertFalse((self.bundle/'backup').exists())
        self.assertEqual((self.config/'www/dashboard/index.html').read_text(),'old')
    def test_apply_refuses_tampered_staging(self):
        r.stage(self.config,self.bundle,self.dist)
        (self.bundle/'staged/configuration.yaml').write_text('modified')
        with self.assertRaises(ValueError):r.apply(self.bundle)
        self.assertFalse((self.bundle/'backup').exists())
