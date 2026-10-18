# Spotify Connect and song heart — 2026-10-17

The speaker card now opens Yann's owned/followed Spotify library through
**Playlists** and reserves the song heart for saving/removing the identified
current song in **Liked Songs**. Playlist launches stage the exact context on
the private relay and transfer the verified Connect session to the selected
Sonos coordinator. Existing grouping, Sonos transport, per-room volumes and
Follow me remain available. Manual playlist launch releases only affected mood
playback ownership; House Mood presets retain their existing playback route.

Production release **`spotify-connect-20261018T013607Z-304a901`** is deployed and
verified, using reviewed source `304a901065a427efa88bb5282ed88813d22ffcaf`, pushed
to `origin/main`. This record includes controller-supplied household, browser,
test, served-file and remote-source evidence. The
[backend verification record](../../home-assistant/spotify-connect-verification.md)
contains the exact versions, service/permission boundaries, protected backup
paths, authorization and targeted rollback procedures. Checks recorded after
midnight UTC on October 18 are part of the October 17 Toronto work session.

## Tablet format and surrounding dashboard

Actual Fire HD 10 photographs establish iframe inner/document/visual viewport
**1224×614 CSS px**, visual scale **1**, DPR **1.5**, screen **1280×800**, landscape
primary. Photos include Silk's address bar, the Home Assistant sidebar and
Android navigation; the user's description as the HA app does not establish a
chrome-free fullscreen display. The temporary viewport probe loader is already
absent from production; its stale diagnostic HTML must not be restored.

The controller checked the actual HA dashboard in Chrome with its existing
trusted-network login. A collapsed-sidebar host at 1280×614 gave the embedded
production dashboard inner/client/visual 1224×614, scale 1, with DPR 1 emulation
and the 56 px surrounding HA sidebar. The loaded main JS was the new production
`assets/index-DciSzNpS.js`. This
matches the physical CSS dimensions while preserving the dashboard around the
music card. Supplemental fixtures used 1224×614, 375×812 and 960×540 at DPR 1.
These checks do not prove the new UI has rendered on the physical Fire.

The tablet music card retained its measured baseline: x=647.796875, y=150,
width=556.203125, height=232 CSS px, with no horizontal overflow. The existing
theme, artwork treatment, controls, typography and focus treatment remain in use.

| UI check | Observed result |
| --- | --- |
| Playlists loading, empty, errors and pagination | All seven real playlist titles/owners visible with valid artwork; existing sheet retained, with explicit further-page loading and retry |
| Sticky pending/error feedback | First and last items in a 56-item fixture kept feedback visible at Fire and phone sizes |
| Long names, missing artwork and short layout | Long-name/broken-art fallback inspected; empty 960×540 layout had no overflow |
| Song heart and error | 44 px control, visible nearby error at Fire and phone sizes; tablet card kept its 232 px height |
| Enabled/disabled/focus | Paused identified Connect track save worked in preview; TV source disabled; keyboard focus and particle cleanup inspected |
| Save/remove effects | Confirmed user save uses 420 ms pop/sparkles; removal uses 240 ms shrink/settle. Timing, reduced motion and stale-response behavior have unit coverage |
| Existing group/Follow controls | Available after heart saves in mocked integration checks; launch pending guards and topology changes covered by regressions |

## Household acceptance

The pinned live environment is SpotifyPlus 1.0.224 / spotifywebapipython 1.0.296,
HA 2026.9.3 / actual Core Python 3.14.6, HAOS 18.3 and Supervisor 2026.09.2 on
aarch64. The full backend was verified at `8f01e72`; the independently reviewed
gateway update at `6545cef` is installed. Configuration check and normal restart
passed, preserving paused Gym + Bedroom, Follow on/saved Gym source and baseline
volumes. Affected post-restart live checks passed as recorded below.

| Requirement | Evidence and limits |
| --- | --- |
| Fixed account and refresh | Human Desktop consent, canonical account/scopes, normal SDK Desktop refresh, relay restart and HA Core restart recovery passed. Read-only cache checks before restart and after ordinary actual activation confirmed automatic refresh from naturally expired to unexpired with refresh present, without a manual refresh call |
| Relay isolation | Local add-on 1.0.0, private paced PulseAudio null sink, UID/GID 1000 and zero capabilities; no privileged mode, physical/shared audio or device mappings. Boot/watchdog and stable name/Connect ID verified |
| Exact playlist launch | Fresh account/relay/context → explicit supported activation → explicit transfer → fresh native Sonos Connect plus cloud target/context/playing verified. First/second selected playlists, already-listed devices, identical duplicate request result and new-intent already-playing no-op passed |
| All four speakers and existing group | Gym cold start and later Living Room/Bathroom/Bedroom starts confirmed. Gym + Bedroom requested through the follower resolved Gym, preserving exact current-track identity, group and member volumes |
| Spotify phone and Jam | User: “yes I see it on my phone and jam works :D”. Controller accepted this and the physical Follow confirmation as the release gate. Detailed second-participant track addition before/after topology changes was not separately observed |
| Physical Follow me | Asked to resume Gym, start Jam, enable Follow, walk through mapped lit rooms, verify joins without Spotify/Jam interruption, then disable Follow leaving Gym playing. User: “yes all of this works this is awesome!!” |
| Transport and room volume | Actual Bedroom coordinator + Gym follower: pause/resume, one next, one previous, seek to 35 s and Gym volume .20 → .21 → .20 while Bedroom stayed .19 passed. Existing Sonos transport retained |
| Manual grouping and changed coordinator | Known-follower `getInfoError` fix has regression coverage and independent approval. After restart with cloud initially empty, Bedroom coordinator + Gym follower launch returned `confirmed` for Bedroom; restoring Gym coordinator + Bedroom returned `confirmed` for Gym. Exact `current_track` URI resolved for both |
| Manual launch during a mood | Active Gym mood → manual Spotify confirmed → End mood idle left manual session playing; relevant lighting/group/volumes/Follow restored |
| Real library pagination | Seven actual playlists, two owned/five followed; offsets 0/2/4/6 returned 2/2/2/1, preserving full-read URI order. All are public/noncollaborative; private/collaborative access has granted scopes and mock coverage only |
| Song save/remove | Paused exact-track WebSocket opposite-state write → direct provider confirmation → prior state restored. External provider change reconciled over WebSocket after 31 s, then restored. Track races have automated coverage |
| Failed launch/reconnection | Pending launch → browser reload produced one observed intent/unique request ID over 45 s and fresh Gym Connect/account/context/group/Follow confirmation. A production confirmation error recovered on explicit retry to Already playing without a new Spotify playback mutation; details below |

