# Gym mood player synchronization — 2026-10-26

## Cause and behavior

Home Assistant reported the Gym mood active with `media_player.gym#playback` ownership and Gym playing Bangers Workout Mix, while Living Room retained a paused Chill House Mix queue. Follow me was off with no saved source. The backend had started playback successfully.

The frontend saved the last manually controlled speaker for paused-queue resume. That preference outlived mood activations and took precedence over newly confirmed mood playback. Music metadata, selected rooms and transport all used that stale coordinator.

Source `68522ea` scopes preferences to confirmed mood activation identity (`session_id`, `active_mood`, active phase). New sessions and mood switches replace prior preferences. Later deliberate speaker choices, paused queue resume after ownership release, saved Follow source and pending group handoffs remain supported. Ownership-only sensor updates do not reset selection. No device command is sent to synchronize the display.

## Verification

- Regression tests first failed on the old implementation: eight expected failures, 132 passing CanvasMusic cases.
- Final full frontend suite: 770 tests across 49 files passed.
- Lint and dashboard production build (including TypeScript) passed. Existing large-chunk build advisory remains.
- Browser preview used the actual dashboard components and surrounding dashboard. Pausing previous Living Room audio then starting Gym showed the Gym track/artist, Pause control, Gym footer, and Gym Main speaker checked. Changing source explicitly afterward displayed Living Room's paused queue and Resume.
- Browser dimensions were measured after applying the override: 1224x614 CSS pixels, visual scale 1, DPR 1, document 1224x614 with no overflow. Historical physical Fire measurements are 1224x614 CSS pixels at DPR 1.5; this run uses the same effective CSS viewport but does not claim physical-device validation or DPR 1.5 emulation.
- Browser interaction tests use a local-only fixture; real playback was inspected read-only to avoid interrupting the active workout. No backend deployment or restart is required.

## Compatibility

Production exposes session IDs. Older sensors without IDs support mood switches and reactivation after an observed non-active phase; a new same-mood session with neither an ID nor an observed phase change cannot be distinguished.
