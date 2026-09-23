// @vitest-environment jsdom
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

afterEach(cleanup);

it('uses the supported Home Assistant login without supplying a bundled token', () => {
  render(<App />);
  expect(screen.getByText('Dashboard views')).toBeTruthy();
  expect(auth.props).not.toHaveProperty('hassToken');
});
