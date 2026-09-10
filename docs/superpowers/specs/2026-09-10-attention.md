# Needs attention — investigation and proposal

Investigated September 9, 2026, America/Toronto. Approved proposal; implementation status and installation are documented in home-assistant/attention-setup.md. View is constrained to the current dashboard page.

## Recommendation

Build one conditional, full-width strip between House Mood and the two dashboard columns. Use a curated set of actionable events, with persistent Home Assistant state behind it. Avoid scanning every unavailable entity or interpreting an expired countdown as completion. Keep notifications on the dashboard for the first version: no sound, phone push, modal, or repeated toast.

## Evidence gathered

Read the deployed worktree at commit 7c50509, existing recovery flows, installed @hakit/core lifecycle, 353 current states, 704 entity registry entries, 84 devices, all 27 non-restored automation configurations, and seven days of selected entity history (explicit start and end). Registry counts include disabled or historical entities, not 704 working devices. No notify/notification actions appeared in the inspected automation configurations; this does not exclude external Samsung/phone notifications or scripts outside that scope.

Live inventory contained 48 unavailable entities and 27 restored entities. These sets can overlap. The washer is unavailable; old printer, TV, energy-meter and automation entities are also present. Four active Hue battery sensors report 58%, 61%, 61%, 100%. Roomba is docked with bin-full off. WAN is on; Raspberry Pi power-problem sensor is off. Three thermostats are available. Amazon KFTRWI reports 100%, full, AC; device identity as the dashboard tablet still needs confirmation, and an unchanged percentage does not prove fresh telemetry.

Seven-day history proves the following signal behavior, not guaranteed future completeness:

- Washer `sensor.washer_washer_job_state` emitted `finish`, lasting 28.335 seconds on September 4. It later became unavailable after stopping. Therefore post-cycle unavailability alone is not evidence of a fault.
- Dryer `sensor.dryer_dryer_job_state` emitted `finished` four times. Three pulses lasted about 28 seconds; another remained for hours. Detect transitions once, not a continually true condition.
- Dishwasher `sensor.dishwasher_dishwasher_job_state` emitted `finish` for 5.307 seconds on September 5. A 30-second completion debounce would miss it. During that cycle its connection also dropped for approximately 31 seconds and recovered.
- Dryer history includes an active-to-none transition without `finished`; call this neither successful completion nor a proven failure.
- Completion estimates change after stopping and while idle. They are not authoritative event timestamps.
- Roomba has rapid normal transitions and a sustained paused interval. Paused does not establish that it is stuck.
- No appliance unloading/door sensors were found. `binary_sensor.range_door` is the oven door; front-door entities are motion/camera, not an entrance contact.
- Hilo exposes challenge state and next_events, but next_events is empty and selected history contains only off. Range job history contains ready/unavailable, with unknown setpoint. Neither validates richer alerts.

Evidence: `evidence-summary.json`, `history.json`, `states.json`, `entity_registry.json`, `device_registry.json`, `automations.json` in this directory. Raw inventory is local and may contain household information; it is not embedded in the UI.

## Exact proposed first-version rules

All durations below are proposed product defaults. Continuous conditions require trustworthy connected observation; unknown/unavailable never count as healthy recovery or zero battery.

