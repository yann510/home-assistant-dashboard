import { ThemeProvider } from '@hakit/components';
import { HassConnect } from '@hakit/core';
import { DashboardViews } from './DashboardViews';

function App() {
  return (
    <>
      <HassConnect hassUrl={import.meta.env.VITE_HA_URL}>
        <ThemeProvider />
        <DashboardViews />
      </HassConnect>
    </>
  );
}

export default App;