After production acceptance, a fresh snapshot confirmed Gym coordinator +
Bedroom group, volumes .20/.19, Follow on with saved Gym source and mood idle;
the source was restored paused after testing. Living Room and Bathroom were
idle after earlier transfers. The test changed playlist context and did not
restore the exact prior track/queue. This cleanup record does not promise
preservation of the prior test queue or an existing Jam across selecting a
different playlist.

## Automated verification and independent review

At final source `304a901`, the controller recorded **759 JavaScript tests in 48
files passing (15.20 s)**, lint, dashboard build (2.09 s) and whitespace checks
passing. The unchanged backend's 274 pure Python tests passed at `6545cef`
(3.314 s, one existing skip); eight unchanged relay unit tests passed separately.
Nine Python installer tests passed after the final installer fix. The existing
large-chunk build advisory remains. These runs are distinct from the 40 isolated
native HA tests that passed in 3.317 s on actual Core Python 3.14.6 at backend
`8f01e72`; those fake providers changed no household state. The newer gateway
passed affected live restart/reversed-group checks; this does not imply a newer
native test-suite run.

Task implementations received independent reviews. Fresh whole-branch review
raised four findings; fixes in `304a901` received one scoped independent rereview
confirming all four addressed and no new Critical or Important findings.

## Live reconnect and uncertain-confirmation recovery

The controller clicked a playlist and reloaded the browser during pending UI.
A 45-second HA `call_service` observer captured one dashboard intent and one
unique request ID. Fresh account/context/target evidence confirmed Gym Spotify
Connect with group and Follow preserved; the source was paused again afterward.

The first production click showed a generic Spotify confirmation error while
fresh cloud and native evidence showed the chosen context playing on Gym. The
exact failed provider read was not captured; neither a root cause nor provider
status is inferred. Explicit UI retry returned **Already playing** and closed
the chooser. Another 45-second HA bus observation captured one new dashboard
intent and zero Spotify context-play/activation/transfer mutations, demonstrating
reconciliation without restarting playback. This is real recoverable uncertainty,
not proof that every provider call succeeds. The fresh Gym + Bedroom / .20 + .19 /
Follow on + saved Gym / mood idle snapshot was preserved and source paused.

## Atomic production release

The final trial `spotify-connect-trial-20261018T013219Z-304a901` passed HTTP
verification of all **68 current local build files**, served manifest and bytes.
Its index SHA256 is
`b2918b9b0b066dbfbca5f9f4f452dc7434a629680c8a6e19233769b2e7b471b3`;
main JS is `assets/index-DHWcdo8A.js`.

Production `spotify-connect-20261018T013607Z-304a901` passed the same **68-file**
verification. Index SHA256 is
`84d0cd1aa68fa5e421784cb2124f81b602c700f88aa2ff127227edf2665a1d61`;
main JS `assets/index-DciSzNpS.js` has SHA256
`18bff94fc5f746d0f4d3b591818b2f23b89f0cb158d8b1164bbf9b75f2b27680`.
Ten deployed backend files match HEAD source hashes. Production browser checks
verified the new asset, real account/library and recoverable Connect session.

Released source `304a901065a427efa88bb5282ed88813d22ffcaf` was pushed normally to
`origin/main` as a fast-forward from `fd15ad5`, and `git ls-remote` returned that
exact SHA. Later documentation-only commits do not change the released runtime.
Unrelated changes in the original checkout were preserved.

Controller screenshots are retained under `backups.local/spotify-connect-qa/`:
`final-trial-live-playlists.jpg`, `final-fire-playlist-titles.jpg`,
`final-phone-last-row-feedback.jpg` and `production-confirmed-session.jpg`.
These browser captures supplement the earlier physical Fire measurements.

## Recorded limits and recovery

The controller accepted the user's general Jam and physical Follow confirmation
for release; detailed second-participant track addition was not separately
observed. Real private/collaborative playlist access remains **unverified**:
the seven actual playlists are all public/noncollaborative, with scopes and mock
coverage only for those other types. No sample was created. The release decision
retains these coverage limits.

The previous dashboard remains recoverable through `npm run rollback:dashboard`.
Backend/YAML/relay rollback uses the specific ownership-aware records in the
backend verification document and preserves unrelated integrations/accounts.
