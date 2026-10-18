import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = new URL('../home-assistant/addons/dashboard_spotify_relay/', import.meta.url);
const FILES = ['Dockerfile', 'config.json', 'relay.py', 'README.md', 'LICENSE.librespot', 'LICENSE.upstream-image'];

export async function configureRelay(options = {}, remote) {
  if ([options.install, options.start, options.rollback].filter(Boolean).length > 1) throw new Error('Relay modes are mutually exclusive');
  if (options.rollback) return { mode: 'rollback', ...await remote.rollback(options.rollback) };
  if (options.start) return { mode: 'start', ...await remote.start(options.start) };
  const report = await remote.inspect();
  if (!options.install) return { mode: 'inspect', ...report };
  if (report.arch !== 'aarch64' || !report.supervisor) throw new Error('Incompatible or unknown Home Assistant runtime');
  if (report.installed || report.sourceExists) throw new Error('Refusing existing relay add-on/source; ownership not confirmed');
  return { mode: 'install', ...await remote.install(), started: false };
}

export async function createRemote(env, connectors = {}) {
  const source = await readFile(new URL('./spotify-relay-remote.py', import.meta.url), 'utf8');
  let ssh;
  if (connectors.ssh) ssh = await connectors.ssh(env);
  else {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const { Client } = require(require.resolve('ssh2', { paths: [require.resolve('node-scp')] }));
    const client = new Client();
    await new Promise((ready, failed) => {
      client.once('ready', ready);
      client.once('error', () => failed(new Error('SSH connection failed')));
      client.connect({ host: env.VITE_SSH_HOSTNAME, username: env.VITE_SSH_USERNAME, password: env.VITE_SSH_PASSWORD, readyTimeout: 15000 });
    });
    ssh = {
      close: () => client.end(),
      python: payload => new Promise((resolveCommand, rejectCommand) => {
        const encoded = Buffer.from(payload).toString('base64');
        client.exec(`python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`, (error, stream) => {
          if (error) return rejectCommand(new Error('SSH relay command failed'));
          let output = '';
          stream.on('data', chunk => { output += chunk; });
          stream.stderr.resume();
          stream.on('close', code => {
            if (code !== 0) return rejectCommand(new Error('Relay operation failed; inspect protected relay backup before retrying'));
            try { resolveCommand(JSON.parse(output)); }
            catch { rejectCommand(new Error('Invalid relay status response')); }
          });
        });
      }),
    };
  }
  const request = payload => ssh.python(source + '\nprint(json.dumps(dispatch(json.loads(' + JSON.stringify(JSON.stringify(payload)) + '))))\n');
  return {
    close: () => ssh.close(),
    inspect: () => request({ action: 'inspect' }),
    async install() {
      const files = Object.fromEntries(await Promise.all(FILES.map(async name => [name, (await readFile(new URL(name, SOURCE))).toString('base64')])));
      return request({ action: 'install', files });
    },
    start: backup => request({ action: 'start', backup }),
    rollback: backup => request({ action: 'rollback', backup }),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let envPath = resolve('.env');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--install') options.install = true;
    else if (args[i] === '--start' && args[i + 1]) options.start = args[++i];
    else if (args[i] === '--rollback' && args[i + 1]) options.rollback = args[++i];
    else if (args[i] === '--env' && args[i + 1]) envPath = resolve(args[++i]);
    else throw new Error('Usage: configure-spotify-relay.mjs [--env PATH] [--install | --start BACKUP | --rollback BACKUP]');
  }
  const { config } = await import('dotenv');
  config({ path: envPath, quiet: true });
  for (const name of ['VITE_SSH_HOSTNAME', 'VITE_SSH_USERNAME', 'VITE_SSH_PASSWORD']) if (!process.env[name]) throw new Error(`Missing ${name}`);
  const remote = await createRemote(process.env);
  try { console.log(JSON.stringify(await configureRelay(options, remote), null, 2)); }
  finally { remote.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(() => {
  console.error('Relay setup failed. Inspect relay source, permissions and protected backups before retrying; no credentials are logged.');
  process.exitCode = 1;
});
