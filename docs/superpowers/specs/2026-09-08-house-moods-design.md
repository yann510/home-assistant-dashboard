# House moods design

Date: 2026-09-08
Status: Preset behavior and UI/UX approved in conversation on 2026-09-08. Technical implementation prerequisites remain to be verified.

## Purpose and scope

Add one House Mood card with four curated presets: Love, Unwind, Dinner, and Party. Every preset starts an existing Sonos favorite and applies explicit lighting settings. Follow-me moves music only; lighting remains fixed in the selected rooms. Night and user-created presets are excluded from the first version.

The card contains four labeled mood buttons, an active-mood indicator, and End mood. There is no details control. Existing dashboard controls remain the way to inspect and adjust individual devices. Brief progress and actionable failure messages remain necessary.

No mood implementation or deployment has happened yet. This specification records the agreed behavior and proposes the supporting architecture.

### Approved UI and interaction states

- Place House Mood immediately after `HomeModeControls` and before the two `.columns`, full width and always visible. Keep Day/Night separate and treat its light changes as external adjustments.
- Use the existing dashboard's card styling, `--dashboard-card-*` tokens, and at least 44px touch targets. Show the title “House Mood” and four equal buttons labeled Love, Unwind, Dinner, and Party, with a corresponding icon and restrained rose, amber, gold, or violet accent.
- Use one row of four buttons when the card width accommodates readable labels and comfortable touch targets; use a 2×2 grid at narrower widths. Match the deployed dashboard's spacing and typography after locating its source.
- In the neutral state, no mood is selected and End mood is hidden. There is no settings button, playlist picker, or expandable details panel.
- On activation, immediately display “Starting…” and a spinner in the requested button. Disable preset actions during the pending operation to prevent overlapping requests.
- On success, mark the active button with an outline and checkmark, give the card a subtle matching tint, and show a footer such as “Love is on” with End mood. Selection must remain understandable without color alone.
- Switching is a single tap on another mood, with no confirmation dialog and no separate End step. Tapping the active mood does not restart playback.
- On End, show “Restoring…” until completion. Successful restoration returns the card to its neutral appearance and hides End mood.
- Keep errors inside the card until resolved, with a specific recovery action such as “Office neon couldn’t be restored” and “Retry restoration.” Do not hide recovery failures in temporary notifications.
- The active label identifies the selected ambiance; it does not promise that manually adjusted devices still match the preset. Do not add redundant per-device status, brightness values, or playlist names to the card.
- Give buttons accessible names, visible keyboard focus, and normal keyboard activation. Announce progress and failures through an appropriate live status region without moving focus unexpectedly. Keep the visual treatment static apart from the pending spinner, and respect reduced-motion preferences.

## Verified environment

- The local application is React/TypeScript/Vite with `@hakit/core` and `@hakit/components`.
- The actual editable source is `/Users/yann510/github/home-assistant-dashboard`, a sibling Git repository. Its `dist/assets/index-KBW-T9wq.js` SHA-256 exactly matches the live asset. The original `home-dashboard/ha-dashboard` folder is an unrelated starter; do not implement there.
- The custom panel `/hakit-dashboard` uses `/local/hakit-panel.js?v=1` to load `/local/dashboard/index.html`. Standard Lovelace storage is not the source of this UI.
- The actual source contains pre-existing uncommitted changes. Preserve all of them. Its `AGENTS.md` requires existing theme tokens and compact phone/tablet touch targets.
- Home Assistant is 2025.5.3. Installed Lepro version 1.4.1 is at `/config/custom_components/lepro_led`; its source was downloaded read-only and inspected.
- The neon device is already assigned to Office in Home Assistant. Its light entity inherits that area. No reassignment was necessary.
- Home Assistant lists all seven inspected Sonos favorites as playable. Preset playback itself has not been tested.

## Exact presets

An explicit brightness turns that light on, even if it was previously off. All lights not listed for a preset remain untouched. Static RGB values are requests; actual color rendering depends on the device.

