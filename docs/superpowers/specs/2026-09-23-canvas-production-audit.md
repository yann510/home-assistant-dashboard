# House Canvas production-readiness audit

Scope: reviewed the actual dashboard controllers against House Canvas. The prototype is still simulated and does not replace the live implementation. This audit is the integration acceptance checklist, not a claim of production readiness.

## Features to preserve

| Area | Existing source | Required integration behaviour |
| --- | --- | --- |
| Moods | useHouseMood.ts, HouseMoodCard.tsx | Keep start/restore/recovery phases, errors and retry; never overwrite the saved pre-mood state through duplicate starts. |
| Music transport | SpeakerCard.tsx, SpeakerPlayer.tsx, useSpeakerCommand.ts | Keep coordinator resolution, capability-aware controls, retained Follow source, unavailable/buffering/idle states, authenticated socket and rejected/timeout handling. |
| Speaker grouping | SpeakerRooms.tsx | Preserve source membership, all/only-source selection, manual handoff, cleanup retry, group conflict detection and errors. Prototype immediate grouping is not a substitute. |
| Volume and mute | SpeakerVolume.tsx | Preserve relative group volumes, per-speaker controls and mute, batching and pending slider state. |
| Seeking/favourites | SpeakerSeek.tsx, SpeakerFavourites.tsx | Preserve media capability checks, actual duration/position, live favourites and empty/error states. |
| Lights | LightCard.tsx, useLightSummary.ts | Preserve all entities and use actual supported light controls, including colour temperature/effects where supported. A finite sample colour palette is insufficient. |
| Climate | TemperatureCard.tsx | Office/Gym/Bedroom, actual limits and step, target/current values, heating status and observed state confirmation. |
| Appliances/activity | AppliancesCard.tsx, RunningPanel.tsx, applianceStatus.ts | Actual machine/job/completion sensors; paused, finished and unknown states; Roomba cleaning/returning/docked. No fabricated ETA. |
| Attention | useAttention.ts, AttentionPanel.tsx, attention.ts | Existing deduplication, priorities, reminder dismissal and contextual destinations. Running states remain informational rather than alarms. |
| Weather | QuietWeather.tsx, useQuietForecast.ts | Current actual temperature, live forecast, loading/error/stale behaviour and units. |
| Device access | Dashboard.tsx, QuietHome.tsx | All existing controls remain reachable. Retain Classic and Quiet Home during trial. |

## Command feedback gaps to fix in the live phase

- BlindCard.tsx calls Google Assistant and uses 5/20-second UI timers. These are not position confirmation. Await service errors/timeouts, report per-room outcomes for multi-room commands, and label success as command accepted with position unknown. Keep Stop reachable.
- HomeModeControls.tsx calls turnOn without a visible error path. Show pending, await actual boolean state, handle timeout/disconnect and avoid claiming exclusive Day/Night before automation reports it.
- LightCard.tsx clears its pending state after ten seconds without explaining failure. Global/room commands need partial-failure reporting and state reconciliation; retain per-entity capability checks.
- useSpeakerCommand.ts confirms service acknowledgement, not every physical playback transition. Use wording appropriate to the available state; do not invent an observed outcome.
- Do not replay timed-out toggles blindly after reconnect. Re-read state before retry. Prevent duplicate in-flight changes without blocking emergency Stop.

## Validation and rollout gates

1. Implement optional view=canvas using the existing authenticated connection and reusable controllers, keeping all current views and no default replacement.
2. Automated checks: rejection, timeout, disconnect/reconnect, partial group failure, missing entities, stale data, capability differences, delayed/out-of-order state and unmount/reset during a command.
3. Browser checks with mocked devices before real commands. Compare the full feature inventory and keyboard/focus behaviour.
4. Actual mounted Fire HD 10: record CSS viewport/browser version; check 44px targets at arm's length, long labels, four active appliances, animation load, wake after sleep and dropped Wi-Fi.
5. Actual smaller iPhone Pro: safe areas, sheets/keyboard, foreground/background reconnect, volume and room selection.
6. Explicit trial deployment of the optional view, then several days of use before deciding on default replacement.

Hardware checks and live command confirmation cannot be inferred from desktop viewport emulation. No physical-device checks or live integration were performed by this audit.
