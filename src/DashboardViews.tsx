import Dashboard from './Dashboard';
import { QuietHome } from './QuietHome';
import './quiet-home.css';

export function DashboardViews() {
  const url = new URL(window.location.href);
  const quiet = url.searchParams.get('view') === 'quiet';
  const href = (view: 'classic' | 'quiet') => {
    const target = new URL(url);
    if (view === 'quiet') target.searchParams.set('view', 'quiet');
    else target.searchParams.delete('view');
    target.hash = '';
    return target.pathname + target.search;
  };
  return (
    <>
      <nav className='dashboard-view-switch' aria-label='Dashboard view'>
        <a href={href('classic')} aria-current={!quiet ? 'page' : undefined}>
          Classic
        </a>
        <a href={href('quiet')} aria-current={quiet ? 'page' : undefined}>
          Quiet Home
        </a>
        <span>Proof of concept</span>
      </nav>
      {quiet ? <QuietHome /> : <Dashboard />}
    </>
  );
}
