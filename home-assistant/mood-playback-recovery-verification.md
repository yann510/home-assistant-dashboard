# Failed Sonos playback recovery — October 13, 2026

Unwind activation at 07:03 Toronto time failed in `media_player.play_media`.
The saved journal showed Living Room stopped with its former 50-track queue
before the request, then stopped with an empty queue afterwards. Installed Sonos
favorite playback clears its queue before adding the favorite. Recovery accepted
only the original or requested state, so that partial failure remained blocked.
The underlying exception had been replaced with a generic service failure.

## Correction

The Sonos adapter recognizes only a non-uncertain, single-target apply request
for a configured playback source with exactly `playing` and no external source.
An authoritative stopped report with no external source or stream already meets
the existing restoration contract. The coordinator resolves that journal entry
and releases playback ownership without replaying a queue or sending Stop.
This also handles the persisted journal format from the incident.

Uncertain timeouts remain unresolved because their remote effect may arrive
later. Manual overrides take precedence; unavailable telemetry and unexpected
external sources remain protected. Other operation types retain their existing
reconciliation rules.

Trusted Home Assistant errors from `play_media` on the fixed Sonos sources now
retain the actual error text and exception cause. Unrelated service errors retain
the existing sanitization. The original incident's discarded error cannot be
reconstructed retrospectively.

## Verification

Regression tests first failed on the original recovery and error handling, then
passed after the correction. They cover partial queue replacement, legacy durable
reload for Living Room and Gym, uncertainty, manual override, external sources,
unavailable telemetry, unrelated operation rejection, and actual Sonos error text
and cause through the real Home Assistant service registry.

- Backend: 171 tests run, 170 passed and one existing skip.
- Home Assistant 2026.9.3 compatibility (same version as production): 101 passed.
- Frontend: 663 passed; lint, TypeScript and production Vite build passed.
- Rollout installer: 6 passed. Attention integration: 37 run, 36 passed and one existing skip.
- `git diff --check` passed. Independent review approved the complete correction.
- The separate Lepro suite could not complete because its private original
  `.local/lepro-baseline/light.py` fixture is absent; no Lepro files changed.

## Deployment and live recovery

Backed up the integration, configuration and durable journal privately at
`/share/mood-recovery-20261013/backup`. Verified the three live source hashes
against the original repository version, staged and compiled the replacement
modules, stopped Core, installed only `coordinator.py`, `ha_adapter.py` and
`sonos.py`, passed the updated Home Assistant configuration check, and started
Core again. All deployed module hashes match the tested source.

Home Assistant returned RUNNING. The real existing recovery session was retried
through the registered `house_moods.retry_restoration` service. It returned
`success: true`, `phase: idle`, no errors and no retained session. A subscription
to service-call events observed only the Retry service itself: zero media,
light, script or helper commands. The checked speaker, strip and Follow me states
were identical before and after Retry. No mood was started for this verification.

Private raw evidence, manifests and rollback scripts remain in the ignored
`.local/mood-recovery/` directory of the implementation worktree. Module rollback
uses the private backup; it must not overwrite the current session storage.