| Message | Trigger | Clear / action |
|---|---|---|
| Washer / Dryer / Dishwasher finished · 12 min ago | Capture explicit finish/finished transition immediately after observed active-cycle activity; one event per cycle. Active job transitions also establish a new cycle, since machine=run can remain unchanged across cycles. | Done, a confirmed new active cycle, or 24-hour expiry. No claim of unloading. Stop/none/offline does not erase a captured completion. |
| Washer / Dryer / Dishwasher paused · 10 min | machine_state=pause continuously 10 min during an observed cycle. | Valid resume/stop/completion; Snooze 1 hour. If data goes unavailable, replace with status-unavailable only after its threshold. |
| Empty Roomba bin | binary_sensor.roomba_bin_full=on for 60 sec. | off for 60 sec. Snooze 4 hours; no false “Done” acknowledgment that pretends sensor cleared. |
| Roomba needs attention | vacuum.roomba=error for 60 sec. Error state is supported conceptually but was not observed in the retrieved history; test with simulated input before enabling. Only show specific fault text if supplied and mapped. | Valid non-error state for 60 sec; tap View Roomba. No generic stuck claim. |
| Roomba paused · 10 min | paused continuously 10 min following cleaning/returning in the same observed session. | Cleaning/returning/docked for 60 sec; Snooze 1 hour. Keep normal low battery/return-to-dock out. |
| Bedroom sensor battery low · 18% | One of four allowlisted Hue battery sensors <=20% for 30 min. Below or equal 10% changes wording to Very low, once per severity change. | >=25% for 30 min. Snooze 7 days; severity escalation may break snooze once. Group multiple low sensors into one expandable item. |
| Office thermostat unavailable / Bedroom motion sensor unavailable | The three climate entities or four Hue motion entities unavailable/unknown/missing for 10 min after HA startup grace. Only these fixed devices initially. Group entities by physical device. | Valid state for 60 sec. Snooze 4 hours. Hilo gateway outage plus affected thermostats becomes one heating-status message, with details listing rooms. |
| Washer / Dryer / Dishwasher status unavailable · cycle was running | Primary machine/job signal lost for 10 min during a tracked unfinished active cycle; exclude stop/none/pause/finished episodes. | Reliable active/paused/stopped state returns; no inference of successful completion across a gap. Snooze 1 hour. |
| Internet connection unavailable | binary_sensor.coda_4680_fiz_wan_status=off for 2 min. unknown/unavailable means Router status unavailable after 10 min, not proven internet failure. | on for 60 sec. WAN outage suppresses derivative cloud-appliance/Hilo alerts; retain independent local faults. |
| Home Assistant power issue | binary_sensor.rpi_power_status=on for 60 sec. | off for 5 min. Tap details; no automatic power action. Unknown is not a resolved fault. |
| House mood needs recovery / Speaker cleanup needs retry | Existing recovery_required state; or existing canRetryCleanup predicate persists 5 sec after Follow me script stops. | Existing recovery flow succeeds. Tap scrolls to existing Retry controls. Do not duplicate transient command errors or show Starting/Restoring as failure. |

Local connection fallback: after 15 seconds disconnected while the page is visible, show one muted “Reconnecting to Home Assistant — live status paused” strip. Suspend new device conclusions and mark saved event ages as historical. Reconnecting resumes existing items without new entrance animations. This rule is client-side because HA cannot report a broken client connection through that connection.

## Deferred and excluded

- Tablet charging warning: useful optional addition after confirming KFTRWI is this tablet and that updates are fresh. Proposed <=20% and discharging for 5 min; clear after charging/full for 1 min or >=25%. Do not initially include old phones or toothbrush batteries.
- Backup maintenance: expose only after verifying the intended schedule; proposed blocked for 15 min or missed scheduled success plus 24 hours. No schedule assumption from one timestamp.
- Hilo challenge starts/ends and heating explanations: defer until a real event payload or installed integration schema has been validated. Do not infer a challenge from unexplained room temperature.
- Oven ready/left-on: defer until real preheat/cooking transitions are observed. Current temperature alone cannot distinguish residual heat or stale data; no safety promise.
- Door/window open, leaks, smoke/CO: no relevant connected signals found. Do not invent them from camera/motion names.
- Software updates, weather changes, all idle/off states, every unavailable light/TV/printer, routine room/target differences, and ordinary speaker playback are excluded. The existing cards already cover routine activity.
- Do not claim missed cycle completions while HA itself was down. Restore saved confirmed events; when a gap cannot be reconciled, show status uncertainty rather than a fabricated completion.

## UI and notification behavior

