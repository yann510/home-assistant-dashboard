import { Client } from 'node-scp';
import dotenv from 'dotenv';
import { localPayload, publishTrial, rollbackTrial, type TrialAdapter } from './canvas-release';

dotenv.config({ quiet: true });
async function main() {
  const action = process.argv[2];
  const releaseId = process.argv[3];
  if (action !== 'rollback' && (action !== 'publish' || !releaseId))
    throw new Error('Usage: deploy-canvas.ts publish RELEASE_ID | rollback');
  const required = ['VITE_SSH_HOSTNAME', 'VITE_SSH_USERNAME', 'VITE_SSH_PASSWORD'];
  if (required.some(key => !process.env[key])) throw new Error('Missing SSH configuration');
  if (action === 'publish') {
    const payload = await localPayload('dist');
    const secrets = Object.entries(process.env)
      .filter(([key, value]) => /token|password|secret/i.test(key) && value && value.length >= 8)
      .map(([, value]) => value!);
    for (const bytes of payload.values()) {
      if (secrets.some(value => bytes.includes(value)) || /VITE_[A-Z_]*TOKEN|hassToken\s*[:=]\s*["']/.test(bytes.toString()))
        throw new Error('Secret check failed; deployment refused');
    }
  }
  const client = await Client({
    host: process.env.VITE_SSH_HOSTNAME,
    username: process.env.VITE_SSH_USERNAME,
    password: process.env.VITE_SSH_PASSWORD,
    port: 22,
  });
  const adapter: TrialAdapter = {
    exists: async path => Boolean(await client.exists(path)),
    realPath: path => client.realPath(path),
    mkdir: path => client.mkdir(path, undefined, { recursive: false }),
    writeFile: (path, bytes) => client.writeFile(path, bytes),
    readFile: path => client.readFile(path),
    list: async path => {
      const entries: { name: string; type: string }[] = await client.list(path);
      return entries
        .filter(entry => entry.name !== '.' && entry.name !== '..')
        .map(entry => {
          if (!['d', '-', 'l'].includes(entry.type)) throw new Error('Unsupported remote file');
          return { name: entry.name, directory: entry.type === 'd', symlink: entry.type === 'l' };
        });
    },
    rename: (from, to) => client.rename(from, to),
    removeTree: path => client.rmdir(path),
    close: async () => client.close(),
  };
  if (action === 'rollback') await rollbackTrial(adapter);
  else await publishTrial(adapter, 'dist', releaseId!);
  console.info(
    action === 'rollback' ? 'Canvas trial rollback verified and promoted.' : `Canvas trial release ${releaseId} verified and promoted.`
  );
}
main().catch(() => {
  console.error(
    'Canvas trial operation failed. Current or retained release remains available; inspect release directories before retrying.'
  );
  process.exitCode = 1;
});
