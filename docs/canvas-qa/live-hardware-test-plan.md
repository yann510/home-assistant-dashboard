# Canvas live deployment and hardware acceptance plan

Prepared September 26, 2026. **This is a plan, not a record of passed tests.** Record execution separately in `live-hardware-results.md`, including blocked and unexecuted cases. Existing local preview reports do not certify this release on hardware.

## Preflight observed for this session

Root read-only inspection found HA 2026.9.3, an existing active **Unwind** session, Day on/Night off, Follow me on, and a living-room/bathroom playing group at 20%/18%. `mode_control` is absent and the only `house_moods` services are `activate`, `end`, `retry_restoration`, and `follow_join`; `apply_mode` is absent. Baseline is private at `/tmp/canvas-live-qa/baseline.json` and must not be committed. This is an already-in-use household session, **not disposable test state**. Preserve its durable ownership/restoration journal. Ending and recreating the same mood would capture a different baseline and is not exact restoration. Avoid device writes covered by this session until its restoration/migration boundary is understood; do not restart the backend over it solely to unlock test cases. Frontend trial deployment can proceed independently. Coordinated mode cases remain blocked until an explicitly recorded safe backend migration/restoration path is completed. Browser authentication and physical observer availability are also preconditions, not presumed available.

## Scope and acceptance contract

Test the deployed Canvas frontend, its Home Assistant integrations, real entity updates and the household devices it controls. Exercise the actual dashboard UI for each primary journey; a direct service call alone does not prove the UI works. Read-only HA state subscriptions provide independent corroboration. Physical observation provides a third, separate level of evidence.

The user authorized deployment and real-hardware testing. Execute reversible tests in a short, controlled session, restoring the captured baseline after each family. Do not start dishwasher, washer or dryer cycles; delete reminders; factory-reset devices; intentionally corrupt configuration/storage; disable household Wi-Fi; or disconnect power to running equipment. Do not raise volume to maximum or drive thermostats to extreme temperatures just to exercise bounds. Use client-only network interruption for recovery tests. Restart HA only as part of the coordinated backend rollout or a separately scheduled restoration-recovery exercise with a verified recovery path. Never issue competing test actions from multiple operators unknowingly.

Required behavior:

- Moods may start over either settled Day or Night. Ending them restores still-owned baseline settings; explicit manual overrides survive. Switching moods retains the original baseline.
- Room brightness sets the same level on **currently on, available, dimmable lights only**; off lights stay off.
- One group volume applies the same absolute level to every confirmed group member. Speaker selection applies immediately; removing a coordinator transfers to a remaining room. At least one speaker remains selected.
- Blind acknowledgements prove service acceptance only. They do not prove movement, final position or physical Stop.
- Reconnect/reload never replays stale writes. Failed/unconfirmed operations never masquerade as successful physical completion.
- Favourite artwork opens from the heart; successful selection closes the gallery. Seek uses the existing divider between transport and Follow me. Unsupported or unavailable controls are omitted/disabled honestly.

## Evidence and result rules

For every test record: ID, timestamp/time zone, deployed commit/release, actual client/browser/viewport, starting state, UI steps, expected result, actual result, target entities, service outcome, observed HA state, physical observation, cleanup result, screenshots/log references, and verdict.

Use **PASS**, **FAIL**, **BLOCKED**, **NOT RUN**, or **N/A**. N/A requires a verified absent capability. BLOCKED names the missing prerequisite/operator/access. Split results when necessary: `UI PASS / HA PASS / physical BLOCKED`. Never convert a service ACK, a simulated scene or desktop viewport emulation into physical PASS. Redact tokens, private URLs/query strings and household identifiers unnecessary to the evidence. Record event order and times rather than claiming causality from a single snapshot.

Suggested row template:

| ID | Client | Baseline/steps | UI + service | HA observation | Physical observation | Cleanup | Verdict/evidence |
|---|---|---|---|---|---|---|---|
| L01 | actual device/browser | … | … | … | … | … | NOT RUN |

Use the application's configured command/observation timeout, recording its measured duration. After an unconfirmed result inspect live state before retrying. Stop the family on unexpected targeting, uncontrolled movement, unexpectedly loud playback, contradictory mode state or a persistent recovery-required status. Restore only known changed values; do not blindly replay a stale baseline over somebody else's new manual action.

