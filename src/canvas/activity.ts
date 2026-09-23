import { runningApplianceStatus } from '../applianceStatus';
import type { ApplianceIconState } from '../ApplianceIcon';

export type ApplianceId = 'washer' | 'dryer' | 'dishwasher';
export type ActivityState = { status: string; active: boolean; iconState: ApplianceIconState };

export function classifyAppliance(
  _id: ApplianceId,
  machine: string | undefined,
  job: string | undefined,
  completion: string | undefined,
  now: number,
  connected = true
): ActivityState {
  if (!connected || !machine || machine === 'unavailable') return { status: 'Unavailable', active: false, iconState: 'unavailable' };
  if (machine === 'unknown') return { status: 'Unknown', active: false, iconState: 'unknown' };
  if (['finish', 'finished'].includes(job ?? '')) return { status: 'Finished', active: false, iconState: 'idle' };
  if (machine === 'pause') return { status: 'Paused', active: false, iconState: 'paused' };
  if (machine === 'run') return { status: runningApplianceStatus(job, completion, now), active: true, iconState: 'running' };
  if (machine === 'stop') return { status: 'Idle', active: false, iconState: 'idle' };
  return { status: 'Unknown', active: false, iconState: 'unknown' };
}

export function classifyVacuum(state: string | undefined, connected = true): ActivityState {
  if (!connected || !state || state === 'unavailable') return { status: 'Unavailable', active: false, iconState: 'unavailable' };
  if (state === 'cleaning') return { status: 'Cleaning', active: true, iconState: 'running' };
  if (state === 'returning') return { status: 'Returning to dock', active: true, iconState: 'running' };
  if (state === 'paused') return { status: 'Paused', active: false, iconState: 'paused' };
  if (state === 'docked') return { status: 'Docked', active: false, iconState: 'idle' };
  if (state === 'idle') return { status: 'Idle', active: false, iconState: 'idle' };
  return { status: 'Unknown', active: false, iconState: 'unknown' };
}

export const applianceSensors = [
  { id: 'washer', name: 'Washer', prefix: 'sensor.washer_washer' },
  { id: 'dryer', name: 'Dryer', prefix: 'sensor.dryer_dryer' },
  { id: 'dishwasher', name: 'Dishwasher', prefix: 'sensor.dishwasher_dishwasher' },
] as const;
