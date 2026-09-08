import { VacuumCard, WeatherCard } from '@hakit/components';
import { LightsGroup } from './LightsGroup.tsx';
import { BlindsGroup } from './BlindsGroup.tsx';
import { HomeModeControls } from './HomeModeControls.tsx';
import { HouseMoodSection } from './HouseMoodSection.tsx';
import { SpeakerCard } from './SpeakerCard.tsx';

function Dashboard() {
  return (
    <>
      <HomeModeControls />
      <HouseMoodSection />
      <div className={'columns'}>
        <div className={'column'}>
          <LightsGroup />
          <BlindsGroup />
          <VacuumCard entity={'vacuum.roomba'} layoutType={'slim'} />
        </div>
        <div className={'column'}>
          <WeatherCard className={'button-card'} entity={'weather.forecast_home'} />
          <SpeakerCard />
        </div>
      </div>
    </>
  );
}

export default Dashboard;
