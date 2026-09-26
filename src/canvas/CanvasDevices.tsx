import { useStore } from '@hakit/core';
import { speakerIds } from '../useSpeakerSession';
import { useCanvasLights } from './useCanvasLights';
import type { CanvasRoute } from './routes';
import type { BlindRoom } from './useCanvasBlinds';

type Entry = { id: string; name: string; detail: string; category: string; room: string; search: string; route: CanvasRoute };
const categoryEntries: Omit<Entry, 'id'>[] = [
  {
    name: 'All lights',
    detail: 'Power, brightness and colour',
    category: 'Lights',
    room: '',
    search: 'lights bulbs rooms',
    route: { kind: 'all-lights' },
  },
  {
    name: 'Blinds',
    detail: 'Living room, Bedroom and Gym',
    category: 'Blinds',
    room: '',
    search: 'open stop close shades',
    route: { kind: 'blinds' },
  },
  {
    name: 'Player',
    detail: 'Music and favourites',
    category: 'Music',
    room: '',
    search: 'music playback playlists',
    route: { kind: 'player' },
  },
  {
    name: 'Speakers',
    detail: 'Rooms, volume and Follow me',
    category: 'Music',
    room: '',
    search: 'music volume living bathroom bedroom gym',
    route: { kind: 'speakers' },
  },
  { name: 'Weather', detail: 'Forecast', category: 'Weather', room: '', search: 'temperature forecast rain', route: { kind: 'weather' } },
  {
    name: 'Thermostats',
    detail: 'Office, Gym and Bedroom',
    category: 'Climate',
    room: '',
    search: 'temperature heating climate',
    route: { kind: 'thermostats' },
  },
  {
    name: 'Appliances',
    detail: 'Washer, Dryer and Dishwasher',
    category: 'Appliances',
    room: '',
    search: 'laundry kitchen washing drying',
    route: { kind: 'appliances' },
  },
  { name: 'Roomba', detail: 'Vacuum controls', category: 'Cleaning', room: '', search: 'robot vacuum', route: { kind: 'vacuum' } },
];
const blindRooms = ['Living room', 'Bedroom', 'Gym'];
const thermostats = ['Office', 'Gym', 'Bedroom'];

export function CanvasDevices({
  onOpen,
  query,
  onQueryChange,
}: {
  onOpen(route: CanvasRoute, trigger: HTMLElement): void;
  query: string;
  onQueryChange(query: string): void;
}) {
  const { rooms } = useCanvasLights();
  const entities = useStore(state => state.entities);
  const entries: Entry[] = [
    ...categoryEntries.map(entry => ({ ...entry, id: `category:${entry.route.kind}` })),
    ...rooms.flatMap(room =>
      room.lights.map(light => ({
        id: light.id,
        name: `${room.name} · ${light.name}`,
        detail: `${light.state === 'unavailable' ? 'Unavailable' : light.state === 'on' ? 'On' : 'Off'} · Power, brightness and colour when supported`,
        category: 'Lights',
        room: room.name,
        search: `${room.name} ${light.name} light bulb brightness colour color`,
        route: { kind: 'light', entityId: light.id } as CanvasRoute,
      }))
    ),
    ...blindRooms.map(room => ({
      id: `blinds:${room}`,
      name: `${room} blinds`,
      detail: 'Open, stop or close · position unavailable',
      category: 'Blinds',
      room,
      search: `${room} blinds shades`,
      route: { kind: 'blinds', room: room.toLowerCase() as BlindRoom } as CanvasRoute,
    })),
    ...speakerIds.map(id => {
      const room = id.replace('media_player.', '').replace(/_/g, ' ');
      const entity = entities[id];
      const name = entity?.attributes.friendly_name?.trim() || `${room[0].toUpperCase()}${room.slice(1)} speaker`;
      const available = entity && !['unknown', 'unavailable'].includes(entity.state);
      const features = entity?.attributes.supported_features ?? 0;
      const capabilities = [features & 4 ? 'volume' : '', features & 8 ? 'mute' : ''].filter(Boolean).join(', ');
      return {
        id,
        name,
        detail: available ? `Speaker · ${room}${capabilities ? ` · ${capabilities}` : ''}` : `Speaker · ${room} · unavailable`,
        category: 'Music',
        room,
        search: `${room} ${name} speaker music ${capabilities}`,
        route: { kind: 'speakers' } as CanvasRoute,
      };
    }),
    ...thermostats.map(room => ({
      id: `climate.thermostat_${room.toLowerCase()}`,
      name: `${room} thermostat`,
      detail: 'Temperature controls',
      category: 'Climate',
      room,
      search: `${room} thermostat heating temperature`,
      route: { kind: 'thermostats' } as CanvasRoute,
    })),
    ...(['Washer', 'Dryer', 'Dishwasher'] as const).map(name => ({
      id: `sensor.${name.toLowerCase()}_${name.toLowerCase()}_machine_state`,
      name,
      detail: 'Cycle status',
      category: 'Appliances',
      room: name === 'Dishwasher' ? 'Kitchen' : 'Entry & laundry',
      search: `${name} ${name === 'Dishwasher' ? 'Kitchen' : 'Laundry'} appliance cycle`,
      route: { kind: 'appliances' } as CanvasRoute,
    })),
  ];
  const needle = query.trim().toLocaleLowerCase();
  const matches = entries.filter(entry =>
    `${entry.name} ${entry.detail} ${entry.category} ${entry.room} ${entry.search}`.toLocaleLowerCase().includes(needle)
  );
  return (
    <div className='canvas-devices'>
      <p>Find a room, device or control.</p>
      <label>
        Find a device or room{' '}
        <input
          type='search'
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          aria-label='Find a device or room'
          placeholder='Search devices and rooms'
          autoComplete='off'
        />
      </label>
      <p role='status'>
        {matches.length} {matches.length === 1 ? 'destination' : 'destinations'}
      </p>
      {matches.length ? (
        <nav aria-label='Device directory' className='canvas-devices__list'>
          {matches.map(entry => (
            <button
              key={entry.id}
              type='button'
              aria-label={entry.name}
              data-canvas-focus-key={entry.id}
              onClick={event => onOpen(entry.route, event.currentTarget)}
            >
              <span>
                <strong>{entry.name}</strong>
                <small>{entry.detail}</small>
              </span>
              <span aria-hidden='true'>→</span>
            </button>
          ))}
        </nav>
      ) : (
        <div role='status'>
          <p>No devices found. Try another room or shorter name.</p>
          <button type='button' onClick={() => onQueryChange('')}>
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
