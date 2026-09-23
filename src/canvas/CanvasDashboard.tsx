import { useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { CanvasDialog } from './CanvasDialog';
import { canvasRouteTitle, routeForAttention, type CanvasRoute } from './routes';
import { CanvasLights, CanvasAllLights } from './CanvasLights';
import { CanvasLightDetails } from './CanvasLightDetails';
import { CanvasLightsProvider } from './useCanvasLights';
import { CanvasModes } from './CanvasModes';
import { CanvasBlinds } from './CanvasBlinds';
import { CanvasBlindsProvider } from './useCanvasBlinds';
import { CanvasMusicProvider } from './CanvasMusicProvider';
import { CanvasMusic } from './CanvasMusic';
import { CanvasPlayer } from './CanvasPlayer';
import { CanvasSpeakers } from './CanvasSpeakers';
import { CanvasMood } from './CanvasMood';
import { CanvasPulse } from './CanvasPulse';
import { CanvasDevices } from './CanvasDevices';
import { useHouseMood } from '../useHouseMood';
import { useAttention } from '../useAttention';
import { attentionExplanation, type AttentionItem } from '../attention';
import { TemperatureCard } from '../TemperatureCard';
import { AppliancesCard } from '../AppliancesCard';
import { CanvasVacuum, CanvasVacuumProvider } from './CanvasVacuum';
import { CanvasWeather, CanvasWeatherNow } from './CanvasWeather';
import './canvas.css';
import './canvas-music.css';
import './canvas-secondary.css';

function CanvasDashboardContent(): React.JSX.Element {
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const [route, setRoute] = useState<CanvasRoute>({ kind: 'overview' });
  const [routeHistory, setRouteHistory] = useState<{ route: CanvasRoute; trigger: string | null }[]>([]);
  const backFocus = useRef<string | null>(null);
  const [deviceQuery, setDeviceQuery] = useState('');
  const returnFocus = useRef<HTMLElement | null>(null);
  const mood = useHouseMood();
  const attention = useAttention();
  const [selectedAttention, setSelectedAttention] = useState<AttentionItem | null>(null);
  const activeAttention = selectedAttention ? (attention.items.find(item => item.id === selectedAttention.id) ?? null) : null;

  useEffect(() => {
    if (backFocus.current) {
      const name = backFocus.current;
      document.querySelectorAll<HTMLElement>('.canvas-dialog button').forEach(button => {
        if ((button.dataset.canvasFocusKey || button.getAttribute('aria-label') || button.textContent) === name)
          button.focus({ preventScroll: true });
      });
      backFocus.current = null;
    }
    if (route.kind === 'overview' && returnFocus.current) {
      if (returnFocus.current.isConnected) returnFocus.current.focus({ preventScroll: true });
      returnFocus.current = null;
    }
  }, [route]);

  function open(next: CanvasRoute, trigger: HTMLElement) {
    if (route.kind === 'overview' && trigger) returnFocus.current = trigger;
    setRouteHistory(previous => [
      ...previous,
      { route, trigger: trigger?.dataset.canvasFocusKey || trigger?.getAttribute('aria-label') || trigger?.textContent || null },
    ]);
    setRoute(next);
  }
  function close() {
    setRouteHistory([]);
    setRoute({ kind: 'overview' });
    setSelectedAttention(null);
  }
  function back() {
    const previous = routeHistory[routeHistory.length - 1];
    if (!previous || previous.route.kind === 'overview') {
      close();
      return;
    }
    setRouteHistory(routeHistory.slice(0, -1));
    backFocus.current = previous.trigger;
    setRoute(previous.route);
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
            <CanvasWeatherNow onOpen={trigger => open({ kind: 'weather' }, trigger)} />
            <button type='button' onClick={event => open({ kind: 'all-devices' }, event.currentTarget)}>
              All devices
            </button>
          </div>
        </header>
        <CanvasPulse onOpen={open} attention={attention} onSelect={setSelectedAttention} />
        <div className='canvas__feature-band'>
          <CanvasMood controller={mood} onExplore={trigger => open({ kind: 'moods' }, trigger)} />
          <CanvasMusic
            onOpenPlayer={trigger => open({ kind: 'player' }, trigger)}
            onOpenSpeakers={trigger => open({ kind: 'speakers' }, trigger)}
          />
        </div>
        <section className='canvas__shortcuts' aria-label='Home controls'>
          <CanvasLights onOpenAll={trigger => open({ kind: 'all-lights' }, trigger)} />
          <CanvasBlinds />
        </section>
      </div>
      {route.kind !== 'overview' && (
        <CanvasDialog title={canvasRouteTitle(route)} onClose={close}>
          {routeHistory.length > 1 && (
            <button type='button' className='canvas-dialog__back' onClick={back}>
              Back
            </button>
          )}
          {activeAttention && routeForAttention(activeAttention).kind === route.kind && (
            <div className='canvas-attention-context'>
              <strong>{activeAttention.title}</strong>
              <p>{activeAttention.detail}</p>
              <p>{attentionExplanation(activeAttention)}</p>
              <button
                type='button'
                disabled={!attention.connected || attention.busy || !attention.ready}
                aria-label={`${activeAttention.kind === 'completion' ? 'Done' : 'Snooze'}: ${activeAttention.title}`}
                onClick={() => void attention.onAction(activeAttention.kind === 'completion' ? 'dismiss' : 'snooze', activeAttention)}
              >
                {activeAttention.kind === 'completion' ? 'Done' : 'Snooze'}
              </button>
              <button type='button' onClick={close}>
                Back to House pulse
              </button>
            </div>
          )}
          {route.kind === 'all-devices' ? (
            <CanvasDevices
              query={deviceQuery}
              onQueryChange={setDeviceQuery}
              onOpen={(next, trigger) => {
                setSelectedAttention(null);
                open(next, trigger);
              }}
            />
          ) : route.kind === 'player' ? (
            <CanvasPlayer />
          ) : route.kind === 'speakers' ? (
            <CanvasSpeakers />
          ) : route.kind === 'all-lights' ? (
            <CanvasAllLights onOpenLight={(entityId, trigger) => open({ kind: 'light', entityId }, trigger)} />
          ) : route.kind === 'light' ? (
            <CanvasLightDetails key={route.entityId} entityId={route.entityId} />
          ) : route.kind === 'blinds' ? (
            <CanvasBlinds key={route.room ?? 'all'} initialRoom={route.room} />
          ) : route.kind === 'moods' ? (
            <CanvasMood controller={mood} detail />
          ) : route.kind === 'thermostats' ? (
            <TemperatureCard />
          ) : route.kind === 'appliances' ? (
            <AppliancesCard />
          ) : route.kind === 'vacuum' ? (
            <CanvasVacuum />
          ) : route.kind === 'weather' ? (
            <CanvasWeather />
          ) : (
            <p className='canvas__empty'>Live {canvasRouteTitle(route).toLowerCase()} controls will appear here.</p>
          )}
        </CanvasDialog>
      )}
    </main>
  );
}

export function CanvasDashboard(): React.JSX.Element {
  return (
    <CanvasLightsProvider>
      <CanvasBlindsProvider>
        <CanvasVacuumProvider>
          <CanvasMusicProvider>
            <CanvasDashboardContent />
          </CanvasMusicProvider>
        </CanvasVacuumProvider>
      </CanvasBlindsProvider>
    </CanvasLightsProvider>
  );
}
