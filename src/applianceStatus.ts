const activities: Record<string, string> = {
  wash: 'Washing',
  washing: 'Washing',
  ai_wash: 'Washing',
  pre_wash: 'Prewashing',
  air_wash: 'Air washing',
  rinse: 'Rinsing',
  ai_rinse: 'Rinsing',
  spin: 'Spinning',
  ai_spin: 'Spinning',
  drying: 'Drying',
  ai_drying: 'Drying',
  cooling: 'Cooling',
  refreshing: 'Refreshing',
  weight_sensing: 'Sensing load',
  wrinkle_prevent: 'Wrinkle prevention',
  delay_wash: 'Delayed start',
  pre_drain: 'Draining',
  sanitizing: 'Sanitizing',
  dehumidifying: 'Dehumidifying',
  continuous_dehumidifying: 'Dehumidifying',
  internal_care: 'Internal care',
  freeze_protection: 'Freeze protection',
  thawing_frozen_inside: 'Thawing',
};

export function runningApplianceStatus(job: string | undefined, completion: string | undefined, now: number) {
  let status = activities[job ?? ''] ?? 'Running';
  const finish = Date.parse(completion ?? '');
  if (Number.isFinite(finish) && finish > now) status += ` · ~${Math.ceil((finish - now) / 60_000)} min left`;
  return status;
}
