import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';

export interface TrialAdapter {
  exists(path: string): Promise<boolean>;
  realPath(path: string): Promise<string>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, bytes: Buffer): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  list(path: string): Promise<{ name: string; directory: boolean; symlink: boolean }[]>;
  rename(from: string, to: string): Promise<void>;
  removeTree(path: string): Promise<void>;
  close(): Promise<void>;
}
const roots = ['/config/www', '/homeassistant/www'];
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export function trialPath(root: string, relative: string): string {
  const parts = relative.split('/');
  if (
    !roots.includes(root) ||
    !/^canvas-trial(?:-[a-zA-Z0-9-]+)?$/.test(parts[0]) ||
    parts.some(p => !/^[a-zA-Z0-9_.-]+$/.test(p) || p === '.' || p === '..' || p === 'dashboard')
  ) {
    throw new Error('Unsafe trial destination');
  }
  return root + '/' + relative;
}
async function resolveRoot(a: TrialAdapter) {
  const matches = new Set<string>();
  for (const candidate of roots) if (await a.exists(candidate)) matches.add(await a.realPath(candidate));
  if (matches.size !== 1 || !roots.includes([...matches][0])) throw new Error('Expected one canonical HA www root');
  return [...matches][0];
}
// Reject links even on reads; inherited files must never escape the trial tree.
async function remoteFiles(a: TrialAdapter, root: string, relative: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  async function walk(rel: string, prefix: string) {
    const path = trialPath(root, rel);
    if ((await a.realPath(path)) !== path) throw new Error('Remote trial symlink rejected');
    for (const entry of await a.list(path)) {
      if (entry.name.includes('/') || entry.symlink) throw new Error('Unsafe remote entry');
      const child = trialPath(root, rel + '/' + entry.name);
      if (entry.directory) await walk(rel + '/' + entry.name, prefix + entry.name + '/');
      else result.set(prefix + entry.name, await a.readFile(child));
    }
  }
  await walk(relative, '');
  return result;
}
export async function localPayload(directory: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  async function walk(dir: string, prefix: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (!prefix && entry.name !== 'index.html' && entry.name !== 'assets') continue;
      trialPath(roots[0], 'canvas-trial/' + relative);
      if (entry.isSymbolicLink()) throw new Error('Local symlink rejected');
      if (entry.isDirectory()) await walk(join(dir, entry.name), relative + '/');
      else if (entry.isFile()) result.set(relative, await readFile(join(dir, entry.name)));
      else throw new Error('Unsupported local file');
    }
  }
  await walk(directory, '');
  if (!result.has('index.html') || ![...result.keys()].some(p => /^assets\/.+\.js$/.test(p))) throw new Error('Incomplete trial build');
  if (!result.get('index.html')!.toString().includes('/local/canvas-trial/')) throw new Error('Build must use canvas-trial base');
  return result;
}
async function retainAssets(a: TrialAdapter, root: string, files: Map<string, Buffer>) {
  if (!(await a.exists(trialPath(root, 'canvas-trial')))) return;
  for (const [name, bytes] of await remoteFiles(a, root, 'canvas-trial')) {
    if (!name.startsWith('assets/')) continue;
    if (files.has(name) && hash(files.get(name)!) !== hash(bytes)) throw new Error('Asset name collision');
    files.set(name, bytes);
  }
}
async function stageFiles(a: TrialAdapter, root: string, stage: string, files: Map<string, Buffer>) {
  const directories = new Set<string>([stage]);
  for (const [name, bytes] of files) {
    const relative = stage + '/' + name;
    const segments = posix.dirname(relative).split('/');
    for (let i = 1; i <= segments.length; i++) {
      const directory = segments.slice(0, i).join('/');
      if (!directories.has(directory)) {
        await a.mkdir(trialPath(root, directory));
        directories.add(directory);
      }
    }
    await a.writeFile(trialPath(root, relative), bytes);
  }
  // The locally computed manifest covers the exact staged bytes, including retained assets.
  const manifest = Buffer.from(JSON.stringify(Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)])), null, 2));
  await a.writeFile(trialPath(root, stage + '/release-manifest.json'), manifest);
  for (const [name, bytes] of [...files, ['release-manifest.json', manifest] as const]) {
    if (hash(await a.readFile(trialPath(root, stage + '/' + name))) !== hash(bytes)) throw new Error('Remote hash verification failed');
  }
}
async function release(a: TrialAdapter, payload: () => Promise<Map<string, Buffer>>, releaseId: string, rollback: boolean) {
  let root: string | undefined;
  let locked = false;
  let staged = false;
  const stage = 'canvas-trial-stage-' + randomUUID();
  try {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(releaseId)) throw new Error('Invalid release ID');
    root = await resolveRoot(a);
    const path = (p: string) => trialPath(root!, p);
    await a.mkdir(path('canvas-trial-lock')); // Non-recursive mkdir provides cross-process exclusion.
    locked = true;
    const files = rollback ? await remoteFiles(a, root, 'canvas-trial-previous') : await payload();
    files.delete('release-manifest.json');
    if (!rollback) files.set('release-info.json', Buffer.from(JSON.stringify({ releaseId })));
    if (!files.has('index.html')) throw new Error('Missing previous release');
    await retainAssets(a, root, files);
    await a.mkdir(path(stage));
    staged = true;
    await stageFiles(a, root, stage, files);
    const currentExists = await a.exists(path('canvas-trial'));
    const backup = rollback ? 'canvas-trial-rollback-' + randomUUID() : 'canvas-trial-previous';
    if (!rollback && (await a.exists(path(backup)))) {
      if ((await a.realPath(path(backup))) !== path(backup)) throw new Error('Previous release symlink rejected');
      await a.rename(path(backup), path('canvas-trial-archive-' + randomUUID()));
    }
    if (currentExists) await a.rename(path('canvas-trial'), path(backup));
    try {
      await a.rename(path(stage), path('canvas-trial'));
      staged = false;
    } catch (error) {
      // If recovery also fails, the previous directory remains intact for manual recovery.
      if (currentExists) await a.rename(path(backup), path('canvas-trial'));
      throw error;
    }
  } finally {
    try {
      try {
        if (root && staged) await a.removeTree(trialPath(root, stage));
      } finally {
        if (root && locked) await a.removeTree(trialPath(root, 'canvas-trial-lock'));
      }
    } finally {
      await a.close();
    }
  }
}
export async function publishTrial(adapter: TrialAdapter, localDirectory: string, releaseId: string): Promise<void> {
  await release(adapter, () => localPayload(localDirectory), releaseId, false);
}
export async function rollbackTrial(adapter: TrialAdapter): Promise<void> {
  await release(adapter, async () => new Map(), 'rollback', true);
}
