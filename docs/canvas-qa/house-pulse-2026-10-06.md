# House pulse — October 6, 2026

House pulse now keeps its earlier illustrated “All quiet at home” presentation visible by default. Active washer, dryer and dishwasher cards retain real completion-time countdowns. Roomba activity shows its dedicated battery sensor, with no guessed remaining duration. Its controls use the same reading.

Supplemental warnings cover verified always-on Sonos speakers, lights/switches, primary Aqara presence sensors and the Broadlink remote. A present entity must report unavailable/unknown for at least ten minutes using a valid Home Assistant state-change timestamp. Healthy off/idle/paused states, absent entities, restored orphan entities and normal powered-off washer behavior do not create these alerts. Existing backend thermostat, Hue sensor battery, router, appliance and recovery reminders remain unchanged.

Charge guidance appears at 20% or below for an explicitly noncharging, undocked Roomba and an explicitly unplugged, discharging dashboard tablet. Unknown charge states and invalid/restored readings cannot assert a need to charge. Supplemental warnings clear when their condition resolves and are computed from the connected live snapshot; they do not add persistent backend snooze/dismiss actions. No Home Assistant restart is required.

## Verification

- Independent Task 1 specification and quality review passed.
- Integrated frontend suite: 501 tests passed across 35 files.
- ESLint, TypeScript and production Vite build passed. The existing large-bundle advisory remains.
- Browser previews checked quiet/busy/disconnected/health scenarios at tablet 1280×800 and compact tablet 960×600, and phone 393×852. Quiet illustration remains visible; activity and health cards use the existing horizontally scrollable strip when space is limited.
- Simulated warning navigation opened disabled offline light controls and Roomba controls with the matching 15% battery reading. The tablet charging reminder is informational. Browser console showed no errors/warnings in the checked preview.
- Read-only live inspection confirmed monitored primary entity IDs, dedicated Roomba battery/charging sensors, tablet battery/charger sensors and unchanged installed attention integration. No physical appliance cycles, vacuum missions or device disconnections were initiated for testing.

The companion app reports tablet battery/charge through its [battery sensors](https://companion.home-assistant.io/docs/core/sensors/#battery-sensors). Actual device readings drive the dashboard; previews only simulate fault conditions.

Final Task 2 review passed after removing irrelevant navigation from presence/remote/switch warnings. Those remain informational; actual light/speaker/vacuum controls remain linked. The routing fix passed 67 covering tests, ESLint, TypeScript and production build. Independent whole-branch review approved `67cc0e8..a90b19a` without further findings.

## Release

Published production dashboard release `a90b19a` with the existing guarded deployment flow. Remote staged hashes passed before promotion; the prior dashboard was retained for rollback. Fresh HTTP requests confirmed the release ID, exact index and all 67 build assets against the local build and release manifest (68 files total). No backend files, device settings or Home Assistant restart were involved.

Git remote was fetched before work and again before release; the branch is a fast-forward of the fetched `origin/main`. The tested code and these verification notes are pushed directly to `origin/main`, preserving the other checkouts’ local edits.

Open the [verified dashboard](http://homeassistant.local:8123/local/dashboard/index.html?release=a90b19a) to load this release; an already-open tablet browser may need a refresh.
