# Night presence lighting

`night-presence.json` is a bounded REST configuration bundle for the existing
legacy Night automations. It creates `script.night_presence_lights` and replaces
only the three identified automation configurations. Each replacement includes
its expected original configuration for drift checks; automation ids and entity
ids stay the same. The bundle is data for deployment, not an executable installer.

At 21:00, the existing 25% wind-down remains unchanged. At 21:30, Morning turns
off and Night turns on. If Night was off, its existing off-to-on trigger runs
Apply Night Mode once. If Night was already on, the schedule directly calls the
same presence policy once. Manual Night activation uses that same policy.
Occupied lights receive no brightness, color, effect, or power writes. Night
activation does not dim any light; inherited 25% brightness stays as it is.

The shared script checks the current Night helper, current room sensor, and
current light state separately before every individual `light.turn_off` call.
Only sensor `off` means vacant. Missing, unknown, unavailable, and occupied
sensors preserve that room. Already-off, missing, and unavailable lights receive
no writes. Living-room lights shut down regardless of presence, per the user's
explicit request, while Night is on. No all-lights entity or device target is
used. A failed device command is logged by HA and later lights are still checked.
Changing back to Day stops later writes, and reoccupancy protects later writes;
a device command already dispatched cannot be recalled.

| Room | Presence sensor | Lights |
| --- | --- | --- |
| Office | `binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_2` | `light.office_bulbs`, `light.neon_light_led_strip` |
| Kitchen | `binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_3` | `light.light_kitchen`, `light.kitchen_range_light` |
| Bathroom | `binary_sensor.aqara_fp2_bathroom_presence_sensor_1` | `light.light_toilet` |
| Bedroom | `binary_sensor.hue_motion_sensor_1_motion` | `light.light_bedroom` |
| Closet | `binary_sensor.hue_motion_sensor_1_motion_3` | `light.bedroom_closet` |
| Gym | `binary_sensor.hue_motion_sensor_1_motion_2` | `light.gym` |
| Entry/laundry | `binary_sensor.hue_motion_sensor_2_motion` | `light.light_front_door`, `light.light_laundry_room` |
| Living room | Unconditional shutdown | `light.light_living_room_bulbs`, `light.living_room_led_strip` |

The retired 22:00 safety automation must stay disabled. Its replacement saved
action is a stop, making manual triggers and accidental re-enabling inert.
Apply Night Mode and the 21:30 rule must remain enabled. Motion automation gates,
`toggle_lights_based_on_motion.py`, the shared LocalTuya staging script, and the
21:00 rule are untouched. This bundle does not enable coordinated modes or
modify dormant `modes.py` behavior.

## Deployment sequence

1. Read live configs and states. Accept each expected original config or the
   exact desired config on an idempotent repeat; stop for any other drift.
   Back up exact configs/states outside the repository with private permissions.
   Preserve all unrelated automation/helper state. Ensure unrelated scripts have
   no active runs: script configuration POST reloads all scripts.
2. Stop only the three modified automations. Install the script first through
   `/api/config/script/config/night_presence_lights`. POST returns before reload
   finishes: poll runtime `script/config` and service availability before proceeding.
3. Replace the three configs through `/api/config/automation/config/<id>` using
   each object's `config` field. Poll runtime `automation/config` after each POST,
   rather than relying on saved-file readback alone.
4. Disable the retired 22:00 rule and restore/verify the intended enabled states
   for Apply Night Mode and the 21:30 rule. Read back runtime configs, saved configs,
   enabled states, helper states, and the protected 21:00/staging configs.
   Do not trigger the lighting script as an installation check.
5. On partial failure, restore the exact backup configs and enabled states and
   verify runtime readback. If the script was newly created, delete it and reload
   scripts; the config deletion hook alone does not reload scripts. Do not change
   the Night/Morning helpers during installation or rollback.

## Offline regression checks

Use the existing compatible HA environment (Python 3.14, HA 2026.9.3):

```sh
python -m unittest discover -s home-assistant/tests_ha -p test_night_presence.py -v
python -m unittest discover -s home-assistant/tests_ha -v
python -m unittest discover -s home-assistant/tests -v
```

Tests execute real HA scripts, templates, helper state triggers, and complete
configuration validation. Hardware services are substitutes that record writes
and update state; one raises a real HA error to verify per-device resilience.

## Live verification — 2026-10-12

Installed at 21:51 America/Toronto on HA 2026.9.3. A private backup of the
original configs and states is in the original checkout at
`backups.local/night-presence/config-2026-10-13T01-51-41-603Z.json`.

Saved and runtime `script/config` readbacks exactly matched the bundled script;
saved and runtime `automation/config` readbacks matched all three desired rules.
Apply Night Mode and the 21:30 schedule were enabled; the retired 22:00 rule was
disabled. The 21:00 automation and shared LocalTuya staging config remained equal
to their originals. Morning stayed off and Night stayed on throughout installation.
No lighting services were executed during installation.

HA's native `/api/config/core/check_config` returned `valid`, with no errors or
warnings. A read-only `/api/template` preview of the exact policy condition using
live states preserved the occupied office bulbs and neon, marked the vacant
kitchen main light eligible for shutdown, and skipped the other already-off lights.
This verified configuration and template decisions; it was not a physical service
trial or a natural scheduled run. The next 21:30 run will use the new rules.

Independent review passed specification and quality checks with no findings.
Final verification passed 98 HA tests, 164 backend tests (one existing skip), and
663 frontend tests across 39 files.
