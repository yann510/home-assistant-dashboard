import { ThemeProvider } from '@hakit/components';
import { HassConnect } from '@hakit/core';
import Dashboard from './Dashboard';

function App() {
  return (
    <>
      <HassConnect hassUrl={import.meta.env.VITE_HA_URL} options={{ allowNonSecure: true }}>
        <ThemeProvider includeThemeControls={false} />
        <Dashboard />
      </HassConnect>
    </>
  );
}

export default App;
