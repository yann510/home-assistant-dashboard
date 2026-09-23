import { useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { CanvasDialog } from './CanvasDialog';
import { canvasRouteTitle, routeForAttention, type CanvasRoute } from './routes';
import { CanvasLights, CanvasAllLights } from './CanvasLights';
import { CanvasLightDetails } from './CanvasLightDetails';
import { CanvasLightsProvider } from './useCanvasLights';
import { CanvasModes } from './CanvasModes';
import { CanvasBlinds } from './CanvasBlinds';
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
import { VacuumControls } from '@hakit/components';
import './canvas.css';
import './canvas-music.css';
import './canvas-secondary.css';

function CanvasDashboardContent(): React.JSX.Element {
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const [route, setRoute] = useState<CanvasRoute>({ kind: 'overview' });
  const [routeHistory, setRouteHistory] = useState<CanvasRoute[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mood = useHouseMood();
  const attention = useAttention();
  const [selectedAttention, setSelectedAttention] = useState<AttentionItem | null>(null);
  const activeAttention = selectedAttention ? (attention.items.find(item => item.id === selectedAttention.id) ?? null) : null;

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
    setSelectedAttention(null);
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
        <CanvasPulse
          onOpen={next => open(next, document.activeElement instanceof HTMLElement ? document.activeElement : undefined)}
          attention={attention}
          onSelect={setSelectedAttention}
        />
        <div className='canvas__feature-band'>
          <CanvasMood
            controller={mood}
            onExplore={() => open({ kind: 'moods' }, document.activeElement instanceof HTMLElement ? document.activeElement : undefined)}
          />
          <CanvasMusic
            onOpenPlayer={() =>
              open({ kind: 'player' }, document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
            }
            onOpenSpeakers={() =>
              open({ kind: 'speakers' }, document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
            }
          />
        </div>
        <section className='canvas__shortcuts' aria-label='Home controls'>
          <CanvasLights
            onOpenAll={() =>
              open({ kind: 'all-lights' }, document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
            }
          />
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
          {activeAttention && routeForAttention(activeAttention).kind === route.kind && (
            <div className='canvas-attention-context'>
              <strong>{activeAttention.title}</strong>
              <p>{activeAttention.detail}</p>
              <p>{attentionExplanation(activeAttention)}</p>
              <button type='button' onClick={close}>
                Back to House pulse
              </button>
            </div>
          )}
          {route.kind === 'all-devices' ? (
            <CanvasDevices
              onOpen={next => {
                setSelectedAttention(null);
                open(next);
              }}
            />
          ) : route.kind === 'player' ? (
            <CanvasPlayer />
          ) : route.kind === 'speakers' ? (
            <CanvasSpeakers />
          ) : route.kind === 'all-lights' ? (
            <CanvasAllLights onOpenLight={entityId => open({ kind: 'light', entityId })} />
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
            connected ? (
              <VacuumControls entity='vacuum.roomba' />
            ) : (
              <p role='status'>Reconnect to control Roomba.</p>
            )
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
      <CanvasMusicProvider>
        <CanvasDashboardContent />
      </CanvasMusicProvider>
    </CanvasLightsProvider>
  );
}
