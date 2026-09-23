# House Canvas trial handoff

Status: tooling implemented and locally verified; remote upload, LAN verification, login and physical-device observations remain **pending**. This document does not claim that a trial is currently deployed.

Trial URL after deployment: **http://homeassistant.local:8123/local/canvas-trial/?view=canvas**.
Immediate existing-dashboard fallback: **http://homeassistant.local:8123/local/dashboard/index.html**.

Source baseline for this tooling: `b3af9bf` on `codex/quiet-home-poc`. The exact deployed source commit and release ID are **pending deployment**; record both here after successful remote and LAN verification. Source publication to `origin/main` follows the user's latest repository instructions and is separate from deployment. Canvas remains optional; adopting it as the default remains a later decision.

## Build and release

Use Node 24. Do not invoke the generic `npm run build`: its prebuild hook formats the entire repository.

```sh
npm run build:canvas-trial
npm run deploy:canvas-trial -- RELEASE_ID
npm run rollback:canvas-trial
```

Use an immutable release ID such as the tested commit SHA. The publish command takes only a release ID: it does not accept arbitrary remote destinations. SSH configuration is read from the existing ignored `.env`; credentials are never logged. Failures exit nonzero and close the SSH connection. `scripts/deploy.ts` is unchanged.

The build command produces `dist` with `/local/canvas-trial/` as its base. The release payload permits only `index.html` and `assets/` at its root, excluding copied development concepts/prototypes and other unneeded public files. Publish checks the entry base before upload and scans payload bytes for configured secret values, client token environment references and literal `hassToken` assignments. HAKit's bundled optional prop declarations/variable forwarding are normal library code, not an embedded credential; the application uses its supported login flow without supplying that prop.

The tool deduplicates `/config/www` and `/homeassistant/www` by their canonical paths and requires exactly one valid canonical root. Paths stay inside `canvas-trial` or `canvas-trial-*` siblings; traversal, links, and `dashboard` destinations are rejected. A nonrecursive remote `canvas-trial-lock` mkdir excludes concurrent publish/rollback operations. Never remove an existing lock without investigating the owner and any interrupted operation.

Each run uploads to its own `canvas-trial-stage-UUID`, computes a local SHA-256 manifest and verifies every staged file by downloading and hashing the remote bytes. Existing `assets/` files are carried forward and checked for conflicting bytes. The current trial is renamed to `canvas-trial-previous`, then staging is renamed to `canvas-trial`. This **two-rename switch is recoverable, not atomic**: requests may fail briefly between renames. Failed promotion restores the previous current directory. Previous backups are archived rather than deleted.

Rollback stages the previous release, retains current assets for already-open clients, verifies staged bytes and performs the same recoverable switch. It preserves the previous directory and archives the displaced current release as `canvas-trial-rollback-UUID`. Retained assets survive both promotion and rollback; directories/assets accumulate intentionally. There is no automated pruning. If connectivity fails during rename/recovery, inspect current, previous, stage and archive directories before retrying; a crash may also leave a lock. A rollback before any previous release exists fails safely. Only this run's staging directory and owned lock are cleaned; dashboard and retained releases are never deleted.

## Required remote evidence (pending)

- Record tested source commit, release ID and deployed `release-info.json`.
- Verify remote staged manifest and successful promotion, then fetch LAN trial HTML and linked JS/CSS with successful responses and matching bytes.
- Re-fetch all three existing-dashboard baseline paths from `.superpowers/sdd/2026-09-23-house-canvas-production/existing-dashboard-baseline.json`; require unchanged SHA-256 values.
- Complete supported Home Assistant login and observe read-only entity updates; report any user-interaction/auth/connectivity blocker precisely.
- Verify source push is a fast-forward to `origin/main` and remote HEAD equals the tested commit. No force push.

## Physical hardware checklist

All observations below are **pending** until performed on the named device; desktop checks do not complete this list.

- Fire HD 10: record actual CSS viewport, orientation and Silk version.
- Fire HD 10: full-screen fit and readability at normal wall viewing distance.
- Fire HD 10: every main touch action, including navigation, lights, modes, audio, weather and appliances.
- Fire HD 10: follow/manual room handoff.
- Fire HD 10: multi-room blinds, partial failures and Stop.
- Fire HD 10: favourite artwork and music controls.
- Fire HD 10: daily/hourly forecasts and unavailable states.
- Fire HD 10: appliance animation and status transitions.
- Fire HD 10: sleep/wake and Wi-Fi disconnect/recovery.
- iPhone Pro: portrait/landscape fit, safe areas, touch interactions and background/resume recovery.
