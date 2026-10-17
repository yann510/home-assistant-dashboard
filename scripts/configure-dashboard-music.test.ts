import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Missing guards would allow unverified/local-queue playback or mutate a dry run.
async function installer() {
  return import('./configure-dashboard-music.mjs');
}
const services = {
  get_playlist_favorites: { fields: { entity_id: {}, limit: {}, offset: {}, sort_result: {} }, response: { optional: false } },
  get_spotify_connect_devices: { fields: { entity_id: {}, refresh: {} }, response: { optional: false } },
  get_player_playback_state: { fields: { entity_id: {} }, response: { optional: false } },
  player_media_play_context: { fields: { entity_id: {}, context_uri: {}, device_id: {} } },
  check_track_favorites: { fields: { entity_id: {}, ids: {} }, response: { optional: false } },
  save_track_favorites: { fields: { entity_id: {}, ids: {} } },
  remove_track_favorites: { fields: { entity_id: {}, ids: {} } },
};
const ready = () => ({
  hasAccount: true,
  desktopAuthorized: true,
  haVersion: '2026.9.3',
  pythonVersion: '3.14.7',
  services,
  installedVersion: '1.0.224',
  scopes: [
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
    'user-library-modify',
    'user-modify-playback-state',
    'user-read-playback-state',
    'user-read-currently-playing',
    'user-read-private',
  ],
  accountVerified: true,
});

describe('SpotifyPlus feasibility preflight', () => {
  it('requires Desktop authorization even when an account exists', async () => {
    const { validatePreflight } = await installer();
    expect(() => validatePreflight({ hasAccount: true, desktopAuthorized: false })).toThrow(/authorization.required/i);
  });
  it.each(['3.10.9', '', undefined])('rejects incompatible or missing Python %s', async pythonVersion => {
    const { validatePreflight } = await installer();
    expect(() => validatePreflight({ ...ready(), pythonVersion })).toThrow(/runtime/i);
  });
  it('rejects a missing service or response schema', async () => {
    const { validatePreflight } = await installer();
    expect(() => validatePreflight({ ...ready(), services: {} })).toThrow(/schema/i);
    expect(() =>
      validatePreflight({ ...ready(), services: { ...services, check_track_favorites: { fields: { entity_id: {}, ids: {} } } } })
    ).toThrow(/response/i);
  });
  it('requires the pinned release, verified account and granted library scopes', async () => {
    const { validatePreflight } = await installer();
    expect(() => validatePreflight({ ...ready(), installedVersion: '1.0.193' })).toThrow(/version/i);
    expect(() => validatePreflight({ ...ready(), accountVerified: false })).toThrow(/account/i);
    expect(() => validatePreflight({ ...ready(), scopes: [] })).toThrow(/scope/i);
    expect(validatePreflight(ready())).toEqual({ ready: true });
  });
});

describe('installer modes with mocked remote operations', () => {
  it('defaults to inspection and never mutates even when authorization is absent', async () => {
    const { configureMusic } = await installer();
    const remote = {
      inspect: vi.fn(async () => ({ haVersion: '2026.9.3', pythonVersion: '3.14.7', hasAccount: false })),
      backup: vi.fn(),
      install: vi.fn(),
      rollback: vi.fn(),
    };
    const result = await configureMusic({}, remote);
    expect(result.mode).toBe('inspect');
    expect(result.ready).toBe(false);
    expect(remote.backup).not.toHaveBeenCalled();
    expect(remote.install).not.toHaveBeenCalled();
    expect(remote.rollback).not.toHaveBeenCalled();
  });
  it('backs up before installation and stops if backup fails', async () => {
    const { configureMusic } = await installer();
    const calls: string[] = [];
    const remote = {
      inspect: async () => ready(),
      backup: async () => {
        calls.push('backup');
        return '/protected/task-backup';
      },
      install: async () => {
        calls.push('install');
      },
      rollback: vi.fn(),
    };
    const result = await configureMusic({ install: true }, remote);
    expect(calls).toEqual(['backup', 'install']);
    expect(result.backup).toBe('/protected/task-backup');
    remote.backup = async () => {
      throw new Error('Cannot back up');
    };
    calls.length = 0;
    await expect(configureMusic({ install: true }, remote)).rejects.toThrow('Cannot back up');
    expect(calls).toEqual([]);
  });
  it('does not install on an incompatible runtime', async () => {
    const { configureMusic } = await installer();
    const remote = { inspect: async () => ({ ...ready(), pythonVersion: '3.10.0' }), backup: vi.fn(), install: vi.fn(), rollback: vi.fn() };
    await expect(configureMusic({ install: true }, remote)).rejects.toThrow(/runtime/i);
    expect(remote.backup).not.toHaveBeenCalled();
  });
  it('rollback only passes its specific backup and does not install', async () => {
    const { configureMusic } = await installer();
    const remote = { inspect: vi.fn(), backup: vi.fn(), install: vi.fn(), rollback: vi.fn(async () => undefined) };
    expect(await configureMusic({ rollback: '/protected/task-backup' }, remote)).toEqual({ mode: 'rollback', restored: true });
    expect(remote.rollback).toHaveBeenCalledWith('/protected/task-backup');
    expect(remote.install).not.toHaveBeenCalled();
    await expect(configureMusic({ install: true, rollback: '/protected/task-backup' }, remote)).rejects.toThrow(/exclusive/i);
  });
});