## Prerequisites, baseline and deployment

### P01 — Inventory and recoverable baseline

1. Verify current worktree and clean/intended diff; fetch `origin`, record HEAD and upstream. Record review findings and resolutions before publishing.
2. Record live Canvas/current-dashboard release, entry and asset hashes; keep the existing dashboard usable. Verify SSH recovery access without logging secrets.
3. Capture Day/Night helpers, `sensor.house_mood` phase/capabilities and active mood, Follow me state, all dashboard light state and supported modes/bounds/current brightness/colour/effect, speaker state/group coordinator/members/volume/mute/current source/track/position, climate targets/modes, blind physical positions and appliance/vacuum states. Preserve this evidence privately outside git if it contains sensitive state.
4. Record which devices are occupied/in use. Prefer inactive, unoccupied rooms for light tests. Capture existing media state before replacing playback; if its original stream cannot be restored reliably, mark replacement/handoff cases blocked until a test playback session is available.
5. Arrange a physical observer for blind motion/Stop and audible playback, or mark physical portions blocked. Do not move blinds unattended when physical position or clearance is unknown. Capture actual Fire model/browser/full-screen viewport and iPhone model/iOS/browser; do not assume them from desktop emulation.
6. If a mood already owns devices, do not snapshot those as an ordinary baseline and later overwrite its ownership. Complete/restore the existing session first under its documented contract or defer state-changing mode tests.

### P02 — Regression and backend readiness

Run frontend full Vitest, TypeScript, ESLint and production trial build. Run mood, HA integration, attention and rollout-helper suites using the repository's supported Python environments. Record exact commands, counts, failures and build warnings; do not reuse old passing counts as this release's evidence. Confirm regression coverage for deterministic failures that will not be injected into real equipment: partial writes, stale acknowledgements, out-of-order topology events, restoration interrupted by restart, unsupported capabilities, gesture cancellation and timeout recovery.

Inspect live services/configuration before exercising moods and modes. UI deployment alone does **not** deploy Python integration fixes or coordinated Day/Night orchestration. Follow `home-assistant/rollout/coordinated-modes.md` and its YAML exactly if rolling out that backend:

- Preserve private integration session storage and back up configuration/integration files.
- Disable and stop the specified competing legacy automations/script; retain their definitions for rollback.
- Install integration changes, merge opt-in/schedule without replacing unrelated configuration, validate configuration, restart using the documented route.
- Verify `sensor.house_mood.attributes.mode_control == coordinated-v1`, expected services, exclusive helper state, no startup errors, and absence of competing legacy automation execution.
- If this prerequisite is unmet, record coordinated transition tests **BLOCKED**, not passed using legacy helper toggles. Legacy UI intentionally blocks unsafe mode commands while a mood is active.
- The documented off-state LocalTuya restoration uses captured Day/Night defaults for hidden DP22, not an exact unreadable raw snapshot. Test that specific contract and label HA/service evidence separately from physical brightness.

### P03 — Publish a dedicated live trial

Use `npm run build:canvas-trial` (avoid the generic formatting prebuild), then `npm run deploy:canvas-trial -- RELEASE_ID` with the tested immutable commit ID. Verify release metadata, SHA-256 manifest and explicit entry `/local/canvas-trial/index.html?view=canvas`, its referenced assets and retained prior assets over LAN HTTP. Verify the original `/local/dashboard/index.html` remains unchanged. Do not use the directory URL alone; it has previously returned 403.

Open the authenticated trial in an ordinary browser and on available physical clients. Confirm it uses live HA, not `/dev/canvas-preview`, fixture IDs or a simulated scene. Check a benign existing state against HA. Refresh once to exclude stale bundle/cache. If critical load/authentication/state-subscription checks fail, stop, restore the previous trial using `npm run rollback:canvas-trial`, and verify recovery rather than continuing device tests.

## Session execution order and release gates

