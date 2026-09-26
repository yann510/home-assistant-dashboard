import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { publishTrial, rollbackTrial, trialPath, type TrialAdapter } from './canvas-release';

const root = '/homeassistant/www';
class Fake implements TrialAdapter {
  files = new Map<string, Buffer>();
  dirs = new Set([root]);
  operations: { kind: string; from: string; to?: string }[] = [];
  fail = '';
  closed = false;
  aliases = true;
  async exists(p: string) {
    return p === '/config/www' || this.dirs.has(p) || this.files.has(p);
  }
  async realPath(p: string) {
    return p === '/config/www' && this.aliases ? root : p;
  }
  async mkdir(p: string) {
    if (this.dirs.has(p)) throw Error('exists');
    this.dirs.add(p);
  }
  async writeFile(p: string, bytes: Buffer) {
    this.operations.push({ kind: 'upload', from: p });
    if (this.fail === 'upload') throw Error('interrupted');
    if (this.fail !== 'missing') this.files.set(p, this.fail === 'hash' ? Buffer.from('corrupt') : bytes);
  }
  async readFile(p: string) {
    const bytes = this.files.get(p);
    if (!bytes) throw Error('missing');
    return bytes;
  }
  async list(p: string) {
    return [...this.dirs, ...this.files.keys()]
      .filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'))
      .map(k => ({ name: k.slice(p.length + 1), directory: this.dirs.has(k), symlink: false }));
  }
  async rename(from: string, to: string) {
    this.operations.push({ kind: 'rename', from, to });
    if (this.fail === 'promotion' && from.includes('-stage-')) throw Error('promotion');
    if (this.dirs.has(to)) throw Error('destination exists');
    for (const k of [...this.dirs])
      if (k === from || k.startsWith(from + '/')) {
        this.dirs.delete(k);
        this.dirs.add(to + k.slice(from.length));
      }
    for (const [k, v] of [...this.files])
      if (k.startsWith(from + '/')) {
        this.files.delete(k);
        this.files.set(to + k.slice(from.length), v);
      }
  }
  async removeTree(p: string) {
    this.operations.push({ kind: 'remove', from: p });
    for (const k of [...this.dirs]) if (k === p || k.startsWith(p + '/')) this.dirs.delete(k);
    for (const k of [...this.files.keys()]) if (k.startsWith(p + '/')) this.files.delete(k);
  }
  async close() {
    this.closed = true;
  }
}
let local: string;
beforeEach(async () => {
  local = await mkdtemp(join(tmpdir(), 'canvas-release-'));
  await mkdir(join(local, 'assets'));
  await writeFile(join(local, 'index.html'), '<script src="/local/canvas-trial/assets/new-12345678.js"></script>');
  await writeFile(join(local, 'assets/new-12345678.js'), 'new');
});
afterEach(async () => {
  await rm(local, { recursive: true, force: true });
});
function existing(a: Fake) {
  a.dirs.add(root + '/canvas-trial');
  a.dirs.add(root + '/canvas-trial/assets');
  a.files.set(root + '/canvas-trial/index.html', Buffer.from('old'));
  a.files.set(root + '/canvas-trial/assets/old-12345678.js', Buffer.from('old asset'));
}
it.each(['upload', 'missing', 'hash'])('leaves current untouched on %s failure and closes', async fail => {
  const a = new Fake();
  existing(a);
  a.fail = fail;
  await expect(publishTrial(a, local, 'test')).rejects.toThrow();
  expect(a.operations.some(o => o.kind === 'rename' && o.from.endsWith('/canvas-trial'))).toBe(false);
  expect(a.closed).toBe(true);
  expect([...a.dirs].some(p => p.includes('-stage-'))).toBe(false);
});
it('restores previous if promotion fails', async () => {
  const a = new Fake();
  existing(a);
  a.fail = 'promotion';
  await expect(publishTrial(a, local, 'test')).rejects.toThrow();
  expect((await a.readFile(root + '/canvas-trial/index.html')).toString()).toBe('old');
});
it('deduplicates roots, retains previous and old assets through promotion and rollback', async () => {
  const a = new Fake();
  existing(a);
  await publishTrial(a, local, 'test');
  expect((await a.readFile(root + '/canvas-trial-previous/index.html')).toString()).toBe('old');
  expect(await a.exists(root + '/canvas-trial/assets/old-12345678.js')).toBe(true);
  await rollbackTrial(a);
  expect((await a.readFile(root + '/canvas-trial/index.html')).toString()).toBe('old');
  expect(await a.exists(root + '/canvas-trial/assets/new-12345678.js')).toBe(true);
});
it('rejects concurrent release without deleting another lock or stage', async () => {
  const a = new Fake();
  a.dirs.add(root + '/canvas-trial-lock');
  a.dirs.add(root + '/canvas-trial-stage-other');
  await expect(publishTrial(a, local, 'test')).rejects.toThrow();
  expect(a.operations).toEqual([]);
  expect(a.closed).toBe(true);
});
it('fails ambiguous roots', async () => {
  const a = new Fake();
  a.aliases = false;
  await expect(publishTrial(a, local, 'test')).rejects.toThrow(/root/);
  expect(a.closed).toBe(true);
});
it.each(['dashboard', 'canvas-trial/../dashboard', 'canvas-trial-../../dashboard', '/canvas-trial', 'canvas-trial/assets/../bad'])(
  'rejects destination %s',
  p => {
    expect(() => trialPath(root, p)).toThrow();
  }
);
it('rejects unsafe release identifiers', async () => {
  const a = new Fake();
  await expect(publishTrial(a, local, '../dashboard')).rejects.toThrow();
  expect(a.operations).toEqual([]);
  expect(a.closed).toBe(true);
});
it('excludes development prototypes from the payload', async () => {
  await mkdir(join(local, 'concepts'));
  await writeFile(join(local, 'concepts/index.html'), 'prototype');
  const a = new Fake();
  await publishTrial(a, local, 'test');
  expect([...a.files.keys()].some(p => p.includes('/concepts/'))).toBe(false);
});
it('closes even when cleanup fails', async () => {
  const a = new Fake();
  a.fail = 'upload';
  a.removeTree = async () => {
    throw Error('cleanup unavailable');
  };
  await expect(publishTrial(a, local, 'test')).rejects.toThrow();
  expect(a.closed).toBe(true);
});
it('rejects a wrong build base before uploading', async () => {
  await writeFile(join(local, 'index.html'), '<script src="/local/dashboard/assets/new.js"></script>');
  const a = new Fake();
  await expect(publishTrial(a, local, 'test')).rejects.toThrow(/base/);
  expect(a.operations.some(o => o.kind === 'upload')).toBe(false);
});
it('rejects a symlink current release without renaming it', async () => {
  const a = new Fake();
  existing(a);
  const realPath = a.realPath.bind(a);
  a.realPath = async p => (p === root + '/canvas-trial' ? root + '/dashboard' : realPath(p));
  await expect(publishTrial(a, local, 'test')).rejects.toThrow(/symlink/);
  expect(a.operations.some(o => o.kind === 'rename')).toBe(false);
});
it('retains a prior previous release in an archive on the next publish', async () => {
  const a = new Fake();
  existing(a);
  await publishTrial(a, local, 'one');
  await publishTrial(a, local, 'two');
  expect([...a.files].some(([p, b]) => p.includes('canvas-trial-archive-') && p.endsWith('/index.html') && b.toString() === 'old')).toBe(
    true
  );
});
it('restores current on a failed rollback promotion', async () => {
  const a = new Fake();
  existing(a);
  await publishTrial(a, local, 'one');
  a.fail = 'promotion';
  await expect(rollbackTrial(a)).rejects.toThrow();
  expect((await a.readFile(root + '/canvas-trial/index.html')).toString()).toContain('new-12345678.js');
});
it('rejects asset collisions without changing the current release', async () => {
  const a = new Fake();
  existing(a);
  a.files.set(root + '/canvas-trial/assets/new-12345678.js', Buffer.from('different'));
  await expect(publishTrial(a, local, 'one')).rejects.toThrow(/collision/);
  expect(a.operations.some(o => o.kind === 'rename')).toBe(false);
});

