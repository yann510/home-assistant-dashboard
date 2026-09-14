/* Deliberately standalone: sample state only, no Home Assistant connection. */
const concepts = {
  quiet: {
    name: 'Quiet Home',
    description: 'A home screen that feels like an exhale. The essentials, with room to breathe.',
    idea: 'One mood, three shortcuts, and a compact house summary. Individual devices appear only when you ask for them.',
    tradeoff: 'Adjusting a particular light takes an extra tap. Best if you usually repeat the same few actions.',
    try: 'Change the mood, open Lights, then switch to Busy evening to see how a reminder fits in.',
  },
  rooms: {
    name: 'Room by Room',
    description: 'Less house at once. Everything you need, exactly where you are.',
    idea: 'Lights, blinds, music, and temperature live together in each room. A stable room list replaces a long list of devices.',
    tradeoff: 'Cross-room tasks need a little navigation. Whole-home controls and reminders remain reachable from any room.',
    try: 'Move from Living Room to Bedroom. Dim the lights, adjust the temperature, and open Whole home.',
  },
  now: {
    name: 'Right Now',
    description: 'The house tells you what matters. Everything else waits quietly.',
    idea: 'Finished chores and active devices earn a place on screen. Idle appliances disappear into All controls.',
    tradeoff: 'The overview changes with activity. Fixed shortcuts keep familiar controls in the same place.',
    try: 'Try Busy evening, mark the laundry as handled, and pause the music. Then try a Quiet afternoon.',
  },
};
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>',
  light: '<path d="M8 15a6 6 0 1 1 8 0l-1 3H9zM9 21h6"/>',
  blinds: '<path d="M4 3h16v15H4zM4 7h16M4 11h16M4 15h16M18 18v4"/>',
  temperature: '<path d="M10 14V5a2 2 0 0 1 4 0v9a5 5 0 1 1-4 0Z"/><path d="M12 9v9m0 0h.01"/>',
  music: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  washer: '<rect x="4" y="2" width="16" height="20" rx="3"/><circle cx="12" cy="14" r="5"/><path d="M7 6h2m3 0h5m-8 8c2 3 4-3 6 0"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  sofa: '<path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M5 18v3m14-3v3M3 11h3v4h12v-4h3v8H3z"/>',
  bed: '<path d="M3 19V7m18 12V7M3 16h18M3 10h18v6M6 10V6h5v4m2 0V6h5v4"/>',
  office: '<path d="M3 5h18v12H3zM8 21h8m-4-4v4"/>',
  gym: '<path d="m6 6 12 12M2 7l5-5m10 20 5-5M4 11l7-7m2 16 7-7"/>',
  kitchen: '<path d="M6 3v6m-3-6v4a3 3 0 0 0 6 0V3M6 10v11M18 3v18m0-18c-5 3-5 10 0 10"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  play: '<path d="m9 5 10 7-10 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.home}</svg>`;
const roomList = [
  ['Living Room', 'sofa'],
  ['Bedroom', 'bed'],
  ['Office', 'office'],
  ['Kitchen', 'kitchen'],
  ['Gym', 'gym'],
];
const moodNames = ['Unwind', 'Love', 'Dinner', 'Party', 'Gym'];
const descriptions = {
  Unwind: 'Warm lights. Soft music. A slower pace.',
  Love: 'A little warmth for time together.',
  Dinner: 'A warm welcome to the table.',
  Party: 'Color, music, and a little more energy.',
  Gym: 'A brighter space to find your rhythm.',
};
let concept = concepts[location.hash.slice(1)] ? location.hash.slice(1) : 'quiet';
let scenario = 'quiet';
let room = 'Living Room';
let detail = '';
let drawerOpener = '';
let toastTimer;
let state;
const dialog = document.querySelector('#drawer');
function resetState() {
  state = {
    mood: scenario === 'night' ? 'Off' : 'Unwind',
    music: scenario !== 'night',
    musicRoom: 'Living Room',
    laundry: scenario === 'busy',
    washer: scenario === 'busy',
    dishwasher: scenario === 'busy',
    night: scenario === 'night',
    rooms: {},
  };
  roomList.forEach(([name], i) => {
    state.rooms[name] = {
      lights: scenario === 'night' ? false : i === 0 || i === 3,
      brightness: i === 0 ? 65 : 40,
      blinds: scenario === 'night' ? 0 : 60,
      temperature: scenario === 'night' ? 19 : 21,
    };
  });
}
resetState();
const lightsCount = () => Object.values(state.rooms).filter(r => r.lights).length;
const roomData = () => state.rooms[room];
const modeButton = () =>
  `<button class="mode" data-action="mode" aria-pressed="${state.night}">${icon(state.night ? 'moon' : 'sun')}${state.night ? 'Night' : 'Day'} mode</button>`;
