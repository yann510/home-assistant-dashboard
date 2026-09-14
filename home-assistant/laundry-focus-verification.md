# Laundry focus release — September 13, 2026

## Behavior and decision

The dashboard now shows a compact Running area directly after attention reminders. Only washer and dryer are included. Confirmed running machines show their reported phase and a usable future finish estimate; clicking one scrolls to and focuses the unchanged-position Appliances card. Idle, disconnected, missing, and terminal states do not appear. Night mode disables the running icon animation and smooth scrolling. Terminal job states also override a lagging `run` machine state in the full card: Finished, with no running animation or estimate.

The reported reminder issue was not a wrong door entity: the attention integration never subscribed to doors, and no washer/dryer door capability was available. Live entity registry inspection (including disabled and differently named entities belonging to each device) and raw SmartThings device diagnostics confirmed this. Both machines reset to stopped/none and power off shortly after completion; these observations cannot establish unloading.

The user delegated decisions while away. Astra product and independent release reviews approved an explicit fallback: washer/dryer completions are recent-cycle updates that expire two hours after the original finish or immediately through Done. Dishwasher retains its 24-hour window. Restart and snooze do not extend the window, existing stored episodes migrate without changing their timestamps, and no door-opening or unloading inference is made. Actual door-based acknowledgement remains unavailable.

## Verification

- Eight focused laundry lifecycle tests were added. Before implementation, five assertions failed on two-hour expiry, saved-copy migration, startup expiry, and snooze limits; all passed after the change.
- All 37 attention backend tests passed in the isolated Home Assistant 2025.5.3 environment, including actual state callbacks, persistent Store writes, registered dismissal services, and recorded completion replay.
- All 154 frontend tests passed. The Running placement and subsequent terminal/Night-mode regressions were observed failing before their implementations.
- `npx eslint src`, `npx tsc -b`, and the production Vite build passed. Whole-repository lint still includes old untracked `.local` preview files with existing lint errors. Vite reports its existing large-chunk advisory.
- Browser checks used actual production components with local fixtures, without Home Assistant writes. Mixed and both-running layouts were inspected at 390px and 1024px; 320px had no horizontal overflow. Two active links, card focus, Night-mode animation suppression, idle/disconnected hiding, and Done removal were verified.
- Two Astra reviews found no release blockers.

## Deployment

The existing worktree is `/Users/yann510/.codex/worktrees/house-moods-20260908`, branch `codex/house-moods`, belonging to `/Users/yann510/github/home-assistant-dashboard`. The saved task folder `/Users/yann510/github/home-dashboard` contains an unrelated starter; its new `AGENTS.md` records the correct source location.

Before deployment, remote attention `engine.py`, `__init__.py`, and `gateway.py` matched the baseline commit `61fb7cd`. The engine and persistent storage were backed up locally. Only `engine.py` changed on the backend; its staged and installed bytes were hash-verified. Home Assistant's configuration check passed and one core restart completed. No appliance controls or synthetic production states were invoked.

After the normal startup grace period, `sensor.dashboard_attention` reported `ready: true`, state `0`, and no items. Both prior laundry updates were older than two hours. The persistent storage also contained no events, proving their removal was saved rather than merely hidden by the frontend.

The frontend was published assets-first, preserving the previous entry and old assets. The served entry, JavaScript, and CSS matched the built files:

- JavaScript: `index-DjE9T9CE.js`
- CSS: `index-oXt3qO0A.css`
- Entry SHA-256: `b23b93f86849fadcef39a462ea2b9c9314c337ef1870d3c04c55b54c4811c8c5`

The live dashboard loaded the Appliances card, correctly showed no Running area for stopped/unavailable machines, and had no phone-width overflow. The remaining `/vite.svg` favicon 404 is unrelated to these changes.

Private evidence and backend backup: `.local/laundry-focus/`. Frontend entry backup and hash verification: `.local/appliances-deploy-2026-09-14T02-47-17-583Z/`. Raw diagnostic responses are local-only and not committed. To roll back, restore the backed-up engine and restart after a configuration check, and restore the previous dashboard entry. Keep current attention storage; restoring an old storage snapshot can resurrect acknowledged reminders.