it('publishes Canvas to the canonical dashboard with isolated backups and rollback', async () => {
  const a = new Fake();
  existing(a);
  a.dirs.add(root + '/dashboard');
  a.dirs.add(root + '/dashboard/assets');
  a.files.set(root + '/dashboard/index.html', Buffer.from('classic'));
  a.files.set(root + '/dashboard/assets/classic.js', Buffer.from('classic asset'));
  await writeFile(join(local, 'index.html'), '<script src="/local/dashboard/assets/new-12345678.js"></script>');
  await publishTrial(a, local, 'canvas-only', 'dashboard');
  expect((await a.readFile(root + '/dashboard-previous/index.html')).toString()).toBe('classic');
  expect((await a.readFile(root + '/dashboard/index.html')).toString()).toContain('/local/dashboard/');
  expect((await a.readFile(root + '/canvas-trial/index.html')).toString()).toBe('old');
  expect((await a.readFile(root + '/dashboard/assets/classic.js')).toString()).toBe('classic asset');
  await rollbackTrial(a, 'dashboard');
  expect((await a.readFile(root + '/dashboard/index.html')).toString()).toBe('classic');
  expect((await a.readFile(root + '/dashboard/assets/new-12345678.js')).toString()).toBe('new');
});

it.each(['upload', 'hash', 'promotion'])('preserves the canonical dashboard after %s failure', async fail => {
  const a = new Fake();
  a.dirs.add(root + '/dashboard');
  a.files.set(root + '/dashboard/index.html', Buffer.from('classic'));
  await writeFile(join(local, 'index.html'), '<script src="/local/dashboard/assets/new-12345678.js"></script>');
  a.fail = fail;
  await expect(publishTrial(a, local, 'canvas-only', 'dashboard')).rejects.toThrow();
  expect((await a.readFile(root + '/dashboard/index.html')).toString()).toBe('classic');
  expect(a.closed).toBe(true);
  expect(a.dirs.has(root + '/dashboard-lock')).toBe(false);
});

it('requires explicit canonical target and matching build base', async () => {
  expect(() => trialPath(root, 'dashboard')).toThrow();
  expect(() => trialPath(root, 'canvas-trial', 'dashboard')).toThrow();
  expect(() => trialPath(root, 'dashboard/../other', 'dashboard')).toThrow();
  expect(() => trialPath(root, 'dashboard', 'other' as 'dashboard')).toThrow();
  const a = new Fake();
  await expect(publishTrial(a, local, 'wrong-base', 'dashboard')).rejects.toThrow('Build must use dashboard base');
  expect(a.operations.some(o => o.kind === 'rename')).toBe(false);
});
