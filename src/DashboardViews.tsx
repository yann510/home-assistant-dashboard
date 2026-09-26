import { useEffect } from 'react';
import { CanvasDashboard } from './canvas/CanvasDashboard';
import type { QuietPulsePresentation } from './canvas/CanvasPulse';

// Legacy view query parameters remain valid bookmarks for the single dashboard.
export function DashboardViews({ canvasQuietPulse }: { canvasQuietPulse?: QuietPulsePresentation } = {}) {
  useEffect(() => {
    const root = document.getElementById('root');
    root?.classList.add('canvas-view');
    return () => root?.classList.remove('canvas-view');
  }, []);
  return <CanvasDashboard quietPulse={canvasQuietPulse} />;
}
