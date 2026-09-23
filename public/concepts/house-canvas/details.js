import { tracks, roomSummary, escapeHtml as esc } from './state.js';
import { icon, albumArt } from './art.js';
import { button, blindControls } from './overview.js';
const open = (kind, id = '') => `data-action="open" data-kind="${kind}" data-id="${id}"`;
const chip = (label, type, value, selected = false) =>
  button(
    label,
    type,
    esc(label),
    `class="chip" data-value="${esc(value)}" aria-pressed="${selected}" data-focus-key="${type}-${esc(value)}"`
  );
export function deviceEntries(state) {
  return [
    ...state.rooms.flatMap(r => [
      ...r.lights.map(l => ({
        id: l.id,
        title: `${r.name} · ${l.name}`,
        subtitle: l.available ? (l.on ? `On · ${l.brightness}%` : 'Off') : 'Unavailable',
        category: 'Lights',
        room: r.id,
        kind: 'room',
        target: r.id,
        symbol: 'bulb',
      })),
      ...(r.blinds
        ? [
            {
              id: `${r.id}-blinds`,
              title: `${r.name} blinds`,
              subtitle: r.lastBlindCommand ? `${r.lastBlindCommand} command sent` : 'Open, stop or close',
              category: 'Blinds',
              room: r.id,
              kind: 'room',
              target: r.id,
              symbol: 'blinds',
            },
          ]
        : []),
    ]),
    { id: 'music', title: 'Music & speakers', subtitle: state.music.room, category: 'Music', room: '', kind: 'music', symbol: 'speaker' },
    {
      id: 'thermostat',
      title: 'Thermostat',
      subtitle: `Set to ${state.thermostat}°C`,
      category: 'Climate',
      room: '',
      kind: 'thermostat',
      symbol: 'sun',
    },
    {
      id: 'appliances',
      title: 'Washer & dryer',
      subtitle: state.appliances.dryer,
      category: 'Appliances',
      room: 'entry',
      kind: 'appliances',
      symbol: 'grid',
    },
    { id: 'vacuum', title: 'Roomba', subtitle: state.vacuum, category: 'Cleaning', room: '', kind: 'vacuum', symbol: 'sparkle' },
  ];
}
export function renderDeviceList(state, query = '', category = 'All', room = 'All') {
  const found = deviceEntries(state).filter(
    d =>
      (category === 'All' || d.category === category) &&
      (room === 'All' || d.room === room) &&
      `${d.title} ${d.subtitle}`.toLowerCase().includes(query.toLowerCase().trim())
  );
  return found.length
    ? `<p class="fine-print" role="status">${found.length} device${found.length === 1 ? '' : 's'}</p><div class="device-list">${found.map(d => `<button class="device-item" ${open(d.kind, d.target || '')} data-focus-key="device-${d.id}">${icon(d.symbol)}<span><strong>${esc(d.title)}</strong><small>${esc(d.subtitle)}</small></span>${icon('arrow')}</button>`).join('')}</div>`
    : `<div class="empty-state" role="status">${icon('search')}<h3>No devices found</h3><p>Try another room or a shorter name.</p><button class="chip" data-action="clear-search">Clear filters</button></div>`;
}
export function renderDetails(state, route, query = '') {
  const room = state.rooms.find(r => r.id === route.id),
    track = tracks[state.music.trackIndex];
  switch (route.kind) {
    case 'room':
      return {
        title: room.name,
        html: `<p class="sheet-intro">Make this room feel just right.</p>
 <div class="detail-row"><h3>Lights</h3>${button(`Toggle ${room.name} lights`, 'room-power', `${icon('bulb')} ${roomSummary(room).on ? 'Turn all off' : 'Turn all on'}`, `class="chip" data-room-id="${room.id}" data-focus-key="sheet-room-power"`)}</div>
 ${room.lights
   .map(
     l => `<section class="detail-card"><div class="detail-row"><div><h3>${esc(l.name)}</h3><small>${!l.available ? 'Unavailable' : l.on ? 'On' : 'Off'}</small></div>${button(`${l.name} light power`, 'light-power', '<span></span>', `class="switch" data-room-id="${room.id}" data-id="${l.id}" data-focus-key="light-${l.id}" aria-pressed="${l.on && l.available}" ${l.available ? '' : 'disabled'}`)}</div>
 <label class="range-row">Brightness<input type="range" min="0" max="100" value="${l.brightness}" aria-label="${l.name} brightness" data-action="brightness" data-room-id="${room.id}" data-id="${l.id}" data-focus-key="brightness-${l.id}" ${l.available ? '' : 'disabled'}><output>${l.brightness}%</output></label>
 ${
   l.colourCapable
     ? `<div class="colour-choices" aria-label="${l.name} colour">${[
         ['Warm', '#ffd39b'],
         ['White', '#fff8ef'],
         ['Coral', '#f1aa8e'],
         ['Lavender', '#cbb5ed'],
         ['Mint', '#9fd4bb'],
       ]
         .map(([name, c]) =>
           button(
             `${l.name} ${name} colour`,
             'colour',
             `<span style="--swatch:${c}"></span>`,
             `class="colour-choice" data-room-id="${room.id}" data-id="${l.id}" data-value="${c}" data-focus-key="${l.id}-${name}" aria-pressed="${l.colour === c}" ${l.available ? '' : 'disabled'}`
           )
         )
         .join('')}</div>`
     : ''
 }</section>`
   )
   .join('')}
 ${room.blinds ? `<h3 class="detail-title">Blinds</h3><section class="detail-card">${blindControls(room)}<p class="fine-print">${room.lastBlindCommand ? `Last command: ${room.lastBlindCommand}. ` : ''}Current position isn’t reported. These buttons simulate room-wide commands.</p></section>` : ''}`,
      };
    case 'music':
      return {
        title: 'Your soundtrack',
        html: `<div class="full-track"><div class="album">${albumArt()}</div><div><h3>${esc(track.title)}</h3><p>${esc(track.artist)}</p><p>${state.music.playing ? 'Playing' : 'Paused'} · ${state.music.room}</p></div></div>
 <div class="transport large-transport">${button('Previous track', 'skip', icon('prev'), 'class="icon-button" data-value="-1" data-focus-key="sheet-prev"')}${button(state.music.playing ? 'Pause music' : 'Play music', 'play', icon(state.music.playing ? 'pause' : 'play'), 'class="play-button" data-focus-key="sheet-play"')}${button('Next track', 'skip', icon('next'), 'class="icon-button" data-value="1" data-focus-key="sheet-next"')}</div>
 <label class="range-row">Volume<input aria-label="Speaker volume" type="range" min="0" max="100" value="${state.music.volume}" data-action="volume" data-focus-key="sheet-volume"><output>${state.music.volume}%</output></label>
 <label class="field">Play in<select data-action="speaker" data-focus-key="speaker">${['Living room', 'Bedroom', 'Office', 'Kitchen', 'Everywhere'].map(r => `<option ${r === state.music.room ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
 <label class="field">Source<select data-action="source" data-focus-key="source">${['Favourites', 'Spotify', 'Radio'].map(r => `<option ${r === state.music.source ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
 <h3 class="detail-title">Something for the moment</h3><div class="device-list">${tracks.map((t, i) => button(t.title, 'favourite', `${icon('play')}<span><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span>`, `class="device-item" data-value="${i}" data-focus-key="favourite-${i}"`)).join('')}</div><p class="fine-print">Sample player · no audio or real speakers are controlled.</p>`,
      };
    case 'weather': {
      const hourly = route.period !== 'daily';
      return {
        title: 'A look outside',
        html: `<div class="forecast-header"><div><strong>18°</strong><p>${state.scenario === 'nighttime' ? 'Clear night' : 'Mostly sunny'} · Feels like 17°</p></div>${icon('sun')}</div><p class="sheet-intro">A little sun, a little fresh air.<br>Sample forecast · not live weather.</p><div class="chip-list">${chip('Hourly', 'forecast', 'hourly', hourly)}${chip('Daily', 'forecast', 'daily', !hourly)}</div><div>${(hourly
          ? [
              ['Now', 18, '10%'],
              ['1 pm', 19, '10%'],
              ['2 pm', 20, '5%'],
              ['3 pm', 21, '5%'],
              ['4 pm', 20, '10%'],
              ['5 pm', 18, '15%'],
            ]
          : [
              ['Today', '21° / 14', '10%'],
              ['Thursday', '19° / 12', '20%'],
              ['Friday', '17° / 11', '45%'],
              ['Saturday', '20° / 13', '10%'],
              ['Sunday', '22° / 15', '5%'],
            ]
        )
          .map(
            ([label, temp, rain]) =>
              `<div class="forecast-row"><strong>${label}</strong>${icon('sun')}<span>${temp}°</span><small>${rain} rain</small></div>`
          )
          .join('')}</div>`,
      };
    }
    case 'attention':
      return {
        title: 'A little heads-up',
        html: state.notices.length
          ? `<p class="sheet-intro">Just the things that need a moment of your time.</p>${state.notices.map(n => `<section class="detail-card"><h3>${esc(n.short)}</h3><p class="sheet-intro">${esc(n.detail)}</p><div class="chip-list"><button class="chip" ${open(n.category, n.roomId || '')} data-focus-key="notice-${n.id}">View ${n.category === 'room' ? 'room' : 'appliances'} ${icon('arrow')}</button>${button(`Dismiss ${n.short}`, 'dismiss', 'Got it', `class="chip" data-id="${n.id}" data-focus-key="dismiss-${n.id}"`)}</div></section>`).join('')}`
          : `<div class="empty-state">${icon('check')}<h3>All good here.</h3><p>Nothing needs your attention.</p></div>`,
      };
    case 'devices':
      return {
        title: 'All devices',
        html: `<p class="sheet-intro">Everything has its place. Find a room, light, or device.</p><label class="field">Search devices<input type="search" id="device-search" class="search-input" placeholder="Try “bedroom” or “blinds”" data-focus-key="device-search" autocomplete="off"></label><div class="detail-row"><label class="field" style="flex:1">Category<select data-action="category" data-focus-key="category">${['All', 'Lights', 'Blinds', 'Music', 'Climate', 'Appliances', 'Cleaning'].map(c => `<option ${c === (route.category || 'All') ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label class="field" style="flex:1">Room<select data-action="room-filter" data-focus-key="room-filter"><option value="All">All</option>${state.rooms.map(r => `<option value="${r.id}" ${r.id === route.room ? 'selected' : ''}>${r.name}</option>`).join('')}</select></label></div><div id="device-results">${renderDeviceList(state, query, route.category, route.room)}</div>`,
      };
    case 'thermostat':
      return {
        title: 'A comfortable temperature',
        html: `<p class="sheet-intro">Whole-home temperature · demo controls</p><div class="thermostat-value">${state.thermostat}°</div><label class="range-row">Target<input aria-label="Target temperature" type="range" min="16" max="28" step=".5" value="${state.thermostat}" data-action="thermostat" data-focus-key="thermostat"><output>${state.thermostat}°</output></label><p class="fine-print">Current room temperature: 20.5°C (sample).</p>`,
      };
    case 'appliances':
      return {
        title: 'The everyday helpers',
        html: `<p class="sheet-intro">A quick check on the laundry.</p>${[
          ['Washer', state.appliances.washer],
          ['Dryer', state.appliances.dryer],
        ]
          .map(
            ([name, status]) =>
              `<section class="detail-card"><div class="detail-row"><h3>${name}</h3>${icon('grid')}</div><p>${status}</p>${name === 'Washer' && state.scenario === 'busy' ? '<progress value="80" max="100" aria-label="Wash cycle progress" style="width:100%;accent-color:var(--lilac)"></progress>' : ''}</section>`
          )
          .join('')}<p class="fine-print">Sample cycle information. Appliance power controls are not part of this concept.</p>`,
      };
    case 'vacuum':
      return {
        title: 'A fresh start',
        html: `<section class="detail-card"><div class="detail-row"><h3>Roomba</h3>${icon('sparkle')}</div><p>${state.vacuum === 'docked' ? 'Home at its dock.' : state.vacuum === 'cleaning' ? 'Making the rounds.' : 'Taking a pause.'}</p><div class="chip-list">${chip('Start cleaning', 'vacuum', 'cleaning', state.vacuum === 'cleaning')}${chip('Pause', 'vacuum', 'paused', state.vacuum === 'paused')}${chip('Return to dock', 'vacuum', 'docked', state.vacuum === 'docked')}</div></section><p class="fine-print">Demo commands only.</p>`,
      };
    case 'demo':
      return {
        title: 'Explore House Canvas',
        html: `<p class="sheet-intro">An interactive design study for your home. Every control uses sample data; nothing changes in the real house.</p>${[
          ['everyday', 'Everyday', 'A little music, a few lights, a finished load.'],
          ['busy', 'Busy evening', 'More activity, reminders, and a light offline.'],
          ['nighttime', 'Nighttime', 'Soft lighting and a quieter home.'],
        ]
          .map(
            ([id, name, desc]) =>
              `<button class="scenario-button" data-action="scenario" data-value="${id}" aria-pressed="${state.scenario === id}"><strong>${name}</strong><span>${desc}</span></button>`
          )
          .join(
            ''
          )}<button class="primary-button" data-action="reset">Reset this scene</button><p class="fine-print">Tablet: one landscape overview. Phone: room controls and detail sheets, with music always within reach.</p>`,
      };
    default:
      return { title: 'Home', html: '<p>Choose a room or device.</p>' };
  }
}
