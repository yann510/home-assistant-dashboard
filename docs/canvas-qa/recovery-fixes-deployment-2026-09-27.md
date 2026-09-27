# Recovery fixes deployment — September 27, 2026

Deployed source release: `8aea92f4999e635638f82904fd8a1b2e3caa9dfd`.

The user explicitly requested deployment after implementation, automated verification, independent review, and push to `origin/main`.

## Backend

- Live Home Assistant version: **2026.9.3**; no HA version upgrade.
- Before deployment, mood was idle with no errors, persisted session was null, and Follow me and its script were off.
- Installed all **13** current `house_moods` files, including the new `modes.py`, after checking live hashes against the captured baseline.
- Stopped Core for installation; preserved session storage and configuration. Configuration checks passed before installation and before restarting.
- Private rollback copies of the integration, journal, and configuration are in `/share/recovery-fixes-8aea92f-20260927/backup`.
- Kept `house_moods: {}` unchanged. Coordinated mode control remains disabled and legacy mode automations remain unchanged.
- After restart, mood returned idle/no errors, mood response services were registered, Follow remained off, and all 13 installed file hashes matched source. No mood/attention startup error or warning lines were found in the captured startup log.
- The attention integration completed its normal two-minute warm-up and reported ready.

## Dashboard

- Built with `npm run build:dashboard`; TypeScript and Vite production build passed. Existing large-chunk warning remains.
- Published using `scripts/deploy-canvas.ts publish-dashboard 8aea92f`, preserving previous-release rollback and old assets.
- At **2026-09-27T18:28:48.882Z**, release metadata reported `8aea92f`; **178** served files returned successful HTTP responses and matched their manifest hashes.
- Authenticated live browser showed Connected, idle mood, current device state, and working speaker popup navigation/focus restoration. No physical-device commands were issued for this check.
- A plain URL initially reused historical cached HTML referencing an obsolete bundle. The versioned [deployed dashboard](http://homeassistant.local:8123/local/dashboard/index.html?release=8aea92f) loaded the verified current release correctly. Existing browser sessions may need a hard refresh.

## Evidence and limits

Private snapshots, source backups, install scripts, hashes, and raw logs are retained in the ignored `.local/recovery-deploy-20260927/` directory. Credentials and private state are not committed.

Deployment verification establishes installed/served integrity, startup health, and read-only UI operation. It does not claim a live forced-timeout, partial speaker regrouping, blind movement, or physical mood-restoration test. Those recovery paths have automated regression coverage. Unknown timed-out effects and ambiguous old journal entries intentionally remain in recovery until evidence or manual control resolves them.
