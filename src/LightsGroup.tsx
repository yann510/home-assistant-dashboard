import { LightCard } from './LightCard.tsx';
import { DashboardSection } from './DashboardSection.tsx';

export const LightsGroup = () => {
  return (
    <DashboardSection title='Lights' className='lights-group' defaultOpen>
      <div className='lights-grid'>
        <LightCard lightEntityName={'light.light_front_door'} />
        <LightCard lightEntityName={'light.light_laundry_room'} />
        <LightCard lightEntityName={'light.light_kitchen'} />
        <LightCard lightEntityName={'light.light_living_room_bulbs'} />
        <LightCard lightEntityName={'light.living_room_led_strip'} />
        <LightCard lightEntityName={'light.office_bulbs'} />
        <LightCard lightEntityName={'light.desk_led_strip'} />
        <LightCard lightEntityName={'light.light_bedroom'} />
        <LightCard lightEntityName={'light.bedroom_closet'} />
        <LightCard lightEntityName={'light.light_toilet'} />
        <LightCard lightEntityName={'light.gym'} />
      </div>
    </DashboardSection>
  );
};