| Light | Love | Unwind | Dinner | Party |
|---|---|---|---|---|
| Living-room LED strip | Rose `#FF3377`, 35% | Amber `#FFAA44`, 25% | Golden amber `#FFC070`, 20% | Violet `#AA44FF`, 70% |
| Living-room bulbs | Unchanged | 25% | 35% | 25% |
| Kitchen | Unchanged | Unchanged | Brightness 55% | Brightness 40% |
| Office neon | Rose Breath, 100%, speed 50 | Static amber `#FFAA44`, 100% | Static golden amber `#FFC070`, 100% | Gradient, 100%, speed 85; reproduce the user-approved preview |

Entity mapping:

| Device | Entity |
|---|---|
| Living-room strip | `light.living_room_led_strip` |
| Living-room bulbs | `light.light_living_room_bulbs` |
| Kitchen | `light.light_kitchen` |
| Office neon | `light.neon_light_led_strip` |
| Office neon speed | `number.neon_light_speed` |

The living-room bulbs and kitchen are dimmable but cannot change color or color temperature. Live validation identified the kitchen as a 3-Way Smart Dimmer: DP20 controls power, DP22 controls brightness (maximum 1000), and DP26 is countdown. Its previous LocalTuya brightness/color-temperature mapping to DP26 was invalid. Dinner and Party therefore set only kitchen brightness; no color-temperature request is sent. Use approximately three-second transitions only on lights that actually support them. The neon does not advertise transition support; do not promise a fade on it.

Office main bulbs, bedroom, bathroom/toilet, gym, closet, laundry, and front-door lights remain unchanged. There is no verified separate dining-room light; Dinner uses the verified kitchen and living-room lights. Do not infer or add another dining device.

### Sonos selections

All moods start on `media_player.living_room`.

| Mood | Sonos favorite | Observed favorite ID | Volume | Follow-me |
|---|---|---|---|---|
| Love | Crush Radio | `FV:2/1` | 25% | On |
| Unwind | Chill House Mix | `FV:2/4` | 20% | On |
| Dinner | Cozy Dinner Mix | `FV:2/3` | 20% | Off |
| Party | Electro House Mix | `FV:2/7` | 40% | On |

Favorites were retrieved through the Living Room Sonos media browser, under Favorites → Playlists; their media content type is `favorite_item_id`. Validate the favorite ID/title mapping before playback. If a saved ID disappears or changes title, resolve a unique exact-title match. If no unambiguous match exists, stop activation and explain which favorite must be restored. Do not silently substitute another playlist.

Other available favorites are Modern Jazz Mix, Bangers Workout Mix, and Discover Weekly. No additional playlists are required for the initial presets.

Existing follow-me automations discovered:

- Bathroom: `automation.group_sonos_on_spotify_play_with_movement`
- Gym: `automation.group_gym_sonos_speaker_if_music_is_playing_in_living_room`
- Bedroom: `automation.group_bedroom_sonos_speaker_if_music_is_playing_in_living_room`

Read-only inspection verified that the live script and automations semantically match `home-assistant/speaker-follow.json` in the actual source after Home Assistant's key normalization. All three call `script.speaker_follow_motion`. The user-facing state is `input_boolean.speaker_follow_motion`, with its saved source in `input_text.speaker_follow_source`.

Reuse that script's `enable`, `disable`, and `join` commands, not the automations' enabled states. Enabling with `source_entity` arms following without immediately joining rooms. Disabling turns off following, ungroups followers back to the saved source, and clears the source helper. Wait for its response and confirmed cleanup before re-enabling. Snapshot the switch, source, and affected groups; leave automation enabled states untouched.

## Neon findings and effect preservation

The user visually approved rose Breath for Love, the first Gradient preview for Party, and the recovered original slow rainbow wave. Initial Love testing used speed 50. Party testing used speed 85, reported approximately 84.83 due to device quantization.

The initial Home Assistant state of white/no effect was incomplete: an earlier device report contained a multi-color effect that the generic state did not represent accurately. A guessed 25-color grouped payload was sent, but the device reported its old white payload back and the user saw white. That payload must not be reused.

An earlier raw device report was recovered and replayed. The device returned the identical effect string, and the user confirmed the original slow rainbow wave was restored:

```text
N01:P10003ff000000ff000000ffU3F601030000V3002640800;
```

The complete replay data is saved at `/Users/yann510/github/home-dashboard/office-neon-original-effect.json` and copied into the verified repository at `home-assistant/tests/fixtures/office-neon-original-effect.json`. It is a recovery recipe for this specific effect, not a substitute for capturing the actual state before each future mood.

