import { createRoot } from 'react-dom/client';
import { HassContext, useStore, type HassContextProps } from '@hakit/core';
import { ThemeProvider } from '@hakit/components';
import type { Connection, HassEntities } from 'home-assistant-js-websocket';
import { DashboardViews } from '../../src/DashboardViews';
import { rooms } from '../../src/useLightSummary';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const scene = params.get('scene') ?? 'everyday';
const entities: HassEntities = {};
function publish(id: string, state: string, attributes: Record<string, unknown> = {}) {
  entities[id] = {
    entity_id: id,
    state,
    attributes,
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'local-preview', parent_id: null, user_id: null },
  };
  useStore.setState({ entities: { ...entities } });
}
for (const room of rooms)
  for (const id of room.lights)
    publish(id, 'on', {
      friendly_name: id.split('.')[1].replaceAll('_', ' '),
      brightness: 166,
      supported_color_modes: ['rgb', 'color_temp'],
      color_temp_kelvin: 3000,
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6500,
      rgb_color: [240, 180, 120],
    });
for (const room of ['living_room', 'bathroom', 'bedroom', 'gym'])
  publish(`media_player.${room}`, room === 'living_room' ? 'playing' : 'idle', {
    friendly_name: room.replaceAll('_', ' '),
    supported_features: 4127295,
    group_members: [`media_player.${room}`],
    volume_level: 0.32,
    is_volume_muted: false,
    media_title: params.has('long')
      ? 'A very long title about the extraordinary places we call home and everything in between'
      : 'All In A Dream',
    media_artist: 'LP Giobbi · DJ Tennis · Joseph Ashworth',
    media_duration: 250,
    media_position: 42,
  });
publish('input_boolean.speaker_follow_motion', 'off');
publish('input_text.speaker_follow_source', '');
publish('script.speaker_follow_motion', 'off');
publish('input_boolean.night_mode', 'off');
publish('input_boolean.morning_mode', 'on');
publish('sensor.house_mood', scene === 'busy' ? 'recovery_required' : 'active', {
  active_mood: 'unwind',
  errors: scene === 'busy' ? [{ target: 'Living room', message: 'One light could not be restored.' }] : [],
});
publish('weather.forecast_home', 'sunny', { temperature: 18, temperature_unit: '°C', supported_features: 3 });
for (const kind of ['washer', 'dryer', 'dishwasher']) {
  publish(`sensor.${kind}_${kind}_machine_state`, scene === 'busy' ? 'run' : 'stop');
  publish(`sensor.${kind}_${kind}_job_state`, 'wash');
}
publish('vacuum.roomba', scene === 'busy' ? 'returning' : 'docked', {
  battery_level: 84,
  supported_features: 16383,
  fan_speed: 'Balanced',
  fan_speed_list: ['Quiet', 'Balanced', 'Turbo'],
});
for (const room of ['office', 'gym', 'bedroom'])
  publish(`climate.thermostat_${room}`, 'heat', {
    friendly_name: room,
    current_temperature: 21,
    temperature: 22,
    min_temp: 5,
    max_temp: 30,
    target_temp_step: 0.5,
  });
publish('sensor.dashboard_attention', '0', {
  ready: true,
  items:
    scene === 'busy'
      ? [
          {
            id: 'bin',
            episode: 'bin-1',
            title: 'Empty Roomba bin',
            detail: 'Bin full',
            tone: 'amber',
            icon: 'bin',
            target: 'vacuum',
            kind: 'condition',
            occurred_at: new Date().toISOString(),
            snoozed_until: null,
            snooze_seconds: 3600,
          },
        ]
      : [],
});
if (scene === 'empty') for (const id of Object.keys(entities)) delete entities[id];
const connection = {
  connected: scene !== 'offline',
  addEventListener() {},
  removeEventListener() {},
  sendMessage() {},
  async sendMessagePromise(message: Record<string, unknown>) {
    if (message.type === 'media_player/browse_media')
      return {
        children: ['Morning calm', 'Dinner at home', 'Night drive'].map((title, index) => ({
          title,
          media_content_id: `fixture:${index}`,
          media_content_type: 'playlist',
          can_play: true,
          thumbnail:
            index === 0
              ? `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#bf8e73"/><circle cx="90" cy="65" r="40" fill="#e6dcbc"/><path d="M0 160Q80 15 160 160" fill="#443b46"/></svg>')}`
              : undefined,
        })),
      };
    if (scene === 'busy') throw new Error('Controlled preview failure. Retry after changing scene.');
    return { response: { success: true } };
  },
  async subscribeMessage(callback: (event: unknown) => void, message: Record<string, unknown>) {
    if (scene === 'busy') throw new Error('Controlled forecast failure');
    const daily = message.forecast_type === 'daily';
    queueMicrotask(() =>
      callback({
        forecast: Array.from({ length: daily ? 7 : 25 }, (_, i) => ({
          datetime: new Date(Date.now() + i * (daily ? 86400000 : 3600000)).toISOString(),
          temperature: 18 + (i % 4),
          templow: 8,
          precipitation_probability: i % 2 ? 35 : 0,
          condition: ['sunny', 'partlycloudy', 'rainy', 'snowy', 'fog', 'windy', 'lightning'][i % 7],
        })),
      })
    );
    return () => Promise.resolve();
  },
} as unknown as Connection;
useStore.setState({
  connection,
  connectionStatus: scene === 'offline' ? 'disconnected' : 'connected',
  entities,
  config: { time_zone: 'America/Toronto', unit_system: { temperature: '°C' } } as never,
});
const context = {
  useStore,
  getAllEntities: () => useStore.getState().entities,
  joinHassUrl: (path: string) => path,
  callService: async () => ({}),
  getConfig: async () => null,
} as unknown as HassContextProps;
createRoot(document.getElementById('root')!).render(
  <HassContext.Provider value={context}>
    <ThemeProvider />
    <DashboardViews />
  </HassContext.Provider>
);
