import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { CanvasOverlayNavigation } from './CanvasOverlayNavigation';
import { CanvasDialog } from './CanvasDialog';
import { useCanvasNavigation } from './useCanvasNavigation';
import { canvasRouteTitle, routeForAttention, type CanvasRoute } from './routes';
import { CanvasLights, CanvasAllLights, CanvasAllLightsAction } from './CanvasLights';
import { CanvasLightDetails } from './CanvasLightDetails';
import { CanvasLightsProvider } from './useCanvasLights';
import { CanvasModes, CanvasModeAlert, CanvasModeFeedback, CanvasModeNotices } from './CanvasModes';
import { CanvasNightDimmer } from './CanvasNightDimmer';
import { useCanvasModes } from './useCanvasModes';
import { CanvasBlinds } from './CanvasBlinds';
import { CanvasBlindsProvider } from './useCanvasBlinds';
import { CanvasMusicProvider, useCanvasMusic } from './CanvasMusicProvider';
import { CanvasMusic } from './CanvasMusic';
import { followCleanupMessage, type ReportMusicNotice } from './CanvasMusicNotice';
import type { OverviewNotice, ReportOverviewNotice } from './CanvasOverviewNotice';
import { CanvasPlayer } from './CanvasPlayer';
import { CanvasSpeakers } from './CanvasSpeakers';
import { CanvasMood, CanvasMoodAlert } from './CanvasMood';
import { CanvasPulse, type QuietPulsePresentation } from './CanvasPulse';
import { CanvasDevices } from './CanvasDevices';
import { useHouseMood } from '../useHouseMood';
import { useAttention } from '../useAttention';
import { attentionExplanation, type AttentionItem } from '../attention';
import { CanvasThermostats, CanvasThermostatsProvider } from './CanvasThermostats';
import { AppliancesCard } from '../AppliancesCard';
import { CanvasVacuum, CanvasVacuumProvider } from './CanvasVacuum';
import { CanvasWeatherDialog, CanvasWeatherNow } from './CanvasWeather';
import './canvas.css';
import './canvas-motion.css';
import './canvas-music.css';
import './canvas-secondary.css';
import './canvas-appliances-vacuum.css';
import './canvas-tablet.css';

const noticeFallback: Record<OverviewNotice['category'], string> = {
  Music: '.canvas-music',
  Lights: '.canvas-lights--compact',
  Blinds: '.canvas-blinds',
  'House Mood': '.canvas-mood',
  'Home modes': '.canvas-modes',
  Weather: '.canvas-weather-now',
};

