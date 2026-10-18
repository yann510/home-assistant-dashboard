#!/usr/bin/env python3
"""Supervise a private, paced silent Spotify Connect receiver."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time
import uuid

SINK = 'dashboard_silence'
UID = 1000
GID = 1000


def private_path(path, directory=False):
    """Reject links/special files before touching persistent account state."""
    if path.is_symlink():
        raise RuntimeError('Unsafe private path')
    if directory:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.exists():
        mode = path.lstat().st_mode
        if not (stat.S_ISDIR(mode) if directory else stat.S_ISREG(mode)):
            raise RuntimeError('Unsafe private path')
        path.chmod(0o700 if directory else 0o600)
        if os.geteuid() == 0:
            os.chown(path, UID, GID)


def prepare(data, runtime):
    os.umask(0o077)
    for path in (data, data / 'cache', runtime):
        private_path(path, directory=True)
    for path in (data / 'identity.json', data / 'bootstrap-token'):
        private_path(path)
    # Only the relay's own state, never shared HA audio or storage.
    for path in (data / 'cache').iterdir():
        private_path(path)
    identity_file = data / 'identity.json'
    if identity_file.exists():
        identity = json.loads(identity_file.read_text())
        name = identity.get('name', '')
        if not isinstance(name, str) or not name.startswith('Dashboard Relay ') or len(name) != 24:
            raise RuntimeError('Invalid persistent identity')
        if identity.get('device_id') != hashlib.sha1(name.encode()).hexdigest():
            raise RuntimeError('Invalid persistent identity')
    else:
        name = 'Dashboard Relay ' + uuid.uuid4().hex[:8]
        identity = {'name': name, 'device_id': hashlib.sha1(name.encode()).hexdigest()}
        with identity_file.open('x') as output:
            json.dump(identity, output)
        private_path(identity_file)
    if os.geteuid() == 0:
        os.setgroups([])
        os.setgid(GID)
        os.setuid(UID)
    return identity


def healthy(env):
    try:
        result = subprocess.run(['pactl', '--format=json', 'list', 'sinks'], env=env,
                                capture_output=True, timeout=2, check=True, text=True)
        sinks = json.loads(result.stdout)
        return len(sinks) == 1 and sinks[0].get('name') == SINK and sinks[0].get('driver') == 'module-null-sink.c'
    except (OSError, ValueError, subprocess.SubprocessError, TypeError, KeyError):
        return False


def run(data, runtime):
    identity = prepare(data, runtime)
    # Whitelist so inherited upstream LIBRESPOT_*, audio defaults, debug settings,
    # or HA credentials cannot influence the receiver or appear in child logs.
    env = {'PATH': os.environ.get('PATH', '/usr/local/bin:/usr/bin:/bin'),
           'HOME': str(data), 'LANG': 'C.UTF-8', 'XDG_RUNTIME_DIR': str(runtime),
           'PULSE_SERVER': 'unix:' + str(runtime / 'pulse.sock'), 'PULSE_SINK': SINK,
           'PULSE_CLIENTCONFIG': str(runtime / 'client.conf')}
    (runtime / 'client.conf').write_text('autospawn = no\nenable-shm = no\n')
    config = runtime / 'pulse.pa'
    config.write_text('.fail\n'
                      f'load-module module-native-protocol-unix socket={runtime}/pulse.sock auth-anonymous=1\n'
                      f'load-module module-null-sink sink_name={SINK} rate=44100 channels=2 format=s16le\n'
                      f'set-default-sink {SINK}\n')
    token_file = data / 'bootstrap-token'
    credentials = data / 'cache' / 'credentials.json'
    using_bootstrap = False
    if token_file.exists() and not credentials.exists():
        token = token_file.read_text().strip()
        if not token or len(token) > 16384 or any(char.isspace() or not char.isprintable() for char in token):
            raise RuntimeError('Invalid bootstrap; existing credentials preserved')
        env['LIBRESPOT_ACCESS_TOKEN'] = token
        using_bootstrap = True
    stopping = False

    def stop(_signum, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    children = []
    try:
        pulse_env = {key: value for key, value in env.items() if key != 'LIBRESPOT_ACCESS_TOKEN'}
        pulse = subprocess.Popen(['pulseaudio', '--daemonize=no', '--exit-idle-time=-1',
                                  '--disable-shm=true', '--use-pid-file=false', '--disallow-exit',
                                  '--log-target=stderr', '-n', '--file', str(config)],
                                 env=pulse_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        children.append(pulse)
        # Native socket can take a moment to become ready. Never start playback
        # unless the private server reports exactly our single null sink.
        deadline = time.monotonic() + 3
        while not healthy(pulse_env):
            if stopping:
                return 0
            if pulse.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError('Private silent sink unavailable')
            time.sleep(0.1)
        if stopping:
            return 0
        player = subprocess.Popen(['librespot', '--name', identity['name'],
                                   '--backend', 'pulseaudio', '--system-cache', str(data / 'cache'),
                                   '--disable-audio-cache', '--zeroconf-backend', 'libmdns',
                                   '--zeroconf-port', '24879', '--device-type', 'computer', '--quiet'],
                                  env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        children.append(player)
        print('Relay running with private silent audio.', flush=True)
        while not stopping:
            if pulse.poll() is not None or player.poll() is not None or not healthy(pulse_env):
                raise RuntimeError('Relay process or private silent sink unhealthy')
            if using_bootstrap and credentials.exists():
                private_path(credentials)
                token_file.unlink()
                using_bootstrap = False
            time.sleep(0.25)
        return 0
    finally:
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
        for child in reversed(children):
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path('/data'))
    parser.add_argument('--runtime-dir', type=Path, default=Path('/tmp/dashboard-relay'))
    args = parser.parse_args()
    try:
        return run(args.data_dir.resolve() if not args.data_dir.is_symlink() else args.data_dir,
                   args.runtime_dir.resolve() if not args.runtime_dir.is_symlink() else args.runtime_dir)
    except Exception:
        # Upstream/library exceptions may include auth data: report status only.
        print('Relay stopped: private sink, identity or account setup requires inspection.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
