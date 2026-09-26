import { useStore } from '@hakit/core';
import { speakerIds } from '../useSpeakerSession';
import { useCanvasLights } from './useCanvasLights';
import type { CanvasRoute } from './routes';
import type { BlindRoom } from './useCanvasBlinds';

type Entry = { id: string; name: string; detail: string; category: string; room: string; search: string; route: CanvasRoute };
const categoryEntries: Omit<Entry, 'id'>[] = [
  {
    name: 'Lights',
    detail: 'By room',
    category: 'Lights',
    room: '',
    search: 'lights bulbs brightness colour',
    route: { kind: 'all-lights' },
  },
  {
    name: 'Blinds',
    detail: 'Open · stop · close',
    category: 'Blinds',
    room: '',
    search: 'open stop close shades',
    route: { kind: 'blinds' },
  },
  {
    name: 'Speakers',
    detail: 'Rooms · volume · Follow me',
    category: 'Music',
    room: '',
    search: 'music audio volume follow me',
    route: { kind: 'speakers' },
  },
  {
    name: 'Climate',
    detail: 'Thermostats',
    category: 'Climate',
    room: '',
    search: 'thermostats temperature heating',
    route: { kind: 'thermostats' },
  },
  {
    name: 'Appliances',
    detail: 'Washer · dryer · dishwasher',
    category: 'Appliances',
    room: '',
    search: 'washer dryer dishwasher laundry kitchen',
    route: { kind: 'appliances' },
  },
  {
    name: 'Vacuum',
    detail: 'Roomba',
    category: 'Cleaning',
    room: '',
    search: 'roomba robot vacuum cleaning',
    route: { kind: 'vacuum' },
  },
];

function CategoryArtwork({ kind }: { kind: CanvasRoute['kind'] }) {
  return (
    <svg
      viewBox='0 0 88 80'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <circle cx='47' cy='40' r='31' fill='currentColor' opacity='.09' stroke='none' />
      {kind === 'all-lights' && (
        <>
          <path d='M44 7v14M32 22h24l12 28H20l12-28Z' fill='currentColor' fillOpacity='.2' />
          <path d='M37 50a7 7 0 0 0 14 0M28 59l-5 9M60 59l5 9M44 62v11' />
        </>
      )}
      {kind === 'blinds' && (
        <>
          <rect x='22' y='12' width='44' height='56' rx='3' />
          <path d='M22 22h44M22 31h44M22 40h44M22 49h44M44 50v18M73 18v34' />
          <circle cx='73' cy='56' r='3' fill='currentColor' />
        </>
      )}
      {kind === 'speakers' && (
        <>
          <rect x='24' y='11' width='36' height='59' rx='8' />
          <circle cx='42' cy='47' r='11' />
          <circle cx='42' cy='25' r='3' fill='currentColor' />
          <path d='M69 29q10 13 0 26M75 22q15 20 0 40' />
        </>
      )}
      {kind === 'thermostats' && (
        <>
          <path d='M37 44V18a7 7 0 0 1 14 0v26a14 14 0 1 1-14 0Z' />
          <path d='M44 29v25M58 22h7M58 32h5' />
          <circle cx='44' cy='56' r='7' fill='currentColor' fillOpacity='.4' />
          <path d='M19 26v9M15 30h8M68 49v8M64 53h8' />
        </>
      )}
      {kind === 'appliances' && (
        <>
          <rect x='19' y='11' width='50' height='60' rx='7' />
          <path d='M19 25h50M26 18h10' />
          <circle cx='60' cy='18' r='1' fill='currentColor' />
          <circle cx='44' cy='47' r='16' />
          <path d='M31 48q7-7 13 0t13 0' />
          <path d='M35 56q9 8 18-2' />
        </>
      )}
      {kind === 'vacuum' && (
        <>
          <circle cx='44' cy='43' r='25' />
          <path d='M21 49h46M36 22h16M20 58l-7 8M68 58l7 8' />
          <circle cx='44' cy='37' r='5' fill='currentColor' fillOpacity='.3' />
          <path d='M72 13v10M67 18h10M15 23v6M12 26h6' />
        </>
      )}
    </svg>
  );
}
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
    {
      id: 'vacuum.roomba',
      name: entities['vacuum.roomba']?.attributes.friendly_name?.trim() || 'Roomba',
      detail: 'Vacuum controls',
      category: 'Cleaning',
      room: '',
      search: 'roomba robot vacuum cleaning',
      route: { kind: 'vacuum' },
    },
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
      <label>
        <span className='canvas-devices__search-label'>Find a device or room</span>
        <input
          type='search'
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          aria-label='Find a device or room'
          placeholder='Search devices and rooms'
          autoComplete='off'
        />
      </label>
      {needle && (
        <p role='status'>
          {matches.length} {matches.length === 1 ? 'destination' : 'destinations'}
        </p>
      )}
      {!needle ? (
        <nav aria-label='Device categories' className='canvas-devices__categories'>
          {categoryEntries.map(entry => (
            <button
              key={entry.route.kind}
              type='button'
              className={`canvas-devices__category canvas-devices__category--${entry.route.kind}`}
              aria-label={entry.name}
              data-canvas-focus-key={`category:${entry.route.kind}`}
              onClick={event => onOpen(entry.route, event.currentTarget)}
            >
              <CategoryArtwork kind={entry.route.kind} />
              <span>
                <strong>{entry.name}</strong>
                <small>{entry.detail}</small>
              </span>
              <span className='canvas-devices__arrow' aria-hidden='true'>
                ↗
              </span>
            </button>
          ))}
        </nav>
      ) : matches.length ? (
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