One shared panel using existing surface, border, typography and 16px radius. Header “Needs attention” and item count. At tablet width show at most two compact rows (about 56–64px each) plus “View all (N)”; expanded list opens below, never a carousel. On phones text wraps while actions remain at least 44px tall. Hidden entirely when there are no unsnoozed items. If items are snoozed, leave a small “Snoozed · N” entry so they can be recovered.

Each row: tinted existing-style SVG icon; message and relative time; one explicit action. Completion blue with a check, maintenance amber, confirmed faults muted red. Text and icon convey severity without color. Entrance is a 200–250ms fade with slight vertical movement; icon gets one gentle accent animation, then rests. No spinning washer after completion. Respect reduced motion and polite screen-reader announcements once per event, not on each minute tick.

Example with illustrative values, not current household alerts:

    Needs attention                                      3
    [washer/check] Washer finished       12 min ago   [Done]
    [bin]          Empty Roomba bin                   [View]
                                              [View all 3]

Ranking: connection failure replaces live status; otherwise infrastructure/recovery faults, Roomba intervention, newly finished appliances, paused tasks, then battery maintenance. Within a priority sort by event time; minute updates never reorder. New items appear once at the same location. No focus stealing, modal, toast stack, chime, or repeated pop every refresh. Snooze expiry makes an item visible silently; only a new episode or severity escalation can animate again. Night Mode suppresses decorative entrance animation while retaining actionable text.

Done means dismiss this completion event, not “I verified the machine was unloaded.” It persists across tablets. A 24-hour completion expiry prevents an abandoned message staying forever; the new-cycle rule also clears it. No repeated laundry escalation until the user specifically asks for reminders. The strip can be called “Home updates” instead if mixing completion and maintenance makes “Needs attention” feel too urgent.

## Implementation implications and verification

Recommend HA automations and persistent per-rule helpers for event identity, observed active-cycle state, occurrence timestamp, dismiss/snooze deadline and condition episode. Frontend subscribes to a current snapshot. Browser-only storage is cheaper but loses short events during tablet sleep and cannot reliably share dismissal; a custom HA integration is flexible but disproportionate for the first version.

Installed @hakit/core suspends its socket after five minutes hidden, so page timers cannot be the event collector. Its store also ignores timestamp-only updates, so last_updated in React is not a trustworthy device heartbeat. Existing local recovery state should remain owned by its current feature, with a read-only summary exposed to the strip.

Persist deadlines rather than relying solely on automation `for` waits; HA documentation notes those waits reset on restart/reload. On startup, reconcile saved state, allow 2 minutes for integrations to settle, and revalidate continuous conditions. Do not count an unobserved gap as continuous failure or success. Do not backfill old laundry notifications on first installation. Capture short finish pulses immediately; validate persisted event behavior independently from UI render timing.

Replay the retrieved history to confirm six explicit completion events (washer 1, dryer 4, dishwasher 1), no notification from estimates alone, no dishwasher offline alert from the 31-second interruption, and no false Roomba error from normal transitions. Test cancellation, finished-to-none, subsequent new cycle without machine-state change, disconnect/reconnect, restart during dwell/snooze, unknown battery, duplication, dismissal across tabs, and the tablet asleep during the five-second dishwasher finish pulse. Replay is proposed validation; no production rule engine has been implemented or certified by this investigation.

Code references: src/Dashboard.tsx (placement), src/AppliancesCard.tsx (existing status/countdown), src/HouseMoodCard.tsx and src/useHouseMood.ts (recovery), src/SpeakerCard.tsx (cleanup predicate), installed @hakit/core/dist/Provider-Cj7cK62S.js:249–258 and dist/es/HassConnect/HassContext.js (sleep and state merging).

Official references: [SmartThings signals](https://www.home-assistant.io/integrations/smartthings), [automation triggers and restart semantics](https://www.home-assistant.io/docs/automation/trigger/), [state object timestamp semantics](https://www.home-assistant.io/docs/configuration/state_object).
