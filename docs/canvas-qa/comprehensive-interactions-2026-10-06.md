# Comprehensive dashboard interaction audit — October 6, 2026

Audited current production source from `321f87d` in the clean, existing isolated `house-status-20261006` worktree. Other checkouts, including unrelated uncommitted main-checkout work, were preserved. Source fixes are in `756c58a`. Two independent read-only audits, an independent specification/quality review, and a broad final review found no remaining actionable defects in the audited changes.

## Fixed defects

| Defect | Fix and evidence |
| --- | --- |
| Seeking could retain a gesture through a same-socket disconnect/reconnect, then send it after reconnect | Seek cancels its gesture/draft/timer on connection lifecycle changes and relevant media/capability changes. New regressions failed before the fix. Browser same-socket disconnected/ready injection produced **zero interrupted writes**; a fresh gesture sent exactly one seek. Store disconnect/reconnect also produced zero interrupted writes. Late acknowledgements cannot settle a new track's draft. |
| Pulse could say Finished while appliance details said Idle or Paused | Both use one classifier. Existing detail semantics retained: stopped is Idle, paused is Paused, running with finish/finished is Finished, and unknown/unavailable/disconnected take precedence. All-device machine/job combinations and icon states tested. Browser stop+finished for all three appliances showed a quiet pulse and three Idle details. |
| Pulse keyboard order differed from visual notice priority | DOM now puts feedback, health, reminders, activities, and snoozed controls in visual order. CSS notice-only reordering removed. Browser Tab from header entered the reminder first, then Washer/Dryer/Dishwasher/Roomba; the strip scrolled to keep focused controls visible. |
| Search results overflowed narrow/zoomed dialogs | Grid minimum clamps to available width and long text wraps. Before fix, 280px viewport body measured scrollWidth 251/clientWidth 241. After fix, **241/241** at default and enlarged root text. |

## Browser coverage

Tests used Chromium and the actual composed production React components in the local preview. Entity updates and commands were simulated. The development-only Preview tools overlay was hidden when it intercepted clicks at the bottom of the phone; this overlay is absent from production. No household device writes, backend configuration changes, or HA restart were performed in this audit.

| Family | Exercised behavior and results |
| --- | --- |
| Navigation | All devices → every category → Back → Close at ten viewport sizes. One dialog owner, retained search, stable destination focus, Escape, reverse Tab, body scroll restoration, room picker keyboard Home/Arrow/Enter. Search case/whitespace, bulbs, office, laundry, blinds, speaker, temperature, no matches and Clear. Individual light destinations open and return. |
| Lights | Selected all seven rooms; room off/on and brightness key changes; brightness disabled with all lights off. Opened all eleven light settings overlays, changed brightness, returned correctly; All off affected all seven room cards. Colour-temperature and colour-wheel keyboard changes accepted. Supported settings vary honestly by device. |
| Blinds | Selected/deselected rooms, verified commands disabled with none selected, Open, Stop recent request targets, Close. ACK feedback remains distinct from physical movement. Failure identifies each affected room. |
| Moods/modes | Day/Night, all five mood selections, End, and Retry restoration in recovery scene. Recovery returned to Just be. Deliberate failures expose feedback rather than success. Existing automated tests cover uncertain recovery, ownership and pending locks. |
| Music | Pause/Resume, Next/Previous, overview volume ±, keyboard seek, favourites loading and changed-favourite playback closing, immediate room joins/removal, three-room grouping, coordinator removal/transfer, group volume, mute/unmute, Follow me enable and switch to manual grouping. Changed favourite selection closes on observed playback; same-favourite uncertainty is documented below. |
| Native touch emulation | Phone 393×852 and tablet 960×540, with touch-enabled contexts and reduced motion. Vertical seek swipes sent zero commands; horizontal drag sent exactly one seek. Touch room selection, room power, speaker grouping, and dialog close succeeded without alerts or page overflow. This exercises Chromium touch events, not actual iOS/Fire hardware. |
| Weather | Hourly and Daily, correct seven daily entries/units, mobile columns without horizontal overflow, reverse Tab and Escape/focus return. Forecast failure and explicit retry show honest error state. |
| Climate | Lower/raise each Office/Gym/Bedroom target by 0.5°, restore baseline, reported target updates, and rejected-command feedback. Automated tests cover bounds, off/unsupported states and interrupted commands. |
| Vacuum | Start, pause, resume, stop, return to dock, locate, select/apply fan speed, state-dependent actions and battery. Locate is labelled accepted without claiming observation. Rejection feedback tested. |
| Pulse/reminders | Busy appliances, low battery/offline health, quiet/empty states, Snooze and Restore, three snoozed items, visual/DOM/Tab priority and overflow-strip scrolling. No real reminders dismissed. |
| Failure/offline/empty | Six scenes (busy, health, offline, empty, failure, mood-recovery) × desktop 1440×900, short tablet 960×540 and phone 393×852. Every six-category route and Back checked: **108 detail visits** without horizontal overflow. Offline commands disabled; details remain accessible. Rejected mood/mode/playback/volume/blind/light/climate/vacuum/forecast operations display scoped feedback. |
| Reconnect | Retained seek interrupted by both store state and same-socket lifecycle events sends no stale write. Fresh gesture works. Automated suites cover queued light cancellation, interrupted group topology, retry/restoration, stale acknowledgements and connection epochs. |

