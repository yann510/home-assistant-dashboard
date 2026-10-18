# Spotify Connect and song heart — 2026-10-17

The speaker card now opens Yann's owned/followed Spotify library through
**Playlists** and reserves the song heart for saving/removing the identified
current song in **Liked Songs**. Playlist launches stage the exact context on
the private relay and transfer the verified Connect session to the selected
Sonos coordinator. Existing grouping, Sonos transport, per-room volumes and
Follow me remain available. Manual playlist launch releases only affected mood
playback ownership; House Mood presets retain their existing playback route.

This record includes controller-supplied household, browser and test evidence
through the post-restart recheck of source `6545cef` and trial build `4ba7cfb`.
Final rollout remains in progress. The
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
dashboard inner/document/visual 1224×614, scale 1, with DPR 1 emulation. This
matches the physical CSS dimensions while preserving the dashboard around the
music card. Supplemental fixtures used 1224×614, 375×812 and 960×540 at DPR 1.
These checks do not prove the new UI has rendered on the physical Fire.

The tablet music card retained its measured baseline: x=647.796875, y=150,
width=556.203125, height=232 CSS px, with no horizontal overflow. The existing
theme, artwork treatment, controls, typography and focus treatment remain in use.

| UI check | Observed result |
| --- | --- |
| Playlists loading, empty, errors and pagination | Existing sheet retained; loaded choices remain available, with explicit further-page loading and retry |
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
| Spotify phone and Jam | User: “yes I see it on my phone and jam works :D”. Detailed second-participant track addition before/after topology changes was not separately reported |
| Physical Follow me | Asked to resume Gym, start Jam, enable Follow, walk through mapped lit rooms, verify joins without Spotify/Jam interruption, then disable Follow leaving Gym playing. User: “yes all of this works this is awesome!!” |
| Transport and room volume | Actual Bedroom coordinator + Gym follower: pause/resume, one next, one previous, seek to 35 s and Gym volume .20 → .21 → .20 while Bedroom stayed .19 passed. Existing Sonos transport retained |
| Manual grouping and changed coordinator | Known-follower `getInfoError` fix has regression coverage and independent approval. After restart with cloud initially empty, Bedroom coordinator + Gym follower launch returned `confirmed` for Bedroom; restoring Gym coordinator + Bedroom returned `confirmed` for Gym. Exact `current_track` URI resolved for both |
| Manual launch during a mood | Active Gym mood → manual Spotify confirmed → End mood idle left manual session playing; relevant lighting/group/volumes/Follow restored |
| Real library pagination | Seven actual playlists, two owned/five followed; offsets 0/2/4/6 returned 2/2/2/1, preserving full-read URI order. All are public/noncollaborative; private/collaborative access has granted scopes and mock coverage only |
| Song save/remove | Paused exact-track WebSocket opposite-state write → direct provider confirmation → prior state restored. External provider change reconciled over WebSocket after 31 s, then restored. Track races have automated coverage |
| Failed launch/reconnection | Automated regressions require a new explicit intent and prohibit automatic replay/local-queue fallback; final live failed-launch/disconnection check pending |

After post-restart acceptance, the controller restored Gym coordinator + Bedroom group,
Follow on with saved Gym source, baseline volumes and paused state; Living Room
and Bathroom were idle; cloud playing was false. The test changed playlist context and did not restore
the exact prior track/queue. This cleanup record does not promise preservation
of the prior test queue. Following the user's physical acceptance, further
household actions require a fresh snapshot of current state.

## Automated verification and independent review

At `6545cef`, the controller recorded 758 JavaScript tests in 48 files passing
(21.95 s), 274 pure Python tests passing (3.314 s, one existing skip), lint,
dashboard build and whitespace checks passing. Eight relay unit tests and seven
Python installer tests also passed. The existing large-chunk build advisory
remains. These runs are distinct from the 40 isolated native HA tests that
passed in 3.317 s on actual Core Python 3.14.6 at backend `8f01e72`; those fake
providers changed no household state. The newer gateway passed affected live
restart/reversed-group checks; this does not imply a newer native test-suite run.
The updated trial build at `4ba7cfb` also passed; publication remains pending.

Task implementations received independent reviews. The known-follower discovery
guard was independently approved at `6545cef`. Final whole-branch review is
pending and must include the approved specification, task reviews, deferred
acceptance items and current test evidence.

## Remaining acceptance and release gates

The gateway restart, reversed-group live recheck and automatic recovery after
natural expiry are passed. The controller still owns the final live
failed-launch/disconnection check, real private/collaborative playlist sample
and detailed second-participant Jam
track-add evidence. The broader human Jam/physical Follow confirmations above
are passed within their stated scope; they do not independently establish those
missing details.

Atomic trial/production publication, final served HTML/assets and release ID,
production account/library/control checks, final fetch/integration, push to
`origin/main` and remote HEAD verification remain pending. No future result is
recorded as passed. Keep the previous dashboard recoverable through
`npm run rollback:dashboard`; backend/YAML/relay rollback uses the specific
ownership-aware records in the backend verification document and preserves
unrelated integrations and account entries.