const header = () =>
  `<header class="home-header"><div class="home-name">${icon('home')} Home <small>Monday, September 14</small></div><div class="header-right"><span>${state.night ? '☾ 16°' : '☀ 22°'} outside</span>${modeButton()}</div></header>`;
const attention = () =>
  state.laundry
    ? `<div class="attention-banner">${icon('washer')}<div class="row-copy"><strong>The dryer is finished</strong><small>Your laundry is ready to put away.</small></div><button data-open="laundry">View</button></div>`
    : '';
function moodHero() {
  const mood = state.mood === 'Off' ? 'Unwind' : state.mood;
  return `<section class="mood-hero"><img src="./assets/${mood.toLowerCase()}.jpg" alt=""/><span class="eyebrow">${state.mood === 'Off' ? 'A quieter house' : 'House mood'}</span><div><h3>${state.mood === 'Off' ? 'Sleep well.' : state.mood}</h3><p>${state.mood === 'Off' ? 'Lights down. The day can wait until tomorrow.' : descriptions[state.mood]}</p><div class="hero-foot"><button data-open="mood">${state.mood === 'Off' ? 'Choose a mood' : 'Change mood'} ↗</button><span>${state.mood === 'Off' ? 'No mood active' : '● Active across the house'}</span></div></div></section>`;
}
const row = (symbol, title, sub, target) =>
  `<button class="row" data-open="${target}"><span class="symbol">${icon(symbol)}</span><span class="row-copy"><strong>${title}</strong><small>${sub}</small></span><span class="arrow">›</span></button>`;
const quick = (symbol, title, sub, target) =>
  `<button class="quick" data-open="${target}">${icon(symbol)}<span>${title}<small>${sub}</small></span></button>`;
const musicStrip = () =>
  `<div class="music-strip"><img class="album" src="./assets/unwind.jpg" alt=""/><div class="row-copy"><strong>Evening acoustic</strong><small>${state.musicRoom} · ${state.music ? 'Playing' : 'Paused'}</small></div><button class="icon-button" data-action="music" aria-label="${state.music ? 'Pause' : 'Play'} music">${icon(state.music ? 'pause' : 'play')}</button><button class="icon-button" data-open="music" aria-label="Music details">${icon('arrow')}</button></div>`;
function quietView() {
  return `${header()}<div class="body-pad"><div class="welcome"><div><span class="eyebrow">${state.night ? 'Time to switch off' : 'Welcome back, Yann'}</span><h2>${state.night ? 'Let the house rest.' : 'Make yourself at home.'}</h2><p>${state.laundry ? 'One small thing needs you. Everything else is in hand.' : 'Everything is settled. Enjoy your space.'}</p></div></div>${attention()}<div class="quiet-layout"><div>${moodHero()}<div class="section-label">Within reach<button data-open="library">All controls ↗</button></div><div class="quick-grid">${quick('light', 'Lights', `${lightsCount()} rooms on`, 'lights')}${quick('blinds', 'Blinds', state.night ? 'All closed' : 'Adjust by room', 'blinds')}${quick('temperature', 'Comfort', '21° indoors', 'temperature')}</div></div><div class="quiet-right"><span class="eyebrow">Your home, at a glance</span><div class="list-panel">${row('light', 'A little light', `${lightsCount()} of 5 rooms lit`, 'lights')}${row('washer', state.washer ? 'Two cycles in progress' : 'Chores are taking a break', state.washer ? 'Washer · 24 min / Dishwasher · 42 min' : 'Washer, dryer & dishwasher idle', 'appliances')}${row('temperature', 'Just comfortable', 'Living Room 21° · Bedroom 20°', 'temperature')}</div>${musicStrip()}<div class="calm-note">${icon('check')} ${state.laundry ? '1 reminder waiting above' : 'Nothing needs your attention'}</div></div></div></div>`;
}
const toggle = name =>
  `<button class="toggle" data-action="light" data-room="${name}" aria-label="${name} lights" aria-pressed="${state.rooms[name].lights}"></button>`;