Layout navigation was exercised at 1440×900, 1280×800, 960×600, 960×540, 800×600, 768×1024, 393×852, 375×812, 320×568 and landscape 852×393. Overview and all six details have no horizontal overflow. Phone overview scrolls vertically; landscape sheets retain internal scrolling. Normal/busy 960×540 overview fits exactly and every measured overview button is at least 44×44 CSS pixels. Empty status at that constrained viewport may grow by one pixel and scroll naturally.

Fixed search reflow was measured at 280, 320, 393, 960 and 1440px widths at default and 24px root text: body scrollWidth equals clientWidth in all ten cases. Tablet and phone screenshots were visually inspected. Reduced-motion touch navigation passed. Latest browser console contains no errors or warnings; the initial development-only favicon 404 and intentionally missing/failed fixture resources do not establish a production application error.

## Automated verification

| Command/environment | Result |
| --- | --- |
| `npm test` | **528 tests, 35 files passed** (baseline 506). |
| `npm run lint` | Passed. |
| `npm run build:dashboard` | TypeScript and production Vite build passed. Existing large-chunk advisory remains; main bundle about 1.04 MB before gzip. No development fixture markers in production main bundle. |
| `git diff --check` | Passed. |
| `python3 -m unittest discover -s home-assistant/tests` | 164 run, passed, one installed-baseline test skipped. |
| HA 2026.9 environment: `python -m unittest discover -s home-assistant/tests_ha` | **83 passed**. Existing environment at `voice-assistant-design-20260927/.venv-ha-2026`; no dependencies changed on the HA host. |
| HA 2026.9 environment: `python -m unittest discover -s home-assistant/tests_attention` | 37 run, passed, one optional test skipped. |
| `python -m unittest discover -s home-assistant/rollout/tests` | **6 passed**. |
| `LEPRO_BASELINE_DIR=…/neon-startup-20260922/.local/lepro-baseline python3 -m unittest discover -s home-assistant/tests_lepro` | **18 passed** against supplied offline integration baseline. |

Initial broad backend runs exposed missing prerequisites: old HA environment lacked newer LLM/openai dependencies; this worktree lacked exported Lepro source. Rerunning against the existing matching HA 2026.9 environment and complete Lepro baseline passed. These were test-environment issues, not dashboard failures. No source/dependency workaround was added to hide them.

## Usability choices resolved by the user

The user accepted Chromium testing as sufficient and delegated the remaining usability choices on October 6. These decisions are implemented and independently reviewed:

