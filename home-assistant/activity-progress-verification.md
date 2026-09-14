# In progress expansion — September 14, 2026

The compact activity area now includes washer, dryer, and dishwasher running or paused cycles, plus Roomba cleaning or returning to dock. It is titled In progress. Paused appliances have no ETA or running animation. Terminal job states are excluded even when the machine state lags. All items hide during disconnection. Appliance links focus the full Appliances card; Roomba links focus its existing vacuum wrapper. The responsive layout uses two columns, or one on phones.

Existing completion and fault tracking remains unchanged: dishwasher completion updates already exist, laundry updates expire after two hours, and vacuum errors/bin-full conditions stay under Needs attention. No backend change or Home Assistant restart is required.

Validation: 169 frontend tests passed, source ESLint and TypeScript checks passed, and the production build succeeded with its existing chunk-size advisory. The initial new behavior checks failed before implementation; final tests cover all four active devices, pause/terminal states, dishwasher phase naming, navigation, and disconnection. Astra's independent review approved the scoped changes and independently passed 48 focused tests. Browser checks at 1024px and 320px confirmed all four entries, Roomba focus, no horizontal overflow, and idle/disconnected hiding. Sample screenshots are local-only at `.local/activity-desktop.png` and `.local/activity-phone.png`.

## Deployment status

The implementation is committed and pushed to `origin/main` as `6e1a106`. Deployment was attempted but stopped during the SSH handshake, before any upload. The current computer's default gateway is on a different network from Home Assistant; `homeassistant.local` does not resolve and its configured private SSH address is unreachable. The live dashboard was not changed by this release.

The tested build is in `dist/`; its entry and asset hashes are recorded in `.local/activity-release/verification.json`. Once Home Assistant is reachable, verify the source/build still match this release (or rebuild and test any newer source), then use the existing assets-first deployment helper `node .local/ship-appliances.mjs`. That helper backs up the previous entry, uploads assets, verifies served hashes, and publishes the entry. Verify the live dashboard after publishing; do not report this release as deployed until then.