function lightControl(name, inDrawer = false) {
  const r = state.rooms[name];
  return `<div class="control-card"><div class="control-heading">${icon('light')} ${name === room && concept === 'rooms' && !inDrawer ? 'Lights' : name}${toggle(name)}</div><label class="range-label" for="brightness-${inDrawer ? 'detail-' : ''}${name.replaceAll(' ', '-')}">Brightness<output>${r.brightness}%</output></label><input id="brightness-${inDrawer ? 'detail-' : ''}${name.replaceAll(' ', '-')}" type="range" min="1" max="100" value="${r.brightness}" data-range="brightness" data-room="${name}" ${r.lights ? '' : 'disabled'}/><p class="subcopy">${r.lights ? 'Warm and easy on the eyes' : 'Off · turn on to adjust'}</p></div>`;
}
function blindControl(name, inDrawer = false) {
  const r = state.rooms[name];
  return `<div class="control-card"><div class="control-heading">${icon('blinds')} ${inDrawer ? name : 'Blinds'}</div><label class="range-label" for="blind-${inDrawer ? 'detail-' : ''}${name.replaceAll(' ', '-')}">Open position<output>${r.blinds}%</output></label><input id="blind-${inDrawer ? 'detail-' : ''}${name.replaceAll(' ', '-')}" type="range" min="0" max="100" value="${r.blinds}" data-range="blinds" data-room="${name}"/><p class="subcopy">0% closed · 100% open</p></div>`;
}
function temperatureControl(name) {
  return `<div class="control-card"><div class="control-heading">${icon('temperature')} ${detail ? name : 'Temperature'}</div><div class="stepper"><button data-action="temperature" data-room="${name}" data-step="-0.5" aria-label="Lower ${name} temperature" ${state.rooms[name].temperature <= 16 ? 'disabled' : ''}>−</button><output aria-label="${name} target temperature">${state.rooms[name].temperature}°</output><button data-action="temperature" data-room="${name}" data-step="0.5" aria-label="Raise ${name} temperature" ${state.rooms[name].temperature >= 26 ? 'disabled' : ''}>+</button></div><p class="subcopy">Target · Currently ${name === 'Bedroom' ? '20' : '21'}°</p></div>`;
}
function roomsView() {
  return `${header()}<div class="rooms-layout"><nav class="room-nav" aria-label="Rooms"><span class="eyebrow">Your spaces</span>${roomList.map(([name, symbol]) => `<button class="room-tab" data-room-select="${name}" aria-pressed="${room === name}">${icon(symbol)}<span>${name}<small>${state.rooms[name].lights ? 'Lights on' : 'Lights off'}</small></span></button>`).join('')}<div class="whole-home"><button class="room-tab" data-open="library">${icon('grid')}<span>Whole home<small>${state.laundry ? '1 reminder' : 'All controls'}</small></span></button></div></nav><section class="room-content">${attention()}<div class="welcome"><div><span class="eyebrow">A space of your own</span><h2>${room}</h2><p>${room === 'Bedroom' ? 'Settle in. The rest of the house can wait.' : room === 'Gym' ? 'A little energy, on your terms.' : 'Your everyday comforts, together.'}</p><div class="room-stats"><span>${roomData().lights ? 'Lights on' : 'Lights off'}</span><span>${roomData().temperature}° target</span><span>${roomData().blinds}% blinds open</span></div></div></div><div class="room-controls">${lightControl(room)}${['Living Room', 'Bedroom', 'Gym'].includes(room) ? blindControl(room) : `<div class="control-card"><div class="control-heading">${icon('check')} All settled</div><p class="subcopy">No blind controls in this room.<br/>Only the controls that belong here.</p></div>`}${temperatureControl(room)}<div class="control-card"><div class="control-heading">${icon('music')} Music</div><p class="subcopy">${room === state.musicRoom && state.music ? 'Evening acoustic' : `Play Evening acoustic in ${room}`}</p><button class="full-button" data-open="music">${room === state.musicRoom && state.music ? 'Playing · Open player' : 'Open player'} ↗</button></div></div><div class="room-mood"><img src="./assets/${state.mood === 'Off' ? 'unwind' : state.mood.toLowerCase()}.jpg" alt=""/><div><strong>${state.mood === 'Off' ? 'No house mood' : state.mood + ' is active'}</strong><small>One atmosphere, throughout your home.</small></div><button data-open="mood">Change mood</button></div></section></div>`;
}
function nowView() {
  const count = Number(state.laundry);
  return `${header()}<div class="body-pad"><div class="now-layout"><section><div class="now-heading"><span class="eyebrow">Home is taking care of itself</span><h2>${count ? 'One thing, then relax.' : state.night ? 'Call it a day.' : 'Nothing on your list.'}</h2><p>${count ? 'A small nudge, only when you need it.' : 'No reminders. No loose ends. A little room for you.'}</p></div>${count ? `<div class="section-label">Needs you <span class="count-badge">1</span></div><div class="timeline"><article class="activity">${icon('washer')}<div class="row-copy"><strong>Your laundry is ready</strong><p>The dryer finished 8 minutes ago.<br/>Put it away while it’s still warm.</p><button data-action="done">All taken care of ✓</button> <button data-open="laundry">Details</button></div></article></div>` : `<div class="empty">${icon('check')}<h3>You’re all caught up.</h3><p>We’ll bring the important things here.<br/>For now, make yourself comfortable.</p></div>`}<div class="section-label">Happening in the background<span class="eyebrow">${Number(state.washer) + Number(state.dishwasher) + Number(state.music)} active</span></div>${state.washer || state.dishwasher || state.music ? `<div class="timeline">${state.washer ? `<article class="activity">${icon('washer')}<div class="row-copy"><strong>Washer · Rinsing</strong><div class="progress"><span></span></div><small>About 24 minutes left</small></div><button data-open="appliances">View</button></article>` : ''}${state.dishwasher ? `<article class="activity">${icon('washer')}<div class="row-copy"><strong>Dishwasher · Washing</strong><p>About 42 minutes left</p></div><button data-open="appliances">View</button></article>` : ''}${state.music ? `<article class="activity">${icon('music')}<div class="row-copy"><strong>Evening acoustic</strong><p>Playing in ${state.musicRoom}</p></div><button class="icon-button" data-action="music" aria-label="Pause music">${icon('pause')}</button></article>` : ''}</div>` : '<p class="subcopy">All quiet. No devices running.</p>'}</section><aside class="now-side"><span class="eyebrow">Set the tone</span>${moodHero()}<div class="section-label">Always within reach</div><div class="shelf"><button data-open="lights">${icon('light')} Lights</button><button data-open="blinds">${icon('blinds')} Blinds</button><button data-open="music">${icon('music')} Music</button><button data-open="library">${icon('grid')} All controls</button></div><div class="calm-note">${icon('check')} Idle devices stay tucked away.</div></aside></div></div>`;
}
function render() {
  const oldFocus = document.activeElement;
  const focusKey = oldFocus?.dataset;
  document.body.classList.toggle('night', state.night);
  document.querySelector('#concepts').innerHTML = Object.entries(concepts)
    .map(([id, c], i) => `<button data-concept="${id}" aria-pressed="${concept === id}"><span>0${i + 1}</span>${c.name}</button>`)
    .join('');
  document.querySelector('#scenarios').innerHTML = [
    ['quiet', 'Quiet afternoon'],
    ['busy', 'Busy evening'],
    ['night', 'Bedtime'],
  ]
    .map(([id, label]) => `<button data-scenario="${id}" aria-pressed="${scenario === id}">${label}</button>`)
    .join('');
  document.querySelector('#concept-number').textContent = `Concept 0${Object.keys(concepts).indexOf(concept) + 1} / 03`;
  document.querySelector('#concept-title').textContent = concepts[concept].name;
  document.querySelector('#concept-description').textContent = concepts[concept].description;
  for (const key of ['idea', 'tradeoff', 'try']) document.getElementById(key).textContent = concepts[concept][key];
  document.querySelector('#canvas').innerHTML = concept === 'quiet' ? quietView() : concept === 'rooms' ? roomsView() : nowView();
  if (dialog.open) renderDrawer();
  if (focusKey && !oldFocus.isConnected) {
    const selector = Object.entries(focusKey)
      .map(([key, value]) => `[data-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(value)}"]`)
      .join('');
    if (selector) (dialog.open ? dialog : document).querySelector(selector)?.focus({ preventScroll: true });
  }
}
function drawerContent() {
  const headings = {
    mood: ['Set the tone', 'One mood for the whole home. Try a different atmosphere.'],
    lights: ['A little light', 'Adjust one room without opening up the entire dashboard.'],
    blinds: ['Let the outside in', 'Open just enough. Every room has its own setting.'],
    temperature: ['Just comfortable', 'Set your preferred temperature for each space.'],
    music: ['Evening acoustic', `Sample playlist · ${concept === 'rooms' ? room : state.musicRoom} speaker`],
    appliances: ['Chores, in hand', 'A quiet place for the details, when you want them.'],
    laundry: ['Laundry is ready', 'The dryer finished 8 minutes ago.'],
    library: ['Your whole home', 'Everything is still here. Just one tap away.'],
  };
  const [title, description] = headings[detail] || headings.library;
  let content = '';
  if (detail === 'mood')
    content = `<div class="mood-choices">${moodNames.map(name => `<button class="mood-choice" data-mood="${name}" aria-pressed="${state.mood === name}"><img src="./assets/${name.toLowerCase()}.jpg" alt=""/>${name}${state.mood === name ? ' ✓' : ''}</button>`).join('')}</div><button class="full-button" data-mood="Off" ${state.mood === 'Off' ? 'disabled' : ''}>Turn mood off</button>`;
  if (detail === 'lights') content = `<div class="drawer-stack">${roomList.map(([name]) => lightControl(name, true)).join('')}</div>`;
  if (detail === 'blinds')
    content = `<div class="drawer-stack">${['Living Room', 'Bedroom', 'Gym'].map(name => blindControl(name, true)).join('')}</div>`;
  if (detail === 'temperature') content = `<div class="drawer-stack">${roomList.map(([name]) => temperatureControl(name)).join('')}</div>`;
  if (detail === 'music')
    content = `<img src="./assets/unwind.jpg" alt="Sunlit forest mood artwork" style="width:100%;aspect-ratio:1.5;object-fit:cover;border-radius:16px;margin-bottom:18px"/><p class="subcopy">${state.music && (concept !== 'rooms' || room === state.musicRoom) ? 'Playing' : 'Paused'} · ${concept === 'rooms' ? room : state.musicRoom}</p><button class="full-button" data-action="music" data-room="${concept === 'rooms' ? room : state.musicRoom}">${state.music && (concept !== 'rooms' || room === state.musicRoom) ? 'Pause' : 'Play'} music</button><p class="subcopy" style="margin-top:16px">Playback is simulated in one room at a time.</p>`;
  if (detail === 'appliances')
    content = [
      ['Washer', state.washer ? 'Rinsing · 24 min left' : 'Idle'],
      ['Dryer', state.laundry ? 'Finished · Ready to empty' : 'Idle'],
      ['Dishwasher', state.dishwasher ? 'Washing · 42 min left' : 'Idle'],
      ['Roomba', 'Docked · Fully charged'],
    ]
      .map(([name, status]) => `<div class="drawer-row"><strong>${name}</strong><span>${status}</span></div>`)
      .join('');
  if (detail === 'laundry')
    content = `<div class="empty">${icon('washer')}<h3>${state.laundry ? 'Fresh out of the dryer.' : 'All taken care of.'}</h3><p>${state.laundry ? 'A simple reminder you can clear once you’ve put the laundry away.' : 'This reminder has been cleared.'}</p></div><button class="full-button" data-action="done" ${state.laundry ? '' : 'disabled'}>All taken care of ✓</button>`;
  if (detail === 'library')
    content = `${attention()}<div class="library">${[
      ['light', 'Lights', 'lights'],
      ['blinds', 'Blinds', 'blinds'],
      ['temperature', 'Comfort', 'temperature'],
      ['music', 'Music', 'music'],
      ['washer', 'Appliances', 'appliances'],
      ['home', 'House mood', 'mood'],
    ]
      .map(([symbol, label, target]) => `<button data-open="${target}">${icon(symbol)}${label}</button>`)
      .join('')}</div>`;
  return `<h2 id="drawer-title">${title}</h2><p class="drawer-description">${description}</p>${content}`;
}
function renderDrawer() {
  document.querySelector('#drawer-body').innerHTML = drawerContent();
}
function openDrawer(target) {
  if (!dialog.open) drawerOpener = document.activeElement?.dataset.open || target;
  detail = target;
  renderDrawer();
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  document.querySelector('#close-drawer').focus();
}
function notify(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const d = button.dataset;
  if (d.concept) {
    concept = d.concept;
    history.replaceState(null, '', '#' + concept);
    render();
  } else if (d.scenario) {
    scenario = d.scenario;
    resetState();
    render();
  } else if (d.roomSelect) {
    room = d.roomSelect;
    render();
  } else if (d.open) openDrawer(d.open);
  else if (d.mood) {
    state.mood = d.mood;
    render();
    notify(d.mood === 'Off' ? 'Mood turned off · Demo' : `${d.mood} mood selected · Demo`);
  } else if (d.action) {
    if (d.action === 'music') {
      const target = d.room || state.musicRoom;
      state.music = target === state.musicRoom ? !state.music : true;
      state.musicRoom = target;
    }
    if (d.action === 'light') state.rooms[d.room].lights = !state.rooms[d.room].lights;
    if (d.action === 'temperature')
      state.rooms[d.room].temperature = Math.max(16, Math.min(26, state.rooms[d.room].temperature + Number(d.step)));
    if (d.action === 'mode') {
      state.night = !state.night;
      notify(`${state.night ? 'Night' : 'Day'} mode selected · Demo`);
    }
    if (d.action === 'done') {
      state.laundry = false;
      notify('Laundry reminder cleared · Demo');
      if (dialog.open) dialog.close();
    }
    render();
  }
});
document.addEventListener('input', event => {
  const input = event.target;
  if (!input.dataset.range) return;
  state.rooms[input.dataset.room][input.dataset.range] = Number(input.value);
  input.previousElementSibling.querySelector('output').textContent = input.value + '%';
});
document.addEventListener('change', event => {
  if (event.target.dataset.range) render();
});
document.querySelector('#close-drawer').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  detail = '';
  document.querySelector('#drawer-body').innerHTML = '';
  render();
  const opener = document.querySelector(`[data-open="${CSS.escape(drawerOpener)}"]`) || document.querySelector('[data-open="library"]');
  opener?.focus({ preventScroll: true });
});
dialog.addEventListener('click', event => {
  if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left) dialog.close();
});
document.querySelector('#reset').addEventListener('click', () => {
  resetState();
  render();
  notify('Sample moment reset');
});
window.addEventListener('hashchange', () => {
  if (concepts[location.hash.slice(1)]) {
    concept = location.hash.slice(1);
    render();
  }
});
render();
