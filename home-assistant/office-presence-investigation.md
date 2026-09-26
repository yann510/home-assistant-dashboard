# Office lights switching off while occupied

## Confirmed cause — 2026-09-26

Read-only HA recorder/logbook evidence shows the mobile_app iPhone tracker becoming
unavailable briefly, causing `person.yann_thibodeau` to become unknown. The old
zone-leave trigger interpreted that transition as departure, with no conditions
or delay. At 20:43:30 UTC (16:43:30 Montréal):

- Person became unknown at 20:43:30.395081 and home at 20:43:30.460207 (~65 ms).
- Office FP2 zone remained occupied throughout this transition.
- Office lights turned off at 20:43:30.536413. Logbook attributed this explicitly
  to `automation.close_all_the_lights_when_leaving_home`.
- Similar unknown/home interruptions accompanied shutdowns on September 25 at
  14:07:28 and 20:19:13 UTC and September 26 at 18:41:48 UTC.

This confirms an automation false departure, rather than a dashboard command, for
these incidents. The reason the mobile_app entity briefly loses availability is
not established; an unavailable tracker must not be interpreted as departure.

## Separate vacancy path

The office automation uses FP2 presence_sensor_2 and a 600-second timeout for
office bulbs and desk strip. Recorded shutdowns also match that timeout exactly:
September 26 20:54:01 vacancy, 21:04:01 off, 21:04:24 presence returns and lights on.
Without a physical observation, these cannot be classified as false sensor readings.
The Python script previously trusted a time-only helper after sleeping without
rechecking current occupancy. Automation restart does not guarantee cancellation
of an executor thread already sleeping in a python_script.

## Changes

- `office-presence-safety.json` preserves automation ID 1689080467859 and all 11
  original device targets. Known away AND explicitly vacant office must hold for
  five continuous minutes. Both conditions are checked again before the action.
  Home, unknown, unavailable, or occupied resets the timer. Later sensor recovery
  starts a new timer, avoiding a skipped departure that never retries.
- Shared motion script schedules off only for explicit off. After sleeping, each
  target write requires the same vacancy `last_changed`, an unchanged helper,
  current off state, and the full-date deadline reached. Missing or uncertain
  presence cancels shutdown. Day/night and mood ownership behavior is preserved.
- Time helper display remains HH:MM:SS, compatible with existing callers. Internal
  comparisons include the date, fixing midnight handling.

## Verification and deployment

- 157 backend unit tests pass.
- 52 runtime tests pass on Home Assistant 2026.9.3, matching production. Includes
  13 actual RestrictedPython motion tests and 11 actual template-trigger/Script
  departure tests. Only test clock and hardware services are substituted.
- Coverage includes unknown bounce, brief away/return, named away zone, valid
  departure, late vacancy, occupancy bounce, unavailable/missing sensors, stale
  waiters, secondary-target recheck, midnight, early wakeup and mood protections.
- Independent subagent review found the late-vacancy retry issue; fixed and
  reviewed again with no remaining blockers.
- Live pre-change motion script matched the tracked baseline. Backups are private
  at `/config/.office-safety-20260926/` (motion-original.py and away-original.json).
- Departure config saved through HA's validated configuration API, which reloads
  only that automation. Motion script staged, syntax checked and atomically
  replaced with a baseline SHA guard. HA reads script source on each invocation.
- Independent REST/SFTP readback at 2026-09-26T23:32:32Z matched both tested files;
  motion SHA256 `3f4dc7d3de6f09fe2962e1131b30cb57617438abc291907ed16fa1fa1d4fd9bb`.
  Both automations remain enabled. Publisher SSH channel did not finish closing;
  after independent readback confirmed promotion, its local process was terminated.
- No deliberate light commands or synthetic presence events were sent to live HA.
  Physical seated-presence reliability still needs observation.

## Limits and recovery

HA restart/reload resets pending template timers; already-true conditions at setup
wait for a fresh false-to-true transition. This fails safe (lights may remain on).
An old Python invocation already sleeping at deployment keeps its old code until
it finishes; future invocations use the new guards. A sensor falsely reporting
vacant continuously for ten minutes can still trigger legitimate occupancy logic;
the FP2 map, chair coverage and sensitivity may need adjustment if that recurs.

To roll back, restore the saved automation JSON using its configuration API, and
atomically restore motion-original.py after checking that the live file still has
the deployment hash above. No HA restart is needed. Never execute the departure
automation manually as a verification step: it targets real household lights.