1. Complete P01/P02 and the independent plan review; record any pre-existing failures separately. A relevant failing regression blocks publishing until resolved or concretely justified, not silently waived as unrelated.
2. Publish and verify P03 without changing the backend or active Unwind journal. First execute read-only U01/U02/U03, B01, S01, W01/W02, A01 and capability inventory. These may proceed without a physical observer; their physical verdict remains separate. If browser login is blocked, HTTP/asset and API checks can proceed but **all UI interaction verdicts remain BLOCKED** until an authenticated client is available.
3. Re-read live mood ownership, grouping and occupancy immediately before any write. During the existing Unwind session, defer its owned light/music/group/Follow me writes and stateful recovery tests; run a reversible test on an independently verified unowned target only if it does not conflict with household use. Never clear/end the existing mood merely to unblock the checklist. Record the reason and next prerequisite for each deferred family.
4. Once a controlled test session and observer are available, run one-target lights/music smoke tests, then group actions, physical blinds, mode/mood families after their backend gate, and finally client-fault tests. Verify cleanup after each family before expanding scope. Run at most one state-changing family at a time.
5. Recheck read-only navigation and live state after cleanup; issue a limited-trial verdict if any critical live/device cases remain blocked. Report the exact deployed frontend and backend revisions separately.

For deliberate failure injection, record exactly which client/request was interrupted and when the fault was removed. After each fault, prove **both** fresh state reconciliation and one subsequent successful benign UI action on the same control (with baseline restoration); disappearance of an error alone is insufficient recovery evidence. Missing-art/favourite-empty/unsupported-format and device-partial-failure branches that cannot be safely produced live must cite their deterministic regression and retain a distinct live NOT RUN/BLOCKED verdict.

## Navigation and global UX

| ID | Steps | Expected result |
|---|---|---|
| U01 | Open dashboard directly; refresh; open in a second authenticated client. | Same live entities and base mode; no unsolicited device writes. No clipped header, art or duplicate controls. |
| U02 | Open every overview entry: room picker, All lights, light settings, blinds detail where available, Speakers, heart/Favourites, Weather, attention, All devices. Close with X; desktop Escape/outside click where supported. | Correct target/title; one active dialog, predictable focus return; no background interaction through overlay. Closing is not a write. |
| U03 | All devices: search room/device/category, mixed case, whitespace, no matches, Clear; enter each destination then Back. | Correct results; query/scroll retained where designed; Back returns to originating entry; no unsolicited writes. |
| U04 | All lights: scroll below fold, open embedded settings, change supported setting, close X. | Settings fit the room card; returns to same scroll/card with changed state; controls for another light remain distinct. |
| U05 | Keyboard tab/shift-tab, Escape, room picker and slider keys; screen-reader names where tooling exists. | Focus visible and contained appropriately; accessible name/state and no keyboard trap. Physical touch verdict separate. |

## Lights

Run capability discovery for every dashboard light. Start with a reversible one-light smoke test, then expand room by room. Check both main card and All lights route; recheck settings opened via All devices.

| ID | Steps | Expected result and evidence |
|---|---|---|
| L01 | Select each room tile, inspect room icon/colour/list. Toggle one available light on then off, restoring baseline. | Correct room/entity only; button pending stays inside its footprint; state follows actual HA update; physical illumination separately recorded. No routine success text causes layout jumps. |
| L02 | In a room with mixed on/off bulbs, set room brightness to a moderate recorded level; restore. | Every currently-on dimmable member receives equal brightness (allow device quantization); off/unavailable/non-dimmable members untouched. |
| L03 | All room lights off: inspect slider; use room power on/off, then All lights off across house only after baseline captured and occupancy suitable. | All-off slider disabled; room action stays scoped; whole-house action targets eligible configured lights only. Restore each original state, not blanket on. |
| L04 | Open settings for every capability class; change supported brightness/colour/warmth/effect modestly and restore. | Only supported properties exist, valid ranges, no unsupported service fields. Live advertised `color_temp` plus valid increasing Kelvin bounds required for Warmth. Current known warmth candidates: bedroom, office bulbs, front door, toilet; re-query rather than hardcode acceptance. Brightness-only/HS/RGB-only lights have no Warmth. |
| L05 | Start slider gesture; second client turns that light off before release. Repeat vertical-scroll/pointer-cancel on actual touch client. | Dispatch revalidates state; off light is not powered on; cancelled gesture sends no delayed write. |
| L06 | Two quick taps; change selected room/open-close settings while request pending. | No duplicate conflicting write; feedback remains tied to original target; subsequent ordinary action works after settlement. |
| L07 | Use any naturally unavailable light; inspect controls and independent healthy light. | Unavailable does not read Off; unsupported writes disabled; healthy light remains usable. Do not cut device power to manufacture this case. |

