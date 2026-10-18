import { describe, expect, it, vi } from 'vitest';

const installer = () => import('./configure-spotify-relay.mjs');
const ready = () => ({ arch: 'aarch64', supervisor: true, sourceExists: false, installed: false });

describe('relay setup is explicit and scoped', () => {
  it('inspects without mutation and returns no raw add-on configuration', async () => {
    const { configureRelay } = await installer();
    const remote = { inspect: vi.fn(async () => ready()), install: vi.fn(), start: vi.fn(), rollback: vi.fn() };
    expect(await configureRelay({}, remote)).toEqual({ mode: 'inspect', ...ready() });
    expect(remote.install).not.toHaveBeenCalled();
    expect(remote.start).not.toHaveBeenCalled();
    expect(remote.rollback).not.toHaveBeenCalled();
  });
  it('refuses incompatible or pre-existing add-ons before mutation', async () => {
    const { configureRelay } = await installer();
    for (const report of [{ ...ready(), arch: 'amd64' }, { ...ready(), installed: true }, { ...ready(), sourceExists: true }]) {
      const remote = { inspect: async () => report, install: vi.fn() };
      await expect(configureRelay({ install: true }, remote)).rejects.toThrow(/compatible|existing/i);
      expect(remote.install).not.toHaveBeenCalled();
    }
  });
  it('separates installation, start, and rollback', async () => {
    const { configureRelay } = await installer();
    const remote = { inspect: async () => ready(), install: vi.fn(async () => ({ backup: '/protected/relay' })), start: vi.fn(), rollback: vi.fn() };
    expect(await configureRelay({ install: true }, remote)).toMatchObject({ mode: 'install', backup: '/protected/relay', started: false });
    expect(remote.start).not.toHaveBeenCalled();
    await configureRelay({ start: '/protected/relay' }, remote);
    expect(remote.start).toHaveBeenCalledWith('/protected/relay');
    await configureRelay({ rollback: '/protected/relay' }, remote);
    expect(remote.rollback).toHaveBeenCalledWith('/protected/relay');
    await expect(configureRelay({ install: true, rollback: '/protected/relay' }, remote)).rejects.toThrow(/exclusive/i);
  });
});
