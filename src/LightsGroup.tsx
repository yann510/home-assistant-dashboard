import { LightCard } from './LightCard.tsx';
import { DashboardSection } from './DashboardSection.tsx';

export const LightsGroup = () => {
  return (
    <DashboardSection title='Lights' className='lights-group' defaultOpen>
      <div className='lights-grid'>
        <div className='light-cluster light-cluster--pair' role='group' aria-label='Entry'>
          <LightCard lightEntityName={'light.light_front_door'} />
          <LightCard lightEntityName={'light.light_laundry_room'} />
        </div>
        <div className='light-cluster light-cluster--single' role='group' aria-label='Kitchen'>
          <LightCard lightEntityName={'light.light_kitchen'} />
        </div>
        <div className='light-cluster light-cluster--pair' role='group' aria-label='Office'>
          <LightCard lightEntityName={'light.office_bulbs'} />
          <LightCard lightEntityName={'light.desk_led_strip'} />
        </div>
        <div className='light-cluster light-cluster--single' role='group' aria-label='Gym'>
          <LightCard lightEntityName={'light.gym'} />
        </div>
        <div className='light-cluster light-cluster--pair' role='group' aria-label='Living Room'>
          <LightCard lightEntityName={'light.light_living_room_bulbs'} />
          <LightCard lightEntityName={'light.living_room_led_strip'} />
        </div>
        <div className='light-cluster light-cluster--single' role='group' aria-label='Toilet'>
          <LightCard lightEntityName={'light.light_toilet'} />
        </div>
        <div className='light-cluster light-cluster--pair' role='group' aria-label='Bedroom'>
          <LightCard lightEntityName={'light.light_bedroom'} />
          <LightCard lightEntityName={'light.bedroom_closet'} />
        </div>
      </div>
    </DashboardSection>
  );
};