## Blinds — physical supervision required for movement

| ID | Steps | Expected result and evidence |
|---|---|---|
| B01 | Select each of three rooms, two-room subset, all, then none without sending movement. | Distinct room icon/colour and selection; no redundant selection prose; none disables movement; no service call on selection. |
| B02 | With observer and safe clearance, select two rooms; Open briefly, then Stop while still moving. | Only chosen rooms move; Stop reaches both promptly. Record dispatch/ACK and physical stop times separately. No invented position/progress. |
| B03 | During safe observed movement change/clear current selection, then Stop before remembered targets expire. | Stop targets original movement rooms, not only new selection. 90-second retention is operational memory, not motion telemetry. |
| B04 | If naturally slow acknowledgement allows it, Stop before Open ACK. Otherwise deterministic regression only. | Stop dispatch does not wait for Open ACK; late response cannot overwrite/replay action. Physical provider ordering must be observed; ACK alone insufficient. |
| B05 | Close briefly then Stop; restore original physical positions with observer. | Same scope/order safeguards; cleanup is physically confirmed. If precise original position cannot be restored, report explicitly. |
| B06 | Natural per-room failure, if present: inspect error and retry. | Retry only failed original targets; successful rooms not repeated. Never deliberately jam/disconnect a blind. Otherwise live case BLOCKED with regression reference. |

## Music, favourites and speakers

Keep test volume low and audible, never above the lesser of the captured safe baseline or an agreed comfortable limit. If baseline is zero, do not infer that louder audio is welcome; use state-only checks until an audible test window exists.

| ID | Steps | Expected result and evidence |
|---|---|---|
| S01 | Open heart; inspect all seven live favourites and artwork, scroll if needed; close without choosing. | Gallery contains artwork, accessible labels and graceful missing-art fallback; no duplicate transport/player screen or device write. |
| S02 | Select one favourite; repeat once with another, then pause/resume/previous/next. | One playback request, gallery closes only on success; reduced-motion preference suppresses travel animation; selected artwork arrives at card. Correct coordinator/track updates; failures retain useful retry state, not false success. |
| S03 | While playing observe progress; pause, wait, resume; seek to safe midpoint, then near end. | Divider below transport fills with elapsed/duration, no extra line; pause stops advancing; live/missing duration hides unsupported seek; seeking uses current coordinator. Track rollover resets correctly. |
| S04 | Join one room then remove it; repeat each available speaker. | Immediate selection, no Apply/Will join states; authoritative membership settles; no unrelated playback stolen silently. |
| S05 | With ≥2 members remove coordinator; after settled transfer seek, pause/resume and change volume. Repeat with three survivors if available. | Playback transfers to a selected survivor; removed coordinator no longer receives group commands; surviving members play same stream. Last selected room cannot be removed. Physical audibility separately checked in each room. |
| S06 | Start members with observed different volumes only within safe range; set group slider/± once; add/remove member and repeat. | Every confirmed member receives identical absolute volume. Slider reports coherent final state; removed/nonmember speakers untouched. Restore original individual values through backend cleanup if needed, not by adding individual-volume UI. |
| S07 | Enable Follow me; physically move between covered rooms; inspect room controls while managed. Use **Switch to manual grouping**, wait for cleanup, then select rooms; separately exercise the Follow me off switch. | Correct automation follows actual occupancy; room selectors stay locked while managed/cleanup is pending. Explicit manual handover disables Follow me and completes cleanup before room editing becomes available; later automation does not undo manual grouping. No occupancy events means physical case BLOCKED. |
| S08 | If another room already has independent audio, inspect conditional Change source and conflicting Join. Cancel first; then Replace only during controlled test playback. | No silent audio replacement; Cancel retains both streams; chosen source/explicit replacement is honored. If no competing source exists, do not fabricate success. |
| S09 | Pending operation: double tap favourite, close/reopen speakers; reload during a benign volume change. | No duplicate playback, stale targeting or replay; fresh state recovered. Natural errors/timeout are visible; do not disconnect Sonos power or force disruptive topology corruption. |

## Day, Night and moods

