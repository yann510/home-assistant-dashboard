import { useRef, useState } from 'react';
import { QuietDetailSheet } from './QuietDetailSheet';
import { useStore } from '@hakit/core';
import { VacuumCard } from '@hakit/components';
import { AttentionPanel } from './AttentionPanel';
import { attentionExplanation, type AttentionItem } from './attention';
import { RunningPanel } from './RunningPanel';
import { HomeModeControls } from './HomeModeControls';
import { HouseMoodCard } from './HouseMoodCard';
import { useHouseMood } from './useHouseMood';
import { QuietMoodCard } from './QuietMoodCard';
import { QuietWeather, QuietForecast } from './QuietWeather';
import { QuietRoomControls } from './QuietRoomControls';
import { useLightSummary } from './useLightSummary';
import { SpeakerCard } from './SpeakerCard';
import { TemperatureCard } from './TemperatureCard';
import { AppliancesCard } from './AppliancesCard';
import './quiet-home.css';

type Panel = 'mood' | 'weather' | 'lights' | 'blinds' | 'library' | 'temperature' | 'appliances' | 'vacuum';
const titles: Record<Panel, string> = {
  mood: 'House Mood',
  weather: 'Full forecast',
  lights: 'Lights by room',
  blinds: 'Blinds by room',
  library: 'All controls',
  temperature: 'Thermostat',
  appliances: 'Appliances',
  vacuum: 'Roomba',
};
const library: Panel[] = ['lights', 'blinds', 'mood', 'weather', 'temperature', 'appliances', 'vacuum'];

export function QuietHome() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [selected, setSelected] = useState<AttentionItem | null>(null);
  const details = useRef<HTMLElement>(null);
  const music = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const allControls = useRef<HTMLButtonElement>(null);
  const mood = useHouseMood();
  const lights = useLightSummary();
  const connected = useStore(s => Boolean(s.connection?.connected && s.connectionStatus === 'connected'));

  function open(next: Panel) {
    const trigger = document.activeElement;
    if (trigger instanceof HTMLElement && !details.current?.contains(trigger)) returnFocus.current = trigger;
    if (next === panel) {
      details.current?.focus({ preventScroll: true });
    }
    setSelected(null);
    setPanel(next);
  }
  function close() {
    setPanel(null);
    setSelected(null);
    requestAnimationFrame(() =>
      (returnFocus.current?.isConnected ? returnFocus.current : allControls.current)?.focus({ preventScroll: true })
    );
  }
  function viewReminder(item: AttentionItem) {
    if (item.target === 'details') {
      setPanel(null);
      setSelected(item);
      return;
    }
    if (item.target === 'speaker') {
      setPanel(null);
      setSelected(item);
      music.current?.scrollIntoView?.({ behavior: 'instant', block: 'center' });
      music.current?.focus({ preventScroll: true });
      return;
    }
    open(item.target);
    setSelected(item);
  }
  return (
    <main className='quiet-home'>
      <div inert={panel !== null}>
        <header className='quiet-heading'>
          <div>
            <h1>Home</h1>
            <p>Your everyday essentials.</p>
          </div>
          <HomeModeControls compact disabled={!connected} />
        </header>
        <AttentionPanel compact selected={selected} onView={viewReminder} onClose={() => setSelected(null)} />
        <div className='quiet-overview'>
          <div className='quiet-mood-area'>
            <QuietMoodCard {...mood} onOpen={() => open('mood')} />
          </div>
          <QuietWeather onOpen={() => open('weather')} />
          <section className='quiet-room-shortcuts' aria-label='Room controls'>
            <div className='quiet-section-heading'>
              <h2>Your rooms</h2>
              <button ref={allControls} type='button' className='quiet-button' onClick={() => open('library')}>
                All controls
              </button>
            </div>
            <div className='quiet-shortcuts'>
              <button type='button' className='quiet-shortcut' aria-expanded={panel === 'lights'} onClick={() => open('lights')}>
                <strong>
                  <span aria-hidden='true'>☀</span> Lights by room <b aria-hidden='true'>›</b>
                </strong>
                <span>{lights}</span>
              </button>
              <button type='button' className='quiet-shortcut' aria-expanded={panel === 'blinds'} onClick={() => open('blinds')}>
                <strong>
                  <span aria-hidden='true'>▤</span> Blinds by room <b aria-hidden='true'>›</b>
                </strong>
                <span>3 rooms · Open or close</span>
              </button>
            </div>
          </section>
          <section ref={music} tabIndex={-1} className='quiet-music-area' aria-label='Music'>
            {selected?.target === 'speaker' && (
              <div className='attention-context'>
                <strong>{selected.title}</strong>
                <p>{attentionExplanation(selected)}</p>
                <button type='button' onClick={() => setSelected(null)}>
                  Close reminder
                </button>
              </div>
            )}
            <SpeakerCard compact />
          </section>
        </div>
        <RunningPanel onNavigate={target => open(target === 'attention-target-vacuum' ? 'vacuum' : 'appliances')} />
      </div>
      {panel && (
        <QuietDetailSheet detailsRef={details} onClose={close} panel={panel}>
          <div className='quiet-section-heading'>
            <h2 id='quiet-details-title'>{titles[panel]}</h2>
            <button type='button' className='quiet-button' aria-label='Close details' onClick={close}>
              Close ✕
            </button>
          </div>
          {selected && (
            <div className='attention-context'>
              <strong>{selected.title}</strong>
              <p>{attentionExplanation(selected)}</p>
            </div>
          )}
          {!connected && ['lights', 'blinds', 'temperature', 'vacuum'].includes(panel) ? (
            <p role='status'>Reconnect to control your devices.</p>
          ) : (
            <>
              {panel === 'mood' && <HouseMoodCard {...mood} />}
              {panel === 'weather' && <QuietForecast />}
              {(panel === 'lights' || panel === 'blinds') && <QuietRoomControls kind={panel} />}
              {panel === 'temperature' && <TemperatureCard />}
              {panel === 'appliances' && <AppliancesCard />}
              {panel === 'vacuum' && <VacuumCard entity='vacuum.roomba' layoutType='slim' />}
              {panel === 'library' && (
                <div className='quiet-library'>
                  {library.map(name => (
                    <button key={name} type='button' className='quiet-shortcut' onClick={() => open(name)}>
                      {titles[name]}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </QuietDetailSheet>
      )}
    </main>
  );
}
