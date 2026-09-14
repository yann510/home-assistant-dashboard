# Dashboard attention backend

This household-specific integration captures appliance completion pulses while the dashboard/tablet is asleep. It stores confirmed episodes, dismissal, snooze, battery severity, and unfinished-cycle context in Home Assistant's `.storage/dashboard_attention`. It sends no mobile notifications and never controls an appliance.

## Installation

1. Copy `custom_components/dashboard_attention/` from this directory into `/config/custom_components/dashboard_attention/` on the Home Assistant host. Keep the existing `house_moods` integration and speaker helpers.
2. Add this top-level entry to `/config/configuration.yaml` (once):

   ```yaml
   dashboard_attention:
   ```

3. Run Home Assistant's configuration check. Restart Home Assistant to load the integration. This briefly interrupts dashboard connections and automations; choose an appropriate time.
4. Wait two minutes for startup reconciliation. Verify `sensor.dashboard_attention` exists with `ready: true` and an `items` attribute. Zero items is healthy when nothing needs attention.
5. Deploy the matching dashboard build. No simulated scenarios are injected into the production sensor.

To remove: remove the YAML entry and restart HA before deleting the custom component. Preserve `.storage/dashboard_attention` if saved events/dismissals should survive reinstalls.

## Contract and controls

`sensor.dashboard_attention` state is the unsnoozed visible count; attributes contain `ready` and `items`. Each item has `id`, immutable `episode`, `title`, `detail`, `tone`, `icon`, `target`, ISO UTC `occurred_at`, `kind`, `snoozed_until`, and `snooze_seconds`. Snoozed items remain in the attribute for restoration. Grouped/suppressed derivative items are hidden from this public list until their infrastructure parent clears.

Services `dashboard_attention.dismiss`, `dashboard_attention.snooze`, and `dashboard_attention.unsnooze` accept exactly `{id, episode}`. A stale episode is rejected; only completion items support dismissal. Changes persist before service success and sensor publication. If saving fails, the sensor becomes unavailable with `ready: false` and its last confirmed items; periodic retry recovers it after storage works again.

All View targets are dashboard sections or inline details. These services never navigate and never invoke device-control services. Existing House Mood and speaker retry controls retain their own behavior.

## Implemented rules

- Explicit washer/dryer/dishwasher finish after observed activity, immediately captured and deduplicated. Washer and dryer updates expire two hours after the original finish; dishwasher updates expire after 24 hours. A confirmed new active cycle or Done clears the update sooner. Snooze and restart never renew its age. Existing saved laundry updates adopt the shorter window and explicit expiry text on upgrade. No completion estimate or unloading inference.
- Tracked appliance pause for 10 minutes; snooze one hour. Primary status loss for 10 minutes during unfinished activity; snooze one hour. Stopped/none/finished or intentionally paused episodes do not trigger running-cycle offline warnings.
- Roomba bin-full 60 seconds, clearing after empty for 60 seconds; snooze four hours. Error 60 seconds with trustworthy non-error recovery for 60 seconds. Pause 10 minutes after observed cleaning/returning, clearing after cleaning/returning/docked for 60 seconds; snooze one hour. Active startup snapshots establish cleaning sessions, but an initially paused snapshot does not backfill one. Idle or unknown does not clear an existing pause; a verified error supersedes its display until resolved.
- Four fixed Hue sensor batteries at ≤20% for 30 minutes; recover ≥25% for 30 minutes. Grouped with sensor names and percentages, seven-day snooze. ≤10% escalation can break snooze once per unresolved grouped episode. Numeric invalid/unknown values never prove recovery.
- Three fixed thermostats and four fixed Hue motion sensors unavailable/unknown/missing for 10 minutes after startup grace; recover after 60 seconds. Hilo gateway failures group heating alerts with affected rooms. Four-hour snooze.
- Explicit router WAN off for two minutes; recover on for 60 seconds. Unknown/unavailable router status uses a distinct ten-minute warning. Confirmed WAN outage suppresses cloud-appliance and Hilo/thermostat derivatives, retaining local faults.
- Raspberry Pi power fault for 60 seconds, healthy recovery for five minutes; four-hour snooze.
- `sensor.house_mood = recovery_required` immediately after startup grace. Speaker cleanup: Follow me off, saved `media_player.*` source, and Follow me script off continuously five seconds. Empty saved source resolves cleanup. These refer to the existing persistent server state.

The UI owns its disconnected-client banner, entrance animation, in-page navigation and relative times. Fault/recovery items rank first, followed by Roomba intervention, completions, other interruptions, then batteries.

The compact Running area follows Needs attention and shows only washer/dryer machines reporting `run`, excluding a terminal `finish`/`finished` job. It shows the reported phase and a future completion estimate when usable, updating remaining minutes every 30 seconds. It hides during dashboard disconnection and links to the full Appliances card without moving it. Paused cycles remain covered by the existing ten-minute attention rule. No percentage is invented from the finish estimate.

### Laundry door limitation

Read-only inspection on September 13, 2026 confirmed that neither washer nor dryer exposes a door/contact sensor, including disabled entities and the raw SmartThings device capability/status responses. Both reset to stopped/none and power off shortly after finishing; the washer can subsequently become unavailable. These signals do not establish unloading. The two-hour window is therefore a recent-cycle update policy, not automatic door-open acknowledgement. Done remains the immediate persistent dismissal across tablets. Automatic door clearing would require an actual supported door signal.

## Reliability and limits

State subscriptions attach before reading/loading the initial snapshot; queued transitions preserve even a five-second finish pulse during storage initialization. HA callback handlers remain on its event loop. A five-second timer handles dwell, expiry, readiness and retry. The async lock serializes state events, timer evaluations and user actions.

Confirmed episodes/snoozes survive restart. Continuous dwell restarts after a two-minute integration grace period: HA downtime never counts as continuous failure or recovery. Unfinished cycles restore as uncertain; they need fresh active job evidence before a later finish can be trusted. The first snapshot never backfills completion. A cycle finishing immediately after first installation without a newly observed active transition may therefore be omitted. If HA itself misses a finish, no success is fabricated. Events acknowledged while other tablets sleep stay acknowledged.

The rule allowlist is household-specific; entity IDs are in `engine.py`. Hilo currently uses gateway **state**, not undocumented connectivity attributes. No generic unavailable-entity scan, oven safety claims, door/unloading inference, tablet battery rule, or challenge announcements. Roomba error behavior is verified with simulated input rather than an observed real error.

## Verification

From the worktree root:

```sh
python3 -m unittest discover -s home-assistant/tests_attention -v
.venv-ha/bin/python -m unittest discover -s home-assistant/tests_attention -v
```

The second command additionally uses isolated Home Assistant 2025.5.3 APIs, actual state subscription callbacks, Store writes, and registered services without touching live devices. Private `.local/attention-investigation/history.json`, when present, replays six recorded completions (washer one, dryer four, dishwasher one), including the short dishwasher finish and brief connection gap; the history is deliberately not committed. HA compatibility tests skip if HA is not installed; private replay skips if the evidence file is absent.
