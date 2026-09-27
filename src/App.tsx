import { ThemeProvider } from '@hakit/components';
import { HassConnect } from '@hakit/core';
import { DashboardViews } from './DashboardViews';

function App() {
  // Published dashboards live under HA /local on either its LAN or remote origin.
  const hassUrl = import.meta.env.PROD ? window.location.origin : import.meta.env.VITE_HA_URL;
  return (
    <>
      <HassConnect hassUrl={hassUrl}>
        <ThemeProvider />
        <DashboardViews />
      </HassConnect>
    </>
  );
}

export default App;