it('reads HA Core Python from the streamed system-health initial event, not the SSH addon', async () => {
  class FakeSocket extends EventTarget {
    constructor() {
      super();
      queueMicrotask(() => this.receive({ type: 'auth_required' }));
    }
    receive(data: object) {
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
    send(value: string) {
      const data = JSON.parse(value);
      queueMicrotask(() => {
        if (data.type === 'auth') this.receive({ type: 'auth_ok' });
        else {
          this.receive({ id: data.id, type: 'result', success: true, result: null });
          this.receive({
            id: data.id,
            type: 'event',
            event: { type: 'initial', data: { homeassistant: { info: { python_version: '3.14.6' } } } },
          });
        }
      });
    }
    close() {
      this.dispatchEvent(new Event('close'));
    }
  }
  vi.stubGlobal('WebSocket', FakeSocket);
  const { openHA } = await installer();
  const client = await openHA({ VITE_HA_URL: 'http://ha.test:8123', VITE_HA_TOKEN: 'test-only' });
  try {
    expect(await client.request({ type: 'system_health/info' })).toEqual({ homeassistant: { info: { python_version: '3.14.6' } } });
  } finally {
    client.close();
    vi.unstubAllGlobals();
  }
});

it('accepts the exact pinned HACS release when its manifest uses the v prefix', async () => {
  const { validatePreflight } = await installer();
  expect(validatePreflight({ ...ready(), installedVersion: 'v1.0.224' })).toEqual({ ready: true });
});

it('rejects missing playback scope and an unsupported HA runtime', async () => {
  const { validatePreflight } = await installer();
  expect(() => validatePreflight({ ...ready(), scopes: ready().scopes.filter(scope => scope !== 'user-modify-playback-state') })).toThrow(
    /scope/i
  );
  expect(() => validatePreflight({ ...ready(), haVersion: '2023.7.9' })).toThrow(/runtime/i);
});

it('removes only its newly added HACS repository registration on rollback', async () => {
  const { createRemote } = await installer();
  const mutations: object[] = [];
  const ha = {
    close() {},
    request: async (payload: { type: string }) => {
      if (payload.type === 'config_entries/get') return [];
      if (payload.type === 'hacs/repositories/list')
        return [
          {
            full_name: 'thlucas1/homeassistantcomponent_spotifyplus',
            id: '763230666',
            installed: true,
            installed_version: 'v1.0.224',
            custom: true,
          },
        ];
      mutations.push(payload);
      return {};
    },
  };
  let reads = 0;
  const ssh = {
    close() {},
    python: async () =>
      ++reads === 1 ? { prior: { hacsRepository: null }, installed: taskInstallation } : reads === 2 ? installedArtifact : true,
  };
  const remote = await createRemote({}, { ha: async () => ha, ssh: async () => ssh });
  try {
    await remote.rollback('/homeassistant/backups.local/dashboard-music-20261017T170231376043Z');
    expect(mutations).toEqual([
      { type: 'hacs/repository/remove', repository: '763230666' },
      { type: 'hacs/repositories/remove', repository: '763230666' },
    ]);
  } finally {
    remote.close();
  }
});

const installedArtifact = { exists: true, version: 'v1.0.224', fingerprint: 'a'.repeat(64) };
const taskInstallation = { kind: 'dashboard-music-installed-v1', artifact: installedArtifact };
const backupPath = '/homeassistant/backups.local/dashboard-music-20261017T170231376043Z';

async function rollbackFixture(
  currentArtifact: object,
  priorRepository: object | null = null,
  installation: object | null = taskInstallation
) {
  const { createRemote } = await installer();
  const mutations: object[] = [];
  const responses = [{ prior: { hacsRepository: priorRepository }, installed: installation }, currentArtifact, true];
  const python = vi.fn(async () => responses.shift());
  const ha = {
    close() {},
    request: async (payload: { type: string }) => {
      if (payload.type === 'config_entries/get') return [];
      if (payload.type === 'hacs/repositories/list')
        return [
          {
            full_name: 'thlucas1/homeassistantcomponent_spotifyplus',
            id: '763230666',
            installed: true,
            installed_version: 'v1.0.224',
            custom: true,
          },
        ];
      mutations.push(payload);
      return {};
    },
  };
  const remote = await createRemote({}, { ha: async () => ha, ssh: async () => ({ close() {}, python }) });
  return { remote, mutations, python };
}

it('refuses rollback over a newer installation and preserves its HACS registration', async () => {
  const { remote, mutations, python } = await rollbackFixture({ ...installedArtifact, version: 'v1.0.225' });
  try {
    await expect(remote.rollback(backupPath)).rejects.toThrow(/ownership|changed|owned/i);
    expect(mutations).toEqual([]);
    expect(python.mock.calls.length).toBeLessThanOrEqual(2);
  } finally {
    remote.close();
  }
});

it('refuses rollback over same-version modified files instead of restoring an older baseline', async () => {
  const { remote, mutations, python } = await rollbackFixture(
    { ...installedArtifact, fingerprint: 'b'.repeat(64) },
    { installed: true, installedVersion: 'v1.0.223' }
  );
  try {
    await expect(remote.rollback(backupPath)).rejects.toThrow(/ownership|changed|owned/i);
    expect(mutations).toEqual([]);
    expect(python.mock.calls.length).toBeLessThanOrEqual(2);
  } finally {
    remote.close();
  }
});

it('refuses rollback when current files disappeared or the backup lacks installation ownership', async () => {
  for (const [current, installation] of [
    [{ exists: false, version: null, fingerprint: null }, taskInstallation],
    [installedArtifact, null],
  ]) {
    const { remote, mutations, python } = await rollbackFixture(current, null, installation);
    try {
      await expect(remote.rollback(backupPath)).rejects.toThrow(/ownership|changed|owned/i);
      expect(mutations).toEqual([]);
      expect(python.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      remote.close();
    }
  }
});

it('allows rollback when the recorded installed artifact is unchanged', async () => {
  const { remote, mutations } = await rollbackFixture(installedArtifact);
  try {
    await remote.rollback(backupPath);
    expect(mutations).toEqual([
      { type: 'hacs/repository/remove', repository: '763230666' },
      { type: 'hacs/repositories/remove', repository: '763230666' },
    ]);
  } finally {
    remote.close();
  }
});

it('records the task-installed fingerprint alongside its backup after HACS download', async () => {
  const { createRemote } = await installer();
  const calls: string[] = [];
  const python = vi.fn(async () => {
    calls.push('python');
    return calls.filter(x => x === 'python').length === 1 ? installedArtifact : true;
  });
  const ha = {
    close() {},
    request: async (payload: { type: string }) => {
      if (payload.type === 'hacs/repositories/list')
        return [
          {
            full_name: 'thlucas1/homeassistantcomponent_spotifyplus',
            id: '763230666',
            installed: true,
            installed_version: 'v1.0.224',
            custom: true,
          },
        ];
      calls.push(payload.type);
      return {};
    },
  };
  const remote = await createRemote({}, { ha: async () => ha, ssh: async () => ({ close() {}, python }) });
  try {
    expect(await remote.install({}, backupPath)).toEqual(taskInstallation);
    expect(calls).toEqual(['hacs/repositories/add', 'hacs/repository/download', 'python', 'python']);
  } finally {
    remote.close();
  }
});

it('records real file content and rejects an edited file while tolerating generated Python cache', async () => {
  const { createRemote } = await installer();
  const root = await mkdtemp(join(tmpdir(), 'dashboard-music-ownership-'));
  const component = join(root, 'custom_components/spotifyplus');
  const mutations: string[] = [];
  let configured = false;
  // This connector emulates the remote Python interpreter in a disposable local filesystem.
  // HACS and all external connections remain mocked; actual hashing/storage code executes.
  const python = async (source: string) => {
    const output = execFileSync('python3', ['-c', source.replaceAll('/homeassistant', root)], { encoding: 'utf8' });
    const value = JSON.parse(output);
    return typeof value === 'string' ? value.replace(root, '/homeassistant') : value;
  };
  const ha = {
    close() {},
    request: async (payload: { type: string }) => {
      if (payload.type === 'hacs/repositories/list')
        return [
          {
            full_name: 'thlucas1/homeassistantcomponent_spotifyplus',
            id: '763230666',
            installed: true,
            installed_version: 'v1.0.224',
            custom: true,
          },
        ];
      if (payload.type === 'config_entries/get') return configured ? [{ domain: 'spotifyplus' }] : [];
      mutations.push(payload.type);
      if (payload.type === 'hacs/repository/download') {
        await mkdir(component, { recursive: true });
        await writeFile(join(component, 'manifest.json'), JSON.stringify({ version: 'v1.0.224' }));
        await writeFile(join(component, 'media_player.py'), 'original source');
      }
      return {};
    },
  };
  const remote = await createRemote({}, { ha: async () => ha, ssh: async () => ({ close() {}, python }) });
  try {
    const backup = await remote.backup({ hacsRepository: null });
    const installed = await remote.install({}, backup);
    const recorded = JSON.parse(await readFile(join(root, backup.slice('/homeassistant/'.length), 'installed-artifact.json'), 'utf8'));
    expect(recorded).toEqual(installed);
    expect(recorded.artifact.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    mutations.length = 0;
    configured = true;
    await mkdir(join(component, '__pycache__'));
    await writeFile(join(component, '__pycache__/media_player.cpython-314.pyc'), 'generated bytecode');
    await expect(remote.rollback(backup)).rejects.toThrow(/Remove only the task-created/);
    await writeFile(join(component, 'media_player.py'), 'newer custom source');
    await expect(remote.rollback(backup)).rejects.toThrow(/files changed/i);
    expect(mutations).toEqual([]);
    expect(await readFile(join(component, 'media_player.py'), 'utf8')).toBe('newer custom source');
  } finally {
    remote.close();
    await rm(root, { recursive: true, force: true });
  }
});