1. Device results focus/highlight the particular speaker, thermostat or appliance in its existing panel, preserving context and never changing device state just by navigating.
2. No thermostat power/HVAC controls: the user expects them to remain on.
3. Keep quick category shortcuts and offer the full inventory underneath when search is empty.
4. Allow supported vacuum fan selection while docked, without starting cleaning.
5. Browser/mobile Back follows the current detail stack; Forward follows the recorded navigation.
6. Keep primary Stop for recently commanded blind rooms, with a separate explicitly targeted Stop selected option when selections differ.
7. Avoid restarting a verified already-playing favourite. Unchanged playback after an acknowledged request remains accepted/unverified, never falsely confirmed.

## Acceptance limits

The separate Playwright browser reached Home Assistant login. A subsequent check found the existing signed-in Codex in-app browser session and verified the deployed dashboard there: Connected live subscriptions, all six device categories/Back/Close, case/whitespace Office search and retained query/focus, real hourly12/daily6 forecasts, all seven actual favourites, and live thermostat/appliance/vacuum/light/speaker readouts. These navigation/read-only checks sent no device commands. At 1440×900,960×540,393×852,320×568, live overview, search and favourites had no horizontal overflow; normal short-tablet overview fit exactly. Native browser console had no warnings/errors. Temporary viewport overrides were reset.

Actual Fire/iPhone/Safari behavior, virtual keyboard/safe-area behavior, background/sleep recovery, audible speaker handoff, physical illumination, vacuum movement, and blind movement/Stop require physical clients and an observer. State-changing authenticated live/device tests for this audit remain unexecuted. The user explicitly accepted Chromium simulation as sufficient for this dashboard audit. These physical outcomes remain outside that accepted scope; they are not prerequisites for completing software acceptance. Sign-in is available through the existing in-app session.

Read-only HA API readiness confirmed HA 2026.9.3, an idle mood, house_moods activate/end/retry_restoration/follow_join/apply_mode services, and reminder dismiss/snooze/unsnooze services. The mood sensor does **not** advertise coordinated-v1 mode control, so the dashboard retains its guarded legacy mode behavior and prevents mode changes over an active mood. No backend opt-in/configuration migration was performed.

This report establishes a reviewed software release with no known remaining actionable defects in the audited changes. It does not assert that arbitrary undiscovered bugs cannot exist or certify unobserved physical behavior. Refer to the existing [hardware test plan](live-hardware-test-plan.md) for remaining physical cases.

## Release

Guarded deployment staged, hash-verified and promoted final frontend release `df3d4c2`, retaining the previous dashboard for rollback. Fresh HTTP verification matched all **193 manifest files**, including **68 local build files**. Exact hashes and timestamp are in [release verification](comprehensive-interactions-release-2026-10-06.json). No backend changes or real hardware commands were issued.

