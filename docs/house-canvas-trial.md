# House Canvas trial handoff

Status: dedicated trial deployed and verified over SSH and LAN HTTP. Supported browser login, read-only entity updates and physical-device observations remain **pending**. No physical home commands were issued during deployment verification.

Live trial URL: **http://homeassistant.local:8123/local/canvas-trial/?view=canvas**.
Immediate existing-dashboard fallback: **http://homeassistant.local:8123/local/dashboard/index.html**.

Deployed source commit and release ID: `4e29b770bff3c56fcd61c9a788e6d682c80bbe74` on `codex/quiet-home-poc`. Source publication to `origin/main` follows the user's latest repository instructions and is separate from deployment. Canvas remains optional; adopting it as the default remains a later decision.

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

## Deployment evidence

Verified at **2026-09-23T18:34:57.651Z**. The reviewed final build passed 333 tests, project type checking and lint across all changed TypeScript files before deployment.

- `npm run deploy:canvas-trial -- 4e29b770bff3c56fcd61c9a788e6d682c80bbe74` exited 0 after its secret scan, staged SHA-256 verification and promotion.
- Remote `/homeassistant/www/canvas-trial/release-info.json` reports the exact source/release ID above.
- Re-read the deployed manifest and all **74 files** over SSH; every SHA-256 matched. Fetched all 74 over LAN HTTP with **HTTP 200** and matching hashes. All 73 build files also match local `dist`; the remaining file is generated release metadata.
- The two assets directly linked by index.html (JS and CSS) were included in these checks.
- The existing dashboard index.html and its two baseline JS/CSS files still return HTTP 200 with unchanged byte counts and SHA-256 values. The original URL remains available.
- Full per-file evidence is retained in the local workspace at `.superpowers/sdd/2026-09-23-house-canvas-production/trial-deployment-verification.json`, compared against `existing-dashboard-baseline.json` in that directory.
- This is the first trial release: no earlier trial existed to roll back to. `npm run rollback:canvas-trial` becomes useful after a later release has retained this one; today the immediate fallback is the existing dashboard URL.
- **Browser verification blocked:** the controller attempted the actual trial URL in both the Codex in-app browser and regular Chrome through browser tooling. Both failed with `net::ERR_BLOCKED_BY_CLIENT` before the page opened. This is separate from the successful direct HTTP/SSH checks. Supported Home Assistant login and live read-only entity updates require the user to open the trial link; neither is claimed verified. No credentials were injected or browser restrictions bypassed.
- **Pending:** physical checks below and controller's verified fast-forward source push to `origin/main`.

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
