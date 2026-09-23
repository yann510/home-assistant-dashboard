import { favouritePlaylists, formatTime, runningAppliances, speakers, tracks, roomSummary, escapeHtml as esc } from './state.js';
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
        kind: 'light',
        target: l.id,
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
              kind: 'blind-room',
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
      subtitle: 'Office · Gym · Bedroom',
      category: 'Climate',
      room: '',
      kind: 'thermostat',
      symbol: 'sun',
    },
    {
      id: 'appliances',
      title: 'Appliances',
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
    case 'lights': {
      const ordered = [...state.rooms].sort((a, b) => Number(b.id === route.id) - Number(a.id === route.id));
      return {
        title: 'All lights',
        html: `<div class="lights-toolbar"><p class="fine-print">Switch here. Tap a light for brightness & colour.</p><button class="chip" data-action="all-lights-off" data-focus-key="sheet-all-off">All lights off</button></div><nav class="room-jumps" aria-label="Jump to room">${ordered.map(r => `<button class="chip" data-action="jump-room" data-id="${r.id}">${r.name}</button>`).join('')}</nav><div class="lights-grid">${ordered.map(r => `<section class="light-group" id="lights-${r.id}"><div class="detail-row"><h3>${r.name}</h3>${button(`Turn ${r.name} lights ${roomSummary(r).on ? 'off' : 'on'}`, 'room-power', roomSummary(r).on ? 'Room off' : 'Room on', `class="chip" data-room-id="${r.id}" data-focus-key="group-${r.id}"`)}</div>${r.lights.map(l => `<div class="compact-light"><button class="light-name" ${open('light', l.id)} data-focus-key="detail-${l.id}">${icon('bulb')}<span><strong>${esc(l.name)}</strong><small>${!l.available ? 'Unavailable' : l.on ? `On · ${l.brightness}%` : 'Off'}</small></span>${icon('arrow')}</button>${button(`${r.name} ${l.name} power`, 'light-power', '<span></span>', `class="switch" data-room-id="${r.id}" data-id="${l.id}" data-focus-key="power-${l.id}" aria-pressed="${l.available && l.on}" ${l.available ? '' : 'disabled'}`)}</div>`).join('')}</section>`).join('')}</div>`,
      };
    }
    case 'light': {
      const parent = state.rooms.find(r => r.lights.some(l => l.id === route.id));
      const l = parent.lights.find(l => l.id === route.id);
      // Share the existing capability-aware light controls, scoped to this light.
      const content = renderDetails(
        { ...state, rooms: [{ ...parent, lights: [l], blinds: false }] },
        { kind: 'room', id: parent.id, singleLight: true }
      );
      return { title: `${parent.name} · ${l.name}`, html: content.html };
    }
    case 'volume':
      return {
        title: 'Volume',
        html: `<p class="sheet-intro">${state.music.members.join(' · ')}</p><label class="range-row">Volume<input aria-label="Speaker volume" type="range" min="0" max="100" value="${state.music.volume}" data-action="volume" data-focus-key="sheet-volume"><output>${state.music.volume}%</output></label>${chip(state.music.muted ? 'Unmute speakers' : 'Mute speakers', 'mute', '', state.music.muted)}<p class="fine-print">Group adjustments preserve differences between speakers, up to their volume limits.</p>`,
      };
    case 'blind-room':
      return {
        title: `${room.name} blinds`,
        html: `<p class="sheet-intro">Control all the blinds in this room.</p><section class="detail-card">${blindControls(room)}<p class="fine-print">${room.lastBlindCommand ? `Last command: ${room.lastBlindCommand}. ` : ''}Current position isn’t reported.</p></section>`,
      };
    case 'room':
      return {
        title: room.name,
        html: `<p class="sheet-intro">Make this room feel just right.</p>
 ${route.singleLight ? '' : `<div class="detail-row"><h3>Lights</h3>${button(`Toggle ${room.name} lights`, 'room-power', `${icon('bulb')} ${roomSummary(room).on ? 'Turn all off' : 'Turn all on'}`, `class="chip" data-room-id="${room.id}" data-focus-key="sheet-room-power"`)}</div>`}
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
    case 'music': {
      const speakersTab = route.tab === 'speakers';
      return {
        title: 'Your soundtrack',
        html: `<div class="music-tabs" aria-label="Music views">${['player', 'speakers'].map(t => button(t === 'player' ? 'Player' : 'Speakers', 'music-tab', t === 'player' ? 'Player' : 'Speakers', `class="chip" data-value="${t}" data-focus-key="music-tab-${t}" aria-pressed="${(t === 'speakers') === speakersTab}"`)).join('')}</div>${
          speakersTab
            ? `<div class="speaker-simple">
 <section class="follow-summary"><div><h3>Follow me</h3><p class="fine-print">${state.music.follow ? 'Rooms join automatically as you move.' : 'Let your music follow you from room to room.'}</p></div>${button(state.music.follow ? 'Turn Follow me off' : 'Turn Follow me on', 'follow', state.music.follow ? 'On ✓' : 'Off', `class="chip" aria-pressed="${state.music.follow}" data-focus-key="sheet-follow"`)}</section>
 <div class="speaker-question"><h3>Where should the music play?</h3>${state.music.follow ? button('Choose rooms manually', 'manual', 'Choose rooms manually', 'class="text-button" data-focus-key="choose-manual"') : `<p class="fine-print">Tap rooms to add or remove them. ${esc(state.music.room)} is the main speaker.</p>`}</div>
 <div class="speaker-room-choices" role="group" aria-label="Rooms playing music">${speakers.map(r => button(`${r} speaker`, 'group-toggle', `${icon('speaker')}<span>${r}<small>${r === state.music.room ? 'Main speaker' : state.music.follow ? 'Automatic' : state.music.members.includes(r) ? 'Selected' : 'Add room'}</small></span><span class="room-check" aria-hidden="true">${state.music.members.includes(r) ? '✓' : '+'}</span>`, `class="speaker-room-choice" data-value="${r}" data-focus-key="speaker-${r}" aria-pressed="${state.music.members.includes(r)}" ${state.music.follow || r === state.music.room ? 'disabled' : ''}`)).join('')}</div>
 <section class="speaker-group-volume"><label class="range-row">Group volume<input aria-label="Group volume" type="range" min="0" max="100" value="${state.music.volume}" data-action="volume" data-focus-key="group-volume"><output>${state.music.volume}%</output></label>${chip(state.music.muted ? 'Unmute speakers' : 'Mute speakers', 'mute', '', state.music.muted)}</section>
 <div class="speaker-extra-buttons">${button('Individual volumes', 'speaker-disclosure', `Individual volumes ${route.volumesOpen ? '−' : '+'}`, `class="chip" data-value="volumesOpen" aria-expanded="${!!route.volumesOpen}" aria-controls="individual-volumes" data-focus-key="individual-volumes-toggle"`)}${button('Advanced speaker settings', 'speaker-disclosure', `Advanced ${route.advancedOpen ? '−' : '+'}`, `class="chip" data-value="advancedOpen" aria-expanded="${!!route.advancedOpen}" aria-controls="advanced-speakers" data-focus-key="advanced-speakers-toggle"`)}</div>
 <div id="individual-volumes" ${route.volumesOpen ? '' : 'hidden'}>${state.music.members.map(r => `<label class="range-row">${r}<input aria-label="${r} volume" type="range" min="0" max="100" value="${state.music.volumes[r]}" data-action="speaker-volume" data-id="${r}" data-focus-key="speaker-volume-${r}"><output>${state.music.volumes[r]}%</output></label>`).join('')}</div>
 <div id="advanced-speakers" ${route.advancedOpen ? '' : 'hidden'}><label class="field">Main speaker<select data-action="speaker" data-focus-key="speaker" ${state.music.follow ? 'disabled' : ''}>${speakers.map(r => `<option ${r === state.music.room ? 'selected' : ''}>${r}</option>`).join('')}</select></label><p class="fine-print">Changing the main speaker starts a new group with only that room. ${state.music.follow ? 'Choose rooms manually first to change it.' : ''}</p>${!state.music.follow ? `<div class="chip-list">${chip('All rooms', 'group-all', '')}${chip('Only main speaker', 'group-source', '')}</div>` : ''}</div>
 <p class="fine-print speaker-demo-note">Demo only. No real audio or motion detection.</p></div>`
            : `<div class="player-layout"><section class="player-main"><div class="full-track"><div class="album">${albumArt()}</div><div><h3>${esc(track.title)}</h3><p>${esc(track.artist)}</p><p>${state.music.playing ? 'Playing' : 'Paused'} · ${state.music.room}</p></div></div>
 <div class="transport large-transport">${button('Previous track', 'skip', icon('prev'), 'class="icon-button" data-value="-1" data-focus-key="sheet-prev"')}${button(state.music.playing ? 'Pause music' : 'Play music', 'play', icon(state.music.playing ? 'pause' : 'play'), 'class="play-button" data-focus-key="sheet-play"')}${button('Next track', 'skip', icon('next'), 'class="icon-button" data-value="1" data-focus-key="sheet-next"')}</div>
 <div class="track-timeline"><label for="track-progress">Track progress <small>Sample track</small></label><input id="track-progress" aria-label="Track progress" aria-valuetext="${formatTime(state.music.position)} of ${formatTime(track.duration)}" type="range" min="0" max="${track.duration}" value="${state.music.position}" data-action="seek" data-focus-key="seek"><output>${formatTime(state.music.position)} / ${formatTime(track.duration)}</output></div>
 <p class="fine-print">${state.music.playlist ? `Selected playlist: ${esc(state.music.playlist)} · demo` : 'Choose a favourite playlist to set the mood.'}</p>
</section><section class="player-library"><h3 class="detail-title">Your favourite playlists</h3><div class="device-list favourite-playlists">${favouritePlaylists.map((title, i) => button(title, 'favourite', `${icon(state.music.playlist === title ? 'check' : 'play')}<span><strong>${esc(title)}</strong></span>`, `class="device-item" data-value="${i}" data-focus-key="favourite-${i}" aria-pressed="${state.music.playlist === title}"`)).join('')}</div><p class="fine-print">Your saved favourites · captured from Home Assistant. Playback and track times are simulated.</p></section></div>`
        }`,
      };
    }
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
    case 'activity':
      return {
        title: 'House pulse',
        html: `<p class="sheet-intro">What's happening around your home.</p><div class="device-list">${runningAppliances(state)
          .map(
            a =>
              `<button class="device-item pulse-running ${a.paused ? 'is-paused' : ''}" ${open(a.kind, a.id)} data-focus-key="pulse-${a.id}">${icon(a.symbol)}<span><strong>${a.name}</strong><small>${a.status}</small></span>${icon('arrow')}</button>`
          )
          .join(
            ''
          )}</div>${state.notices.length ? `<button class="chip" ${open('attention')} data-focus-key="pulse-attention">${state.notices.length} need attention ${icon('arrow')}</button>` : '<p class="fine-print">Nothing needs your attention.</p>'}`,
      };
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
        html: `<p class="sheet-intro">What would you like to control?</p><div class="device-categories">${[
          ['Lights', 'bulb', 'Power, brightness & colour'],
          ['Blinds', 'blinds', 'Open & close by room'],
          ['Music', 'speaker', 'Speakers, sources & favourites'],
          ['Climate', 'sun', 'Temperature & comfort'],
          ['Appliances', 'grid', 'Laundry & cleaning'],
        ]
          .map(
            ([name, symbol, desc]) =>
              `<button class="category-tile" data-action="open" data-kind="${name === 'Lights' ? 'lights' : name === 'Music' ? 'music' : name === 'Climate' ? 'thermostat' : 'device-category'}" data-id="${name}" data-focus-key="category-${name}">${icon(symbol)}<span><strong>${name}</strong><small>${desc}</small></span>${icon('arrow')}</button>`
          )
          .join(
            ''
          )}</div><label class="field">Or search for a device<input type="search" id="device-search" class="search-input" placeholder="Find a light, room, or device" data-focus-key="device-search" autocomplete="off"></label><div id="device-results">${query ? renderDeviceList(state, query) : ''}</div>`,
      };
    case 'device-category': {
      if (route.id === 'Lights' || route.id === 'Blinds') {
        const rooms = state.rooms.filter(r => route.id === 'Lights' || r.blinds);
        return {
          title: route.id,
          html: `<p class="sheet-intro">Choose a room.</p><div class="device-list">${rooms.map(r => `<button class="device-item" ${open(route.id === 'Blinds' ? 'blind-room' : 'room', r.id)} data-focus-key="category-room-${r.id}">${icon(r.symbol)}<span><strong>${r.name}</strong><small>${route.id === 'Lights' ? `${roomSummary(r).on} lights on${roomSummary(r).unavailable ? ' · 1 offline' : ''}` : 'Open, stop & close'}</small></span>${icon('arrow')}</button>`).join('')}</div>`,
        };
      }
      const destinations =
        route.id === 'Music'
          ? [['music', 'Music & speakers', 'speaker']]
          : route.id === 'Climate'
            ? [['thermostat', 'Thermostat', 'sun']]
            : [
                ['appliances', 'Laundry & dishwasher', 'grid'],
                ['vacuum', 'Roomba', 'sparkle'],
              ];
      return {
        title: route.id,
        html: `<div class="device-list">${destinations.map(([kind, title, symbol]) => `<button class="device-item" ${open(kind)} data-focus-key="category-device-${kind}">${icon(symbol)}<span><strong>${title}</strong><small>View controls ${icon('arrow')}</small></span></button>`).join('')}</div>`,
      };
    }
    case 'thermostat':
      return {
        title: 'A comfortable temperature',
        html: `<p class="sheet-intro">Temperature by room · sample readings</p>${Object.entries(state.temperatures)
          .map(
            ([name, target]) =>
              `<section class="detail-card"><div class="detail-row"><div><h3>${name}</h3><small>Currently 20.5°C · Sample</small></div><div class="volume-stepper">${button(`Lower ${name} target`, 'temperature-step', '−', `data-id="${name}" data-value="-0.5" data-focus-key="temp-down-${name}" ${target <= 16 ? 'disabled' : ''}`)}<output aria-label="${name} target">${target}°</output>${button(`Raise ${name} target`, 'temperature-step', '+', `data-id="${name}" data-value="0.5" data-focus-key="temp-up-${name}" ${target >= 28 ? 'disabled' : ''}`)}</div></div></section>`
          )
          .join('')}`,
      };
    case 'appliances':
      return {
        title: route.id && state.appliances[route.id] ? route.id.charAt(0).toUpperCase() + route.id.slice(1) : 'The everyday helpers',
        html: `<p class="sheet-intro">Laundry, dishes and the everyday essentials.</p>${[
          ['Washer', state.appliances.washer],
          ['Dryer', state.appliances.dryer],
          ['Dishwasher', state.appliances.dishwasher],
        ]
          .filter(([name]) => !state.appliances[route.id] || name.toLowerCase() === route.id)
          .map(
            ([name, status]) =>
              `<section class="detail-card"><div class="detail-row"><h3>${name}</h3><span class="${status.startsWith('Running') ? 'pulse-running' : ''}">${icon(name.toLowerCase())}</span></div><p>${status}</p>${name === 'Washer' && state.scenario === 'busy' ? '<progress value="80" max="100" aria-label="Wash cycle progress" style="width:100%;accent-color:var(--lilac)"></progress>' : ''}</section>`
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
          )}<button class="chip" data-action="fail-next">Fail the next device command</button><p class="fine-print">Test pending, failure and retry feedback. All responses are simulated.</p><button class="primary-button" data-action="reset">Reset this scene</button><p class="fine-print">Tablet: one landscape overview. Phone: room controls and detail sheets, with music always within reach.</p>`,
      };
    default:
      return { title: 'Home', html: '<p>Choose a room or device.</p>' };
  }
}
