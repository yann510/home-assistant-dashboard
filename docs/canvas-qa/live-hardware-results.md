# Canvas live trial results — September 26, 2026

**Frontend deployed; authenticated live UI testing is underway. Full physical acceptance remains incomplete.** Tests below follow [the live hardware plan](live-hardware-test-plan.md). Direct API probes are supplemental evidence, not substitutes for dashboard interactions or observation of physical devices.

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

## Initial deployment coverage and blockers

This table records the first session before authentication. The continuation below supersedes its login/session blockers for the cases explicitly exercised; unexecuted portions remain open.

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

## Authenticated continuation — September 26, 2026

The user signed into the live browser and explicitly authorized stopping the existing mood. Root executed the deployed dashboard UI; an independent reviewer used read-only HA snapshots. These are desktop browser interactions with real HA entities, **not physical Fire/iPhone or audible/visible device certification**. No backend upgrade has occurred in this continuation.

| Plan IDs / scoped check | UI + HA result | Evidence and remaining coverage |
|---|---|---|
| P03 / U01, authenticated load | Scoped PASS | Signed-in deployed trial freshly reloaded and latest bundle verified. Actual physical-client matrix remains unexecuted. |
| Existing mood End and cleanup | Scoped PASS | Authorized End returned `sensor.house_mood` to idle/success with no errors. Independent snapshot at 21:06:18 UTC: Follow me off, living-room LED off, four standalone speakers, living/bathroom/bedroom/gym volumes 33/18/20/14%. Journal stopped playback normalizes to HA paused/idle. Native neon scene and physical restoration are not independently certified. This is End-only evidence, not M01–M11 completion. |
| L01 / L03, kitchen room power | Scoped PASS | Selected kitchen using room tiles, toggled off then on. All-off brightness disabled correctly. Whole-house lights-off and other rooms remain unexecuted. |
| L02, kitchen brightness | Partial | UI 100% → 99% → 100%, baseline restored. A one-light room does not cover mixed on/off membership, quantization across devices or unavailable members. |
| L04, supported settings | Partial UI PASS | Kitchen offered Brightness only; Office offered Brightness/Warmth. No unsupported Warmth shown in the inspected brightness-only light. Other capability classes and property writes remain unexecuted. |
| S01, favourites inspection | Scoped UI PASS | Seven actual artwork favourites loaded. No replacement favourite playback issued during this check; selection/animation/transport cases remain open. |
| S04 / S05, immediate group and coordinator transfer | Partial UI + HA PASS | Joined bathroom, removed living coordinator, observed paused transfer to bathroom. Rejoined living after explicit Replace audio confirmation, removed bathroom and transferred back. Final four standalone groups confirmed. No Apply state. Playing transfer, three-survivor topology, post-transfer seeking and physical audibility remain untested. |
| S06, equal group volume | Scoped UI + HA PASS | Living/bathroom group both reported 12% following UI group control; independent evidence `group-volume-live.json`. Restored living to33% through UI and bathroom to18% through API cleanup. Other members/nonmember targeting and audible level remain untested. |
| S08, conflicting source confirmation | Partial UI PASS | Explicit Replace audio confirmation appeared and was accepted during controlled paused transfer. Cancel and competing actively playing streams were not tested. |
| W01 / W02, weather | Scoped UI PASS | Hourly12 and daily6 rows loaded, Verdun location and wind/precipitation units correct. No physical touch, reconnect or natural forecast rollover evidence. |
| U03, device search | Scoped UI PASS | All devices search `  THERMOSTAT  ` returned the four expected entries, exercising whitespace and case handling. Other filters and physical keyboard interaction remain untested. |
| T01, office thermostat | Scoped UI + HA PASS | UI decreased target20°C → 19.5°C, then restored20°C. Independent subsequent API read confirmed Heat/20°C. Other thermostats, extreme bounds and physical heating outcome remain untested. |
| U03, search recovery/back | Scoped UI PASS | No-match search showed Clear search; clearing recovered directory. Returning from thermostat details retained the search text and restored focus to its directory entry. |
| B01, blind selection only | Scoped UI PASS | Deselecting all three rooms disabled Open/Stop/Close; selecting all restored availability. No movement command issued. |
| A01, unavailable appliance | Partial UI PASS | Washer correctly reported Unavailable in both pulse and detail; dryer/dishwasher idle. No cycles started. |
| S02 / S03, playback and seek | Partial / unresolved | Living Room resumed at10% and track progress advanced; Pause returned to paused. ArrowRight seek was exercised. Home-to-zero appeared locally, but reload and independent HA read returned position10. Direct `media_seek(0)` returned200 yet HA still reported10 after1.2s. Paused seek confirmation therefore remains unresolved; no physical playback-position conclusion. Living volume restored33%, playback paused. |
| R01–R06, client faults | BLOCKED / NOT RUN | Available live browser tools do not expose client-only network interruption. No household network/server disruption attempted. Authentication now works, but deliberate expiry, pending-action interruption and recovery are not established. |
| Post-action cleanup comparison | Partial | Speaker groups, volumes and mute match post-End baseline; mood remains idle. Bathroom retained the transferred paused track at position0 rather than its prior idle/no-track state. Bedroom and closet were observed on at brightness0 versus off baseline. Root issued no bedroom commands; these concurrent changes are left intact rather than overwriting possible household/automation actions. Native neon state and physical outcomes remain unverified. |

Private evidence: `/tmp/canvas-live-qa/post-mood-baseline.json`, `group-volume-live.json`, and `after-ui-baseline.json`. The new post-End baseline is the reference for subsequent tests, rather than replaying the old active-mood state. No secret-bearing snapshots are committed. Final `authenticated-final.json` confirms kitchen On/255, office Heat/20°C, idle mood/no errors, living paused/33% and bathroom paused/18%. `authenticated-live.jpg` captures the deployed view. Live reload reconciled the reported position rather than retaining the optimistic seek draft.

## Remaining acceptance work

1. Continue remaining authenticated navigation and reversible UI cases; preserve scoped evidence above and explicitly mark unexecuted branches.
2. Complete actual Fire landscape and iPhone touch checks, with physical observation for illumination, speaker handoff/audibility and blinds Stop. Record each actual result and restore changed baseline values.
3. Plan and execute the coordinated backend rollout separately before mode/mood transition and restart acceptance. The original Unwind session has now ended successfully; retain its private journal as restoration evidence.
4. Exercise client-only disconnect, pending-action reconnect and suspend/wake. Record genuine unavailable/failure cases where safely available; otherwise retain explicit blocked status alongside deterministic regression evidence.

This release is an accessible deployed **trial**, not a hardware-certified production acceptance. No unsafe device outcome was observed in the limited API probes, but full interaction reliability and physical recovery are not established by those probes.
