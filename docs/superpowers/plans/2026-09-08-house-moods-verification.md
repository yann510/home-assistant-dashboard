# House Moods implementation and verification

Implemented in the isolated `codex/house-moods` worktree at
`/Users/yann510/.codex/worktrees/house-moods-20260908`. The deployed dashboard's
editable source was verified as `/Users/yann510/github/home-assistant-dashboard`.
The initial `home-dashboard` folder was a starter, not the serving dashboard.

Feature changes are measured from **59f90db**, a snapshot preserving the actual
source's pre-existing dashboard/speaker changes. Do not merge a diff against main
blindly over that dirty source checkout. No original source files were overwritten.

## Delivered behavior

- House Mood card directly beneath Day/Night; Love, Unwind, Dinner and Party.
  Four columns on desktop, two on phones; active check/accent, pending lock,
  End mood and persistent recovery action. No details/settings panel.
- Server-owned fixed presets use the approved living-room/kitchen lighting and
  Office neon. The strip's HS-only capability and kitchen's 2702 K minimum were
  verified read-only. The neon already inherits the Office area in HA.
- Each preset starts its exact Sonos favorite from Living Room at the approved
  volume. Follow-me is music-only and is off for Dinner.
- Private durable original baseline across switches, journal before every device
  write, manual ownership relinquishment, independent restoration where possible,
  explicit recovery retry and restart reconciliation without automatic playback.
- Exact native effect snapshots preserve the recovered rainbow bytes. Generic RGB
  controls never replace native restoration. Party uses the approved Gradient.
- Mood-owned music stops at End; previous queues are not resumed. A confirmed stop
  boundary before each start prevents an old playing queue from falsely confirming
  a rejected music request. Unchanged Sonos groups are not torn down.
- Existing follow-me joins stay journaled while mood-owned and continue normally
  from the saved source after explicit manual takeover.

The authoritative lighting/music table remains in
[`2026-09-08-house-moods-design.md`](../specs/2026-09-08-house-moods-design.md).

## Offline verification

Verified against the final implementation at **0ecf5d3** (frontend unchanged from
its full passing run at 8f78928):

| Check | Result |
|---|---|
| `npm test` | 101 passed in 8 files |
| `python3 -m unittest discover -s home-assistant/tests -v` | 99 passed |
| `.venv-ha/bin/python -m unittest discover -s home-assistant/tests_ha -v` | 21 passed |
| `.venv-ha/bin/python -m unittest discover -s home-assistant/rollout/tests -v` | 5 passed |
| `npm run lint` | Passed |
| `npx tsc -b` | Passed |
| `npx vite build` | Passed; large-chunk advisory remains |
| `git diff --check` | Clean |

HA tests use the actual **Home Assistant 2025.5.3** runtime in an isolated Python
3.13 environment. Reproducible dependencies are pinned in
`home-assistant/tests_ha/requirements.txt`; no host upgrades were performed.
Tests exercise real service registration, responses, Store failures, script
execution/templates, area targeting, context ancestry, restart and shutdown.
Device I/O is fake. The native bridge patch is applied/reversed and compiled
against the downloaded matching installed source during its regression test.

UI visual checks used mocked states at desktop and phone widths, covering idle,
active, starting, disconnected and recovery; no live dashboard controls were used.
Regression fixes include absent sensor handling, service/sensor ordering, rejected
switch labels, stale transition reports, manual neon number controls, manual
follow takeover, and backup/collision failure paths.

Individual native, engine, lighting, Sonos, HA, UI and installer task reviews are
approved after fixes. The independent whole-feature review and scoped final
re-review are **approved**, with no remaining actionable findings. Its final
disconnect regression now retains volume, follow and group baselines through
End/restart/retry, while preserving later genuine manual changes.

Startup requires valid baselines for all four configured speakers. Missing or
inconsistent telemetry stops activation before commands; during recovery,
independent available lights/volumes can restore while unavailable controls keep
their saved return state. No synthetic singleton groups or unknown volumes are
treated as confirmed observations.

## Deployment state and remaining acceptance

**Nothing has been deployed, restarted, or exercised on the live house during
implementation.** The current rainbow and music were left alone. Only read-only
capability inspection was performed.

[`home-assistant/rollout/README.md`](../../../home-assistant/rollout/README.md)
describes the concrete hash-guarded staging/install procedure, backups, file
rollback, required configuration and separate restart. Default installer mode
stages privately and does not modify deployed files. A whole-HA restart is never
hidden inside a dashboard upload.

Live acceptance remains: fresh full neon capture/replay with visual confirmation,
one short mood and End, switching, Sonos radio identity/timing, manual controls,
offline recovery and restart behavior on actual devices. Offline tests cannot
certify physical effect appearance or network/device timing. The native protocol
has no verified request-ID correlation; captures are serialized and require a
complete post-request report. Dynamic radio queue changes conservatively
relinquish playback ownership rather than overwrite an uncertain queue.
