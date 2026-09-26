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
export type ReleaseTarget = 'canvas-trial' | 'dashboard';
const roots = ['/config/www', '/homeassistant/www'];
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export function trialPath(root: string, relative: string, target: ReleaseTarget = 'canvas-trial'): string {
  const parts = relative.split('/');
  if (
    !roots.includes(root) ||
    !['canvas-trial', 'dashboard'].includes(target) ||
    !new RegExp(`^${target}(?:-[a-zA-Z0-9-]+)?$`).test(parts[0]) ||
    parts.some(p => !/^[a-zA-Z0-9_.-]+$/.test(p) || p === '.' || p === '..' || (target === 'canvas-trial' && p === 'dashboard'))
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
async function remoteFiles(a: TrialAdapter, root: string, relative: string, target: ReleaseTarget): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  async function walk(rel: string, prefix: string) {
    const path = trialPath(root, rel, target);
    if ((await a.realPath(path)) !== path) throw new Error('Remote trial symlink rejected');
    for (const entry of await a.list(path)) {
      if (entry.name.includes('/') || entry.symlink) throw new Error('Unsafe remote entry');
      const child = trialPath(root, rel + '/' + entry.name, target);
      if (entry.directory) await walk(rel + '/' + entry.name, prefix + entry.name + '/');
      else result.set(prefix + entry.name, await a.readFile(child));
    }
  }
  await walk(relative, '');
  return result;
}
export async function localPayload(directory: string, target: ReleaseTarget = 'canvas-trial'): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  async function walk(dir: string, prefix: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (!prefix && entry.name !== 'index.html' && entry.name !== 'assets') continue;
      trialPath(roots[0], target + '/' + relative, target);
      if (entry.isSymbolicLink()) throw new Error('Local symlink rejected');
      if (entry.isDirectory()) await walk(join(dir, entry.name), relative + '/');
      else if (entry.isFile()) result.set(relative, await readFile(join(dir, entry.name)));
      else throw new Error('Unsupported local file');
    }
  }
  await walk(directory, '');
  if (!result.has('index.html') || ![...result.keys()].some(p => /^assets\/.+\.js$/.test(p))) throw new Error('Incomplete trial build');
  if (!result.get('index.html')!.toString().includes(`/local/${target}/`)) throw new Error(`Build must use ${target} base`);
  return result;
}
async function retainAssets(a: TrialAdapter, root: string, files: Map<string, Buffer>, target: ReleaseTarget) {
  if (!(await a.exists(trialPath(root, target, target)))) return;
  for (const [name, bytes] of await remoteFiles(a, root, target, target)) {
    if (!name.startsWith('assets/')) continue;
    if (files.has(name) && hash(files.get(name)!) !== hash(bytes)) throw new Error('Asset name collision');
    files.set(name, bytes);
  }
}
async function stageFiles(a: TrialAdapter, root: string, stage: string, files: Map<string, Buffer>, target: ReleaseTarget) {
  const directories = new Set<string>([stage]);
  for (const [name, bytes] of files) {
    const relative = stage + '/' + name;
    const segments = posix.dirname(relative).split('/');
    for (let i = 1; i <= segments.length; i++) {
      const directory = segments.slice(0, i).join('/');
      if (!directories.has(directory)) {
        await a.mkdir(trialPath(root, directory, target));
        directories.add(directory);
      }
    }
    await a.writeFile(trialPath(root, relative, target), bytes);
  }
  // The locally computed manifest covers the exact staged bytes, including retained assets.
  const manifest = Buffer.from(JSON.stringify(Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)])), null, 2));
  await a.writeFile(trialPath(root, stage + '/release-manifest.json', target), manifest);
  for (const [name, bytes] of [...files, ['release-manifest.json', manifest] as const]) {
    if (hash(await a.readFile(trialPath(root, stage + '/' + name, target))) !== hash(bytes))
      throw new Error('Remote hash verification failed');
  }
}
async function release(
  a: TrialAdapter,
  payload: () => Promise<Map<string, Buffer>>,
  releaseId: string,
  rollback: boolean,
  target: ReleaseTarget
) {
  let root: string | undefined;
  let locked = false;
  let staged = false;
  const stage = target + '-stage-' + randomUUID();
  try {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(releaseId)) throw new Error('Invalid release ID');
    root = await resolveRoot(a);
    const path = (p: string) => trialPath(root!, p, target);
    await a.mkdir(path(target + '-lock')); // Non-recursive mkdir provides cross-process exclusion.
    locked = true;
    const files = rollback ? await remoteFiles(a, root, target + '-previous', target) : await payload();
    files.delete('release-manifest.json');
    if (!rollback) files.set('release-info.json', Buffer.from(JSON.stringify({ releaseId })));
    if (!files.has('index.html')) throw new Error('Missing previous release');
    await retainAssets(a, root, files, target);
    await a.mkdir(path(stage));
    staged = true;
    await stageFiles(a, root, stage, files, target);
    const currentExists = await a.exists(path(target));
    const backup = rollback ? target + '-rollback-' + randomUUID() : target + '-previous';
    if (!rollback && (await a.exists(path(backup)))) {
      if ((await a.realPath(path(backup))) !== path(backup)) throw new Error('Previous release symlink rejected');
      await a.rename(path(backup), path(target + '-archive-' + randomUUID()));
    }
    if (currentExists) await a.rename(path(target), path(backup));
    try {
      await a.rename(path(stage), path(target));
      staged = false;
    } catch (error) {
      // If recovery also fails, the previous directory remains intact for manual recovery.
      if (currentExists) await a.rename(path(backup), path(target));
      throw error;
    }
  } finally {
    try {
      try {
        if (root && staged) await a.removeTree(trialPath(root, stage, target));
      } finally {
        if (root && locked) await a.removeTree(trialPath(root, target + '-lock', target));
      }
    } finally {
      await a.close();
    }
  }
}
export async function publishTrial(
  adapter: TrialAdapter,
  localDirectory: string,
  releaseId: string,
  target: ReleaseTarget = 'canvas-trial'
): Promise<void> {
  await release(adapter, () => localPayload(localDirectory, target), releaseId, false, target);
}
export async function rollbackTrial(adapter: TrialAdapter, target: ReleaseTarget = 'canvas-trial'): Promise<void> {
  await release(adapter, async () => new Map(), 'rollback', true, target);
}