Backend gate P02 must pass for coordinated transitions. Run each mode family only when test lights/audio can be disturbed; restore captured household state between families. Capture coordinator session/phase and affected entities, not only helper booleans. Do not change system clock to trigger schedules.

| ID | Steps | Expected result and evidence |
|---|---|---|
| M01 | From settled Day select each available mood, wait active, End; repeat at least one fully from Night and inspect every mood's Night preflight. | Allowed from either base mode; helper mode retained; End restores still-owned baseline. Record each mood separately, not one blanket PASS. |
| M02 | Night → mood A → mood B → End. Repeat from Day. | Original base/baseline retained across switch; no accidental Day activation or stale A restoration. |
| M03 | Active mood → explicit Night; active mood → explicit Day; reapply current base mode where UI/service supports it. | Coordinated transaction ends mood and applies requested mode without brighter baseline flash; no unsafe helper-only success. Existing Night routine stages brightness and toilet off; do not expect every light off. |
| M04 | During starting/restoring phase try conflicting mode/mood action once; retry after stable. | Disabled/rejected with useful busy explanation; no queued stale command. UI recovers when phase settles. |
| M05 | During mood manually adjust light brightness/power, music pause/volume, speaker grouping and Follow me (separate runs where ownership differs), then End. | Explicit manual choices preserved; only still-owned settings restored. Observe late events rather than assuming short waits exclude them. |
| M06 | Previously-off mapped light → mood changes brightness → End → later safe manual on. | Power restored off first; captured exclusive Day/Night default restaged only if still owned and base unchanged. Physical later-on level checks default policy; hidden original raw value cannot be certified exact. Restore baseline again. |
| M07 | Real motion on/delayed off during active mood, then after End. | Matches captured automation guard policy for that mood/target; no assumption that every light is protected from all motion automations. Record actual trace and physical light response. |
| M08 | Reload browser while mood active, then End from another client. | Durable backend session survives client lifecycle; ownership/baseline retained; first client reconciles without replay. |
| M09 | If recovery naturally occurs, inspect actionable status, manually change one affected device, Retry/End according to offered recovery action. | Only unresolved still-owned work retried; manual changes preserved; no false success while unresolved. If no natural failure, deterministic regression evidence only, live BLOCKED. |
| M10 | Planned HA restart while a stable test mood is active, only if maintenance/recovery access is available; reconnect then End. Interrupted-write restart remains deterministic unless safely reproducible. | Durable state returns, no duplicate scene/restore, baseline ownership preserved. Never kill power or corrupt storage to create interruption. Record not-run cases explicitly. |
| M11 | Observe next natural scheduled Night transition at 21:30 local time if within test window; otherwise inspect configured schedule/trace and defer live execution. | Single coordinated owner; no legacy parallel writes. Busy rejection is observable and not silently queued. Trace inspection alone is not execution PASS. |

## Weather, attention, appliances and secondary actions

| ID | Steps | Expected result and evidence |
|---|---|---|
| W01 | Weather glance → hourly → daily → hourly; close/reopen. | Verdun/Montréal location; current temperature, correct condition icons including night; hourly ordered by local time; daily rows align. America/Toronto is time zone, not displayed city. |
| W02 | Inspect available wind/feels-like/precipitation and absent fields; refresh/live forecast update. | Amount vs chance correctly labeled by units; zero preserved, absent fields omitted honestly, no repeated amount label or bulky warning. Header sits close to rows; wind does not inflate each row. |
| W03 | Switch forecast view then immediately close/reopen; repeat with client connection interrupted. | Latest selection wins, no duplicated rows/subscriptions; recover to fresh forecast after reconnect. |
| A01 | Inspect House pulse and appliance detail for current washer/dryer/dishwasher/vacuum states. Observe a naturally running→finished cycle if available. | Running animated icon/status visibly present; unavailable isn't idle/running; pill width compact. Do not start a cycle solely to test animation. |
| A02 | Open actual reminder details; snooze/dismiss only a disposable or genuinely resolved reminder after recording it. | Correct episode affected; simultaneous reminders remain. New episode during pending dismissal must survive (deterministic regression if no natural case). Do not lose an unresolved real household task for a test. |
| T01 | Each available active thermostat: one safe step lower then restore, or same-direction safe step avoiding unwanted heating; inspect min/max/step metadata. | Correct single target/step, pending/error truthful, unavailable/off unsupported controls disabled. Extreme bounds tested in regressions, never by heating room to maximum. |
| V01 | Inspect Roomba battery/state/capability actions. If naturally cleaning, inspect pause/return controls; execute only with safe path and observer, restoring prior intent where possible. | Unsupported actions absent/disabled, repeated tap blocked pending; service acceptance distinguished from actual motion/docking. Do not start vacuum unattended simply to exercise a button. |

