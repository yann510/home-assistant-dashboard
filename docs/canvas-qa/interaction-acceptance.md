# Dashboard interaction acceptance — September 26, 2026

Local controlled preview only: `http://127.0.0.1:8773/dev/canvas-preview/index.html?view=canvas`. These checks use simulated HA entities; no physical device commands were sent. Read-only live automation and registry inspection informed the mode contract.

## Browser checks performed

| Scenario | Environment | Result/evidence |
|---|---|---|
| Normal, busy, offline, empty overview | 1024×600 landscape desktop browser | Captured [normal](interactions/tablet-normal.jpg), [busy](interactions/tablet-busy.jpg), [offline](interactions/tablet-offline.jpg), [empty](interactions/tablet-empty.jpg). After compact-fit correction, normal main597px and card bottom593px fit the600px viewport; action buttons remain44px and room tiles66px. |
| Normal, busy, offline, empty overview | 390×844 portrait desktop browser | Document width390px throughout; no horizontal page overflow. [Normal](interactions/phone-normal.jpg), [busy](interactions/phone-busy.jpg), [offline](interactions/phone-offline.jpg), [empty](interactions/phone-empty.jpg). |
| Custom room picker, ArrowDown/Enter | Tablet | Changed Living Room→Bedroom, selection reflected, focus returned to trigger. |
| Picker Escape | Phone | Closed listbox and returned focus to Lights room trigger. |
| Speakers Escape | Tablet | Closed dialog, focus returned to Open speakers. |
| Offline All devices→Weather→Back | Tablet | Detail access remained available, weather showed disconnected state, one dialog, focus returned to Weather directory entry. |
| Daily weather | Phone | All columns fit390px, no horizontal overflow, Verdun label. [Evidence](interactions/phone-weather-daily.jpg). |
| Unconfirmed room power | Phone and tablet | Pending shown within button, observed lights stay on, timeout shows2 lights need attention rather than success. [Phone](interactions/phone-unconfirmed.jpg), [tablet](interactions/tablet-unconfirmed.jpg). |
| Reload after unconfirmed action | Phone | Initial observed state restored with no pending UI; automated fixture tests separately assert no replay. |
| Individual off→room brightness | Tablet | Turned bulbs off, changed room slider to2%; LED strip remained on and bulbs remained off. |
| Night→Love→End | Tablet local simulator | Night remains selected throughout mood activation and after End. [Evidence](interactions/tablet-night-after-mood.jpg). Backend restoration is verified separately, not by this UI simulator. |
| Acknowledged Open | Tablet | No routine success rows; main remains597px after acknowledgement. Stop retains original targets. |

## Not yet certified

- Real Fire tablet touch behavior, installed browser/WebView compatibility, suspend/wake, and actual viewport. Desktop sizes are representative, not physical certification.
- Actual blind movement/Stop timing: Google Assistant text service supplies no position/motion telemetry. ACK must never be interpreted as physical stop.
- Real Sonos multi-room handoff and volume; live Night/mood orchestration after an explicit backend rollout.
- Supervised home test should record initial mode/lights/music, exercise one light and room brightness, two blind rooms and Stop, speaker transfer/volume, Night→mood→End, then restore the agreed initial state.

## Automated evidence

All final checks passed:
- Frontend: 466 tests across 35 files.
- Mood/backend: 148 tests; Home Assistant runtime: 32 tests.
- Attention: 37 tests; rollout helpers: 6 tests.
- Full ESLint, TypeScript, production Vite build and git whitespace checks. Build retains a non-blocking bundle-size warning.
- Independent reviews cleared interaction fixtures, lights/blinds, speaker topology, secondary controls, mode arbitration/restoration, and the accumulated frontend changes. The final off-state restoration patch has seven dedicated raw-storage regressions and independent review.

Test plan: [dashboard interaction testing](../superpowers/plans/2026-09-26-dashboard-interaction-testing.md).

## Implemented behavior and explicit limits

- Moods can overlay either steady Day or Night. Switching moods retains the original baseline; End restores still-owned settings while preserving manual changes.
- Starting/restoring/recovery phases reject conflicting mode commands rather than interrupting partially committed writes. A rejected manual or scheduled command needs a retry after the current operation settles.
- Blind Stop is immediate best effort, never queued behind an acknowledgement. The latest movement targets remain available for 90 seconds; this is operational memory, not motion telemetry. Provider execution order still needs hardware acceptance.
- Group volume uses one absolute level for the currently confirmed members at dispatch. Manual speaker selection disables Follow me so automation does not undo it.
- For mapped Tuya lights previously off, hidden raw brightness cannot be read from HA. If a mood changed brightness and still owns the light, End first confirms power off, then restores the captured Day/Night default only if that mode is unchanged. An unseen custom pre-mood setting therefore returns to the mode default, not an exact raw snapshot. Manual overrides are preserved. Failed staging remains recoverable across restart. Older sessions without this metadata cannot restage it.
- Backend coordinated modes remain opt-in and require legacy competing automations to be disabled. See [rollout instructions](../../home-assistant/rollout/coordinated-modes.md). No backend rollout or physical test was performed.
- Existing authorized Canvas UI iterations were preserved and reviewed together with these fixes. Agent reuse was necessary because of the execution-slot limit; each implementation still received a separate review.