The installed integration exposes `lepro_led.send_debug_command` and `lepro_led.request_debug_state`. The latter requests device state but does not expose a complete snapshot through ordinary light attributes. Logs provided the raw reports during investigation; production must not depend on scraping logs.

Upstream integration source sends palette/motion data through `d50` in mode `d2=2` and Wave/other special effects through `d60` in mode `d2=3`. The examined Wave command does not include the ordinary speed setting. Do not promise Wave speed control from the generic speed slider.

References used for investigation: https://github.com/Sanji78/lepro_led/blob/main/custom_components/lepro_led/light.py . Verify the installed version before implementation; upstream source is supporting evidence, not proof of identical deployed code.

### Required neon adapter contract

Provide a backend adapter that can request and capture a fresh device report, apply a preset, and replay a complete saved effect. It must preserve power, mode, brightness, palette/motion data, speed, sensitivity, and any additional mode-specific fields required to reproduce the active effect. Capture the necessary raw fields rather than constructing a replay from one reported RGB color.

Incoming device reports are evidence of state; an echo of an outgoing command is not sufficient confirmation. Validate report freshness and compare returned raw configuration with the requested effect. Retain opaque effect strings even when the integration cannot interpret them. Restore the effect payload in one operation where possible, avoiding a later generic RGB command that could flatten the palette.

For Party, preserve the exact approved Gradient behavior rather than replacing it with the unsuccessful custom rainbow experiment. Verify its reproducibility after restoring the original rainbow. Love, Unwind, and Dinner must explicitly establish their own single-color palettes so they do not inherit rainbow segments.

If the installed integration cannot expose complete fresh snapshots, extend its adapter interface before enabling moods that modify the neon. The known rainbow recovery file must never be presented as a snapshot of an arbitrary later Lepro-app effect.

## Proposed architecture

Use a Home Assistant-side mood coordinator as the owner of execution and persisted state. The dashboard is a client that sends activate/end requests and subscribes to status. Mood execution and restoration must not depend on an open browser or browser-local storage.

Separate responsibilities:

1. Preset definitions: names, light recipes, favorite references, volume, and follow-me preferences.
2. Coordinator: serializes activation/switch/end, preflights capabilities, persists the original baseline and operation journal, tracks manual overrides, and exposes status.
3. Standard-light adapter: snapshots and restores power, brightness, and supported color state.
4. Neon adapter: captures and restores opaque native effect data and confirms device readback.
5. Sonos/follow-me adapter: resolves favorites, starts playback, tracks session-owned playback, and calls the existing follow-me script and preserves its helper/source state.
6. Dashboard card: renders four buttons, active state, End mood, and concise progress/errors.

Use a separate `house_moods` custom integration, Home Assistant Store for private durable snapshots, and a narrowly scoped Lepro raw-state extension. Keep their source under `home-assistant/` in the verified dashboard repository. Do not place a cloud credential or raw MQTT client in the dashboard to bypass this boundary.

Coordinator status includes active mood, phase, affected devices, and actionable errors. Persist a session ID, original snapshots, last confirmed coordinator writes, manual-override markers, and the pending operation before sending changes.

## Session behavior

### Activation

1. Serialize requests and reject overlapping activation while a change is in progress. Tapping the already active mood is a no-op; it must not restart music or overwrite manual changes.
2. Preflight required devices, the selected favorite, and complete neon snapshot support before changing anything.
3. Capture and persist original state for the lights used across the preset collection and the relevant music/follow-me controls. Capturing a state does not authorize changing an otherwise excluded light.
4. Apply lights and start the selected music at the preset volume; apply the preset follow-me setting in an order validated against the existing automations to avoid unintended routing.
5. Confirm device outcomes and publish the active mood. Report partial failure rather than falsely showing full success.

If preflight fails, make no changes. If an operation fails after some changes have happened, stop further activation and restore still-owned controls to the session baseline. A failed switch ends the mood session rather than claiming the previous mood is still active; preserve manual overrides, and keep recovery status until restoration completes. Retain unresolved recovery data and expose retryable errors. Rolling back music cannot promise resumption of the previous queue.

### Switching

