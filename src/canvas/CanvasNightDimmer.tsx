import { useEffect, useState } from 'react';
import { useStore } from '@hakit/core';

const inactivityDelay = 10_000;
const activityEvents = ['pointerdown', 'pointerup', 'touchmove', 'click', 'keydown', 'wheel'] as const;

function NightDimmer() {
  const [awake, setAwake] = useState(false);

  useEffect(() => {
    let timeout: number | undefined;
    function wake() {
      setAwake(true);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setAwake(false), inactivityDelay);
    }

    for (const event of activityEvents) {
      window.addEventListener(event, wake, { capture: true, passive: true });
    }
    return () => {
      window.clearTimeout(timeout);
      for (const event of activityEvents) window.removeEventListener(event, wake, true);
    };
  }, []);

  return awake ? null : <div className='canvas-night-dimmer' aria-hidden='true' />;
}

export function CanvasNightDimmer() {
  const nightMode = useStore(state => state.entities['input_boolean.night_mode']?.state === 'on');
  return nightMode ? <NightDimmer /> : null;
}
