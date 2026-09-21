import { ThemeProvider } from '@hakit/components';
import { HassConnect } from '@hakit/core';
import { DashboardViews } from './DashboardViews';

function App() {
  return (
    <>
      <HassConnect hassUrl={import.meta.env.VITE_HA_URL} hassToken={import.meta.env.VITE_HA_TOKEN}>
        <ThemeProvider />
        <DashboardViews />
      </HassConnect>
    </>
  );
}

export default App;
