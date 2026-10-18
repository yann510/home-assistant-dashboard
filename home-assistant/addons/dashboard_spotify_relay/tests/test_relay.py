"""Exercise the real supervisor with disposable audio/player executables."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

RELAY = Path(__file__).resolve().parents[1] / 'relay.py'


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.data = self.root / 'data'
        self.data.mkdir(mode=0o700)
        self.runtime = self.root / 'run'
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.log = self.root / 'calls'
        self.process = None
        # A command that switches to ALSA, leaks the token into argv, fails to wait
        # for Pulse readiness, or leaves children alive must fail these tests.
        common = f'''#!/usr/bin/env python3
import json,os,sys,time,signal,pathlib
root=pathlib.Path({str(self.root)!r})
name=pathlib.Path(sys.argv[0]).name
with (root/'calls').open('a') as out:
 out.write(json.dumps({{'command':name,'args':sys.argv[1:],'pulse':os.environ.get('PULSE_SERVER'),'sink':os.environ.get('PULSE_SINK'),'token':os.environ.get('LIBRESPOT_ACCESS_TOKEN'),'injected':os.environ.get('LIBRESPOT_BACKEND'),'rust_log':os.environ.get('RUST_LOG')}})+'\\n')
def stop(*args):
 (root/(name+'-stopped')).touch()
 sys.exit(0)
signal.signal(signal.SIGTERM,stop)
'''
        for name in ('pulseaudio', 'pactl', 'librespot'):
            body = common
            if name == 'pactl':
                body += '''if (root/'bad-sink').exists():
 print(json.dumps([{'name':'physical','driver':'module-alsa-card.c'}]))
else:
 print(json.dumps([{'name':'dashboard_silence','driver':'module-null-sink.c'}]))
'''
            else:
                if name == 'pulseaudio':
                    body += "(root/'pulse-config').write_text(pathlib.Path(sys.argv[sys.argv.index('--file')+1]).read_text())\n"
                else:
                    body += "if os.environ.get('LIBRESPOT_ACCESS_TOKEN'):\n cache=pathlib.Path(sys.argv[sys.argv.index('--system-cache')+1], 'credentials.json')\n if (root/'partial-cache').exists():\n  cache.write_text('{')\n  while not (root/'finish-cache').exists(): time.sleep(0.02)\n cache.write_text(json.dumps({'username':'fixture-canonical-account','auth_type':1,'auth_data':'Zml4dHVyZQ=='}))\n"
                    body += "print('fake-private-child-output',flush=True)\n"
                body += 'while True: time.sleep(0.05)\n'
            path = self.bin / name
            path.write_text(body)
            path.chmod(0o755)

    def tearDown(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            self.process.communicate(timeout=5)
        self.temp.cleanup()

    def start(self):
        self.process = subprocess.Popen(
            ['python3', str(RELAY), '--data-dir', str(self.data), '--runtime-dir', str(self.runtime)],
            env={**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}',
                 'LIBRESPOT_BACKEND': 'alsa', 'RUST_LOG': 'trace', 'PULSE_SERVER': 'tcp:unsafe'},
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def wait_for(self, predicate):
        until = time.monotonic() + 4
        while time.monotonic() < until:
            if predicate():
                return
            if self.process.poll() is not None:
                break
            time.sleep(0.03)
        self.fail(f'Relay did not reach expected state; exit={self.process.poll()} calls={self.calls()}')

    def player(self):
        return next((call for call in self.calls() if call['command'] == 'librespot'), None)

    def test_starts_only_private_paced_sink_and_supported_player_arguments(self):
        self.start()
        self.wait_for(self.player)
        player = self.player()
        self.assertEqual(player['args'][player['args'].index('--backend') + 1], 'pulseaudio')
        self.assertEqual(player['pulse'], 'unix:' + str(self.runtime / 'pulse.sock'))
        self.assertEqual(player['sink'], 'dashboard_silence')
        self.assertIsNone(player['injected'])
        self.assertIsNone(player['rust_log'])
        self.assertNotIn('--device-id', player['args'])  # v0.8.0 derives SHA1(name).
        self.assertIn('--disable-audio-cache', player['args'])
        config = (self.root / 'pulse-config').read_text()
        self.assertIn('module-null-sink sink_name=dashboard_silence rate=44100 channels=2', config)
        self.assertIn('module-native-protocol-unix', config)
        self.assertNotIn('tcp', config)
        self.assertNotIn('udev', config)
        self.assertNotIn('.include', config)
        commands = [call['command'] for call in self.calls()]
        self.assertLess(commands.index('pulseaudio'), commands.index('librespot'))
        self.assertLess(commands.index('pactl'), commands.index('librespot'))
        self.process.terminate()
        stdout, stderr = self.process.communicate(timeout=4)
        self.assertEqual(self.process.returncode, 0)
        self.assertNotIn('fake-private-child-output', stdout + stderr)
        self.assertTrue((self.root / 'pulseaudio-stopped').exists())
        self.assertTrue((self.root / 'librespot-stopped').exists())

    def test_bootstrap_is_environment_only_consumed_after_cache_and_restart_keeps_identity(self):
        token = self.data / 'bootstrap-token'
        token.write_text('fixture-bootstrap-secret')
        token.chmod(0o600)
        self.start()
        self.wait_for(lambda: self.player() and not token.exists())
        player = self.player()
        self.assertEqual(player['token'], 'fixture-bootstrap-secret')
        self.assertNotIn('fixture-bootstrap-secret', ' '.join(player['args']))
        identity = json.loads((self.data / 'identity.json').read_text())
        self.assertRegex(identity['device_id'], '^[0-9a-f]{40}$')
        self.assertEqual((self.data.stat().st_mode & 0o777), 0o700)
        self.assertEqual(((self.data / 'cache').stat().st_mode & 0o777), 0o700)
        self.process.terminate()
        stdout, stderr = self.process.communicate(timeout=4)
        self.assertNotIn('fixture-bootstrap-secret', stdout + stderr)
        self.log.unlink()
        self.start()
        self.wait_for(self.player)
        self.assertIsNone(self.player()['token'])
        self.assertEqual(json.loads((self.data / 'identity.json').read_text()), identity)
        self.assertEqual(json.loads((self.data / 'cache/credentials.json').read_text())['username'], 'fixture-canonical-account')

    def test_partial_cache_cannot_consume_bootstrap_before_valid_credentials_are_written(self):
        token = self.data / 'bootstrap-token'
        token.write_text('fixture-bootstrap-secret')
        token.chmod(0o600)
        (self.root / 'partial-cache').touch()
        self.start()
        self.wait_for(lambda: (self.data / 'cache/credentials.json').exists())
        time.sleep(0.6)
        self.assertTrue(token.exists())
        (self.root / 'finish-cache').touch()
        self.wait_for(lambda: not token.exists())

    def test_incomplete_cached_credentials_reuse_bootstrap_for_recovery(self):
        cache = self.data / 'cache'
        cache.mkdir(mode=0o700)
        valid = {'username': 'fixture-canonical-account', 'auth_type': 1, 'auth_data': 'Zml4dHVyZQ=='}
        invalid = ['{'] + [json.dumps({**valid, key: value}) for key, value in (
            ('username', None), ('username', ''), ('auth_type', None),
            ('auth_type', '1'), ('auth_type', True), ('auth_data', ''), ('auth_data', 'invalid!'),
        )]
        for value in invalid:
            with self.subTest(value=value):
                (cache / 'credentials.json').write_text(value)
                token = self.data / 'bootstrap-token'
                token.write_text('fixture-bootstrap-secret')
                token.chmod(0o600)
                self.start()
                self.wait_for(self.player)
                try:
                    self.assertEqual(self.player()['token'], 'fixture-bootstrap-secret')
                finally:
                    self.process.terminate()
                    self.process.communicate(timeout=4)
                    self.log.unlink()

    def test_bad_sink_never_launches_player(self):
        (self.root / 'bad-sink').touch()
        self.start()
        self.process.communicate(timeout=5)
        self.assertNotEqual(self.process.returncode, 0)
        self.assertIsNone(self.player())
        self.assertTrue((self.root / 'pulseaudio-stopped').exists())

    def test_lost_sink_stops_player_instead_of_falling_back_to_hardware(self):
        self.start()
        self.wait_for(self.player)
        (self.root / 'bad-sink').touch()
        self.process.communicate(timeout=5)
        self.assertNotEqual(self.process.returncode, 0)
        self.assertTrue((self.root / 'librespot-stopped').exists())
        self.assertTrue((self.root / 'pulseaudio-stopped').exists())

    def test_invalid_bootstrap_never_erases_existing_credentials(self):
        cache = self.data / 'cache'
        cache.mkdir(mode=0o700)
        original = '{"username":"existing-canonical-account","auth_type":1,"auth_data":"ZXhpc3Rpbmc="}'
        (cache / 'credentials.json').write_text(original)
        token = self.data / 'bootstrap-token'
        token.write_text('')
        token.chmod(0o600)
        self.start()
        self.wait_for(self.player)
        self.assertIsNone(self.player()['token'])
        self.assertEqual((cache / 'credentials.json').read_text(), original)

    def test_identity_tampering_fails_before_starting_audio(self):
        (self.data / 'identity.json').write_text('{"name":"same","device_id":"wrong"}')
        self.start()
        self.process.communicate(timeout=4)
        self.assertNotEqual(self.process.returncode, 0)
        self.assertEqual(self.calls(), [])


if __name__ == '__main__':
    unittest.main()
