import { createRoot } from 'react-dom/client';
import { HassContext, useStore, type HassContextProps } from '@hakit/core';
import { ThemeProvider } from '@hakit/components';
import type { Connection, HassEntities } from 'home-assistant-js-websocket';
import { DashboardViews } from '../../src/DashboardViews';
import { rooms } from '../../src/useLightSummary';
import '../../src/index.css';
import { applySpeakerService } from './speaker-services';
import { applyMoodService } from './mode-services';
import { lightCapabilities } from './light-capabilities';
import { previewFavourites } from './favourites';

const params = new URLSearchParams(location.search);
const scene = params.get('scene') ?? 'everyday';
const media = params.get('media');
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
      ...(lightCapabilities[id] ?? { supported_color_modes: ['onoff'] }),
    });
for (const room of ['living_room', 'bathroom', 'bedroom', 'gym'])
  publish(
    `media_player.${room}`,
    room === 'living_room' ? (media === 'idle' ? 'idle' : media === 'paused' ? 'paused' : 'playing') : 'idle',
    {
      friendly_name: room.replaceAll('_', ' '),
      supported_features: 4127295,
      group_members: [`media_player.${room}`],
      volume_level: 0.32,
      is_volume_muted: params.has('muted'),
      media_title:
        room === 'living_room' && (media === 'idle' || media === 'untitled')
          ? undefined
          : params.has('long')
            ? 'A very long title about the extraordinary places we call home and everything in between'
            : 'All In A Dream',
      media_artist:
        room === 'living_room' && (media === 'idle' || media === 'untitled') ? undefined : 'LP Giobbi · DJ Tennis · Joseph Ashworth',
      media_duration: room === 'living_room' && (media === 'idle' || media === 'untitled') ? undefined : 250,
      media_position: room === 'living_room' && (media === 'idle' || media === 'untitled') ? undefined : 42,
      media_position_updated_at: new Date().toISOString(),
    }
  );
publish('input_boolean.speaker_follow_motion', 'off');
publish('input_text.speaker_follow_source', '');
publish('script.speaker_follow_motion', 'off');
publish('input_boolean.night_mode', 'off');
publish('input_boolean.morning_mode', 'on');
publish('sensor.house_mood', scene === 'busy' ? 'recovery_required' : 'active', {
  active_mood: 'unwind',
  mode_control: 'coordinated-v1',
  errors: scene === 'busy' ? [{ target: 'Living room', message: 'One light could not be restored.' }] : [],
});
publish('weather.forecast_home', 'sunny', {
  temperature: 18,
  temperature_unit: '°C',
  wind_speed_unit: 'km/h',
  precipitation_unit: 'mm',
  supported_features: 3,
});
for (const kind of ['washer', 'dryer', 'dishwasher']) {
  publish(
    `sensor.${kind}_${kind}_machine_state`,
    scene === 'pulse-single' && kind === 'washer' ? 'unavailable' : scene === 'busy' ? 'run' : 'stop'
  );
  publish(`sensor.${kind}_${kind}_job_state`, params.has('long') ? 'wrinkle_prevent' : 'wash');
  if (params.has('long')) publish(`sensor.${kind}_${kind}_completion_time`, new Date(Date.now() + 7200000).toISOString());
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
    supported_features: 1,
    hvac_action: room === 'bedroom' ? 'idle' : 'heating',
  });