Keep the baseline from before the first mood. Switching Love → Dinner → Party does not replace it. A newly selected mood is an explicit request to apply that mood's settings to its included devices, including devices previously adjusted manually.

Restore a device when it was used by the previous mood but is excluded by the next one, unless manually overridden. Example: Dinner → Love restores the kitchen and living-room bulbs to their baselines, preserving any manual adjustment to either light. Starting Love leaves the living-room bulbs untouched; it does not turn them off.

If an excluded device has been manually adjusted and later becomes included again, preserve that newer manual state as its return destination before applying the new preset. This avoids discarding a deliberate change while retaining the original baseline for devices with no such intervention.

### Manual changes

Track changes per device/control. When a non-coordinator change is confirmed, mark that device/control as manually overridden. At End mood, leave it untouched. A manual light change preserves the whole light state. For the neon, changes to its speed, sensitivity, palette, power, or effect mark the neon as overridden.

Use HA context identifiers where available and compare fresh device reports against outstanding writes. Delayed acknowledgements and rounding must not be treated as manual edits. Lepro-app changes must be detectable from raw reports, even when generic HA state looks unchanged. Identical-value writes without source information cannot reliably be distinguished and must not be claimed as detectable.

### End mood

Restore baseline power, brightness, and color/effect state for unmodified session-controlled lights, including the neon's full native effect and speed. Restore the original follow-me switch and saved source unless manually changed, respecting the shared script's cleanup behavior.

Stop playback only if it remains owned by the mood session. Preserve music the user deliberately replaced. Do not resume the pre-mood queue in this version. Snapshot the Living Room, Bathroom, Gym, and Bedroom volumes and group membership at activation. Restore volumes and group membership only where the mood or its follow-me activity changed them, and preserve subsequent manual adjustments. Follow-me grouping operations must be attributable to the active session; if the existing automations do not expose enough information, add that reporting as part of their integration with the coordinator. Do not rebuild unrelated speaker groups. Restoring group membership must not be represented as resuming the previous queue.

Recover available devices even if another device is offline. Keep the baseline for incomplete restoration and allow retry. Do not silently claim End mood succeeded, and do not discard an unresolved snapshot. Any delayed retry must re-check for newer manual changes before writing.

### Refresh and restart

Dashboard refresh reconnects to coordinator state. A Home Assistant restart reloads the persisted session and operation journal and reconciles device reports before further writes. It must not automatically replay a mood or overwrite manual changes because a browser reconnected. If reconciliation is ambiguous, expose recovery status and retain snapshots.

## Validation and acceptance

Use focused coordinator tests with fake adapters for baseline preservation, switching, manual overrides, serialization, missing favorites, partial failures, and persisted recovery. Validate adapters with readback and short real-device trials; physical effect appearance requires user confirmation.

Acceptance scenarios:

1. All four presets start their exact Sonos favorite on Living Room, with the defined initial volume and follow-me behavior.
2. Each preset changes only the specified lights; office main bulbs and all excluded rooms are untouched.
3. Love reproduces the approved Breath; Party reproduces the approved fast Gradient.
4. Start with the recovered rainbow, activate each neon preset, then end: raw device readback matches the saved rainbow and the user sees the same wave.
5. Repeat with a different Lepro-app effect: the fresh snapshot restores that effect rather than the recovery-file rainbow.
6. Love → Dinner → Love restores the kitchen correctly; End restores the original remaining devices.
7. Manual light, neon-speed, playback, volume, and follow-me changes survive End mood as specified.
8. Device rounding and delayed MQTT reports do not create false manual overrides.
9. A missing favorite or incomplete neon snapshot prevents activation before changes; an unavailable device during End does not prevent other restorations.
10. Refresh and backend restart retain the correct active/recovery state without replaying music.
11. The card contains no details control and remains usable on the actual dashboard's target display.

## Implementation prerequisites and review boundary

The actual source, follow-me behavior, and installed Lepro version are verified. The new full-state adapter must still be implemented: the current handler parses outgoing `set` echoes alongside `rpt`/`getr` device reports, lacks an exposed opaque snapshot, and its normal send method swallows publish failures. Snapshot confirmation must use fresh complete device reports and propagate failures.

The next step after written-spec approval is an implementation plan. No dashboard implementation, integration modification, mood activation, or deployment is authorized solely by writing this spec.
