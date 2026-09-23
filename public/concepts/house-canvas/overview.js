import { moods, tracks, roomSummary, escapeHtml as esc } from './state.js';
import { icon, moodArt, albumArt } from './art.js';
export function button(label, action, content, extra = '') {
  return `<button type="button" aria-label="${esc(label)}" data-action="${action}" ${extra}>${content}</button>`;
}
export function blindControls(room) {
  return `<div class="blind-controls" aria-label="${room.name} blinds"><span class="blind-caption">${icon('blinds')}<span>Blinds</span></span>${['Open', 'Stop', 'Close'].map((label, i) => button(`${label} ${room.name} blinds`, 'blind', icon(['up', 'stop', 'down'][i]), `data-room-id="${room.id}" data-value="${label.toLowerCase()}" data-focus-key="${room.id}-blind-${i}" class="blind-button ${room.lastBlindCommand === label.toLowerCase() ? 'command-active' : ''}"`)).join('')}</div>`;
}
function quickControls(state) {
  const lightRoom = state.rooms.find(r => r.id === state.lightRoom),
    blindRoom = state.rooms.find(r => r.id === state.blindRoom);
  const summary = roomSummary(lightRoom),
    available = lightRoom.lights.filter(l => l.available);
  const level = available.length ? Math.round(available.reduce((sum, l) => sum + (l.on ? l.brightness : 0), 0) / available.length) : 0;
  const picker = (kind, rooms, selected) =>
    `<label class="quick-room-picker"><span class="sr-only">${kind === 'light-room' ? 'Lights room' : 'Blinds room'}</span><select data-action="${kind}" data-focus-key="${kind}">${rooms.map(r => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>${r.name}</option>`).join('')}</select></label>`;
  return `<section class="quick-controls" aria-label="Lights and blinds">
  <article class="quick-panel"><div class="quick-title"><h2>${icon('bulb')} Lights</h2><button class="text-button" data-action="open" data-kind="room" data-id="${lightRoom.id}" data-focus-key="light-details">Individual lights ${icon('arrow')}</button></div>
  <div class="quick-control-row">${picker('light-room', state.rooms, state.lightRoom)}${button(`Turn ${lightRoom.name} lights ${summary.on ? 'off' : 'on'}`, 'room-power', '<span></span>', `class="switch" data-room-id="${lightRoom.id}" data-focus-key="quick-power" aria-pressed="${summary.on > 0}" ${available.length ? '' : 'disabled'}`)}</div>
  <label class="range-row quick-brightness"><span>Brightness</span><input type="range" min="0" max="100" value="${level}" aria-label="Room brightness" data-action="room-brightness" data-room-id="${lightRoom.id}" data-focus-key="room-brightness" ${available.length ? '' : 'disabled'}><output>${level}%</output></label>
  <p class="quick-caption">${summary.on} of ${summary.available} available lights on${summary.unavailable ? ` · ${summary.unavailable} offline` : ''}</p></article>
  <article class="quick-panel"><div class="quick-title"><h2>${icon('blinds')} Blinds</h2><span class="quick-caption">By room</span></div>
  <div class="quick-control-row">${picker(
    'blind-room',
    state.rooms.filter(r => r.blinds),
    state.blindRoom
  )}</div>
  <div class="quick-blinds">${['Open', 'Stop', 'Close'].map((label, i) => button(`${label} ${blindRoom.name} blinds`, 'blind', `${icon(['up', 'stop', 'down'][i])}<span>${label}</span>`, `class="chip" data-room-id="${blindRoom.id}" data-value="${label.toLowerCase()}" data-focus-key="quick-blind-${i}"`)).join('')}</div>
  <p class="quick-caption">${blindRoom.lastBlindCommand ? `Last command: ${blindRoom.lastBlindCommand}` : 'Open, pause, or close this room’s blinds'}</p></article></section>`;
}
function attentionBanner(state) {
  if (!state.notices.length) return '';
  const notice = state.notices[0];
  return `<section class="attention-banner" aria-label="Needs your attention"><span class="attention-symbol">${icon('check')}</span><div class="attention-copy"><span class="eyebrow">NEEDS YOUR ATTENTION</span><strong>${esc(notice.short)}</strong><span>${esc(notice.title)}</span></div><div class="attention-actions"><button class="attention-view" data-action="open" data-kind="${notice.category}" data-id="${notice.roomId || ''}" data-focus-key="attention-view">View ${icon('arrow')}</button><button class="attention-more" data-action="open" data-kind="attention" data-focus-key="attention">${state.notices.length > 1 ? `All ${state.notices.length} updates` : 'Review'} ${icon('arrow')}</button></div></section>`;
}
export function renderOverview(state) {
  const mood = moods.find(m => m.id === state.mood),
    track = tracks[state.music.trackIndex],
    playing = state.music.playing;
  return `<div class="home" style="--mood:${mood?.colour || '#cbb5ed'}">
 <header class="topbar"><div class="brand"><span class="brand-symbol">${icon('sparkle')}</span><div><span class="eyebrow">YOUR EVERYDAY, REIMAGINED</span><h1>Make yourself <em>at home.</em></h1></div></div>
 <div class="header-controls"><div class="mode-control" aria-label="Home mode">${['day', 'night'].map(m => button(`${m === 'day' ? 'Day' : 'Night'} mode`, 'mode', `${icon(m === 'day' ? 'sun' : 'moon')}<span>${m === 'day' ? 'Day' : 'Night'}</span>`, `data-value="${m}" data-focus-key="mode-${m}" aria-pressed="${state.mode === m}"`)).join('')}</div>
 <button class="weather-button" data-action="open" data-kind="weather" data-focus-key="weather" aria-label="Weather, 18 degrees, open forecast">${icon(state.scenario === 'nighttime' ? 'moon' : 'sun')}<span><strong>18°</strong><small>${state.scenario === 'nighttime' ? 'Clear night' : 'Mostly sunny'}</small></span>${icon('arrow')}</button>
 <button class="devices-button" aria-label="All devices" data-action="open" data-kind="devices" data-focus-key="devices">${icon('grid')}<span>All devices</span></button></div></header>
 ${attentionBanner(state)}
 <div class="feature-band">
 <section class="mood-card"><div class="mood-copy"><div class="eyebrow">${icon('sparkle')} THE FEELING OF HOME</div><div class="mood-heading"><h2>${mood ? mood.name : 'Just be.'}<span class="tiny-star">✳</span></h2><p>${mood ? mood.caption : 'Your space. Your own pace.'}</p></div>
 <div class="mood-status"><span class="status-dot"></span>${mood ? 'House mood is on' : 'No mood active'}${mood ? button('End mood', 'mood', 'End mood', `data-value="" data-focus-key="end-mood" class="text-button"`) : ''}</div></div>
 <div class="hero-art">${moodArt(state.mood)}</div>
 <div class="mood-picker" aria-label="Choose a house mood">${moods.map(m => button(`${m.name} mood`, 'mood', `${icon(m.id === 'love' ? 'sparkle' : m.id === 'gym' ? 'gym' : m.id === 'dinner' ? 'cup' : m.id === 'party' ? 'sun' : 'moon')}<span>${m.name}</span>`, `data-value="${m.id}" data-focus-key="mood-${m.id}" aria-pressed="${state.mood === m.id}"`)).join('')}</div>
 </section>
 <section class="music-card"><div class="music-top"><span class="eyebrow">${icon('speaker')} ${playing ? 'THE SOUNDTRACK' : 'ON PAUSE'}</span><button class="text-button" data-action="open" data-kind="music" data-focus-key="music-details">${state.music.room} ${icon('arrow')}</button></div>
 <div class="track-line"><div class="album">${albumArt()}</div><button class="track-copy" data-action="open" data-kind="music" data-focus-key="track"><span class="overline">${track.album}</span><h2 title="${esc(track.title)}">${esc(track.title)}</h2><p>${esc(track.artist)}</p></button></div>
 <div class="player-controls"><span class="sound-wave ${playing ? 'is-playing' : ''}" aria-hidden="true">${'<i></i>'.repeat(9)}</span><div class="transport">${button('Previous track', 'skip', icon('prev'), 'data-value="-1" data-focus-key="previous" class="icon-button"')}${button(playing ? 'Pause music' : 'Play music', 'play', icon(playing ? 'pause' : 'play'), 'data-focus-key="play" class="play-button"')}${button('Next track', 'skip', icon('next'), 'data-value="1" data-focus-key="next" class="icon-button"')}</div><label class="volume-control">${icon('volume')}<input aria-label="Music volume" data-action="volume" data-focus-key="volume" type="range" min="0" max="100" value="${state.music.volume}"><output>${state.music.volume}%</output></label></div>
 </section></div>
 ${quickControls(state)}
 <footer class="home-footer"><div class="footer-tools"><span class="date"><time data-clock></time> · ${new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span><button class="demo-button" data-action="open" data-kind="demo" data-focus-key="demo"><span class="demo-dot"></span>Prototype <span>↗</span></button></div></footer>
 <div class="mobile-player"><button class="mobile-track" data-action="open" data-kind="music" data-focus-key="mobile-music">${albumArt()}<span><strong>${esc(track.title)}</strong><small>${state.music.room} · ${playing ? 'Playing' : 'Paused'}</small></span></button>${button(playing ? 'Pause music' : 'Play music', 'play', icon(playing ? 'pause' : 'play'), 'data-focus-key="mobile-play" class="play-button"')}</div>
 </div>`;
}
