import { Client } from 'node-scp';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

dotenv.config({ quiet: true });
const domain = 'dashboard_spotify';

export function enableConfiguration(text) {
  const declarations = text.split(/\r?\n/).filter(line => /^dashboard_spotify\s*:/.test(line));
  if (declarations.length) {
    if (declarations.length === 1 && /^dashboard_spotify\s*:\s*\{\}\s*(?:#.*)?$/.test(declarations[0])) return text;
    throw new Error('Existing dashboard_spotify configuration needs manual review.');
  }
  return text + (text.endsWith('\n') ? '\n' : '\n\n') + 'dashboard_spotify: {}\n';
}

export function configRoot(path) {
  if (!['/config', '/homeassistant'].includes(path)) throw new Error('Unsupported Home Assistant config directory.');
  return path;
}

export async function install(adapter, files, root, validate) {
  root = configRoot(root);
  const configPath = root + '/configuration.yaml';
  const componentPath = root + '/custom_components/' + domain;
  const canonicalRoot = await adapter.realPath(root);
  if (await adapter.realPath(configPath) !== canonicalRoot + '/configuration.yaml'
      || await adapter.realPath(root + '/custom_components') !== canonicalRoot + '/custom_components')
    throw new Error('Configuration files or integration directory use an unexpected symlink.');
  const originalAttributes = await adapter.stat(configPath);
  if (!originalAttributes || !Number.isInteger(originalAttributes.mode)) throw new Error('Configuration attributes are unavailable.');
  const attributes = {mode: originalAttributes.mode & 0o777, uid: originalAttributes.uid, gid: originalAttributes.gid};
  if (![attributes.mode, attributes.uid, attributes.gid].every(Number.isInteger)) throw new Error('Configuration attributes are unavailable.');
  const configuration = await adapter.readFile(configPath);
  const updated = Buffer.from(enableConfiguration(configuration.toString('utf8')));
  const names = [...files.keys()];
  if (names.length !== 3 || names.some(name => !['__init__.py','search.py','manifest.json'].includes(name))) throw new Error('Unexpected integration payload.');
  if (await adapter.exists(componentPath)) throw new Error('Integration already exists; review it before upgrading.');
  const backupPath = configPath + '.spotify-backup-' + randomUUID();
  const stagePath = configPath + '.spotify-stage-' + randomUUID();
  async function atomicConfig(bytes) {
    await adapter.writeFile(stagePath, bytes, {mode: 0o600, flag: 'wx'});
    await adapter.setstat(stagePath, attributes);
    const stagedAttributes = await adapter.stat(stagePath);
    if ((stagedAttributes.mode & 0o777) !== attributes.mode || stagedAttributes.uid !== attributes.uid || stagedAttributes.gid !== attributes.gid)
      throw new Error('Configuration permission verification failed.');
    if (!(await adapter.readFile(stagePath)).equals(bytes)) throw new Error('Staged configuration verification failed.');
    await adapter.rename(stagePath, configPath);
  }
  await adapter.writeFile(backupPath, configuration, {mode: 0o600, flag: 'wx'});
  if ((await adapter.stat(backupPath)).mode & 0o077) throw new Error('Configuration backup is not private.');
  if (!(await adapter.readFile(backupPath)).equals(configuration)) throw new Error('Configuration backup verification failed.');
  let created = false;
  let promoted = false;
  try {
    await adapter.mkdir(componentPath);
    created = true;
    for (const [name, bytes] of files) {
      await adapter.writeFile(componentPath + '/' + name, bytes);
      if (!(await adapter.readFile(componentPath + '/' + name)).equals(bytes)) throw new Error('Integration verification failed.');
    }
    if (!(await adapter.readFile(configPath)).equals(configuration)) throw new Error('Configuration changed during install.');
    await atomicConfig(updated);
    promoted = true;
    if (!(await adapter.readFile(configPath)).equals(updated)) throw new Error('Configuration verification failed.');
    if (await validate() !== 'valid') throw new Error('Home Assistant configuration check failed.');
    return { backupPath };
  } catch (error) {
    const current = await adapter.readFile(configPath);
    if (current.equals(updated)) await atomicConfig(configuration);
    else if (promoted && !current.equals(configuration)) {
      const incomplete = new Error('Rollback incomplete: configuration changed during validation. Integration and backup retained for manual review; do not restart.');
      incomplete.code = 'ROLLBACK_INCOMPLETE';
      throw incomplete;
    }
    if (created) await adapter.removeTree(componentPath);
    throw error;
  } finally {
    if (await adapter.exists(stagePath)) await adapter.unlink(stagePath);
  }
}

async function main() {
  if (process.argv[2] !== '--install') throw new Error('Usage: node scripts/install-dashboard-spotify.mjs --install [--config-root /config|/homeassistant]. Restart Home Assistant separately after validation.');
  const rootIndex = process.argv.indexOf('--config-root');
  const root = configRoot(rootIndex < 0 ? '/config' : process.argv[rootIndex + 1]);
  const required = ['VITE_SSH_HOSTNAME','VITE_SSH_USERNAME','VITE_SSH_PASSWORD','VITE_HA_URL','VITE_HA_TOKEN'];
  if (required.some(key => !process.env[key])) throw new Error('Missing private Home Assistant configuration.');
  const directory = fileURLToPath(new URL('../home-assistant/custom_components/dashboard_spotify/', import.meta.url));
  const names = (await readdir(directory)).filter(name => ['__init__.py','search.py','manifest.json'].includes(name));
  const files = new Map(await Promise.all(names.map(async name => [name, await readFile(resolve(directory,name))])));
  const client = await Client({host:process.env.VITE_SSH_HOSTNAME,username:process.env.VITE_SSH_USERNAME,password:process.env.VITE_SSH_PASSWORD,port:22});
  try {
    const adapter = {
      realPath: path => client.realPath(path),
      stat: path => client.stat(path), setstat: (path,attributes) => client.setstat(path,attributes),
      readFile: path => client.readFile(path), writeFile: (path,bytes,options) => client.writeFile(path,bytes,options),
      exists: async path => Boolean(await client.exists(path)), mkdir: path => client.mkdir(path,undefined,{recursive:false}),
      removeTree: path => client.rmdir(path),
      unlink: path => client.unlink(path),
      rename: (from,to) => new Promise((resolve,reject) => client.sftpWrapper.ext_openssh_rename(from,to,error => error ? reject(new Error('Atomic configuration rename failed.')) : resolve())),
    };
    const result = await install(adapter,files,root,async () => {
      const response = await fetch(process.env.VITE_HA_URL.replace(/\/$/,'') + '/api/config/core/check_config', {
        method:'POST',headers:{Authorization:'Bearer '+process.env.VITE_HA_TOKEN},signal:AbortSignal.timeout(120000),
      });
      if (!response.ok) return 'invalid';
      return (await response.json()).result;
    });
    console.info('Spotify search integration installed and configuration validated. Backup: '+result.backupPath+'. Restart Home Assistant separately.');
  } finally { client.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error?.code === 'ROLLBACK_INCOMPLETE'
    ? 'Rollback incomplete: configuration changed during validation. Integration and backup retained for manual review; do not restart.'
    : 'Spotify integration install failed. Check configuration and retained backup before retrying. No restart was requested.');
  process.exitCode=1;
});
