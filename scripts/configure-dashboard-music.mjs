import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PINNED_VERSION = '1.0.224';
const REPOSITORY = 'thlucas1/homeassistantcomponent_spotifyplus';
const REQUIRED = {
  get_playlist_favorites: ['entity_id', 'limit', 'offset', 'sort_result'],
  get_spotify_connect_devices: ['entity_id', 'refresh'],
  get_player_playback_state: ['entity_id'],
  player_media_play_context: ['entity_id', 'context_uri', 'device_id'],
  check_track_favorites: ['entity_id', 'ids'],
  save_track_favorites: ['entity_id', 'ids'],
  remove_track_favorites: ['entity_id', 'ids'],
};
const READS = new Set(['get_playlist_favorites', 'get_spotify_connect_devices', 'get_player_playback_state', 'check_track_favorites']);
const SCOPES = ['playlist-read-private', 'playlist-read-collaborative', 'user-library-read', 'user-library-modify', 'user-modify-playback-state', 'user-read-playback-state', 'user-read-currently-playing', 'user-read-private'];
function atLeast(value, minimum) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(value ?? '')) return false;
  const parts = value.split('.').map(Number);
  for (let i = 0; i < minimum.length; i++) {
    if ((parts[i] ?? 0) !== minimum[i]) return (parts[i] ?? 0) > minimum[i];
  }
  return true;
}
function validateRuntime(report) {
  if (!atLeast(report.haVersion, [2023, 8, 0]) || !atLeast(report.pythonVersion, [3, 11, 0])) throw new Error('Incompatible or unknown Home Assistant/Python runtime');
}
export function validatePreflight(report) {
  if (!report.hasAccount || !report.desktopAuthorized) throw new Error('Authorization required: configure SpotifyPlus and authorize Spotify for Desktop');
  validateRuntime(report);
  if (report.installedVersion?.replace(/^v/, '') !== PINNED_VERSION) throw new Error('Installed version does not match pinned SpotifyPlus release');
  if (!report.accountVerified) throw new Error('SpotifyPlus account identity has not been verified');
  if (!SCOPES.every(scope => report.scopes?.includes(scope))) throw new Error('Required playlist/library OAuth scope is missing');
  for (const [name, fields] of Object.entries(REQUIRED)) {
    const service = report.services?.[name];
    if (!service || fields.some(field => !(field in (service.fields ?? {})))) throw new Error(`Missing service schema: spotifyplus.${name}`);
    if (READS.has(name) && !service.response) throw new Error(`Missing response schema: spotifyplus.${name}`);
  }
  return { ready: true };
}
export async function configureMusic(options = {}, remote) {
  if (options.install && options.rollback) throw new Error('Install and rollback modes are mutually exclusive');
  if (options.rollback) {
    await remote.rollback(options.rollback);
    return { mode: 'rollback', restored: true };
  }
  const report = await remote.inspect();
  if (!options.install) {
    try { return { mode: 'inspect', ...report, ...validatePreflight(report) }; }
    catch (error) { return { mode: 'inspect', ...report, ready: false, reason: error.message }; }
  }
  validateRuntime(report);
  const backup = await remote.backup(report);
  await remote.install(report);
  return { mode: 'install', backup, version: PINNED_VERSION, ready: false, next: 'Restart Home Assistant, complete SpotifyPlus OAuth and Spotify for Desktop consent, then inspect and perform live acceptance checks. Installation alone is not compatibility proof.' };
}

