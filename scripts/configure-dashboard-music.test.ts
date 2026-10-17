import { describe, expect, it, vi } from 'vitest';

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
        return [{ full_name: 'thlucas1/homeassistantcomponent_spotifyplus', id: '763230666', installed: true, custom: true }];
      mutations.push(payload);
      return {};
    },
  };
  let reads = 0;
  const ssh = { close() {}, python: async () => (++reads === 1 ? { hacsRepository: null } : true) };
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
