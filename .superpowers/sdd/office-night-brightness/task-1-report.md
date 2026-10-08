# Task 1 report: Office bulb manual Night brightness

Implemented the existing 20% manual Night power-on minimum for `light.office_bulbs` alongside kitchen. Neon remains excluded. No live device commands, deployments, or pushes were performed.

## Read-only diagnosis

Fetched live REST states and read live `/config/.storage/core.config_entries` plus `/config/custom_components/house_moods/modes.py` through SFTP, using existing environment credentials without exposing them. Sanitized raw evidence is saved in ignored `backups.local/office-night-readonly-evidence.json`.

- Office bulbs were off, with reported brightness null and supported color mode `color_temp`.
- Night helper was on; the actual Day helper (`input_boolean.morning_mode`) was off. The initial `input_boolean.day_mode` query was nonexistent and was removed from saved evidence after checking the source helper mapping.
- Office LocalTuya light entity uses power DP20, brightness DP22, lower29 and upper1000.
- Live coordinated mode code includes office bulbs and stages brightness DP22 to126 for Night,1000 for Day.
- `(126 - 29) / (1000 - 29) * 255` is approximately25.5 (10%). This verifies the same staged dim inheritance mechanism as kitchen. Current off-state brightness is hidden, so exact current device DP readback was not observed; staging policy and mapping were verified without powering the lamp on.

## Changes

- `src/canvas/useCanvasLights.ts`: Minimal explicit ID extension to the existing Night turn-on floor; update its comment. Capability checks, preservation of valid higher brightness, per-target service data, queue cancellation, busy tracking and brightness-aware confirmation remain unchanged.
- `src/canvas/CanvasNightPower.test.tsx`: Office detail cases at25 and180, room grouped office bulbs/neon with unknown bulb brightness, old dim telemetry refusing confirmation, both mode helpers preserved, and office daytime/off/onoff-only exclusions. Existing kitchen, other-light and grouped outcome coverage remains.

## Verification

Using Node24.13.0 on PATH:

- Targeted `npx vitest run src/canvas/CanvasNightPower.test.tsx`: passed13 tests before the additional three office exclusion cases.
- Final `npm test`:37 files passed,603 tests passed (includes16 Night power tests).
- `npm run lint`: passed.
- `npx tsc -b`: passed.
- `VITE_FOLDER_NAME=dashboard npx vite build`: passed; existing large-chunk/plugin timing warnings only. Called Vite directly to avoid repository-wide prebuild formatting.
- `git diff --check`: passed.

Initial test run exposed an incorrect detail accessible label in the new test (`Bulbs` versus `Office Bulbs`); corrected the test selectors and reran the full suite successfully.

## Self-review and concerns

Only the two explicit IDs receive51/255 minimum on manual Night off-to-on commands. Neon receives exactly empty service data, the higher known office value180 is preserved, and off/daytime/onoff-only office commands preserve empty service data. Tests exercise real shared controller via details and Office room controls, including telemetry that turns the bulbs on at25 but cannot clear busy until requested brightness is reported. No helper write paths were added. No unrelated tracked source changed. No unresolved implementation concerns; independent review and deployment/push remain the controller's responsibility. A physical trial was intentionally not performed.
