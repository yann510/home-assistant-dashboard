# House Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver an artistic, playful, fully interactive third dashboard prototype for a landscape Fire HD 10 and a smaller iPhone Pro.

**Architecture:** An independent static page with one in-memory demo state, separate overview and detail renderers, and one modal controller. No live services or changes to the existing dashboard. Original SVG/CSS artwork and locally available assets keep the page lightweight.

**Tech Stack:** HTML, CSS, native JavaScript modules, existing local Node runtime for syntax checks, and the computer-use browser for interaction and visual verification. No added dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-house-canvas-design.md`

## Global Constraints

- The prototype is an exploration on the proof-of-concept branch, not a production replacement.
- No Home Assistant connection, credentials, external device commands, or production deployment.
- Start layout verification at 1280 × 800 and a conservative 960 × 600 CSS viewport.
- These are test sizes, not confirmed device measurements.
- Respect safe areas and verify widths from 375 to 440 CSS pixels.
- Aim for touch targets of at least 44 × 44 CSS pixels across both layouts.
- Blind controls acknowledge a command but do not invent measured positions: the current integration supplies no position feedback.
- Respect reduced motion and maintain readable contrast.
- Existing branch: `codex/quiet-home-poc`, worktree `/Users/yann510/.codex/worktrees/house-moods-20260908`. Preserve unrelated edits. Fetch before pushing this branch; never push this prototype to main or deploy it.

## Review Focus

1. Busy tablet with multiple notices: primary controls stay visible and stable; overflow notices open a list.
2. Long titles and small phone widths: text can truncate or wrap without pushing controls outside the viewport.
3. Open details during a state change: the overview and detail state stay consistent and sliders retain focus.
4. Unavailable light within a room: bulk actions skip it and still operate available lights; disabled state remains explicit.
5. Modal navigation and dismissal: directory back navigation, focus restoration, and keyboard containment work from every entry point.

## File map and shared interfaces

Create all runtime files under `public/concepts/house-canvas/`:

- `index.html`: document, viewport metadata, stylesheet/module references, application and sheet roots.
- `style.css`: colour/spacing tokens, responsive overview, controls, sheets, reduced-motion rules.
- `state.js`: fixtures, scenarios, local commands, room summaries.
- `art.js`: original geometric mood artwork and small labelled-control icon helpers.
- `overview.js`: overview markup only, consuming state and artwork.
- `details.js`: room, music, forecast, attention, and device-directory content.
- `app.js`: delegated events, state updates, sheet lifecycle, live announcements, focus restoration.
- `README.md`: launch instructions, demo scope, verification results, hardware-size caveat.

All renderers consume the same `state` object. IDs are stable strings. Never render raw user-entered search text through HTML interpolation: set input values using DOM properties and filter catalogue entries in JavaScript.

```js
// state.js public API
export function createState(scenario = 'everyday') {} // returns a fresh State
export function applyAction(state, action) {} // mutates local state; returns announcement string
export function roomSummary(room) {} // returns { on, available, unavailable }
// overview.js and details.js public API
export function renderOverview(state) {} // returns HTML string
export function renderDetails(state, route, query = '') {} // returns { title, html }
// art.js public API
export function moodArt(moodId) {} // returns decorative SVG string
export function icon(name) {} // returns aria-hidden SVG string
```

The declarations above define interfaces; implementation steps below define behavior. Use this state shape:

```js
const state = {
  scenario: 'everyday', mode: 'day', mood: 'unwind',
  rooms: [{ id: 'living', name: 'Living room', blinds: true,
    lastBlindCommand: null,
    lights: [{ id: 'living-bulbs', name: 'Bulbs', on: true,
      available: true, brightness: 65, colour: '#ffd39b', colourCapable: true }] }],
  music: { playing: true, trackIndex: 0, volume: 32, room: 'Living room', source: 'Favourites' },
  notices: [{ id: 'dryer', title: 'Dryer finished', detail: 'Your laundry is ready.', category: 'appliances' }],
  appliances: { washer: 'idle', dryer: 'finished' },
  vacuum: 'docked', thermostat: 21,
};
```

## Task 1: Art direction and responsive overview

**Files:** Create `index.html`, `style.css`, `state.js`, `art.js`, `overview.js`, and `app.js` in the directory above.

**Consumes:** Approved design brief and existing `src/useLightSummary.ts` and `src/moodPresets.ts` as inventory references.

**Produces:** A renderable overview and the shared exports defined above.

- [x] Define fixtures using the seven existing room groups. Living room: Bulbs/LED strip; Bedroom: Main/Closet; Office: Bulbs/Neon; Kitchen: Main; Gym: Main; Entry: Front door/Laundry; Toilet: Main. Blinds exist only in Living room, Bedroom, and Gym. Support five existing moods and no active mood. Create everyday, busy, and nighttime fixtures as independent deep copies. Busy includes three notices, washer activity, and an unavailable light; nighttime uses Night mode and mostly dark rooms.
- [x] Build the semantic document with independent overview and modal roots:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="stylesheet" href="./style.css">
<main id="app"></main>
<dialog id="details" aria-labelledby="details-title"></dialog>
<div id="announcer" role="status" aria-live="polite" class="sr-only"></div>
<script type="module" src="./app.js"></script>
```

