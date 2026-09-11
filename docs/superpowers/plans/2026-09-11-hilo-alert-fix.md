# Hilo gateway alert correction

The alert watched `sensor.hilo_gateway`, a restored, unavailable entity with an
obsolete Hilo unique ID. The active integration registered the online gateway as
`sensor.hilo_gateway_2`. The monitored thermostats were available; the old gateway
record did not prove a thermostat outage.

The runtime now resolves the gateway from Hilo entity-registry records belonging
to the monitored thermostats' config entries. Restored and disabled records are
excluded. Missing or ambiguous live gateways remain unavailable instead of
silently choosing a healthy candidate. Resolution repeats every five seconds, so
entity renames and registry changes do not require a dashboard update.

The engine's `sensor.hilo_gateway` key is now a normalized internal input, not a
subscription to that physical entity ID. Gateway wording explicitly distinguishes
connectivity status from thermostat availability. Existing ten-minute outage and
one-minute recovery delays, startup grace, and independent thermostat rules are
preserved.

Validation: 29 backend tests pass in the isolated Home Assistant 2025.5.3 runtime,
including stale/renamed gateway resolution, disabled/ambiguous entries, real
outage/recovery, and independent thermostat outages. Uploaded component files
were downloaded and SHA-256 verified. `ha core check` passed before restart.

Deployment backups and detailed local evidence are in
`.local/hilo-alert-investigation/` (ignored by Git).

Live verification after restart: attention reached `ready: true`, the persisted
false Hilo episode cleared naturally, the active gateway reported `on`, and all
three thermostats reported `heat` with `hvac_action: idle`. Only then was the
obsolete `sensor.hilo_gateway` registry entry removed through Home Assistant's
registry API. Both its registry entry and restored state were confirmed absent;
`sensor.hilo_gateway_2` remained online.

The frontend gateway help text now explicitly says thermostats may still be
available. Frontend validation: 135 tests passed, ESLint passed, and the production
TypeScript/Vite build passed (existing chunk-size advisory only).
