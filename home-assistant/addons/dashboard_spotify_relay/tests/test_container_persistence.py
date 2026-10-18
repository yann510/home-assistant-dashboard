"""Opt-in arm64 container recreation regression, using fixture credentials only.

SPOTIFY_RELAY_TEST_IMAGE=dashboard-spotify-relay:test python3 -m unittest \
  discover -s home-assistant/addons/dashboard_spotify_relay/tests \
  -p test_container_persistence.py -v
"""
import json
import os
from pathlib import PurePosixPath
import subprocess
import time
import unittest
import uuid

IMAGE = os.environ.get('SPOTIFY_RELAY_TEST_IMAGE')

# Real image, entrypoint supervisor and PulseAudio; only Spotify is replaced by
# a fixture executable. No account, auth server, LAN discovery or network access.
INITIALIZE = '''import os,pathlib,sys
import relay
phase=sys.argv[1]
data=pathlib.Path('/data')
ready=data/'fixture-ready.json'
if ready.exists(): ready.unlink()
if phase=='first':
 data.mkdir(exist_ok=True)
 token=data/'bootstrap-token'
 token.write_text('fixture-only-not-an-access-token')
 token.chmod(0o600)
fixture=pathlib.Path('/opt/fixture-bin')
fixture.mkdir()
player=fixture/'librespot'
player.write_text("""#!/usr/bin/python3
import json,os,pathlib,sys,time
cache=pathlib.Path(sys.argv[sys.argv.index('--system-cache')+1])/'credentials.json'
bootstrap='LIBRESPOT_ACCESS_TOKEN' in os.environ
if bootstrap:
 cache.write_text(json.dumps({'username':'fixture-canonical-account','auth_type':1,'auth_data':'Zml4dHVyZQ=='}))
else:
 if not cache.exists(): sys.exit(42)
 value=json.loads(cache.read_text())
 if value!={'username':'fixture-canonical-account','auth_type':1,'auth_data':'Zml4dHVyZQ=='}: sys.exit(43)
pathlib.Path('/data/fixture-ready.json').write_text(json.dumps({'phase':PHASE,'bootstrap_used':bootstrap,'cache_path':str(cache)}))
while True: time.sleep(0.1)
""".replace('PHASE',repr(phase)))
player.chmod(0o755)
os.environ['PATH']=str(fixture)+':'+os.environ['PATH']
sys.exit(relay.run(data,pathlib.Path('/tmp/dashboard-relay')))
'''
SNAPSHOT = '''import hashlib,json,pathlib
p=pathlib.Path('/data/fixture-ready.json')
if not p.exists(): print('null')
else:
 value=json.loads(p.read_text())
 cache=pathlib.Path(value['cache_path'])
 value.update(credential_hash=hashlib.sha256(cache.read_bytes()).hexdigest(),
              credential_mode=cache.stat().st_mode & 0o777,
              directory_mode=cache.parent.stat().st_mode & 0o777,
              identity=json.loads(pathlib.Path('/data/identity.json').read_text()),
              bootstrap_present=pathlib.Path('/data/bootstrap-token').exists())
 print(json.dumps(value))
'''


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True, stderr=subprocess.STDOUT).strip()


@unittest.skipUnless(IMAGE, 'Set SPOTIFY_RELAY_TEST_IMAGE to run disposable Docker recreation test')
class ContainerPersistenceTests(unittest.TestCase):
    def test_credentials_survive_remove_with_anonymous_volumes_and_recreate(self):
        name = 'dashboard-relay-recreation-' + uuid.uuid4().hex[:12]
        parent_volume = name + '-data'
        containers = [name + '-first', name + '-second']
        docker('volume', 'create', parent_volume)
        # Bind the disposable daemon-side directory at /data, exactly as HA
        # binds its durable add-on data. rm -v must remove only anonymous mounts.
        host_data = json.loads(docker('volume', 'inspect', parent_volume))[0]['Mountpoint']
        try:
            snapshots = []
            anonymous = []
            for phase, container in zip(('first', 'second'), containers):
                docker('run', '-d', '--name', container, '--platform', 'linux/arm64',
                       '--network', 'none', '--mount', f'type=bind,src={host_data},dst=/data',
                       '--tmpfs', '/tmp', '--entrypoint', 'python3', IMAGE, '-c', INITIALIZE, phase)
                deadline = time.monotonic() + 8
                snapshot = None
                while time.monotonic() < deadline:
                    state = json.loads(docker('inspect', container))[0]['State']
                    if not state['Running']:
                        self.fail(f'{phase} relay exited {state["ExitCode"]}; durable credential cache unavailable')
                    try:
                        snapshot = json.loads(docker('exec', container, 'python3', '-c', SNAPSHOT))
                    except subprocess.CalledProcessError:
                        self.fail(f'{phase} relay lost durable credential cache during startup/recreation')
                    if snapshot and snapshot['phase'] == phase and not snapshot['bootstrap_present']:
                        break
                    time.sleep(0.1)
                self.assertTrue(snapshot and snapshot['phase'] == phase, f'{phase} fixture player never became ready')
                self.assertFalse(snapshot['bootstrap_present'])
                snapshots.append(snapshot)
                mounts = json.loads(docker('inspect', container))[0]['Mounts']
                anonymous.extend(m['Name'] for m in mounts if m['Type'] == 'volume')
                docker('stop', '-t', '10', container)
                self.assertEqual(json.loads(docker('inspect', container))[0]['State']['ExitCode'], 0)
                docker('rm', '-v', container)
                # A recreation must never quietly reuse the anonymous volumes.
                for volume in anonymous:
                    result = subprocess.run(['docker', 'volume', 'inspect', volume], capture_output=True)
                    self.assertNotEqual(result.returncode, 0)
            first, second = snapshots
            self.assertTrue(first['bootstrap_used'])
            self.assertFalse(second['bootstrap_used'])
            self.assertEqual(second['credential_hash'], first['credential_hash'])
            self.assertEqual(second['identity'], first['identity'])
            self.assertEqual(second['credential_mode'], 0o600)
            self.assertEqual(second['directory_mode'], 0o700)
            self.assertEqual(second['cache_path'], '/data/credentials/credentials.json')
            for mount in mounts:
                if mount['Destination'] != '/data':
                    self.assertFalse(PurePosixPath(second['cache_path']).is_relative_to(mount['Destination']))
            print('Recreation passed: bootstrap removed; identical fixture credentials and identity survived rm -v/recreate; mode 0600/0700; no inherited mount shadows credential path.')
        except Exception:
            for container in containers:
                result = subprocess.run(['docker', 'logs', container], capture_output=True, text=True)
                print(result.stdout + result.stderr)
            raise
        finally:
            for container in containers:
                subprocess.run(['docker', 'rm', '-f', '-v', container], capture_output=True)
            docker('volume', 'rm', parent_volume)


if __name__ == '__main__':
    unittest.main()
