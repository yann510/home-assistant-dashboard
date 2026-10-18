"""Real filesystem ownership/rollback tests; only Supervisor API is simulated."""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HELPER = Path(__file__).resolve().parents[1] / 'spotify-relay-remote.py'


class InstallerTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('relay_remote', HELPER)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.addons = self.root / 'addons'
        self.addons.mkdir()
        self.identity = self.root / 'core.uuid'
        self.identity.write_text('{"data":{"uuid":"fixture-host-one"}}')
        self.backups = self.root / 'backups'
        self.installed = None
        self.mutations = []
        self.fail_install = False
        self.files = {name: base64.b64encode(value.encode()).decode() for name, value in {
            'config.json': '{"version":"1.0.0","slug":"dashboard_spotify_relay"}',
            'Dockerfile': 'FROM fixture', 'relay.py': 'fixture', 'README.md': 'fixture',
            'LICENSE.librespot': 'MIT fixture', 'LICENSE.upstream-image': 'Apache fixture',
        }.items()}
        self.installer = self.module.RelayInstaller(self.addons, self.backups, self.identity, self.api)

    def api(self, path, method='GET', data=None):
        if method != 'GET':
            self.mutations.append((path, method, data))
        if path == '/info':
            return {'arch': 'aarch64'}
        if path == '/addons':
            return {'addons': [self.installed] if self.installed else []}
        if path.endswith('/info'):
            return self.installed
        if path.endswith('/install'):
            if self.fail_install:
                raise RuntimeError('installation failed')
            self.installed = {'slug': 'local_dashboard_spotify_relay', 'version': '1.0.0', 'state': 'stopped',
                              'options': {}, 'boot': 'auto', 'watchdog': False, 'protected': True,
                              'auto_update': False, 'network': {'24879/tcp': 24879},
                              'audio_input': None, 'audio_output': None, 'ingress_panel': False}
        elif path.endswith('/options'):
            self.installed.update(data)
        elif path.endswith('/uninstall'):
            self.installed = None
        elif path.endswith('/start'):
            self.installed['state'] = 'started'
        return {}

    def install(self):
        return self.installer.install(self.files)['backup']

    def test_inspection_does_not_write_or_expose_options(self):
        self.installed = {'slug': 'local_dashboard_spotify_relay', 'options': {'secret': 'never expose'}}
        report = self.installer.inspect()
        self.assertTrue(report['installed'])
        self.assertNotIn('never expose', json.dumps(report))
        self.assertEqual(self.mutations, [])
        self.assertFalse(self.backups.exists())
        self.assertEqual(list(self.addons.iterdir()), [])

    def test_refuses_existing_source_or_addon_without_backing_up_or_overwriting(self):
        source = self.addons / 'dashboard_spotify_relay'
        source.mkdir()
        (source / 'unowned').write_text('keep')
        with self.assertRaisesRegex(RuntimeError, 'existing'):
            self.install()
        self.assertEqual((source / 'unowned').read_text(), 'keep')
        self.assertEqual(self.mutations, [])
        self.assertFalse(self.backups.exists())

    def test_backup_precedes_install_then_rollback_removes_only_owned_artifacts(self):
        unrelated = self.addons / 'other'
        unrelated.mkdir()
        (unrelated / 'keep').write_text('unchanged')
        backup = self.install()
        self.assertEqual(Path(backup).stat().st_mode & 0o777, 0o700)
        self.assertEqual((Path(backup) / 'ownership.json').stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.installed['watchdog'], True)
        self.assertNotIn('/addons/local_dashboard_spotify_relay/start', [call[0] for call in self.mutations])
        # API runtime state is allowed to change, the owned source/config is not.
        self.installed['stats'] = {'cpu_percent': 2.5, 'memory_usage': 1000}
        self.installer.start(backup)
        self.installer.rollback(backup)
        self.assertIsNone(self.installed)
        self.assertFalse((self.addons / 'dashboard_spotify_relay').exists())
        self.assertEqual((unrelated / 'keep').read_text(), 'unchanged')
        self.assertTrue(Path(backup).exists())
        with self.assertRaises(RuntimeError):
            self.installer.rollback(backup)

    def test_changed_files_new_version_configuration_and_wrong_host_refuse_rollback(self):
        backup = self.install()
        source = self.addons / 'dashboard_spotify_relay/relay.py'
        source.write_text('concurrent change')
        self.mutations.clear()
        with self.assertRaisesRegex(RuntimeError, 'changed|ownership'):
            self.installer.rollback(backup)
        self.assertEqual(self.mutations, [])
        source.write_text('fixture')
        self.installed['version'] = '2.0.0'
        with self.assertRaisesRegex(RuntimeError, 'changed|ownership'):
            self.installer.rollback(backup)
        self.installed['version'] = '1.0.0'
        self.installed['options'] = {'new': 'keep'}
        with self.assertRaisesRegex(RuntimeError, 'changed|ownership'):
            self.installer.rollback(backup)
        self.installed['options'] = {}
        self.identity.write_text('{"data":{"uuid":"another-host"}}')
        with self.assertRaisesRegex(RuntimeError, 'host|identity|ownership'):
            self.installer.rollback(backup)
        self.assertEqual(self.mutations, [])

    def test_changed_audio_permissions_refuse_start_and_rollback(self):
        backup = self.install()
        self.installed['audio'] = True
        self.mutations.clear()
        with self.assertRaisesRegex(RuntimeError, 'changed|ownership'):
            self.installer.start(backup)
        with self.assertRaisesRegex(RuntimeError, 'changed|ownership'):
            self.installer.rollback(backup)
        self.assertEqual(self.mutations, [])

    def test_each_mutable_addon_setting_refuses_start_and_rollback_without_effects(self):
        backup = self.install()
        ownership = Path(backup) / 'ownership.json'
        original_record = ownership.read_bytes()
        original_source = self.module.fingerprint(self.installer.source)
        for key, value in {
            'auto_update': True, 'network': {'24879/tcp': 24880},
            'audio_input': 'input-device', 'audio_output': 'output-device', 'ingress_panel': True,
        }.items():
            with self.subTest(setting=key):
                original = self.installed[key]
                self.installed[key] = value
                self.mutations.clear()
                for operation in (self.installer.start, self.installer.rollback):
                    with self.assertRaisesRegex(RuntimeError, 'changed|ownership'):
                        operation(backup)
                    self.assertEqual(self.mutations, [])
                    self.assertEqual(self.installed[key], value)
                    self.assertEqual(ownership.read_bytes(), original_record)
                    self.assertEqual(self.module.fingerprint(self.installer.source), original_source)
                self.installed[key] = original

    def test_legacy_weak_ownership_refuses_start_and_rollback_without_adoption(self):
        backup = self.install()
        ownership = Path(backup) / 'ownership.json'
        record = json.loads(ownership.read_text())
        # Pre-fix footprints omitted five mutable settings. Even unchanged old
        # installs need manual review; a current snapshot cannot prove ownership.
        legacy_fields = ('slug', 'version', 'options', 'boot', 'watchdog', 'protected',
                         'audio', 'devices', 'privileged', 'full_access', 'host_network', 'host_pid',
                         'host_ipc', 'host_dbus', 'hassio_api', 'homeassistant_api', 'apparmor')
        record['addon'] = self.module.digest_json({key: self.installed.get(key) for key in legacy_fields})
        ownership.write_text(json.dumps(record))
        original_record = ownership.read_bytes()
        original_source = self.module.fingerprint(self.installer.source)
        self.mutations.clear()
        for operation in (self.installer.start, self.installer.rollback):
            with self.assertRaisesRegex(RuntimeError, 'changed|ownership'):
                operation(backup)
            self.assertEqual(self.mutations, [])
            self.assertIsNotNone(self.installed)
            self.assertEqual(ownership.read_bytes(), original_record)
            self.assertEqual(self.module.fingerprint(self.installer.source), original_source)

    def test_symlink_or_traversal_payload_and_backup_are_rejected(self):
        for name in ('../escape', '/absolute'):
            with self.assertRaises(RuntimeError):
                self.installer.install({**self.files, name: 'Zml4dHVyZQ=='})
        self.assertEqual(self.mutations, [])
        self.assertFalse(self.backups.exists())
        with self.assertRaises(RuntimeError):
            self.installer.rollback(str(self.root))
        source = self.addons / 'dashboard_spotify_relay'
        source.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(RuntimeError):
            self.install()

    def test_failed_install_retains_private_record_and_never_uninstalls_unknown_result(self):
        self.fail_install = True
        with self.assertRaises(RuntimeError):
            self.install()
        backups = list(self.backups.iterdir())
        self.assertEqual(len(backups), 1)
        self.assertTrue((backups[0] / 'ownership.json').exists())
        self.assertFalse(any(path.endswith('/uninstall') for path, _, _ in self.mutations))
        # A late completion cannot be mistaken for a proven owned install.
        self.installed = {'slug': 'local_dashboard_spotify_relay', 'version': '1.0.0', 'options': {}}
        self.mutations.clear()
        with self.assertRaisesRegex(RuntimeError, 'ownership|incomplete'):
            self.installer.rollback(str(backups[0]))
        self.assertEqual(self.mutations, [])


if __name__ == '__main__':
    unittest.main()
