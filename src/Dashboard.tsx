import { ButtonCard, MediaPlayerCard, WeatherCard } from '@hakit/components';
import { LightsGroup } from './LightsGroup.tsx';
import { BlindsGroup } from './BlindsGroup.tsx';

function Dashboard() {


  return (
    <>
      <div className={'columns'}>
        <div className={'column'}>
          <LightsGroup />
          <BlindsGroup />
          <ButtonCard className={'button-card'} entity={'vacuum.roomba'} defaultLayout={'slim'} />
        </div>
        <div className={'column'}>
          <WeatherCard className={'button-card'} entity={'weather.forecast_home'} />
          <MediaPlayerCard
            className={'button-card'}
            entity={'media_player.living_room'}
            groupMembers={['media_player.living_room', 'media_player.bathroom', 'media_player.bedroom', 'media_player.gym']}
          />
        </div>
      </div>
    </>
  );
}

export default Dashboard;
