# House Canvas verification — September 23, 2026

The optional live Canvas view is composed from the production React components. Classic remains the default. The approved prototype was inspected for comparison; it is not the Canvas runtime.

## Automated checks

- `npm test`: **293 tests passed across 29 files**, including 10 Canvas integration journeys.
- `npx tsc -b`: passed.
- Scoped ESLint: passed with **no errors or warnings** for every changed `.ts`/`.tsx` file since `8e9f204`, plus the new integration test and `dev/canvas-preview`.
- `npx vite build`: passed. Vite reports the existing large-chunk advisory (main chunk about 1.04 MB before gzip); no build failure. `npm run build` was deliberately not used because its prebuild formats unrelated files.
- Production `dist/assets` contains none of the development fixture markers (`local-preview`, `Controlled preview failure`, `Canvas controlled preview`, `fixture:`).

The new integration suite exercises every detail destination and Back/Close, retained directory search, focus restoration/trapping, speaker slider identity after telemetry, Player/Speakers roundtrips, offline/reconnect without writes, forecast failure/retry, all-light partial failure, failed-room-only blind retry across navigation, mood recovery with attention context, artwork-only favourite playback rejection, and immediate overview volume adjustment through the shared volume implementation. Existing controller tests continue to cover locks, partial results, capability filtering and stale replies.

## Safe local preview

Start from the repository root:

```sh
npx vite --config dev/canvas-preview/vite.config.ts
```

Open [the controlled Canvas preview](http://127.0.0.1:8773/dev/canvas-preview/index.html?view=canvas). Optional query parameters: `scene=busy`, `scene=offline`, `scene=empty`, and `long=1`. The busy scene rejects mock commands and forecast subscriptions. No Home Assistant connection is opened; all commands terminate in the local fake connection. Fixture data is deliberately confined to the separate development HTML/entry, outside `public`. The production entry still uses normal `HassConnect` authentication. This URL is local browser QA, not a tablet deployment URL.

## Actual browser measurements

CUA drove a dedicated Codex in-app browser tab. Device pixel ratio was 1. These are real browser DOM measurements, not jsdom dimensions. The full composed layout includes the root padding and view switch. Raw route measurements are in [canvas-qa/metrics.json](canvas-qa/metrics.json).

| CSS viewport | Document width × height | Essentials bottom | Pulse height | Targets below 44 px |
| --- | --- | --- | --- | --- |
| 960 × 600 | 960 × 600 | 535.5 px | 62 px | None |
| 1280 × 800 | 1280 × 800 | 541.5 px | 62 px | None |
| 375 × 812 | 375 × 1229 | 1173.4 px | 74 px | None |
| 393 × 852 | 393 × 1229 | 1173.4 px | 74 px | None |

Phones scroll vertically. None of the four viewports has horizontal page overflow. Every detail destination was opened and returned from at all four sizes: All lights, individual light, Blinds, Player, Speakers, Weather, House Mood, Thermostats, Appliances and Roomba. All dialog scroll widths equalled client widths; tall sheets scroll internally. Checkbox targets are measured using their clickable enclosing labels, rather than the smaller drawn checkbox.

The 960 × 600 busy scene also fits in exactly 960 × 600 after a rejected room-light command. Its compact error summary remains visible and directs the user to the full friendly-name failures in All lights. Attention is a compact tappable chip, with Done/Snooze in the contextual detail. Beside one attention chip, all four appliance buttons are visible: each is approximately 141.8 × 44 px, with Roomba ending at x=923. The reserved pulse row does not move the controls. A device count/arrow makes additional horizontally scrollable activity discoverable.

Keyboard verification in the browser confirmed Shift+Tab from the Speakers dialog enters the last visible disclosure, Tab wraps to Close, Escape restores the Speakers trigger, and body overflow is restored. Automated coverage additionally verifies the Back trigger and stable slider focus across entity updates. Closed disclosure controls are excluded from the focus trap; the dashboard view switch is inert while the dialog is open.

Daily weather at 375 px was inspected and measured: date, condition, temperature and precipitation occupy distinct, non-overlapping columns (roughly x=19–85, 90–222, 227–301 and 307–356). Long media titles wrap in Player and use two lines on the overview. Favourites show artwork or a graphic fallback with accessible playlist names. Player has no volume or source selector; Speakers has wide lilac ranges, explicit Apply rooms, and separate immediate-volume wording. Offline commands are disabled; missing metadata is labelled unavailable rather than fabricated.

## Screenshots

Canonical viewport screenshots were taken after a settled AX/DOM check. The browser's alternate full-page capture returned a mis-scaled tablet image once; it was discarded and replaced.

- [960 × 600 overview](canvas-qa/960-overview.png)
- [1280 × 800 overview](canvas-qa/1280-overview.png)
- [375 × 812 overview](canvas-qa/375-overview.png)
- [393 × 852 overview](canvas-qa/393-overview.png)
- [960 × 600 busy scene and command failure](canvas-qa/960-busy-failure.png)
- [375 px Daily forecast](canvas-qa/375-daily.png)
- [375 px All lights](canvas-qa/375-All-lights.png)
- [393 px long title and favourites](canvas-qa/393-player-long-title.png)
- [393 px Speakers](canvas-qa/393-speakers.png)
- [Quiet](canvas-qa/393-quiet.png) and [Classic](canvas-qa/393-classic.png) remain visually separate.

## Console and limits

Fresh Canvas runs across everyday, offline, empty and busy scenes produced no console warnings/errors; Quiet also produced none. Classic rendered correctly but produced a React development warning: `Cannot update a component (gi) while rendering a different component (Unknown)`. A temporary development-only trace localized it to the installed HAKit WeatherCard's `resizeDetectorProps.onResize` setter, invoked by react-resize-detector inside its `setSize` updater. The optimized dependency stack was `ThemeControlsModal-C4NMFtsR-CTWKVcVE.js:26374` → `:13316` → `:13400`; no Canvas hook appeared in that trace. The trace instrumentation was removed. This is an observed Classic/dependency warning; a baseline runtime comparison was not performed.

Classic and Quiet were checked at 393 px with root class empty, root padding `8px 8px 48px`, no Canvas root, no horizontal overflow, and their original dark-blue palette. Canvas selectors are rooted to Canvas/its dialog; the Canvas root class is removed on view cleanup.

This verifies desktop browser emulation only. Fire tablet and iPhone hardware acceptance remains pending: actual viewport/browser version, fullscreen fit, reading distance, touch accuracy, safe areas, artwork loading, appliance animations, keyboard/focus, sleep/background recovery and Wi-Fi loss. No live-home command was sent during QA. Trial deployment and the actual LAN URL are handled separately.

## Review follow-up: activation focus

Pointer/touch navigation now passes each button's actual activation element instead of inferring it from keyboard focus. Back uses stable destination keys even when light names/state change. Regression tests intentionally click without pre-focusing buttons, including when search retains focus. The focused integration/dialog/affected-component run passes **77 tests across 7 suites** (17 integration cases); typecheck and full changed-file scoped lint also pass. The original full-suite result above records the composition acceptance run before this focused follow-up.
