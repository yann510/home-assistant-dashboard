# House Canvas trial handoff

Status: dedicated trial deployed and verified over SSH and LAN HTTP. The normal Home Assistant login screen is reachable. Authenticated live entity updates and physical-device observations remain **pending**. No physical home commands were issued during deployment verification.

Live trial URL: **http://homeassistant.local:8123/local/canvas-trial/index.html?view=canvas**.

The originally shared folder URL (`/local/canvas-trial/?view=canvas`) returns **HTTP 403**. On September 23, a follow-up GET verified that the explicit `index.html?view=canvas` entry returns **HTTP 200** with the deployed index hash; the existing dashboard also returns HTTP 200 with its baseline hash. The original deployment checks fetched individual files and did not establish that the folder URL worked.

Immediate existing-dashboard fallback: **http://homeassistant.local:8123/local/dashboard/index.html**.

Deployed source commit and release ID: `0e3526157c5f878b520b3f6e4f24568f87b58ec7` on `codex/quiet-home-poc`. Previous release `8ba04ae1f704c122f70db19dfdf9dd3e4bcc053e` is retained for rollback. Source publication to `origin/main` is separate from deployment. Canvas remains optional; adopting it as the default remains a later decision.

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

Verified at **2026-09-23T20:13:34.051Z**. The independently reviewed compact wind layout and accessibility correction passed **14 focused weather tests**, scoped ESLint, project type checking and the final explicit trial-base build. The preceding full-suite result remains 349 tests; it was not rerun for this follow-up. The active met provider supplies forecast wind and precipitation amounts but not feels-like or probability; missing fields remain explicitly unavailable. See [UX polish verification](house-canvas-ux-polish.md).

- `npm run deploy:canvas-trial -- 0e3526157c5f878b520b3f6e4f24568f87b58ec7` exited 0 after its secret scan, staged SHA-256 verification and promotion. Remote release-info reports that exact source/release ID.
- All **88 manifest files** match their remote SHA-256 hashes and LAN HTTP responses (HTTP 200). All **73 current build files** match local `dist`; **14 previous hashed assets** remain available and verified, alongside generated release metadata.
- Exact user entry `/local/canvas-trial/index.html?view=canvas` returns **HTTP 200** and the expected index hash. Both directly linked JS/CSS assets were verified.
- Previous release `8ba04ae1f704c122f70db19dfdf9dd3e4bcc053e` is preserved in `/homeassistant/www/canvas-trial-previous`; all **86 previous manifest files** were re-read and verified. `npm run rollback:canvas-trial` can restore it while retaining the new hashed assets for open clients. Rollback was not executed during this verification.
- The existing dashboard HTML and its two baseline JS/CSS files still return HTTP 200 with unchanged byte counts and SHA-256 values.
- [Deployment hash evidence](canvas-qa/trial-deployment-verification.json) records every verified file, exact entry status and previous release. The original local dashboard baseline remains untouched.
- **Login-screen reachability confirmed:** the controller opened the corrected explicit index URL and reached Home Assistant's normal authorization screen with Username, Password and Log in. No credentials were entered. This supersedes the earlier wrong-folder/browser-tool access failure; it does not establish authenticated live state updates.
- **Pending:** authenticated live UI updates and the physical checks below. No real-home commands were issued.

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
