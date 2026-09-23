import { useEffect } from 'react';
import Dashboard from './Dashboard';
import { QuietHome } from './QuietHome';
import { CanvasDashboard } from './canvas/CanvasDashboard';
import './quiet-home.css';

export function DashboardViews() {
  const url = new URL(window.location.href);
  const view = url.searchParams.get('view');
  const quiet = view === 'quiet';
  const canvas = view === 'canvas';
  useEffect(() => {
    const root = document.getElementById('root');
    if (canvas) root?.classList.add('canvas-view');
    return () => root?.classList.remove('canvas-view');
  }, [canvas]);
  const href = (view: 'classic' | 'quiet' | 'canvas') => {
    const target = new URL(url);
    if (view !== 'classic') target.searchParams.set('view', view);
    else target.searchParams.delete('view');
    target.hash = '';
    return target.pathname + target.search;
  };
  return (
    <>
      <nav className='dashboard-view-switch' aria-label='Dashboard view'>
        <a href={href('classic')} aria-current={!quiet && !canvas ? 'page' : undefined}>
          Classic
        </a>
        <a href={href('quiet')} aria-current={quiet ? 'page' : undefined}>
          Quiet Home
        </a>
        <a href={href('canvas')} aria-current={canvas ? 'page' : undefined}>
          Canvas
        </a>
      </nav>
      {quiet ? <QuietHome /> : canvas ? <CanvasDashboard /> : <Dashboard />}
    </>
  );
}
