import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useEntity, useIcon, useStore, type EntityName, type FilterByDomain } from '@hakit/core';
import { useSpeakerCommand } from './useSpeakerCommand';
import { onSpeakerDisconnect } from './speakerConnection';

type SpeakerId = FilterByDomain<EntityName, 'media_player'>;

export function SpeakerVolume({
  entityId,
  targets,
  disabled,
  room,
  accessibleLabel,
  onOpenSettings,
  children,
}: {
  entityId: SpeakerId;
  targets: string[];
  disabled: boolean;
  room?: string;
  accessibleLabel?: string;
  onOpenSettings?: (trigger: HTMLElement) => void;
  children?: ReactNode;
}) {
  const entity = useEntity(entityId, { returnNullIfNotFound: true });
  const attributes = entity?.attributes;
  const reported = Math.round(Math.max(0, Math.min(1, attributes?.volume_level ?? 0)) * 100);
  const entities = useStore(state => state.entities);
  const muted = targets.length > 0 && targets.every(id => entities[id]?.attributes.is_volume_muted === true);
  const reportedMuted = targets.filter(id => {
    const target = entities[id];
    return target && !['unknown', 'unavailable'].includes(target.state) && target.attributes.is_volume_muted === true;
  }).length;
  const muteStatus = reportedMuted > 0 ? (reportedMuted === targets.length ? 'Muted' : 'Some muted') : '';
  const features = attributes?.supported_features ?? 0;
  const unavailable = !entity || ['unknown', 'unavailable'].includes(entity.state);
  const cannotSetVolume = disabled || unavailable || !(features & 4) || !Number.isFinite(attributes?.volume_level);
  const [draft, setDraft] = useState<number | null>(null);
  const [muteBusy, setMuteBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { send, error } = useSpeakerCommand();
  const { send: sendMute, error: muteError } = useSpeakerCommand();
  const latest = useRef<number | null>(null);
  const queued = useRef<number | null>(null);
  const sending = useRef(false);
  const dragging = useRef(false);
  const dirty = useRef(false);
  const mounted = useRef(true);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const muteInFlight = useRef(false);
  const id = useId();
  const popupId = useId();
  const closeIcon = useIcon('mdi:close');
  const minus = useIcon('mdi:minus');
  const plus = useIcon('mdi:plus');
  const muteIcon = useIcon(muted ? 'mdi:volume-off' : 'mdi:volume-high');
  const level = draft ?? reported;
  const label = accessibleLabel ?? (room ? `${room} volume` : 'Volume');
  const heading = room ?? (targets.length > 1 ? 'Group volume' : `${attributes?.friendly_name ?? 'Speaker'} volume`);

  useEffect(() => {
    const panel = popup.current;
    if (!panel) return;
    if (!open) {
      panel.hidePopover();
      return;
    }
    panel.showPopover();
    function position() {
      if (!panel || !trigger.current) return;
      const button = trigger.current.getBoundingClientRect();
      const card = trigger.current.closest('.speaker-player')?.getBoundingClientRect();
      const width = Math.min(360, (card?.width ?? window.innerWidth) - 24, window.innerWidth - 24);
      panel.style.width = `${Math.max(0, width)}px`;
      panel.style.left = `${Math.max(12, Math.min(card ? card.left + 12 : button.right - width, window.innerWidth - width - 12))}px`;
      const height = panel.getBoundingClientRect().height;
      const above = button.top - height - 8;
      panel.style.top = `${Math.max(12, Math.min(above >= 12 ? above : button.bottom + 8, window.innerHeight - height - 12))}px`;
    }
    position();
    panel.querySelector('input')?.focus({ preventScroll: true });
    const resize = new ResizeObserver(position);
    resize.observe(panel);
    const player = trigger.current?.closest('.speaker-player');
    if (player) resize.observe(player);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);

  function closeVolume() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = onSpeakerDisconnect(() => {
      queued.current = null;
      latest.current = null;
      dragging.current = false;
      dirty.current = false;
      clearTimeout(settle.current);
      setDraft(null);
    });
    return () => {
      unsubscribe();
      mounted.current = false;
      queued.current = null;
      clearTimeout(settle.current);
    };
  }, []);

  function updateDraft(value: number) {
    clearTimeout(settle.current);
    latest.current = Math.max(0, Math.min(100, value));
    setDraft(latest.current);
  }

  function resumeDeviceUpdates() {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (mounted.current && !dragging.current && !sending.current) {
        latest.current = null;
        setDraft(null);
      }
    }, 1500);
  }

  async function commit(value: number) {
    if (cannotSetVolume) return;
    dirty.current = false;
    updateDraft(value);
    queued.current = latest.current;
    if (sending.current) return;
    sending.current = true;
    while (queued.current !== null && mounted.current) {
      const next = queued.current;
      queued.current = null;
      const currentEntities = useStore.getState().entities;
      const confirmedGroup = [...new Set([
        entityId,
        ...(currentEntities[entityId]?.attributes.group_members ?? []),
      ])];
      const ids = (room ? [entityId] : confirmedGroup).filter(target => {
        const targetEntity = currentEntities[target];
        return (
          targetEntity &&
          !['unknown', 'unavailable'].includes(targetEntity.state) &&
          Boolean((targetEntity.attributes.supported_features ?? 0) & 4) &&
          Number.isFinite(targetEntity.attributes.volume_level)
        );
      });
      const success = await send(
        'volume_set',
        ids,
        `change volume for ${ids.map(id => useStore.getState().entities[id]?.attributes.friendly_name ?? id).join(', ')}`,
        { volume_level: next / 100 }
      );
      if (!mounted.current) return;
      if (!success) {
        queued.current = null;
        latest.current = null;
        setDraft(null);
        break;
      }
    }
    sending.current = false;
    // Keep the local value through delayed HA echoes. Resume displaying the
    // reported device state after the final command has had time to settle.
    resumeDeviceUpdates();
  }

  function finish(value: number) {
    dragging.current = false;
    if (dirty.current) void commit(value);
    else if (latest.current !== null && !sending.current) resumeDeviceUpdates();
  }

  async function toggleMute() {
    if (muteInFlight.current) return;
    muteInFlight.current = true;
    setMuteBusy(true);
    await sendMute(
      'volume_mute',
      targets.filter(id => {
        const entity = useStore.getState().entities[id];
        return entity && !['unknown', 'unavailable'].includes(entity.state) && Boolean((entity.attributes.supported_features ?? 0) & 8);
      }),
      muted ? 'unmute speakers' : 'mute speakers',
      { is_volume_muted: !muted }
    );
    muteInFlight.current = false;
    if (mounted.current) setMuteBusy(false);
  }

  const muteButton = (
    <button
      type='button'
      className='speaker-mute'
      aria-label={`${muted ? 'Unmute' : 'Mute'}${room ? ` ${room}` : ''}`}
      title={muted ? 'Unmute' : 'Mute'}
      aria-pressed={muted}
      disabled={disabled || unavailable || !(features & 8) || muteBusy}
      aria-busy={muteBusy}
      onClick={() => void toggleMute()}
    >
      {muteIcon}
      <span>{muted ? 'Unmute' : 'Mute'}</span>
    </button>
  );

  const controls = (
    <>
      <div className='speaker-volume-heading'>
        <label htmlFor={id}>{heading}</label>
        <output htmlFor={id}>
          {muted ? 'Muted · ' : ''}
          {Number.isFinite(attributes?.volume_level) ? `${level}%` : '—'}
        </output>
      </div>
      <div className='speaker-volume-row'>
        <button
          type='button'
          className='speaker-control'
          aria-label={room ? `Decrease ${room} volume` : 'Decrease volume'}
          disabled={cannotSetVolume || level <= 0}
          onClick={() => void commit((latest.current ?? reported) - 2)}
        >
          {minus}
        </button>
        <input
          id={id}
          aria-label={label}
          type='range'
          min={0}
          max={100}
          step={1}
          value={level}
          disabled={cannotSetVolume}
          aria-valuetext={`${level} percent${muted ? ', muted' : ''}`}
          style={{ '--speaker-range-fill': `${level}%` } as CSSProperties}
          onPointerDown={event => {
            dragging.current = true;
            clearTimeout(settle.current);
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onChange={event => {
            if (dragging.current) {
              dirty.current = true;
              updateDraft(event.currentTarget.valueAsNumber);
            } else void commit(event.currentTarget.valueAsNumber);
          }}
          onPointerUp={event => finish(event.currentTarget.valueAsNumber)}
          onKeyUp={event => finish(event.currentTarget.valueAsNumber)}
          onBlur={event => finish(event.currentTarget.valueAsNumber)}
          onPointerCancel={() => {
            dragging.current = false;
            dirty.current = false;
            latest.current = null;
            setDraft(null);
          }}
        />
        <button
          type='button'
          className='speaker-control'
          aria-label={room ? `Increase ${room} volume` : 'Increase volume'}
          disabled={cannotSetVolume || level >= 100}
          onClick={() => void commit((latest.current ?? reported) + 2)}
        >
          {plus}
        </button>
      </div>
      {children && targets.length > 1 && <p className='speaker-volume-note'>Sets every room to the same volume.</p>}
      {muteButton}
      {(error || muteError) && (
        <p className='speaker-command-error' role='alert'>
          {error ?? muteError}
        </p>
      )}
    </>
  );

  if (onOpenSettings)
    return (
      <div className='speaker-volume-shortcuts'>
        <button
          type='button'
          aria-label='Lower volume'
          disabled={cannotSetVolume || level <= 0}
          onClick={() => void commit((latest.current ?? reported) - 2)}
        >
          −
        </button>
        <button
          type='button'
          aria-label={`Open speaker volume${muteStatus ? `, ${muteStatus.toLowerCase()}` : ''}`}
          onClick={event => onOpenSettings(event.currentTarget)}
        >
          {muteStatus || (Number.isFinite(attributes?.volume_level) ? `${level}%` : 'Volume')}
        </button>
        <button
          type='button'
          aria-label='Raise volume'
          disabled={cannotSetVolume || level >= 100}
          onClick={() => void commit((latest.current ?? reported) + 2)}
        >
          +
        </button>
        {error && <p role='alert'>{error}</p>}
      </div>
    );

  return (
    <div className='speaker-volume'>
      {children ? (
        <>
          <div className='speaker-transport-row'>
            {children}
            <button
              ref={trigger}
              type='button'
              className='speaker-volume-trigger'
              aria-label='Volume controls'
              aria-haspopup='dialog'
              aria-expanded={open}
              aria-controls={popupId}
              popoverTarget={popupId}
              disabled={disabled || unavailable || !(features & (4 | 8))}
              onClick={event => {
                event.preventDefault();
                if (open) closeVolume();
                else setOpen(true);
              }}
            >
              {muteIcon}
              <span>{muted ? 'Muted' : Number.isFinite(attributes?.volume_level) ? `${level}%` : '—'}</span>
            </button>
          </div>
          <div
            ref={popup}
            id={popupId}
            popover='auto'
            hidden={!open}
            role='dialog'
            aria-label='Volume'
            className='speaker-volume-popup'
            onToggle={event => {
              if ((event.nativeEvent as ToggleEvent).newState === 'closed') setOpen(false);
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeVolume();
              }
            }}
          >
            <button type='button' className='speaker-control speaker-volume-close' aria-label='Close volume controls' onClick={closeVolume}>
              {closeIcon}
            </button>
            {controls}
          </div>
          {!open && (error || muteError) && (
            <p className='speaker-command-error' role='alert'>
              {error ?? muteError}
            </p>
          )}
        </>
      ) : (
        controls
      )}
    </div>
  );
}
