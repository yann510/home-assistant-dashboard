export const favouriteArtwork = {
  'Bangers Workout Mix': 'https://seed-mix-image.spotifycdn.com/v6/img/desc/Bangers Workout/en/default',
  'Chill House Mix': 'https://seed-mix-image.spotifycdn.com/v6/img/desc/Chill House/en/default',
  'Cozy Dinner Mix': 'https://seed-mix-image.spotifycdn.com/v6/img/desc/Cozy Dinner/en/default',
  'Crush Radio': 'https://pickasso.spotifycdn.com/image/ab67c0de0000deef/dt/v1/img/radio/track/0FtuxFKzjbVCQAA3UQZXll/en',
  'Discover Weekly': 'https://pickasso.spotifycdn.com/image/ab67c0de0000deef/dt/v1/img/dw/cover/en',
  'Electro House Mix': 'https://seed-mix-image.spotifycdn.com/v6/img/desc/Electro House/en/default',
  'Modern Jazz Mix': 'https://seed-mix-image.spotifycdn.com/v6/img/desc/Modern Jazz/en/default',
};
export const favouritePlaylists = [
  'Bangers Workout Mix',
  'Chill House Mix',
  'Cozy Dinner Mix',
  'Crush Radio',
  'Discover Weekly',
  'Electro House Mix',
  'Modern Jazz Mix',
];
export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
export const speakers = ['Living room', 'Bathroom', 'Bedroom', 'Gym'];
export const moods = [
  { id: 'love', name: 'Love', colour: '#efa5a5', caption: 'A little closer.' },
  { id: 'unwind', name: 'Unwind', colour: '#cbb5ed', caption: 'Let the day drift away.' },
  { id: 'dinner', name: 'Dinner', colour: '#efbe83', caption: 'Good food. Better company.' },
  { id: 'party', name: 'Party', colour: '#c5d68c', caption: 'Turn a little louder.' },
  { id: 'gym', name: 'Gym', colour: '#9ccfd1', caption: 'Find your rhythm.' },
];
export const tracks = [
  { duration: 234, title: 'All In A Dream', artist: 'LP Giobbi · DJ Tennis · Joseph Ashworth', album: 'Light Places', colour: '#ea9a71' },
  { duration: 302, title: 'Tadow', artist: 'Masego · FKJ', album: 'French Kiwi Juice', colour: '#a8c5a4' },
  { duration: 318, title: 'A Walk', artist: 'Tycho', album: 'Dive', colour: '#c6b1eb' },
  {
    duration: 245,
    title: 'An exceptionally long song title for a slow evening at home',
    artist: 'House Canvas · Sample artist with a long name',
    album: 'Long-title demo',
    colour: '#91b5ce',
  },
];
const inventory = [
  ['living', 'Living room', 'sofa', true, ['Bulbs', 'LED strip']],
  ['bedroom', 'Bedroom', 'bed', true, ['Main', 'Closet']],
  ['office', 'Office', 'desk', false, ['Bulbs', 'Neon']],
  ['kitchen', 'Kitchen', 'cup', false, ['Main']],
  ['gym', 'Gym', 'gym', true, ['Main']],
  ['entry', 'Entry', 'door', false, ['Front door', 'Laundry']],
  ['toilet', 'Toilet', 'bath', false, ['Main']],
];
export function createState(scenario = 'everyday') {
  const busy = scenario === 'busy',
    night = scenario === 'nighttime';
  return {
    scenario,
    lightRoom: 'living',
    blindRooms: ['living', 'bedroom', 'gym'],
    mode: night ? 'night' : 'day',
    mood: night ? 'love' : 'unwind',
    rooms: inventory.map(([id, name, symbol, blinds, names], i) => ({
      id,
      name,
      symbol,
      blinds,
      lastBlindCommand: null,
      lights: names.map((name, j) => ({
        id: `${id}-${j}`,
        name,
        on: night ? i === 0 : busy ? i < 5 : i === 0 || i === 2,
        available: !(busy && id === 'office' && j === 1),
        brightness: night ? 25 : 65,
        colour: '#ffd39b',
        colourCapable: ['living', 'bedroom', 'office', 'gym'].includes(id) && name !== 'Closet',
      })),
    })),
    music: {
      follow: false,
      muted: false,
      position: 56,
      playlist: null,
      members: ['Living room'],
      volumes: Object.fromEntries(speakers.map(r => [r, night ? 18 : 32])),
      playing: !night,
      trackIndex: busy ? 3 : 0,
      volume: night ? 18 : 32,
      room: 'Living room',
      source: 'Favourites',
    },
    notices: night
      ? []
      : busy
        ? [
            {
              id: 'light',
              title: 'Office neon is unavailable.',
              short: 'Office light offline',
              detail: 'The neon light is offline in this demo. Other lights still work.',
              category: 'room',
              roomId: 'office',
            },
          ]
        : [
            {
              id: 'dryer',
              title: 'Laundry, ready when you are.',
              short: 'Dryer finished',
              detail: 'The dryer has finished. Your laundry is ready to put away.',
              category: 'appliances',
            },
          ],
    appliances: {
      washer: busy ? 'Running · 12 min left' : 'Ready for the next load',
      dryer: busy ? 'Running · 28 min left' : night ? 'Idle' : 'Cycle finished',
      dishwasher: night ? 'Idle' : 'Running · 42 min left',
    },
    vacuum: busy ? 'cleaning' : 'docked',
    thermostat: 21,
    temperatures: { Office: 21, Gym: 20, Bedroom: 19 },
  };
}
export function runningAppliances(state) {
  return [
    ...Object.entries(state.appliances)
      .filter(([, status]) => status.startsWith('Running'))
      .map(([id, status]) => ({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        status: status.replace('Running · ', ''),
        kind: 'appliances',
        symbol: id,
      })),
    ...(state.vacuum === 'cleaning'
      ? [{ id: 'vacuum', name: 'Roomba', status: 'Cleaning', kind: 'vacuum', symbol: 'roomba' }]
      : state.vacuum === 'paused'
        ? [{ id: 'vacuum', name: 'Roomba', status: 'Paused', kind: 'vacuum', symbol: 'roomba', paused: true }]
        : []),
  ];
}
export function roomSummary(room) {
  return {
    on: room.lights.filter(l => l.available && l.on).length,
    available: room.lights.filter(l => l.available).length,
    unavailable: room.lights.filter(l => !l.available).length,
  };
}
export function applyAction(state, a) {
  const room = state.rooms.find(r => r.id === a.roomId),
    light = room?.lights.find(l => l.id === a.id);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n)));
  switch (a.type) {
    case 'mode':
      state.mode = a.value;
      return `${a.value === 'day' ? 'Day' : 'Night'} mode selected`;
    case 'mood':
      state.mood = a.value || null;
      return state.mood ? `${moods.find(m => m.id === a.value).name} mood selected` : 'Mood ended';
    case 'all-lights-off':
      state.rooms
        .flatMap(r => r.lights)
        .filter(l => l.available)
        .forEach(l => {
          l.on = false;
        });
      return 'All available lights off';
    case 'room-power': {
      const available = room.lights.filter(l => l.available);
      const on = !available.some(l => l.on);
      available.forEach(l => {
        l.on = on;
        if (on && l.brightness === 0) l.brightness = 65;
      });
      return `${room.name} lights ${on ? 'on' : 'off'}`;
    }
    case 'light-power':
      if (!light?.available) return 'Light unavailable';
      light.on = !light.on;
      if (light.on && light.brightness === 0) light.brightness = 65;
      return `${light.name} ${light.on ? 'on' : 'off'}`;
    case 'light-room':
      state.lightRoom = a.value;
      return '';
    case 'blind-select':
      if (!state.rooms.some(r => r.id === a.value && r.blinds)) return '';
      state.blindRooms = state.blindRooms.includes(a.value)
        ? state.blindRooms.filter(id => id !== a.value)
        : [...state.blindRooms, a.value];
      return '';
    case 'room-brightness':
      room.lights
        .filter(l => l.available)
        .forEach(l => {
          l.brightness = clamp(a.value, 0, 100);
          l.on = l.brightness > 0;
        });
      return 'Room brightness updated';
    case 'brightness':
      if (light?.available) {
        light.brightness = clamp(a.value, 0, 100);
        light.on = light.brightness > 0;
      }
      return 'Brightness updated';
    case 'colour':
      if (light?.available && light.colourCapable) light.colour = a.value;
      return 'Light colour updated';
    case 'blind': {
      const targets = state.rooms.filter(
        r =>
          r.blinds && (a.roomId === 'all' || (a.roomId === 'selected' ? (a.roomIds ?? state.blindRooms).includes(r.id) : r.id === a.roomId))
      );
      if (!targets.length) return 'Select a room first';
      targets.forEach(r => {
        r.lastBlindCommand = a.value;
      });
      return `${targets.map(r => r.name).join(', ')}: ${a.value} command sent (demo)`;
    }
    case 'play':
      state.music.playing = !state.music.playing;
      return state.music.playing ? 'Music playing' : 'Music paused';
    case 'skip':
      state.music.position = 0;
      state.music.trackIndex = (state.music.trackIndex + Number(a.value) + tracks.length) % tracks.length;
      return tracks[state.music.trackIndex].title;
    case 'volume-step':
      return applyAction(state, { type: 'volume', value: state.music.volume + Number(a.value) });
    case 'volume': {
      const next = clamp(a.value, 0, 100),
        delta = next - state.music.volume;
      state.music.members.forEach(r => {
        state.music.volumes[r] = clamp(state.music.volumes[r] + delta, 0, 100);
      });
      state.music.volume = next;
      state.music.muted = false;
      return 'Volume updated';
    }
    case 'speaker-volume':
      state.music.volumes[a.id] = clamp(a.value, 0, 100);
      if (a.id === state.music.room) state.music.volume = state.music.volumes[a.id];
      return 'Speaker volume updated';
    case 'mute':
      state.music.muted = !state.music.muted;
      return state.music.muted ? 'Speakers muted' : 'Speakers unmuted';
    case 'seek':
      state.music.position = clamp(a.value, 0, tracks[state.music.trackIndex].duration);
      return 'Track position updated';
    case 'follow':
      state.music.follow = !state.music.follow;
      if (!state.music.follow) state.music.members = [state.music.room];
      return state.music.follow ? 'Follow me enabled (demo)' : 'Follow me off; original speaker retained';
    case 'manual':
      state.music.follow = false;
      return 'Manual grouping enabled; current group retained';
    case 'group-all':
      if (!state.music.follow) state.music.members = [...speakers];
      return '';
    case 'group-source':
      if (!state.music.follow) state.music.members = [state.music.room];
      return '';
    case 'group-toggle':
      if (state.music.follow || a.value === state.music.room) return '';
      state.music.members = state.music.members.includes(a.value)
        ? state.music.members.filter(r => r !== a.value)
        : [...state.music.members, a.value];
      return 'Speaker group updated';
    case 'speaker':
      if (state.music.follow) return '';
      state.music.room = a.value;
      state.music.members = [a.value];
      state.music.volume = state.music.volumes[a.value];
      return `Playing in ${a.value}`;
    case 'source':
      state.music.source = a.value;
      return `${a.value} selected`;
    case 'favourite':
      state.music.source = 'Favourites';
      if (!favouritePlaylists[Number(a.value)]) return '';
      state.music.playlist = favouritePlaylists[Number(a.value)];
      state.music.playing = true;
      state.music.position = 0;
      return `${state.music.playlist} selected`;
    case 'dismiss':
      state.notices = state.notices.filter(n => n.id !== a.id);
      return 'Reminder dismissed';
    case 'temperature-step':
      state.temperatures[a.id] = clamp(state.temperatures[a.id] + Number(a.value), 16, 28);
      return `${a.id} target updated`;
    case 'thermostat':
      state.thermostat = clamp(a.value, 16, 28);
      return `Temperature set to ${state.thermostat} degrees`;
    case 'vacuum':
      state.vacuum = a.value;
      return `Vacuum ${a.value}`;
    default:
      return '';
  }
}
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
