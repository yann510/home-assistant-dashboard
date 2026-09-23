import { moods, tracks, roomSummary, escapeHtml as esc } from './state.js';
import { icon, moodArt, albumArt } from './art.js';
export function button(label, action, content, extra = '') {
  return `<button type="button" aria-label="${esc(label)}" data-action="${action}" ${extra}>${content}</button>`;
}
export function blindControls(room) {
  return `<div class="blind-controls" aria-label="${room.name} blinds"><span class="blind-caption">${icon('blinds')}<span>Blinds</span></span>${['Open', 'Stop', 'Close'].map((label, i) => button(`${label} ${room.name} blinds`, 'blind', icon(['up', 'stop', 'down'][i]), `data-room-id="${room.id}" data-value="${label.toLowerCase()}" data-focus-key="${room.id}-blind-${i}" class="blind-button ${room.lastBlindCommand === label.toLowerCase() ? 'command-active' : ''}"`)).join('')}</div>`;
}
export function roomCard(room) {
  const s = roomSummary(room);
  return `<article class="room-card ${s.on ? 'room-on' : ''}">
 <div class="room-top"><button type="button" class="room-link" data-action="open" data-kind="room" data-id="${room.id}" data-focus-key="room-${room.id}"><span class="room-icon">${icon(room.symbol)}</span><span><strong>${room.name}</strong><small>${s.on ? `${s.on} light${s.on === 1 ? '' : 's'} on` : 'Lights off'}${s.unavailable ? ' · 1 offline' : ''}</small></span></button>${button(`Turn ${room.name} lights ${s.on ? 'off' : 'on'}`, 'room-power', `<span></span>`, `data-room-id="${room.id}" data-focus-key="${room.id}-toggle" class="switch" aria-pressed="${s.on > 0}" ${s.available ? '' : 'disabled'}`)}</div>
 ${room.blinds ? blindControls(room) : `<button class="room-footnote" data-action="open" data-kind="room" data-id="${room.id}" data-focus-key="adjust-${room.id}"><span>Adjust lights</span>${icon('arrow')}</button>`}
 </article>`;
}
export function renderOverview(state) {
  const mood = moods.find(m => m.id === state.mood),
    track = tracks[state.music.trackIndex],
    playing = state.music.playing;
  const on = state.rooms.reduce((n, r) => n + roomSummary(r).on, 0);
  return `<div class="home" style="--mood:${mood?.colour || '#cbb5ed'}">
 <header class="topbar"><div class="brand"><span class="brand-symbol">${icon('sparkle')}</span><div><span class="eyebrow">YOUR EVERYDAY, REIMAGINED</span><h1>Make yourself <em>at home.</em></h1></div></div>
 <div class="header-controls"><div class="mode-control" aria-label="Home mode">${['day', 'night'].map(m => button(`${m === 'day' ? 'Day' : 'Night'} mode`, 'mode', `${icon(m === 'day' ? 'sun' : 'moon')}<span>${m === 'day' ? 'Day' : 'Night'}</span>`, `data-value="${m}" data-focus-key="mode-${m}" aria-pressed="${state.mode === m}"`)).join('')}</div>
 <button class="weather-button" data-action="open" data-kind="weather" data-focus-key="weather" aria-label="Weather, 18 degrees, open forecast">${icon(state.scenario === 'nighttime' ? 'moon' : 'sun')}<span><strong>18°</strong><small>${state.scenario === 'nighttime' ? 'Clear night' : 'Mostly sunny'}</small></span>${icon('arrow')}</button>
 <button class="devices-button" aria-label="All devices" data-action="open" data-kind="devices" data-focus-key="devices">${icon('grid')}<span>All devices</span></button></div></header>
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
 <section class="rooms-section" aria-labelledby="room-heading"><div class="section-heading"><div><h2 id="room-heading">Room to <em>feel good.</em></h2><span>${on} lights on · Your home, at a glance</span></div><span class="section-note">A tap for the little details ${icon('arrow')}</span></div>
 <div class="room-grid">${state.rooms.map(roomCard).join('')}<div class="home-note"><div class="note-flower">✳</div><p>A home that<br><em>feels like you.</em></p><span>Good things happen here.</span></div></div></section>
 <footer class="home-footer"><div class="attention-slot">${state.notices.length ? `<button class="attention-button" data-action="open" data-kind="attention" data-focus-key="attention"><span class="attention-symbol">${icon('check')}</span><span><strong>${esc(state.notices[0].title)}</strong><small>${state.notices[0].short}${state.notices.length > 1 ? ` · +${state.notices.length - 1} more` : ''}</small></span>${icon('arrow')}</button>` : `<div class="all-good">${icon('check')}<span>All good here.<small>Nothing needs your attention.</small></span></div>`}</div><div class="footer-tools"><span class="date"><time data-clock></time> · ${new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span><button class="demo-button" data-action="open" data-kind="demo" data-focus-key="demo"><span class="demo-dot"></span>Prototype <span>↗</span></button></div></footer>
 <div class="mobile-player"><button class="mobile-track" data-action="open" data-kind="music" data-focus-key="mobile-music">${albumArt()}<span><strong>${esc(track.title)}</strong><small>${state.music.room} · ${playing ? 'Playing' : 'Paused'}</small></span></button>${button(playing ? 'Pause music' : 'Play music', 'play', icon(playing ? 'pause' : 'play'), 'data-focus-key="mobile-play" class="play-button"')}</div>
 </div>`;
}