- [x] Establish the approved palette and responsive grid. Use original geometric mood motifs, warm cream typography, room-specific small illustrations, and a clear active state. Start from these rules and refine against screenshots:

```css
:root { color-scheme: dark; --canvas:#201e24; --surface:#2d2931;
  --ink:#fff5e7; --muted:#c7bdc7; --coral:#ff9d87; --lilac:#c6b0ef; --yellow:#f4da87; }
* { box-sizing:border-box; }
body { margin:0; background:var(--canvas); color:var(--ink); }
button,input,select { font:inherit; }
button { min-height:44px; min-width:44px; }
.home { min-height:100vh; display:grid; gap:12px; padding:16px; }
.room-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
.feature-band { display:grid; grid-template-columns:1.15fr 1fr; gap:12px; }
@media (max-width:700px) {
  .feature-band { display:contents; }
  .room-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .home { padding:12px; padding-bottom:calc(88px + env(safe-area-inset-bottom)); }
}
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; } }
```

- [x] Render Day/Night, weather, All devices, mood choices, music, room controls, and fixed-height attention summary. Provide a distinct room-detail button alongside each direct toggle; use explicit accessible names for every blind command. Reserve the eighth grid position for a compact all-room summary or decorative breathing space, not a fabricated room.
- [x] Open the standalone page through the existing local static server, or start a free localhost port serving `public`. Inspect 1280×800 and 960×600. Verify no overview scroll at those reference sizes. At 375×812, 393×852, and 440×956, verify no horizontal overflow and no overlap with the compact music transport. Browser measurements can compare `scrollWidth` against `clientWidth` and tablet `scrollHeight` against viewport height.
- [x] Inspect a long track title and the busy scenario before finalising typography; shrink decorative space first. Fix clipping and contrast issues from screenshots. Commit the independently viewable shell.

## Task 2: Complete simulated controls and detail navigation

**Files:** Create `details.js`; extend `state.js`, `app.js`, `overview.js`, and `style.css`.

**Consumes:** Shared state, fixtures, renderers, stable IDs from Task 1.

**Produces:** Working local actions and `renderDetails(state, route, query)`. A route is `{kind, id?}` with kind `room`, `music`, `weather`, `attention`, `devices`, `thermostat`, `appliances`, or `vacuum`.

- [x] Implement local action types `mode`, `mood`, `room-power`, `light-power`, `brightness`, `colour`, `blind`, `play`, `skip`, `volume`, `speaker`, `source`, `favourite`, `dismiss`, `thermostat`, and `vacuum`. Range inputs clamp brightness/volume to 0–100 and thermostat to 16–28°C. Unavailable lights ignore actions. Room power switches available lights off when any available light is on, otherwise on. Blind actions store only the last command and announce it. Mode and mood remain independently selected. Skip wraps a small local track list; favourites select a track. No network requests.

```js
// Representative room-power behavior inside applyAction:
const room = state.rooms.find(item => item.id === action.roomId);
const available = room.lights.filter(light => light.available);
const nextOn = !available.some(light => light.on);
available.forEach(light => { light.on = nextOn; });
// Return a readable status message; render pressed state from state, never DOM history.
```

