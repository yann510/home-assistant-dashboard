# Follow me light-off departures — 2026-10-17

Deployed to Home Assistant 2026.9.3. Bathroom, Bedroom, and Gym retain their motion joins and now remove their follower when `light.light_toilet`, `light.light_bedroom`, or `light.gym` changes from on to off. The existing light automation supplies the absence delay. The saved original speaker remains playing.

## Verification

- 114 tests against the real Home Assistant 2026.9.3 script/template runtime passed. These include queued join/departure events, source protection, stale/disabled events, unrelated groups, mood ownership, and startup readiness.
- The pure Python suite ran 171 tests successfully, with one skipped. Independent task and whole-change reviews approved both implementation commits.
- Home Assistant's configuration check passed before each backend restart. The installed follow script and all three enabled room automations match the reviewed configuration after Home Assistant key normalization.
- Native backend acceptance: Bedroom was grouped with Living Room and Bathroom while its light was off. The new `leave` command removed only Bedroom, which reported idle and a standalone group. Living Room continued playing with Bathroom. Follow me stayed enabled with Living Room as its source; the existing Unwind mood remained active and retained group ownership without errors.
- Live testing invoked the departure command; it did not physically walk through the rooms. Automated tests cover the light-trigger mappings and room action dispatch.

## Startup correction during deployment

The first restart exposed an existing race: early observations reconciled the saved mood before Sonos telemetry returned, marking an otherwise intact active session for recovery. Music continued. Before/after session comparison showed that only phase, active mood name, and errors changed; the ownership records, expected state, baseline, and journal were identical. The 50 saved queue track IDs also matched native readback.

A shared startup gate now waits up to 60 seconds for owned Sonos telemetry using read-only checks before initial reconciliation. Persistent failures and genuinely interrupted sessions retain normal recovery behavior. Regression tests cover both paths.

The intact active snapshot was restored with Home Assistant stopped, after checking that shutdown introduced no other session changes. On startup with the correction, the same Unwind session returned active, with no errors and ongoing playback. The existing live shuffle/repeat intent handling was preserved during the narrow integration update. Configuration, component, and session backups remain private under `backups.local/follow-light-deploy/` and `/share/follow-light-20261017-backup/` on the HA host.