// Websocket requests expose only errors/status, never HA response bodies containing credentials.
export async function openHA(env) {
  const url = new URL('/api/websocket', env.VITE_HA_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const authenticated = new Promise((resolveAuth, rejectAuth) => {
    const timer = setTimeout(() => { socket.close(); rejectAuth(new Error('HA authentication timeout')); }, 15000);
    socket.addEventListener('error', () => { clearTimeout(timer); rejectAuth(new Error('HA websocket connection failed')); });
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: env.VITE_HA_TOKEN }));
      if (message.type === 'auth_ok') { clearTimeout(timer); resolveAuth(); }
      if (message.type === 'auth_invalid') { clearTimeout(timer); socket.close(); rejectAuth(new Error('HA authorization failed')); }
      if (message.type === 'event' && message.event?.type === 'initial' && pending.get(message.id)?.stream) {
        const item = pending.get(message.id); clearTimeout(item.timer); pending.delete(message.id);
        item.resolveRequest(message.event.data);
        socket.send(JSON.stringify({ id: nextId++, type: 'unsubscribe_events', subscription: message.id }));
      }
      if (message.type === 'result' && pending.has(message.id)) {
        if (message.success && pending.get(message.id).stream) return;
        const { resolveRequest, rejectRequest, timer: requestTimer } = pending.get(message.id);
        clearTimeout(requestTimer); pending.delete(message.id);
        if (message.success) resolveRequest(message.result);
        else rejectRequest(new Error(`HA operation failed (${message.error?.code ?? 'unknown'})`));
      }
    });
    socket.addEventListener('close', () => {
      for (const item of pending.values()) { clearTimeout(item.timer); item.rejectRequest(new Error('HA connection closed')); }
      pending.clear();
    });
  });
  await authenticated;
  return {
    close: () => socket.close(),
    request: data => new Promise((resolveRequest, rejectRequest) => {
      const id = nextId++;
      const timer = setTimeout(() => { pending.delete(id); rejectRequest(new Error('HA operation timed out; inspect before retrying')); }, 120000);
      pending.set(id, { resolveRequest, rejectRequest, timer, stream: data.type === 'system_health/info' });
      socket.send(JSON.stringify({ id, ...data }));
    }),
  };
}
async function openSSH(env) {
  // ssh2 is the SSH transport already supplied by node-scp in this repository.
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { Client } = require(require.resolve('ssh2', { paths: [require.resolve('node-scp')] }));
  const client = new Client();
  await new Promise((ready, failed) => {
    client.once('ready', ready); client.once('error', () => failed(new Error('SSH connection failed')));
    client.connect({ host: env.VITE_SSH_HOSTNAME, username: env.VITE_SSH_USERNAME, password: env.VITE_SSH_PASSWORD, readyTimeout: 15000 });
  });
  return {
    close: () => client.end(),
    python: source => new Promise((resolveCommand, rejectCommand) => {
      const encoded = Buffer.from(source).toString('base64');
      client.exec(`python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`, (error, stream) => {
        if (error) return rejectCommand(new Error('SSH command failed'));
        let output = ''; stream.on('data', chunk => { output += chunk; });
        stream.on('close', code => code === 0 ? resolveCommand(JSON.parse(output)) : rejectCommand(new Error('Remote operation failed; protected backup retained')));
        stream.stderr.resume();
      });
    }),
  };
}
export async function createRemote(env, connectors = {}) {
  const ha = await (connectors.ha ?? openHA)(env);
  let ssh;
  try { ssh = await (connectors.ssh ?? openSSH)(env); } catch (error) { ha.close(); throw error; }
  let repository;
  const repositories = async () => {
    const items = await ha.request({ type: 'hacs/repositories/list', categories: ['integration'] });
    repository = items.find(item => item.full_name === REPOSITORY);
    return repository;
  };
  return {
    close() { ha.close(); ssh.close(); },
    async inspect() {
      const config = await ha.request({ type: 'get_config' });
      const services = await ha.request({ type: 'get_services' });
      const entries = await ha.request({ type: 'config_entries/get' });
      await repositories();
      const storage = await ssh.python(`import pathlib,json,sys\np=pathlib.Path('/homeassistant')\nassert p.is_dir()\nf=p/'.storage/spotifyplus_tokens.json'\nt=json.loads(f.read_text()) if f.exists() else {}\nm=p/'custom_components/spotifyplus/manifest.json'\nprint(json.dumps({'sshPythonVersion':sys.version.split()[0],'desktopTokenPresent':any(k.startswith('SpotifyWebApiAuthCodePkce/65b708073fc0480ea92a077233ca87bd/') and bool(v.get('refresh_token')) for k,v in t.items()),'installedVersion':json.loads(m.read_text()).get('version') if m.exists() else None}))`);
      // system_health is HA Core's own Python, distinct from the SSH add-on Python.
      const health = await ha.request({ type: 'system_health/info' });
      const pythonVersion = health?.homeassistant?.info?.python_version;
      return {
        haVersion: config.version, pythonVersion,
        ...storage,
        integrations: entries.filter(entry => ['hacs', 'sonos', 'spotify', 'spotifyplus'].includes(entry.domain)).map(({ domain, state }) => ({ domain, state })),
        hasAccount: entries.some(entry => entry.domain === 'spotifyplus' && entry.state === 'loaded'),
        // Token file existence alone does not prove the configured account or valid OAuth.
        desktopAuthorized: false, accountVerified: false, scopes: [],
        services: Object.fromEntries(Object.entries(services.spotifyplus ?? {}).filter(([name]) => name in REQUIRED)),
        hacsRepository: repository ? { id: String(repository.id), installed: repository.installed, installedVersion: repository.installed_version } : null,
      };
    },
    async backup(report) {
      return ssh.python(`import pathlib,json,datetime,shutil,os\np=pathlib.Path('/homeassistant')\nb=p/'backups.local'/('dashboard-music-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))\nb.mkdir(parents=True,mode=0o700)\nos.chmod(b,0o700)\nfor name in ['core.config_entries','application_credentials','spotifyplus_tokens.json','hacs.repositories','hacs.data']:\n f=p/'.storage'/name\n if f.exists():\n  shutil.copy2(f,b/name);os.chmod(b/name,0o600)\nf=p/'custom_components/spotifyplus'\nif f.exists(): shutil.copytree(f,b/'spotifyplus')\nm={'kind':'dashboard-music-v1','report':${JSON.stringify(JSON.stringify(report))}}\n(b/'manifest.json').write_text(json.dumps(m))\nos.chmod(b/'manifest.json',0o600)\nprint(json.dumps(str(b)))`);
    },
    async install() {
      if (!repository) {
        await ha.request({ type: 'hacs/repositories/add', repository: REPOSITORY, category: 'integration' });
        await repositories();
      }
      if (!repository) throw new Error('SpotifyPlus repository is unavailable in HACS');
      await ha.request({ type: 'hacs/repository/download', repository: String(repository.id), version: `v${PINNED_VERSION}` });
      const version = await ssh.python("import json,pathlib\nprint(json.dumps(json.loads(pathlib.Path('/homeassistant/custom_components/spotifyplus/manifest.json').read_text())['version']))");
      if (version?.replace(/^v/, '') !== PINNED_VERSION) throw new Error('Installed SpotifyPlus version mismatch; stop and use backup');
    },
    async rollback(backup) {
      if (!/^\/homeassistant\/backups\.local\/dashboard-music-\d{8}T\d{12}Z$/.test(backup)) throw new Error('Invalid task backup path');
      const prior = await ssh.python(`import pathlib,json\np=pathlib.Path(${JSON.stringify(backup)})\nm=json.loads((p/'manifest.json').read_text())\nassert m['kind']=='dashboard-music-v1'\nprint(m['report'])`);
      const current = await ha.request({ type: 'config_entries/get' });
      if (current.some(entry => entry.domain === 'spotifyplus')) throw new Error('Remove only the task-created SpotifyPlus config entry in HA before rolling back integration code; existing integrations are never removed automatically');
      await repositories();
      if (prior.hacsRepository?.installed) {
        await ha.request({ type: 'hacs/repository/download', repository: String(repository.id), version: prior.hacsRepository.installedVersion });
      } else if (repository?.installed) {
        await ha.request({ type: 'hacs/repository/remove', repository: String(repository.id) });
      }
      if (!prior.hacsRepository && repository?.custom) {
        await ha.request({ type: 'hacs/repositories/remove', repository: String(repository.id) });
      }
      // Never restore shared .storage files over concurrent integration/settings changes.
      await ssh.python(`import pathlib,json,shutil\nb=pathlib.Path(${JSON.stringify(backup)})\nf=pathlib.Path('/homeassistant/custom_components/spotifyplus')\nif (b/'spotifyplus').exists():\n if f.exists(): shutil.rmtree(f)\n shutil.copytree(b/'spotifyplus',f)\nprint(json.dumps(True))`);
    },
  };
}
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let envPath = resolve('.env');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--install') options.install = true;
    else if (args[i] === '--rollback' && args[i + 1]) options.rollback = args[++i];
    else if (args[i] === '--env' && args[i + 1]) envPath = resolve(args[++i]);
    else throw new Error('Usage: node scripts/configure-dashboard-music.mjs [--env PATH] [--install | --rollback BACKUP]');
  }
  const { config } = await import('dotenv');
  config({ path: envPath, quiet: true });
  for (const name of ['VITE_HA_URL', 'VITE_HA_TOKEN', 'VITE_SSH_HOSTNAME', 'VITE_SSH_USERNAME', 'VITE_SSH_PASSWORD']) if (!process.env[name]) throw new Error(`Missing ${name}`);
  const remote = await createRemote(process.env);
  try { console.log(JSON.stringify(await configureMusic(options, remote), null, 2)); }
  finally { remote.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error('Music setup failed. Inspect configuration and protected backups before retrying; no credentials are logged.'); process.exitCode = 1; });