- [x] Implement a single native dialog with a title, close button, and scrollable content. Open with `showModal()`, remember the opener's stable `data-focus-key`, and set body overflow to hidden. Route changes update title/content without nesting dialogs. Close restores original overflow and re-finds the opener after overview renders. Fall back to All devices if the original opener no longer exists. Backdrop dismissal requires pointer down and up on the backdrop; Escape uses the dialog cancel event. Keep directory filters/query when returning from a device detail.
- [x] Render room details with individual light power/brightness/supported colour controls and blind commands. Render music source/room/favourites controls; a sample hourly/daily forecast; full attention list and activity; thermostat temperature adjustment; appliance statuses; and vacuum start/pause/dock. All devices filters by text and room/category and includes these destinations. Empty results show a clear reset-filter action.
- [x] Use delegated events through explicit action attributes. Use `input` to update state and the nearby numeric output for sliders; avoid replacing the focused range input while dragging. On completion, update overview and other affected summaries. Restore focus by stable key after updates when needed.

```js
document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  // Decode the documented action/route, apply it, then refresh affected surfaces.
});
```

- [x] Verify these browser sequences: toggle Living room then open its sheet and check matching states; change one light and close/reopen; toggle a room with one unavailable light and confirm it remains unavailable; issue Open/Stop/Close and confirm command text without position; select/end each mood; select Night then a mood and confirm Night persists; play/skip/volume/source/room/favourite; open hourly/daily forecast; search devices, open a result, return and confirm filter preserved; inspect/dismiss each reminder; adjust thermostat and operate simulated vacuum.
- [x] Verify Tab/Shift+Tab remain within the modal, Escape closes, background cannot scroll, focus returns to the initiating control, and phone sheets leave their close button reachable. Test slider focus while changing volume. Test zero brightness/volume explicitly. Commit working interactions.

## Task 3: Polish, verify, and deliver

**Files:** Create `README.md`; refine prototype files only as findings require.

**Consumes:** Complete prototype from Tasks 1–2.

**Produces:** A polished preview, documented verification, and pushed proof-of-concept commits.

- [x] Add a subtle Prototype label and demo menu with Everyday, Busy, Nighttime, and Reset. Every scenario reset replaces state and closes any active sheet cleanly. Verify dismissing every notice leads to a quiet empty state and resetting restores the scenario.
- [x] Visually inspect all scenarios on tablet and phone, including disabled controls, pressed states, keyboard focus, long text, open sheets, all-device empty results, and safe-area spacing. Confirm the attention area does not move room controls as notice count changes. Keep animations brief and finite; check reduced motion. Record tested sizes and actual findings in README.
- [x] Run syntax/diff checks without repository-wide formatting:

```sh
export PATH="/Users/yann510/Library/Application Support/fnm/node-versions/v24.10.0/installation/bin:$PATH"
node --check public/concepts/house-canvas/state.js
node --check public/concepts/house-canvas/art.js
node --check public/concepts/house-canvas/overview.js
node --check public/concepts/house-canvas/details.js
node --check public/concepts/house-canvas/app.js
git diff --check
```

- [x] Open existing concept and Quiet Home URLs to confirm they still load. Inspect browser errors on the new standalone page. No new unit tests for purely visual reversible changes; the stateful interactions above receive explicit browser checks.
- [x] Request the execution workflow's final independent review after implementation, incorporating actionable findings and rechecking affected behavior. Do not operate real Home Assistant controls during comparison.
- [x] Commit verified prototype changes, fetch origin, verify no unintegrated commits on `origin/codex/quiet-home-poc`, and push normally to that branch. Do not merge main or deploy.
- [x] Open the finished prototype for the user. Share its URL, a short description of the third direction, verification results, and the remaining limitation that the actual Fire tablet viewport has not been measured.

## Self-review

The three tasks cover all approved overview areas, all detail destinations, simulation isolation, both form factors, local artwork, unavailable/empty states, and delivery. Each review-focus condition has a concrete browser sequence above. No dependency installation or production integration is required. Native execution is recommended because visual layout and interaction polishing share the same small state model and DOM.
