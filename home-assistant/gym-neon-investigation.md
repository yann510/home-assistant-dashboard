# Gym activation and Office neon reply failure — September 18, 2026

## Causes established

The deployed mood sensor retained `Office neon native state could not be read.`
The selected Gym recipe includes only `light.gym`, but `LightControls.preflight`
always read the original four-mood collection, including the neon. The coordinator
also captured that collection when starting a session. This was inherited from
before Gym existed, when all four moods used the neon. A fake unreadable neon
reproduced Gym failing before any light or speaker command.

The Lepro log records `MQTT error: [code:128] Unspecified error` at
2026-09-15 04:35:42.629 EDT. No incoming device reports followed that error in the
retained log. Fresh native snapshot requests on September 18 timed out, including
with raw MQTT logging enabled; a debug state request published without producing
an incoming reply or even the subscribed outgoing-topic echo.

The installed `MQTTClientWrapper` exited its receive loop on an MQTT error.
A later command could create a clean MQTT session, but `connect()` cleared the
pending subscriptions and commands. Previously subscribed topics were not retained
at all. The new connection could send while never listening for device replies.
The light entity updates some attributes optimistically, so its displayed on/off
state was not evidence of a working reply path. The broker's original disconnect
reason is unspecified; the demonstrated integration bug explains the continuing
failure to recover.

## Changes

- Validate and capture lights only when a selected mood first includes them.
  Gym starts/ends without reading unrelated lights. Speaker snapshots retain their
  existing behavior because follow-me can affect other rooms during the session.
- Preserve baseline/restoration rules across switches. A failed preflight for a
  neon-using mood leaves active Gym untouched. Switching away from a mood that
  already owns the neon still requires safe restoration; this is intentional.
- Reconnect Lepro MQTT automatically, retain and restore desired subscriptions
  before making the connection available, and cancel reconnection on unload.
- Keep pending publishes in the calling coroutine with a bounded wait rather than
  a detached command queue. Cancelled commands never replay on a later connection.
  Native operations keep their existing fail-offline behavior.

## Verification

New Gym tests failed before the fix for both a native timeout and unrelated
unavailable lights. MQTT tests reproduced missing automatic reconnection, lost
startup subscriptions, and an offline publish returning without sending.
After the changes: 125 backend tests (124 passed, one existing skip), 25 HA
integration tests, 13 Lepro tests, and five rollout tests passed. Independent code
review found no actionable correctness issues. Existing test diagnostics include
expected malformed-effect messages and a Home Assistant deprecation warning.

The installed light sources were hash-checked before replacement. The two original
files and staged replacements are backed up privately at
`/share/neon-gym-20260918` on the HA host. Configuration validation passed before
restart. No frontend changes were needed.

Live verification after restart succeeded: HA reported RUNNING, and a fresh native
snapshot returned mode 2, the original rainbow palette, and brightness 1000.
Gym activation returned active with no errors; device reports confirmed solo Gym
playback, unchanged volume, full Gym-light brightness, and Follow me off. The neon
snapshot remained byte-for-byte identical. End returned idle with no errors;
checked light states/brightness, speaker groups/volumes, and follow settings
matched their baseline. This verifies device telemetry, not audible output.
Private baseline and output: `.local/live/neon-gym-20260918-live-baseline.json`
and `.local/live/neon-gym-20260918-live.log`.
