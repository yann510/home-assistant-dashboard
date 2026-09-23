export function icon(name) {
  const paths = {
    washer:
      '<rect x="4" y="2" width="16" height="20" rx="3"/><path d="M7 5h3"/><circle cx="12" cy="14" r="5"/><g class="appliance-spin"><path d="M8 14q2-4 4 0t4 0"/></g>',
    dryer:
      '<rect x="4" y="2" width="16" height="20" rx="3"/><path d="M7 5h3"/><circle cx="12" cy="14" r="5"/><g class="appliance-spin"><path d="M12 10v2m4 2h-2m-2 4v-2m-4-2h2"/></g>',
    dishwasher:
      '<rect x="3" y="2" width="18" height="20" rx="3"/><path d="M3 7h18M7 5h2M7 17v2h10v-2"/><g class="appliance-wash"><path d="M8 10v3m4-2v3m4-4v3"/></g>',
    roomba:
      '<g class="appliance-roam"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="10" r="2"/><path d="M7 16h10M4 18l-2 2m18-2l2 2"/></g>',
    cloud: '<path d="M6 18a4 4 0 010-8 6 6 0 0111-2 5 5 0 011 10z"/>',
    rain: '<path d="M6 14a4 4 0 010-8 6 6 0 0111-2 5 5 0 011 10z"/><path d="M7 17l-1 3m6-3l-1 3m6-3l-1 3"/>',
    'cloud-sun':
      '<circle cx="7" cy="7" r="3"/><path d="M7 1v1M1 7h1M2 2l1 1m9-1l-1 1"/><path d="M7 20a4 4 0 010-8 5 5 0 019-2 5 5 0 012 10z"/>',
    'cloud-moon': '<path d="M10 2a6 6 0 00-4 10A6 6 0 0110 2zM7 20a4 4 0 010-8 5 5 0 019-2 5 5 0 012 10z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M20 15.5A9 9 0 018.5 4a8.5 8.5 0 1011.5 11.5z"/>',
    arrow: '<path d="M5 12h14m-5-5l5 5-5 5"/>',
    close: '<path d="M6 6l12 12M6 18L18 6"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="1"/>',
    bulb: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 118 0c-1 1-1 2-1 2H9s0-1-1-2z"/>',
    play: '<path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5v14m8-14v14" stroke-width="4"/>',
    next: '<path d="M5 5l10 7-10 7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
    prev: '<path d="M19 5L9 12l10 7z" fill="currentColor" stroke="none"/><path d="M6 5v14"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 010 8m3-11a10 10 0 010 14"/>',
    grid: '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="15" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/>',
    sofa: '<path d="M5 12V8a3 3 0 013-3h8a3 3 0 013 3v4M5 12a2 2 0 00-4 0v5h22v-5a2 2 0 00-4 0v2H5zM4 17v3m16-3v3"/>',
    bed: '<path d="M3 20V6m18 14V6M3 15h18M3 18h18M6 15V9h12v6m-6-6v6"/>',
    desk: '<path d="M2 14h20M5 14v7m14-7v7M7 3h10v8H7zM12 11v3"/>',
    cup: '<path d="M4 8h12v8a4 4 0 01-4 4H8a4 4 0 01-4-4zM16 9h3a3 3 0 010 6h-3M7 2v3m5-3v3"/>',
    gym: '<path d="M7 12h10M3 8v8m4-11v14M17 5v14m4-11v8"/>',
    door: '<path d="M3 21h18M6 21V3h12v18M14 12h1"/>',
    bath: '<path d="M3 12h18v3a5 5 0 01-5 5H8a5 5 0 01-5-5zM6 12V5a3 3 0 016 0M6 20v2m12-2v2"/>',
    check: '<path d="M5 12l4 4L19 6"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
    speaker: '<rect x="6" y="2" width="12" height="20" rx="3"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="6" r=".5"/>',
    blinds: '<path d="M4 4h16M4 8h16M4 12h16M4 16h16M19 4v17m-1 0h2"/>',
    sparkle: '<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
    back: '<path d="M19 12H5m5-5l-5 5 5 5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkle}</svg>`;
}
export function moodArt(id = 'unwind') {
  const shapes = {
    unwind:
      '<path d="M0 170C70 170 80 20 160 20S240 170 320 170"/><path d="M0 205C70 205 80 55 160 55S240 205 320 205"/><path d="M0 240C70 240 80 90 160 90S240 240 320 240"/>',
    love: '<path d="M160 214C130 180 40 135 40 76a62 62 0 01120-17 62 62 0 01120 17c0 59-90 104-120 138z"/>',
    dinner: '<circle cx="160" cy="130" r="91"/><circle cx="160" cy="130" r="59"/><path d="M34 40v190M16 40v50h36V40M287 40v190"/>',
    party: '<path d="M160 12l23 64 64-31-31 64 65 23-65 23 31 64-64-31-23 64-23-64-64 31 31-64-65-23 65-23-31-64 64 31z"/>',
    gym: '<path d="M58 217L146 38h76l-88 179zM160 217l88-179"/>',
  };
  return `<svg class="mood-art" viewBox="0 0 320 260" fill="none" stroke="currentColor" stroke-width="18" aria-hidden="true">${shapes[id] || shapes.unwind}</svg>`;
}
export function albumArt() {
  return `<svg class="album-art" viewBox="0 0 160 160" aria-hidden="true"><rect width="160" height="160" fill="#e7aa78"/><path d="M0 120Q50 50 160 90V160H0Z" fill="#85534c"/><circle cx="96" cy="60" r="35" fill="#f7dfac"/><path d="M0 145Q80 60 160 125v35H0Z" fill="#353f46"/><path d="M0 154q75-49 160-6v12H0Z" fill="#cc795f"/><text x="10" y="18" fill="#302f35" font-family="sans-serif" font-size="9" letter-spacing="2">HOUSE SELECTS</text></svg>`;
}
