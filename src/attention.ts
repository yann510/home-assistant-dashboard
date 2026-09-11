export const attentionTargets = ['appliances', 'vacuum', 'temperature', 'mood', 'speaker', 'details'] as const;
export type AttentionTargetName = (typeof attentionTargets)[number];
export type AttentionItem = {
  id: string;
  episode: string;
  title: string;
  detail: string;
  tone: 'blue' | 'amber' | 'red';
  icon: 'washer' | 'dryer' | 'dishwasher' | 'bin' | 'battery' | 'heat' | 'power' | 'connection' | 'recovery';
  target: AttentionTargetName;
  occurred_at: string;
  kind: 'completion' | 'condition';
  snoozed_until: string | null;
  snooze_seconds: number;
};
export type AttentionAction = 'dismiss' | 'snooze' | 'unsnooze';
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const icons = ['washer', 'dryer', 'dishwasher', 'bin', 'battery', 'heat', 'power', 'connection', 'recovery'];
export function parseAttention(attributes: unknown): AttentionItem[] {
  const items = record(attributes).items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  return items.flatMap(raw => {
    const e = record(raw);
    if (
      !['id', 'episode', 'title', 'detail', 'occurred_at'].every(k => typeof e[k] === 'string') ||
      !e.id ||
      !e.episode ||
      !Number.isFinite(Date.parse(e.occurred_at as string)) ||
      !['completion', 'condition'].includes(String(e.kind)) ||
      seen.has(e.id as string)
    )
      return [];
    seen.add(e.id as string);
    return [
      {
        id: e.id as string,
        episode: e.episode as string,
        title: e.title as string,
        detail: e.detail as string,
        occurred_at: e.occurred_at as string,
        kind: e.kind as AttentionItem['kind'],
        target: attentionTargets.includes(e.target as AttentionTargetName) ? (e.target as AttentionTargetName) : 'details',
        tone: ['blue', 'amber', 'red'].includes(String(e.tone)) ? (e.tone as AttentionItem['tone']) : 'amber',
        icon: icons.includes(String(e.icon)) ? (e.icon as AttentionItem['icon']) : 'recovery',
        snoozed_until: typeof e.snoozed_until === 'string' && Number.isFinite(Date.parse(e.snoozed_until)) ? e.snoozed_until : null,
        snooze_seconds: typeof e.snooze_seconds === 'number' && e.snooze_seconds > 0 ? e.snooze_seconds : 14400,
      },
    ];
  });
}
export function attentionAge(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hr ago`;
}
export function attentionExplanation(item: AttentionItem): string {
  if (item.kind === 'completion')
    return 'The appliance reported that its cycle finished. Done dismisses this reminder; it does not verify that the appliance was unloaded.';
  if (item.target === 'vacuum' && item.id !== 'bin')
    return 'Check Roomba and the controls below. Paused does not necessarily mean stuck. This reminder clears when the robot reports a valid resolved state for one minute.';
  if (item.icon === 'bin') return 'Empty Roomba’s bin. This reminder clears after the bin sensor reports empty for one minute.';
  if (item.icon === 'power')
    return 'Home Assistant is reporting a power-supply problem. Check that its power cable is firmly connected and that the adapter and cable meet the device’s requirements. This reminder clears after five minutes of healthy power reports.';
  if (item.target === 'mood')
    return 'Use Retry restoration below to return affected devices to their previous settings. The reminder clears when restoration succeeds.';
  if (item.target === 'speaker')
    return 'Use Retry ungrouping below to return audio to the original speaker. The reminder clears when cleanup succeeds.';
  if (item.icon === 'battery')
    return 'Replace this sensor’s battery when convenient. This reminder clears after the reported level stays at 25% or more for 30 minutes.';
  if (item.target === 'appliances')
    return 'Check the appliance and its connection. This reminder clears when reliable status returns or the paused cycle resumes or ends. Missing status is not proof that a cycle finished.';
  if (item.id === 'hilo')
    return 'The gateway is not reporting a healthy connection. Thermostats are checked separately and may still be available. This reminder clears after the gateway reports healthy status for one minute.';
  if (item.target === 'temperature')
    return 'Check the thermostat or gateway connection. Temperature controls become available again when reliable status returns.';
  if (item.target === 'details' && item.id.startsWith('offline:'))
    return 'Check the motion sensor and its connection. This reminder clears after reliable status returns for one minute.';
  if (item.icon === 'connection')
    return 'Check your router connection. This reminder clears when reliable connected status returns. Related cloud-device warnings are grouped to avoid duplicate reminders.';
  return 'Check the status and controls below. This reminder clears when the device reports that the condition has resolved.';
}
