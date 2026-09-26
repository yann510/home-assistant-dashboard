# Canvas live trial results — September 26, 2026

**Frontend deployed; full live UI and physical acceptance remain incomplete.** Tests below follow [the live hardware plan](live-hardware-test-plan.md). Direct API probes are supplemental evidence, not substitutes for dashboard interactions or observation of physical devices.

- Trial: [Canvas](http://homeassistant.local:8123/local/canvas-trial/index.html?view=canvas)
- Existing-dashboard fallback: [Dashboard](http://homeassistant.local:8123/local/dashboard/index.html)
- Deployed release: `4b2dcfe`.
- Backend: Home Assistant 2026.9.3; **no backend migration or restart performed**.

## Completed evidence

| Check | Result | Evidence / limitation |
|---|---|---|
| Automated frontend regressions | PASS | 497 tests; full ESLint, TypeScript and trial production build passed for this release. |
| Automated backend regressions | PASS | Mood 148; HA integration 32; attention 37; rollout helpers 6. These execute test environments, not live device transitions. |
| Deployment integrity | PASS | At 20:53:43 UTC, all 90 published/retained manifest files returned HTTP 200 with matching hashes, including explicit index and release metadata. Existing dashboard unchanged. |
| Invalid light request rejection | API PASS | At 20:53:49 UTC, invalid kitchen brightness request returned HTTP 400. This demonstrates server validation, not the dashboard's error rendering. |
| Valid light request after rejection | API + HA PASS | Kitchen brightness 220 accepted (HTTP 200) and HA reported target. Restored original brightness 255 at 20:53:50 UTC. Actual illumination was not observed. |
| Thermostat step and restoration | API + HA PASS | Office target 20°C → 19.5°C accepted and reported, then restored to 20°C by 20:53:57 UTC. No physical temperature/heating outcome claimed. |
| Existing mood preservation | HA PASS | Same preexisting session remained active Unwind after probes. No End/recreate operation, no mode or speaker write, and no ownership-journal migration. |
| Forecast availability | API PASS | Hourly returned 48 rows; daily returned 6. Both include wind and precipitation amount. Neither response advertises apparent-temperature or precipitation-probability fields. Rendering not validated in authenticated live UI. |

The committed [deployment hash evidence](live-deployment-2026-09-26.json) records all 90 file checks.

Private raw evidence remains under `/tmp/canvas-live-qa/`: `deployment.json`, `hardware-probes.json`, `forecast.json`, `final-state.json`, and baseline capture. Credentials/private journals are not included in this report. These temporary artifacts are execution evidence, not a promise of permanent storage.

## Plan coverage and blockers

Each range below includes **every** ID in that range. A blocked row is not counted as passed because a related unit test or API probe passed.

| Plan IDs | Live verdict | Reason / next prerequisite |
|---|---|---|
| P01 | PARTIAL | Read-only baseline and deployment recovery access captured. Physical observer/client inventory not confirmed; existing Unwind and Follow me preserved. |
| P02 | Automated PASS; backend readiness BLOCKED | Current live `house_moods` lacks `apply_mode` and `mode_control`; three legacy mode automations remain enabled. New coordinated backend is not deployed. Existing active session must be safely preserved/restored before any migration. |
| P03 | Deployment PASS; authenticated acceptance BLOCKED | Trial files/hash/old-dashboard checks passed. Live browser requires user login; authenticated dashboard interaction not completed. |
| U01–U05 | BLOCKED | No authenticated live browser session; actual Fire/iPhone access unconfirmed. HTTP reachability is not interaction acceptance. |
| L01–L07 | BLOCKED | Dashboard UI paths not exercised live. Kitchen API probe is supplemental only; group scope, capability UI, gesture/race behavior and physical light response remain untested live. |
| B01–B06 | BLOCKED | UI login and physical blind observer unavailable/unconfirmed. No blind movement or Stop issued. |
| S01–S09 | BLOCKED | UI login plus controlled audible test window/physical observer needed. Existing music group, unequal original volumes and Follow me left intact. |
| M01–M11 | BLOCKED | Coordinated backend absent and existing active household mood must retain its baseline/journal. No mood activation/end/switch, motion trigger, mode transition or restart test executed. |
| W01–W03 | BLOCKED UI; supplemental API PASS | Forecast retrieval works; live location display, icon/column rendering, switching and reconnect still require authenticated UI. |
| A01–A02 | BLOCKED | Live attention/appliance UI and natural episode transitions unobserved. No appliance cycle started and no real reminder dismissed for testing. |
| T01 | BLOCKED UI/physical; supplemental API + HA PASS | Office single-step/restoration verified through API. Remaining thermostat UI, disabled states and physical heating not certified. |
| V01 | BLOCKED | No live vacuum UI session or physical observer; no cleaning/motion command issued. |
| R01–R06 | BLOCKED | Authenticated client fault/reconnect sequence not available. API validation/recovery probe does not cover UI timeout, partial-failure feedback, offline queues or suspend/wake. |
| Actual Fire/iPhone matrix | BLOCKED | Actual device/browser/viewport, touch, orientation, sleep/wake and accessibility checks not performed. Desktop emulation cannot certify them. |
| Cleanup | Scoped HA PASS | Final read-only capture confirms kitchen On at brightness 255, office Heat at target 20°C, Day on/Night off, Follow me on and the original active Unwind session unchanged. Only probe changes were restored. No claim of household-wide physical verification. |
| Rollback exercise | NOT RUN | Existing fallback remains unchanged and deployment verification passed; rollback command was not exercised during this release. |

## Remaining acceptance work

1. Sign into the live trial with the normal HA login flow, then execute navigation/read-only checks and reversible UI actions from the plan.
2. Complete actual Fire landscape and iPhone touch checks, with physical observation for illumination, speaker handoff/audibility and blinds Stop. Record each actual result and restore changed baseline values.
3. Plan and execute the coordinated backend rollout separately, preserving the current Unwind journal and safe restoration path, before mode/mood transition and restart acceptance.
4. Exercise client-only disconnect, pending-action reconnect and suspend/wake. Record genuine unavailable/failure cases where safely available; otherwise retain explicit blocked status alongside deterministic regression evidence.

This release is an accessible deployed **trial**, not a hardware-certified production acceptance. No unsafe device outcome was observed in the limited API probes, but full interaction reliability and physical recovery are not established by those probes.