Completed source and evidence are published directly to `origin/main` through a normal fast-forward after fetching. Other checkouts remain untouched. [Refresh the dashboard](http://homeassistant.local:8123/local/dashboard/index.html?release=df3d4c2) to load the fixes. Physical-device behavior is not certified; Chromium is the user-approved acceptance scope.

## Final visual follow-up

The signed-in in-app browser's default viewport near 788px exposed a blind-room label splitting “Bedroom” across two lines inside the paired overview layout, outside the tablet CSS's ≥800px band. Local reproduction measured label width42px and two word fragments. The paired cards now stack their artwork above room labels from 701–799px. A further narrow-phone check found Bedroom text outside its button at 320px and multiple labels overflowing at 280px; room tiles now use a stacked layout at ≤360px. Final geometry checks cover 280,320,360,361,375,393,701,720,768,788,799,800,960 and1440px. Each tile retains at least44px in both dimensions. Independent task and broad code reviews passed with no actionable findings. The full 528-test frontend suite, lint and production build passed again. These changes are included in the final deployed revision.

Final authenticated production check on release `fb5db1b`: Connected, no warning/error logs, and blind labels contained at 280, 320, 788 and 960px. Bedroom remains a whole word at every size; 280px Living room wraps between words. Temporary viewport overrides reset. Fresh HTTP verification matched all 191 manifest files and all 68 local build files.

## Usability follow-up evidence

Specific speaker/thermostat/appliance destinations: 40 visits across 320,393,960 and1440px focused the exact read-only row and sent zero service writes. Empty search exposes six category shortcuts and25 individual fixture entries. Inventory geometry at280,320,393,768,960 and1440px with16px and24px root text (12cases) has no root/dialog horizontal overflow and all navigation buttons≥44px. Native Chromium touch-enabled393×852/960×540 contexts with reduced motion scrolled inventory, focused tapped appliance, returned via Back and closed by touch.

Main route history checks passed Back/Forward, in-appBack, Close followed by Forward, mixed-case/whitespace query retention, host state/fullURL preservation, reload stale-record rejection and rapidBack+Close. Final review exposed missing room-picker/embedded-light-settings history and Tab leaving the modal from appliance-row focus. Both were fixed in df3d4c2 and the scoped independent re-review approved all findings, including replacement of fixed traversal sleeps with bounded popstate-driven waits.

Docked fan selection reported Quiet while remaining Docked and emitted only vacuum.set_fan_speed. Explicit Stop selected and Stop recent emitted stop commands for Bedroom and Living room respectively after a Living room open request. Stop geometry at the six widths above/default+enlarged text has no horizontal overflow and every control≥44px.

All seven fixture favourites confirmed their first selection, closed the gallery, and sent zero additional play requests on verified repeated selection. Paused selection sent one request and returned Playing; Next cleared stale Already playing feedback. ACK-only and stable unrelated contentID+title-only change stayed accepted/unverified after the20s observation window, retained the gallery and enabled a one-write retry. Initial offline gallery now shows reconnect guidance with no impossible loader or retry. Regression and independent re-review cover sourceA→B→A stale errors and invalid cache prevention.

Latest completed revision8f7120c passed551tests/36files, full ESLint and TypeScript+productionbuild. Backend code is unchanged from the earlier verified suites. Final source df3d4c2 passes **563 tests/36 files**, full lint and TypeScript+production build. Independent review reports no remaining actionable findings. During concurrent hook edits, development HMR briefly mismatched old hook order; clean subsequent page loads had no errors/warnings. No production workaround was added for development refresh state.

Final Chromium overlay acceptance: room-picker Back/Forward, selection and Escape preserve the URL and restore the trigger; homepage settings Back/Forward/Escape work and opening a parent replaces the home overlay coherently. Directory → All lights → settings Back dismisses settings first; the next Back returns to the directory. Forward across remount restores the correct settings owner and focus. Parent Close returns to overview even with settings open. The same touch flows pass at393×852 and960×540 with reduced motion and no horizontal overflow. Native Tab and Shift+Tab remain inside dialogs from all three appliance destinations online/offline and the last offline thermostat/speaker row (eight cases).

Final failure checks show scoped errors for rejected favourite playback and docked fan changes. Initial offline favourites show reconnect guidance; unavailable vacuum has no active commands. Fresh phone preview confirms first favourite selection closes, verified repeat closes with Already playing, and fan Quiet leaves the vacuum Docked. Clean page console has zero warnings/errors. These simulated commands do not write to household devices.

Final authenticated release `df3d4c2`: Connected, room-picker browser Back restores overview, the full inventory contains25 devices, Washer navigation focuses/highlights exactly that row, and Back returns to the directory. Docked live vacuum remains readable; the live integration does not advertise supported fan options, so capability guards correctly omit that control. The supported simulator fan flow passed separately. At393×852 and960×540, inventory root and dialog body have no horizontal overflow (354/354 and813/813 body widths). Native browser warning/error logs are empty. No live device commands were sent; temporary viewport overrides were reset. Final manifest verification matches all193 remote files and68 local build files.

All seven user decisions are resolved. Task and final independent reviews are approved with no open actionable findings. Source and acceptance evidence are committed and pushed directly to origin/main using a normal fast-forward after fetching; unrelated checkouts are preserved. Chromium software acceptance is complete.
