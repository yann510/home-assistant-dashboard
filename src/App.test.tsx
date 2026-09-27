// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://remote.example/local/dashboard/index.html"}
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';

const auth = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock('@hakit/core', () => ({
  HassConnect: (props: Record<string, unknown> & { children: React.ReactNode }) => {
    auth.props = props;
    return <>{props.children}</>;
  },
}));
vi.mock('@hakit/components', () => ({ ThemeProvider: () => null }));
vi.mock('./DashboardViews', () => ({ DashboardViews: () => <main>Dashboard views</main> }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

it('uses the supported Home Assistant login without supplying a bundled token', () => {
  render(<App />);
  expect(screen.getByText('Dashboard views')).toBeTruthy();
  expect(auth.props).not.toHaveProperty('hassToken');
});

it.each(['/local/dashboard/index.html', '/local/canvas-trial/index.html'])(
  'authenticates against the serving Home Assistant origin at %s',
  path => {
    window.history.replaceState(null, '', path);
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_HA_URL', 'http://homeassistant.local:8123');
    render(<App />);
    expect(auth.props.hassUrl).toBe('https://remote.example');
    expect(auth.props).not.toHaveProperty('hassToken');
  }
);

it('retains the configured Home Assistant URL for the development server', () => {
  vi.stubEnv('PROD', false);
  vi.stubEnv('VITE_HA_URL', 'http://homeassistant.local:8123');
  render(<App />);
  expect(auth.props.hassUrl).toBe('http://homeassistant.local:8123');
});
