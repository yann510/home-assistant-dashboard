# House Canvas production design

## Approved outcome

Build the latest House Canvas design as a real Home Assistant dashboard for the mounted landscape Fire HD 10 and smaller iPhone Pro. Preserve the approved layout and interactions, replace all simulated data and commands with real integrations, and retain existing features. Production quality requires meaningful automated tests, readable typed code, verified error handling and an actual tablet trial.

The reference is public/concepts/house-canvas at commit 433ca08. Later production improvements must retain its approved visual language. The prototype remains available for comparison.

## Architecture

Implement React/TypeScript components inside the existing Vite application, exposed at view=canvas. Classic remains the default and Quiet Home remains accessible. Do not execute the prototype's string-rendering modules in the production application.

Use focused components under src/canvas: overview/header, mood, House pulse, light controls, blind controls, music player, speaker settings, weather and device directory. Use shared typed hooks/controllers for Home Assistant state, capabilities and commands. Scope Canvas styles to its root and overlay container; avoid global element rules that alter other views. Use small reusable SVG components and shared Canvas tokens rather than the prototype's accumulated CSS overrides.

Reuse the existing authenticated Home Assistant connection, mood controller, attention rules, speaker capability/grouping semantics, appliance status parsing and forecast subscription. Extract reusable logic from presentation where necessary, preserving existing behaviour and regression tests. Keep connection/command logic outside visual components. Do not add another device backend or duplicate automations.

No fabricated production values: unavailable metadata is shown as unavailable, unknown or empty as appropriate. Playlist artwork comes from the current favourites response, not the snapshot stored in the prototype. Weather uses reported conditions/units; progress and duration use actual media metadata.

## Production interface

### Overview

Preserve the title, Day/Night, current weather, All devices, artistic mood selection, music controls and compact lights/blinds cards. Use the approved palette and simple geometric art. Primary controls have at least 44px targets. Keep essentials visible at 960×600 and 1280×800 reference viewports without clipping. Allow scrolling at smaller real viewports rather than shrinking touch controls.

Reserve House pulse space so device activity does not move controls. Running appliances are informational; faults/completions are visually distinct and follow the existing attention rules. Animate only active devices, respecting reduced motion. Handle paused, returning, finished, unavailable and disconnected states honestly. Phone activity may scroll horizontally within its reserved row.

### Lights and blinds

Lights: selected-room power/brightness, All lights opening a landscape room overview, immediate separate power controls, and per-light details with supported brightness, colour, colour temperature and effects. Preserve all current room/entity mappings. Whole-house off remains inside All lights.

Blinds: independently selectable Living room, Bedroom and Gym. Commands capture the selected rooms when sent. Empty selection disables commands. Execute through the existing Google Assistant integration; collect per-room results and allow failed rooms to be retried without repeating successful rooms. Report command acknowledgement, never an inferred blind position. Stop remains accessible while other blind commands are pending.

### Music

Track title opens Player; room name opens Speakers. Player contains transport, time-based seeking and artwork-only favourites with accessible playlist names and failed-image fallback. Do not include Source selection or volume in Player. Metadata-less/radio streams hide unsupported seeking rather than inventing a duration.

Speakers contains Follow me, four room choices, group volume/mute, expandable individual volumes/mute and Advanced main-speaker settings. Preserve the source member, coordinator targeting, relative volumes, supported-feature checks, Follow cleanup/retry and manual handoff semantics. Do not silently replace unrelated audio in another room. Show an explicit conflict explanation before applying such a grouping change. Preserve existing favourites traversal, playback errors and confirmation behaviour.

### Weather and secondary controls

Weather opens a chronological vertical list, defaulting to the next 12 available forecast hours, with a 24-hour option and Daily. Correctly mark date rollover in the home timezone. Use condition-appropriate sun, partly cloudy, cloud, rain, snow, fog, wind, thunderstorm and night icons; unknown conditions receive a neutral fallback. Missing values are not zero. Unsupported hourly forecasts are explained and available types remain accessible. Loading, retry and unavailable states are visible.

All devices keeps searchable access to lights, blinds, music, moods, weather, Office/Gym/Bedroom thermostats, washer/dryer/dishwasher and Roomba. Preserve actual device capabilities, temperature limits/steps and all currently exposed secondary controls.

