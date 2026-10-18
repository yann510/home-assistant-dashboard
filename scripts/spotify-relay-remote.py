"""Scoped remote filesystem/Supervisor operations for configure-spotify-relay.mjs.

Executed over SSH in memory. Nothing reads or restores shared HA configuration.
"""
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import urllib.request

SLUG = 'local_dashboard_spotify_relay'
VERSION = '1.0.0'
FILES = {'Dockerfile', 'config.json', 'relay.py', 'README.md', 'LICENSE.librespot', 'LICENSE.upstream-image'}


def supervisor(path, method='GET', data=None):
    token = os.environ.get('SUPERVISOR_TOKEN') or os.environ.get('HASSIO_TOKEN')
    if not token:
        raise RuntimeError('Supervisor API unavailable in SSH environment')
    request = urllib.request.Request('http://supervisor' + path, method=method,
                                     data=json.dumps(data).encode() if data is not None else None,
                                     headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            result = json.load(response)
        if result.get('result') != 'ok':
            raise RuntimeError('Supervisor operation failed')
        return result.get('data', {})
    except Exception:
        # API errors and headers may contain credentials. Do not forward them.
        raise RuntimeError('Supervisor operation failed; inspect protected relay record before retrying') from None


def digest_json(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def fingerprint(source):
    if source.is_symlink() or not source.is_dir():
        raise RuntimeError('Relay source ownership changed')
    files = {}
    for path in source.rglob('*'):
        if path.is_symlink() or not path.is_file():
            raise RuntimeError('Relay source ownership changed')
        files[path.relative_to(source).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return digest_json(files)


def write_record(backup, record):
    path = backup / 'ownership.json'
    temporary = backup / '.ownership.tmp'
    with temporary.open('x') as output:
        os.chmod(temporary, 0o600)
        json.dump(record, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def addon_identity(info):
    # Hash options instead of putting configuration/credentials in the record.
    # Runtime state/stats can change freely; version and settings cannot.
    return digest_json({key: info.get(key) for key in ('slug', 'version', 'options', 'boot', 'watchdog', 'protected',
            'audio', 'devices', 'privileged', 'full_access', 'host_network', 'host_pid',
            'host_ipc', 'host_dbus', 'hassio_api', 'homeassistant_api', 'apparmor')})


class RelayInstaller:
    def __init__(self, addons=Path('/addons'), backups=Path('/homeassistant/backups.local'),
                 identity=Path('/homeassistant/.storage/core.uuid'), api=supervisor):
        self.addons = addons
        self.source = addons / 'dashboard_spotify_relay'
        self.backups = backups
        self.identity = identity
        self.api = api

    def host_id(self):
        if self.identity.is_symlink() or not self.identity.is_file():
            raise RuntimeError('Home Assistant identity unavailable')
        identity = json.loads(self.identity.read_text()).get('data', {}).get('uuid')
        if not isinstance(identity, str) or not identity:
            raise RuntimeError('Home Assistant identity unavailable')
        return hashlib.sha256(identity.encode()).hexdigest()

    def installed(self):
        return any(addon.get('slug') == SLUG for addon in self.api('/addons').get('addons', []))

    def inspect(self):
        info = self.api('/info')
        self.host_id()
        if self.addons.is_symlink() or not self.addons.is_dir():
            raise RuntimeError('Local add-on source mount /addons unavailable')
        return {'arch': info.get('arch'), 'supervisor': True,
                'sourceExists': self.source.exists() or self.source.is_symlink(), 'installed': self.installed()}

    def install(self, encoded_files):
        report = self.inspect()
        if report['arch'] != 'aarch64':
            raise RuntimeError('Incompatible architecture')
        if report['sourceExists'] or report['installed']:
            raise RuntimeError('Refusing existing source or add-on')
        if set(encoded_files) != FILES:
            raise RuntimeError('Invalid relay source payload')
        try:
            files = {name: base64.b64decode(value, validate=True) for name, value in encoded_files.items()}
            manifest = json.loads(files['config.json'])
            if manifest.get('slug') != 'dashboard_spotify_relay' or manifest.get('version') != VERSION:
                raise ValueError()
        except Exception:
            raise RuntimeError('Invalid relay source payload') from None
        if self.backups.is_symlink():
            raise RuntimeError('Unsafe backup namespace')
        self.backups.mkdir(mode=0o700, parents=True, exist_ok=True)
        name = 'dashboard-spotify-relay-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup = self.backups / name
        backup.mkdir(mode=0o700)
        record = {'kind': 'dashboard-spotify-relay-v1', 'host': self.host_id(), 'phase': 'prepared',
                  'prior': {'source': False, 'installed': False}}
        write_record(backup, record)
        # mkdir/exclusive file creation cannot overwrite an unowned source.
        self.source.mkdir(mode=0o700)
        for name, content in files.items():
            with (self.source / name).open('xb') as output:
                os.chmod(self.source / name, 0o600)
                output.write(content)
        record.update(phase='staged', source=fingerprint(self.source))
        write_record(backup, record)
        self.api('/store/reload', 'POST')
        if self.installed():
            raise RuntimeError('Concurrent add-on install; ownership not established')
        self.api('/store/addons/' + SLUG + '/install', 'POST')
        # Do not start playback or configure any Spotify credentials here.
        self.api('/addons/' + SLUG + '/options', 'POST', {'boot': 'auto', 'watchdog': True})
        info = self.api('/addons/' + SLUG + '/info')
        if info.get('slug') != SLUG or info.get('version') != VERSION or info.get('options') != {}:
            raise RuntimeError('Unexpected installed relay; ownership not established')
        if fingerprint(self.source) != record['source']:
            raise RuntimeError('Relay source changed during install')
        record.update(phase='installed', addon=addon_identity(info))
        write_record(backup, record)
        return {'backup': str(backup), 'version': VERSION}

    def owned(self, backup):
        backup = Path(backup)
        if (backup.parent != self.backups or not re.fullmatch(r'dashboard-spotify-relay-\d{8}T\d{12}Z', backup.name)
                or self.backups.is_symlink() or backup.is_symlink() or not backup.is_dir()):
            raise RuntimeError('Invalid relay backup path')
        path = backup / 'ownership.json'
        if path.is_symlink() or not path.is_file():
            raise RuntimeError('Missing relay ownership record')
        record = json.loads(path.read_text())
        if record.get('kind') != 'dashboard-spotify-relay-v1' or record.get('host') != self.host_id():
            raise RuntimeError('Relay ownership or host identity mismatch')
        if record.get('phase') != 'installed':
            raise RuntimeError('Incomplete relay ownership; inspect before any cleanup')
        if fingerprint(self.source) != record.get('source'):
            raise RuntimeError('Relay source changed; ownership not confirmed')
        if not self.installed():
            raise RuntimeError('Installed relay missing; ownership not confirmed')
        if addon_identity(self.api('/addons/' + SLUG + '/info')) != record.get('addon'):
            raise RuntimeError('Relay settings/version changed; ownership not confirmed')
        return backup, record

    def start(self, backup):
        self.owned(backup)
        self.api('/addons/' + SLUG + '/start', 'POST')
        return {'started': True}

    def rollback(self, backup):
        backup, record = self.owned(backup)
        # Explicit rollback removes this task-created add-on, including its own
        # private data. No other add-on/config/storage restoration is performed.
        self.api('/addons/' + SLUG + '/uninstall', 'POST')
        if self.installed() or fingerprint(self.source) != record['source']:
            raise RuntimeError('Relay changed during rollback; source preserved')
        shutil.rmtree(self.source)
        record['phase'] = 'rolled-back'
        write_record(backup, record)
        self.api('/store/reload', 'POST')
        return {'restored': True}


def dispatch(request):
    os.umask(0o077)
    installer = RelayInstaller()
    action = request.get('action')
    if action == 'inspect':
        return installer.inspect()
    if action == 'install':
        return installer.install(request['files'])
    if action == 'start':
        return installer.start(request['backup'])
    if action == 'rollback':
        return installer.rollback(request['backup'])
    raise RuntimeError('Unsupported relay operation')