const snoozedItems = ['Empty Roomba bin', 'Check the dishwasher rinse aid and salt levels', 'Clean the washer filter'].map(
  (title, index) => ({
    id: `snoozed-${index}`,
    episode: `snoozed-${index}-1`,
    title,
    detail: 'Preview reminder',
    tone: 'amber',
    icon: 'bin',
    target: 'vacuum',
    kind: 'condition',
    occurred_at: new Date().toISOString(),
    snoozed_until: new Date(Date.now() + 3600000).toISOString(),
    snooze_seconds: 3600,
  })
);
publish('sensor.dashboard_attention', '0', {
  ready: true,
  items:
    scene === 'snoozed'
      ? snoozedItems
      : scene === 'busy'
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
        children: previewFavourites.map((item, index) => ({
          ...item,
          title: index === 1 && params.has('long') ? 'Dinner at home with friends and a very long playlist title to read' : item.title,
          media_content_id: `fixture:${index}`,
          media_content_type: 'playlist',
          can_play: true,
          thumbnail: index === 2 && params.has('brokenArt') ? '/missing-favourite-cover.jpg' : item.thumbnail,
        })),
      };
    if (scene === 'busy') throw new Error('Controlled preview failure. Retry after changing scene.');
    const moodResult = !params.has('unconfirmed') && applyMoodService(entities, message);
    if (moodResult) {
      Object.assign(entities, moodResult.updates);
      useStore.setState({ entities: { ...entities } });
      return { response: moodResult.response };
    }
    const speakerUpdates = !params.has('unconfirmed') && applySpeakerService(entities, message);
    if (speakerUpdates) {
      Object.assign(entities, speakerUpdates);
      useStore.setState({ entities: { ...entities } });
    }
    if (message.type === 'call_service' && message.domain === 'media_player' && message.service === 'play_media' && !params.has('unconfirmed')) {
      const data = (message.service_data ?? {}) as Record<string, unknown>;
      const item = previewFavourites.find((_, index) => data.media_content_id === `fixture:${index}`);
      const target = (message.target as { entity_id?: string | string[] } | undefined)?.entity_id;
      const ids = Array.isArray(target) ? target : target ? [target] : [];
      if (item) {
        for (const id of ids) {
          const speaker = entities[id];
          if (!speaker || speaker.state === 'unavailable' || speaker.state === 'unknown') continue;
          const members = speaker.attributes.group_members;
          const group = Array.isArray(members) && members.length ? members : [id];
          for (const member of group) {
            if (!entities[member]) continue;
            publish(member, 'playing', {
              ...entities[member].attributes,
              media_content_id: data.media_content_id,
              media_content_type: data.media_content_type,
              media_title: item.title,
              media_playlist: item.title,
              media_artist: undefined,
              entity_picture: item.thumbnail,
              media_position: 0,
              media_position_updated_at: new Date().toISOString(),
              // A simulated four-minute track lets the local preview exercise playback progress.
              media_duration: 240,
            });
          }
        }
      }
    }
    if (message.type === 'call_service' && message.domain === 'climate' && message.service === 'set_temperature' && !params.has('unconfirmed')) {
      const target = (message.target as { entity_id?: string | string[] } | undefined)?.entity_id;
      const ids = Array.isArray(target) ? target : target ? [target] : [];
      const temperature = (message.service_data as { temperature?: number } | undefined)?.temperature;
      if (typeof temperature === 'number' && Number.isFinite(temperature)) {
        for (const id of ids) {
          const thermostat = entities[id];
          if (!thermostat || ['unknown', 'unavailable', 'off'].includes(thermostat.state)) continue;
          publish(id, thermostat.state, { ...thermostat.attributes, temperature });
        }
      }
    }
    if (message.type === 'call_service' && message.domain === 'light' && !params.has('unconfirmed')) {
      const target = (message.target as { entity_id?: string | string[] }).entity_id;
      const ids = Array.isArray(target) ? target : target ? [target] : [];
      if (message.service === 'turn_on' || message.service === 'turn_off') {
        for (const id of ids) {
          const light = entities[id];
          if (!light || light.state === 'unavailable' || light.state === 'unknown') continue;
          publish(id, message.service === 'turn_on' ? 'on' : 'off', {
            ...light.attributes,
            ...(message.service === 'turn_on' ? message.service_data as Record<string, unknown> : {}),
          });
        }
      }
    }
    if (message.type === 'call_service' && message.domain === 'input_boolean' && !params.has('unconfirmed')) {
      const id = (message.target as { entity_id: string[] }).entity_id[0];
      publish(id, message.service === 'turn_off' ? 'off' : message.service === 'toggle' && entities[id]?.state === 'on' ? 'off' : 'on');
    }
    if (message.type === 'call_service' && message.domain === 'dashboard_attention' && message.service === 'unsnooze') {
      const episode = (message.service_data as { episode: string }).episode;
      publish('sensor.dashboard_attention', '0', {
        ready: true,
        items: (entities['sensor.dashboard_attention'].attributes.items as typeof snoozedItems).map(item =>
          item.episode === episode ? { ...item, snoozed_until: null } : item
        ),
      });
    }
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
          templow: daily ? 8 : undefined,
          apparent_temperature: params.has('weather-details') && !daily ? 16 + (i % 4) : undefined,
          wind_speed: i % 3 ? 11.5 : 0,
          precipitation: i % 2 ? 0.4 : 0,
          precipitation_probability: params.has('weather-details') || daily ? (i % 2 ? 35 : 0) : undefined,
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