### Detail surfaces and accessibility

Landscape: wide light overview, separate Player/Speakers views, compact focused light/volume settings, readable vertical weather. Phone: stacked detail sheets with safe-area padding. Preserve focus on updates, restore it on close/back, trap it in active dialogs, and support Escape. Nested device controls must not break modal ownership. Every image-only button needs a name; selected/disabled/error states must not depend on colour alone.

## Command contract

Commands must distinguish pending, service accepted, observed device state and failed/unconfirmed. Never claim a physical outcome solely because a service resolved. Surface rejection, timeout and connection loss with actionable wording. For controls with observable state, reconcile against fresh entity updates. For blinds, explicitly state position is unknown.

Avoid repeated in-flight commands. Capture targets and desired values at dispatch. Do not retry stale toggles after reconnect: derive explicit desired states and re-read actual state. Multi-target commands must account for partial failure. Cancel obsolete callbacks/subscriptions on navigation or unmount; an older response must not replace newer state. Preserve user slider drafts while awaiting updates, batch appropriately, and avoid echo jumps.

No automatic writes on mount, reconnect, tab visibility changes or forecast/favourites refresh. Read-only UI verification must not issue real device commands.

## Automated verification

Write regression tests for each controller before its implementation/refactor. Prefer observable user outcomes and real state transitions over snapshots of markup or implementation details.

- Unit tests: capability filtering, room targeting, selected-room capture, forecast parsing/units/condition mapping/date rollover, activity classification, command acknowledgements and partial results.
- Controller/component tests: pending/rejected/timed-out commands; duplicate prevention; disconnect/reconnect; late/out-of-order events; missing entities; unmount cleanup; zero/missing media duration; paused/idle/unavailable playback; unsupported controls; group-volume clamping and relative levels; Follow/manual/cleanup transitions; failed artwork and favourites load/retry.
- Interaction tests: room and individual lights, empty blind selection and emergency Stop, main speaker invariant, Player/Speakers navigation, time seeking, artwork favourites, temperature controls, attention dismissal/context, device search/back, keyboard and focus restoration.
- Integration tests use a controlled Home Assistant connection fixture, not real home commands. Exercise the overview and each detail route at tablet and phone sizes, including offline and busy scenes.
- Run the full existing test suite, new tests, TypeScript build, scoped lint for new/changed code and production Vite build. Investigate regressions; report pre-existing check failures separately and precisely.
- Browser QA checks actual rendered layouts at 960×600, 1280×800, 375×812 and 393×852. Assert overflow/target sizes and inspect screenshots. No claim of hardware verification from viewport emulation.

## Trial deployment and rollback

Keep production work isolated from main during the trial, continuing the user's branch-only direction. Do not replace the currently deployed dashboard directory. Build and deploy into a dedicated canvas-trial directory using a matching Vite base path; the user opens that LAN-accessible Home Assistant URL on the tablet. localhost is not a tablet trial URL.

The existing deploy script deletes a target directory before upload. The trial path must instead stage a complete release, verify uploaded assets, and switch the trial release only after upload succeeds. Preserve a previous trial release for rollback. Never clear or overwrite the existing dashboard folder. Do not print credentials or copy them into source/docs. Production authentication must use the supported Home Assistant client flow; do not introduce a long-lived token into the published trial assets.

Verify the deployed HTML/assets and read-only connection state. Then the user can exercise intended home commands during the tablet trial. The current dashboard remains available immediately by its original URL. Making Canvas the default or merging it into main is a later adoption decision.

## Actual-device acceptance

On the mounted Fire tablet, record the actual CSS viewport/browser version and verify fullscreen fit, readability from normal distance, touch accuracy, artwork loading, active appliance animations, nested controls and recovery after sleep/Wi-Fi loss. On the smaller iPhone Pro, verify safe areas, scrolling, keyboard/focus, background/resume and volume gestures.

These require access to the actual devices or user observations. Provide a concise checklist and the exact trial URL; report remaining checks honestly rather than marking them complete from desktop testing.

## Completion criteria

A typed optional live Canvas view matching the approved design; the feature inventory above is accessible; automated checks pass; browser QA is recorded; a separately deployed tablet trial is reachable; rollback is documented; remaining hardware observations are explicitly listed. No simulated forecast, favourite snapshot or demo response timer is used in production.