function CanvasDashboardContent({ quietPulse }: { quietPulse?: QuietPulsePresentation }): React.JSX.Element {
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const navigation = useCanvasNavigation();
  const { route, routeDepth: depth, scrollTop: dialogScrollTop } = navigation;
  const destination = route.kind === 'blinds' && route.noticeAction ? `blinds:${route.noticeAction}` : 'entityId' in route ? route.entityId : undefined;
  const [deviceQuery, setDeviceQuery] = useState('');
  const [notices, setNotices] = useState<(OverviewNotice & { id: string })[]>([]);
  const reportNotice = useCallback<ReportOverviewNotice>((id, notice) => {
    setNotices(current => {
      const remaining = current.filter(item => item.id !== id);
      if (notice) return [{ ...notice, id }, ...remaining];
      return remaining.length === current.length ? current : remaining;
    });
  }, []);
  const reportMusicNotice = useCallback<ReportMusicNotice>((kind, notice) => {
    reportNotice(`music:${kind}`, notice && { ...notice, category: 'Music', route: { kind: 'music-alert', notice: kind } });
  }, [reportNotice]);
  const modes = useCanvasModes();
  const alertMode = route.kind === 'mode-alert' ? modes.find(mode => mode.mode === route.mode) : undefined;
  const recoveringMode = useStore(state => {
    const mood = state.entities['sensor.house_mood'];
    return mood?.state === 'recovery_required' ? mood.attributes.pending_mode : undefined;
  });
  const showModeRestoration = alertMode && !alertMode.recoveryRequired && alertMode.mode === recoveringMode;
  const returnFocus = useRef<HTMLElement | null>(null);
  const mood = useHouseMood();
  const attention = useAttention();
  const [selectedAttention, setSelectedAttention] = useState<AttentionItem | null>(null);
  const activeAttention = selectedAttention
    ? (attention.items.find(
        item => item.id === selectedAttention.id && (!item.snoozed_until || Date.parse(item.snoozed_until) <= attention.now)
      ) ?? null)
    : null;

  useEffect(() => {
    if (navigation.focus) {
      const name = navigation.focus;
      document.querySelectorAll<HTMLElement>('.canvas button').forEach(button => {
        if (!button.closest('[inert], [aria-hidden="true"]') && (button.dataset.canvasFocusKey || button.getAttribute('aria-label') || button.textContent) === name)
          button.focus({ preventScroll: true });
      });
    }
    if (route.kind === 'overview' && returnFocus.current) {
      if (returnFocus.current.isConnected) returnFocus.current.focus({ preventScroll: true });
      else if (returnFocus.current.dataset.overviewNotice) {
        const { overviewNotice, noticeCategory } = returnFocus.current.dataset;
        const replacement = [...document.querySelectorAll<HTMLElement>('[data-overview-notice]')]
          .find(button => button.dataset.overviewNotice === overviewNotice);
        const card = noticeFallback[noticeCategory as OverviewNotice['category']];
        (replacement ?? (card ? document.querySelector<HTMLElement>(`.canvas__home ${card}`) : null))?.focus({ preventScroll: true });
      }
      returnFocus.current = null;
    }
  }, [route, navigation.focus]);

  function open(next: CanvasRoute, trigger: HTMLElement) {
    if (route.kind === 'overview') returnFocus.current = trigger;
    navigation.open(next, trigger);
  }
  function close() {
    navigation.close();
    setSelectedAttention(null);
  }
  const back = navigation.back;

  return (
    <CanvasOverlayNavigation.Provider value={navigation}>
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
            <CanvasModes modes={modes} />
            <span className='canvas__connection' role='status'>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
            <CanvasWeatherNow onOpen={trigger => open({ kind: 'weather' }, trigger)} reportNotice={reportNotice} />
            <button type='button' className='canvas__all-devices' onClick={event => open({ kind: 'all-devices' }, event.currentTarget)}>
              <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' aria-hidden='true'>
                <rect x='4' y='4' width='6' height='6' rx='1.5' />
                <rect x='14' y='4' width='6' height='6' rx='1.5' />
                <rect x='4' y='14' width='6' height='6' rx='1.5' />
                <rect x='14' y='14' width='6' height='6' rx='1.5' />
              </svg>
              All devices
            </button>
          </div>
        </header>
        <CanvasPulse
          onOpen={open}
          attention={attention}
          onSelect={setSelectedAttention}
          quietPresentation={quietPulse}
          feedback={modes.some(mode => mode.feedback?.phase === 'pending') ? <CanvasModeFeedback modes={modes} pendingOnly /> : undefined}
          notices={notices}
        />
        <CanvasModeNotices modes={modes} reportNotice={reportNotice} />
        <div className='canvas__feature-band'>
          <CanvasMood
            controller={mood}
            reportNotice={reportNotice}
            attention={activeAttention?.target === 'mood' ? activeAttention : null}
            attentionBusy={attention.busy || !attention.connected || !attention.ready}
            onAttentionAction={item => {
              void attention.onAction(item.kind === 'completion' ? 'dismiss' : 'snooze', item);
            }}
          />
          <CanvasMusic
            onOpenPlayer={trigger => open({ kind: 'player' }, trigger)}
            onOpenSpeakers={trigger => open({ kind: 'speakers' }, trigger)}
            reportNotice={reportMusicNotice}
          />
        </div>
        <section className='canvas__shortcuts' aria-label='Home controls'>
          <CanvasLights onOpenAll={trigger => open({ kind: 'all-lights' }, trigger)} reportNotice={reportNotice} />
          <CanvasBlinds reportNotice={reportNotice} />
        </section>
      </div>
      {route.kind === 'weather' ? (
        <CanvasWeatherDialog
          onClose={close}
          onBack={depth > 1 ? back : undefined}
          routeKey={JSON.stringify(route)}
          scrollTop={dialogScrollTop}
        />
      ) : (
        route.kind !== 'overview' && (
          <CanvasDialog
            title={canvasRouteTitle(route)}
            headerAccessory={route.kind === 'all-lights' ? <CanvasAllLightsAction /> : undefined}
            onClose={close}
            onBack={depth > 1 ? back : undefined}
            routeKey={JSON.stringify(route) + (showModeRestoration ? ':restoration' : '')}
            scrollTop={dialogScrollTop}
            destination={destination}
          >
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
                {attention.busy && <p role='status'>Saving reminder…</p>}
                {attention.error && <p role='alert'>{attention.error}</p>}
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
              <CanvasPlayer onClose={close} />
            ) : route.kind === 'music-alert' ? (
              <CanvasMusicAlert notice={notices.find(notice => notice.id === `music:${route.notice}`)} showFollowRecovery={route.notice === 'follow'} />
            ) : route.kind === 'mood-alert' ? (
              <CanvasMoodAlert controller={mood} />
            ) : route.kind === 'mode-alert' && alertMode ? (
              showModeRestoration ? <CanvasMoodAlert controller={mood} /> : <CanvasModeAlert mode={alertMode} />
            ) : route.kind === 'speakers' ? (
              <CanvasSpeakers />
            ) : route.kind === 'all-lights' ? (
              <CanvasAllLights showGlobalAction={false} />
            ) : route.kind === 'light' ? (
              <CanvasLightDetails key={route.entityId} entityId={route.entityId} />
            ) : route.kind === 'blinds' ? (
              <CanvasBlinds key={route.room ?? 'all'} initialRoom={route.room} />
            ) : route.kind === 'thermostats' ? (
              <CanvasThermostats />
            ) : route.kind === 'appliances' ? (
              <AppliancesCard variant='canvas' />
            ) : route.kind === 'vacuum' ? (
              <CanvasVacuum />
            ) : (
              <p className='canvas__empty'>Live {canvasRouteTitle(route).toLowerCase()} controls will appear here.</p>
            )}
          </CanvasDialog>
        )
      )}
    </main>
    </CanvasOverlayNavigation.Provider>
  );
}

