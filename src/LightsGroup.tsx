import { LightCard } from './LightCard.tsx';
import { Group } from '@hakit/components';
import { useHasSmallScreen } from './useHasSmallScreen.tsx';
import { useEffect, useState } from 'react';

export const LightsGroup = () => {
  const [isGroupCollapsed, setIsGroupCollapsed] = useState<boolean | undefined>(undefined);
  const hasSmallScreen = useHasSmallScreen();

  useEffect(() => {
    if (hasSmallScreen && isGroupCollapsed === undefined) {
      setIsGroupCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSmallScreen]);

  return (
    <Group title={'Lights'} className={'group-container'} collapsed={true}>
      <div className='three-columns-row'>
        <LightCard lightEntityName={'light.light_front_door'} />
        <LightCard lightEntityName={'light.light_laundry_room'} />
      </div>
      <div className='three-columns-row'>
        <LightCard lightEntityName={'light.light_kitchen'} />
        <LightCard lightEntityName={'light.light_living_room_bulbs'} />
        <LightCard lightEntityName={'light.living_room_led_strip'} />
      </div>
      <div className='three-columns-row'>
        <LightCard lightEntityName={'light.office_bulbs'} />
        <LightCard lightEntityName={'light.desk_led_strip'} />
      </div>
      <div className='three-columns-row'>
        <LightCard lightEntityName={'light.light_bedroom'} />
        <LightCard lightEntityName={'light.bedroom_closet'} />
        <LightCard lightEntityName={'light.light_toilet'} />
      </div>
      <div className='three-columns-row'>
        <LightCard lightEntityName={'light.gym'} />
      </div>
    </Group>
  );
};
