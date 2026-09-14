import { useState } from 'react';
import { RunningPanel } from './RunningPanel';
import { AttentionPanel } from './AttentionPanel';
import { AttentionTarget } from './AttentionStrip';
import type { AttentionItem } from './attention';
import { TemperatureCard } from './TemperatureCard';
import { VacuumCard, WeatherCard } from '@hakit/components';
import { LightsGroup } from './LightsGroup.tsx';
import { BlindsGroup } from './BlindsGroup.tsx';
import { HomeModeControls } from './HomeModeControls.tsx';
import { HouseMoodSection } from './HouseMoodSection.tsx';
import { AppliancesCard } from './AppliancesCard.tsx';
import { SpeakerCard } from './SpeakerCard.tsx';

function Dashboard() {
  const [selected, setSelected] = useState<AttentionItem | null>(null);
  const close = () => setSelected(null);
  return (
    <>
      <HomeModeControls />
      <AttentionTarget name='mood' selected={selected} onClose={close}>
        <HouseMoodSection />
      </AttentionTarget>
      <AttentionPanel selected={selected} onView={setSelected} onClose={close} />
      <RunningPanel />
      <div className={'columns'}>
        <div className={'column'}>
          <LightsGroup />
          <BlindsGroup />
          <AttentionTarget name='vacuum' selected={selected} onClose={close}>
            <VacuumCard entity={'vacuum.roomba'} layoutType={'slim'} />
          </AttentionTarget>
        </div>
        <div className={'column'}>
          <WeatherCard className={'button-card'} entity={'weather.forecast_home'} />
          <AttentionTarget name='speaker' selected={selected} onClose={close}>
            <SpeakerCard />
          </AttentionTarget>
          <AttentionTarget name='appliances' selected={selected} onClose={close}>
            <AppliancesCard />
          </AttentionTarget>
          <AttentionTarget name='temperature' selected={selected} onClose={close}>
            <TemperatureCard />
          </AttentionTarget>
        </div>
      </div>
    </>
  );
}

export default Dashboard;