function CanvasMusicAlert({ notice, showFollowRecovery }: { notice?: OverviewNotice; showFollowRecovery: boolean }) {
  const { session, rooms, playlistPlayback } = useCanvasMusic();
  const recovery = showFollowRecovery && session.cleanupPending;
  const message = useRef<HTMLParagraphElement>(null);
  const retryWasAvailable = useRef(recovery);
  useEffect(() => {
    if (retryWasAvailable.current && !recovery && document.activeElement === document.body) {
      message.current?.focus({ preventScroll: true });
    }
    retryWasAvailable.current = recovery;
  }, [recovery]);
  const retryBlocked = !session.canRetryCleanup || rooms.busy || !!playlistPlayback.pending || !session.connected || !session.configured;
  return (
    <section className='canvas-music-alert'>
      {notice?.source && <p>{notice.source}</p>}
      <p ref={message} tabIndex={-1} role={!notice && !recovery ? 'status' : undefined}>
        {notice?.message ?? (recovery ? followCleanupMessage : 'This Music alert has cleared.')}
      </p>
      {recovery && (
        <>
          {notice && notice.message !== followCleanupMessage && <p>{followCleanupMessage}</p>}
          {session.updating && <p role='status'>Updating Follow me…</p>}
          <button
            type='button'
            aria-disabled={retryBlocked}
            onClick={() => { if (!retryBlocked) void session.updateFollowing('disable'); }}
          >
            Retry ungrouping
          </button>
        </>
      )}
    </section>
  );
}

export function CanvasDashboard({ quietPulse }: { quietPulse?: QuietPulsePresentation } = {}): React.JSX.Element {
  return (
    <CanvasLightsProvider>
      <CanvasBlindsProvider>
        <CanvasVacuumProvider>
          <CanvasMusicProvider>
            <CanvasThermostatsProvider>
              <CanvasDashboardContent quietPulse={quietPulse} />
              <CanvasNightDimmer />
            </CanvasThermostatsProvider>
          </CanvasMusicProvider>
        </CanvasVacuumProvider>
      </CanvasBlindsProvider>
    </CanvasLightsProvider>
  );
}