## Connectivity and error recovery

Client-only faults must not affect the household LAN or HA server. Keep a second healthy client/read-only state stream to observe actual device outcomes and restoration. End active blind movement before connection tests.

| ID | Steps | Expected result |
|---|---|---|
| R01 | Disconnect only test browser network (or physical test client's Wi-Fi), while idle; try writes and read-only navigation. | Disconnected indication; no queued writes; navigation/weather history remains honest; no false all-clear. |
| R02 | Reconnect after ≥ application timeout, then reload; compare with healthy client. | Fresh HA state; no command replay; no frozen busy indicators, duplicate subscriptions or phantom selection. |
| R03 | Send one benign reversible light/volume action, interrupt client connection immediately; observe second-client state, reconnect. | Ambiguous result reconciles to actual state. Retrying is explicit, not automatic replay. Restore actual outcome once known. |
| R04 | Background/suspend client during pending benign action; wake/reload and navigate elsewhere. | Restored connection, up-to-date progress/state, no duplicate writes; error feedback doesn't attach to unrelated card. |
| R05 | Naturally failed/unavailable target plus healthy target in a group, if present. | Partial results identify failed target; retry only unresolved work where offered; healthy device remains usable. Otherwise BLOCKED live and reference deterministic tests. |
| R06 | Auth expired/permission denied only via non-destructive client session flow if available; reauthenticate. | Login/retry path works, no secret displayed, stale request not replayed. Do not revoke shared household credentials to manufacture failure. |

## Actual-device layout and touch matrix

Execute U01–U04, L01–L02, B01, S01–S06, W01 and R01–R04 on both named physical devices when available. Fire must be mounted landscape/full-screen; iPhone Pro portrait plus landscape. Record actual viewport, browser and OS. On Fire inspect dashboard fit at wall distance, all touch targets ≥44 CSS px, no header clipping/card growth, readable progress and room colours. On iPhone inspect safe areas, keyboard search, modal internal scrolling, thumbnail grid, picker tiles, touch-slider cancellation and orientation. Repeat open/close after sleep/wake. Reduced-motion and increased text settings must leave navigation functional. Desktop resized checks can supplement but cannot satisfy this matrix.

## Cleanup, rollback and final gate

1. Stop any supervised blind motion; physically restore positions. End only the test mood through its recovery-aware controls. Do not force helpers to hide a recovery session.
2. Restore test-changed lights/colour/brightness/effects, base mode, original speaker groups/source/pause/volume/mute/Follow me, and thermostat targets while preserving later household manual choices. Media position may advance naturally; explain nonrestorable streams instead of claiming exact rollback.
3. Compare final HA state with baseline and obtain physical confirmation where required. Verify no active pending/recovery session, no unexpected device targeting, no stuck controls, no new integration errors. Record each mismatch and owner.
4. For severe deployment regression, use verified frontend rollback and HTTP/hash checks. Backend rollback is separate: follow coordinated-mode instructions, disable new schedule/opt-in before restoring legacy automations; preserve integration session storage and resolve active recovery first. Frontend rollback alone does not undo physical actions or backend migration.
5. Publish result matrix, automated run evidence, deployment/release/hash evidence, resolved/open defects and precise blocked physical tests. Commit/push the tested source and evidence following repository policy. Do not claim “all hardware works” if Fire/iPhone touch, blind Stop, audible handoff or restoration remain unobserved.

Acceptance for a household trial requires load/auth/live subscriptions, no unsafe commands, basic reversible lights/music operations, credible errors/reconnect, cleanup and preserved old-dashboard fallback. Acceptance for **hardware-certified production** additionally requires all relevant critical real-device rows above, physical client matrix, reviewed mode/backend contract and no unresolved high-severity failures. Missing equipment/observer creates a candid limited trial result, not an invented pass.
