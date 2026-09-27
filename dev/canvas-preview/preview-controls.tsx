import { createRoot } from 'react-dom/client';
import './preview-controls.css';

const scenarios = [
  ['everyday', 'Everyday'],
  ['busy', 'Active appliances'],
  ['failure', 'Command failures'],
  ['mood-recovery', 'Mood recovery'],
  ['offline', 'Disconnected'],
] as const;

export function PreviewControls() {
  const params = new URLSearchParams(location.search);
  const scene = params.get('scene') ?? 'everyday';
  function selectScene(value: string) {
    const url = new URL(location.href);
    url.searchParams.set('scene', value);
    // Explicit scenario selection leaves previous fault-injection flags behind.
    url.searchParams.delete('unconfirmed');
    url.searchParams.delete('fail');
    url.searchParams.delete('pulse');
    location.assign(url.href);
  }
  return (
    <details className='preview-controls'>
      <summary>Preview tools</summary>
      <div className='preview-controls__panel'>
        <strong>Try the dashboard</strong>
        <p>Simulated devices. These controls do not affect your home.</p>
        <label htmlFor='preview-scene'>Scenario</label>
        <select id='preview-scene' value={scene} onChange={event => selectScene(event.target.value)}>
          {!scenarios.some(([value]) => value === scene) && <option value={scene}>{scene}</option>}
          {scenarios.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type='button' onClick={() => location.reload()}>Reset this preview</button>
      </div>
    </details>
  );
}

const root = document.createElement('div');
root.id = 'preview-tools';
document.body.append(root);
createRoot(root).render(<PreviewControls />);
