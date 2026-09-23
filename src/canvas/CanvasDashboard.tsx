import { useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { CanvasDialog } from './CanvasDialog';
import { canvasRouteTitle, type CanvasRoute } from './routes';
import { CanvasLights, CanvasAllLights } from './CanvasLights';
import { CanvasLightDetails } from './CanvasLightDetails';
import { CanvasLightsProvider } from './useCanvasLights';
import { CanvasModes } from './CanvasModes';
import { CanvasBlinds } from './CanvasBlinds';
import './canvas.css';

const directory: { label: string; route: CanvasRoute }[] = [
  { label: 'All lights', route: { kind: 'all-lights' } },
  { label: 'Player', route: { kind: 'player' } },
  { label: 'Speakers', route: { kind: 'speakers' } },
  { label: 'Weather', route: { kind: 'weather' } },
  { label: 'House Mood', route: { kind: 'moods' } },
  { label: 'Thermostats', route: { kind: 'thermostats' } },
  { label: 'Appliances', route: { kind: 'appliances' } },
  { label: 'Roomba', route: { kind: 'vacuum' } },
];

function MoodArt() {
  return (
    <svg viewBox='0 0 320 260' fill='none' stroke='currentColor' strokeWidth='18' aria-hidden='true'>
      <path d='M0 170C70 170 80 20 160 20S240 170 320 170' />
      <path d='M0 205C70 205 80 55 160 55S240 205 320 205' />
      <path d='M0 240C70 240 80 90 160 90S240 240 320 240' />
    </svg>
  );
}

function CanvasDashboardContent(): React.JSX.Element {
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const [route, setRoute] = useState<CanvasRoute>({ kind: 'overview' });
  const [routeHistory, setRouteHistory] = useState<CanvasRoute[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (route.kind === 'overview' && returnFocus.current) {
      if (returnFocus.current.isConnected) returnFocus.current.focus({ preventScroll: true });
      returnFocus.current = null;
    }
  }, [route]);

  function open(next: CanvasRoute, trigger?: HTMLElement) {
    if (route.kind === 'overview' && trigger) returnFocus.current = trigger;
    setRouteHistory(previous => [...previous, route]);
    setRoute(next);
  }
  function close() {
    setRouteHistory([]);
    setRoute({ kind: 'overview' });
  }
  function back() {
    const previous = routeHistory[routeHistory.length - 1];
    if (!previous || previous.kind === 'overview') {
      close();
      return;
    }
    setRouteHistory(routeHistory.slice(0, -1));
    setRoute(previous);
  }

  return (
    <main className='canvas'>
      <div className='canvas__home' inert={route.kind !== 'overview'}>
        <header className='canvas__header'>
          <div className='canvas__brand'>
            <span className='canvas__eyebrow'>Your everyday, reimagined</span>
            <h1>
              Make yourself <em>at home.</em>
            </h1>
          </div>
          <div className='canvas__header-actions'>
            <CanvasModes />
            <span className='canvas__connection' role='status'>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
            <button type='button' onClick={event => open({ kind: 'weather' }, event.currentTarget)}>
              Weather
            </button>
            <button type='button' onClick={event => open({ kind: 'all-devices' }, event.currentTarget)}>
              All devices
            </button>
          </div>
        </header>
        <section className='canvas__pulse' aria-label='House pulse'>
          <span className='canvas__eyebrow'>House pulse</span>
          <p>Home activity will appear here.</p>
        </section>
        <div className='canvas__feature-band'>
          <section className='canvas__mood'>
            <div>
              <span className='canvas__eyebrow'>The feeling of home</span>
              <h2>Just be.</h2>
              <p>Choose a mood for your space.</p>
              <button type='button' onClick={event => open({ kind: 'moods' }, event.currentTarget)}>
                Explore moods
              </button>
            </div>
            <MoodArt />
          </section>
          <section className='canvas__music'>
            <span className='canvas__eyebrow'>Music</span>
            <h2>Music at home</h2>
            <p>Playback information is unavailable.</p>
            <div className='canvas__actions'>
              <button type='button' onClick={event => open({ kind: 'player' }, event.currentTarget)}>
                Open Player
              </button>
              <button type='button' onClick={event => open({ kind: 'speakers' }, event.currentTarget)}>
                Open Speakers
              </button>
            </div>
          </section>
        </div>
        <section className='canvas__shortcuts' aria-label='Home controls'>
          <CanvasLights onOpenAll={() => open({ kind: 'all-lights' }, document.activeElement instanceof HTMLElement ? document.activeElement : undefined)} />
          <CanvasBlinds />
          <button type='button' onClick={event => open({ kind: 'all-devices' }, event.currentTarget)}>
            Browse devices
          </button>
        </section>
      </div>
      {route.kind !== 'overview' && (
        <CanvasDialog title={canvasRouteTitle(route)} onClose={close}>
          {routeHistory.length > 1 && (
            <button type='button' className='canvas-dialog__back' onClick={back}>
              Back
            </button>
          )}
          {route.kind === 'all-devices' ? (
            <nav className='canvas__directory' aria-label='Device categories'>
              {directory.map(item => (
                <button key={item.label} type='button' onClick={() => open(item.route)}>
                  {item.label}
                  <span aria-hidden='true'>→</span>
                </button>
              ))}
            </nav>
          ) : route.kind === 'all-lights' ? (
            <CanvasAllLights onOpenLight={entityId => open({ kind: 'light', entityId })} />
          ) : route.kind === 'light' ? (
            <CanvasLightDetails key={route.entityId} entityId={route.entityId} />
          ) : (
            <p className='canvas__empty'>Live {canvasRouteTitle(route).toLowerCase()} controls will appear here.</p>
          )}
        </CanvasDialog>
      )}
    </main>
  );
}

export function CanvasDashboard(): React.JSX.Element {
  return <CanvasLightsProvider><CanvasDashboardContent /></CanvasLightsProvider>;
}
