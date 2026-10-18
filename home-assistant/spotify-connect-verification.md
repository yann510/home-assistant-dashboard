# Spotify Connect implementation verification — 2026-10-17

Current status: **Released and verified**, with the evidence limits below.
Production release `spotify-connect-20261018T013607Z-304a901` serves the reviewed
source `304a901065a427efa88bb5282ed88813d22ffcaf`, pushed to `origin/main` and
independently checked against served bytes. The relay-backed launch, fixed
account, phone control/Jam, library save/remove, physical Follow me, refresh and
recoverable reconnect/uncertain launch paths have live evidence. Real
private/collaborative playlists were unavailable in this account, and detailed
second-participant track addition was not separately observed. The controller
accepted the user's general Jam/physical Follow confirmation as the release
gate and released with those stated limits. Earlier pending rollout statuses
are superseded here.

## Current acceptance evidence

| Requirement | Status | Evidence / remaining check |
| --- | --- | --- |
| Pinned runtime, installed integration and fixed account | PASS | SpotifyPlus 1.0.224 / spotifywebapipython 1.0.296 on actual HA Core Python 3.14.6; registry/profile/config-entry identity and granted scopes match Yann's account |
| Desktop consent and normal refresh | PASS | Human Desktop consent completed for the canonical account; pinned SDK normal Desktop refresh succeeded |
| Relay isolation and restart recovery | PASS | Private paced PulseAudio null sink, UID/GID 1000, zero capabilities, no privileged/device/physical audio access; automatic boot/watchdog; relay restart and HA Core restart recovery succeeded |
| Exact playlist/account/relay to native Sonos Connect | PASS | Fresh account/relay/context/playing, explicit supported Zeroconf activation and transfer, then fresh native Sonos Connect plus cloud target/context/playing confirmation; first/second playlists and repeated launches to already-listed devices succeeded |
| Request identity and already-playing no-op | PASS | Duplicate request ID returned the identical result; new intent for the confirmed same context returned `already_playing` |
| Existing group and requested follower | PASS | Gym + Bedroom launch requested through the follower resolved Gym; exact current track, group, and individual volumes were preserved. Living Room, Bathroom and Bedroom cold starts subsequently confirmed, supplementing prior Gym confirmation. After the reviewed gateway update/restart, a fresh empty-cloud session launched with Bedroom coordinator + Gym follower, then with Gym coordinator + Bedroom; both returned `confirmed` for the actual coordinator |
| Spotify phone output, queue/control and Jam | PASS, scoped | User: “yes I see it on my phone and jam works :D”. The controller accepted this and the physical Follow confirmation as the release gate. A second participant adding a track before/after topology changes was not separately observed |
| Physical Follow me on/off with Spotify/Jam | PASS | User was asked to resume Gym, start Jam, enable Follow, walk through mapped lit rooms, verify joins without Spotify/Jam interruption, and disable Follow while Gym keeps playing. User confirmed: “yes all of this works this is awesome!!” |
| Native Sonos transport/seek/room volume | PASS, scoped | Actual Bedroom coordinator + Gym follower Connect/cloud: pause/resume, one next, one previous returning the prior track, seek to 35 s confirmed by cloud at 34–42 s, Gym volume .20 → .21 → .20 while Bedroom stayed .19. Sonos transport is retained |
| Manual grouping/ungrouping and reversed coordinator | PASS, scoped | Known-follower placeholder fix independently approved and verified live after configuration check/restart. Reversed Bedroom + Gym and restored Gym + Bedroom launches each confirmed the correct coordinator; `current_track` resolved an exact URI for both. Baseline groups/volumes/Follow on with saved Gym source were restored, then source paused and cloud playing false. Human general Jam/Follow evidence is recorded separately; detailed second-participant addition was not separately observed |
| Manual launch supersedes mood playback | PASS | Gym mood active → manual Spotify `confirmed` → End mood idle left manual session playing; relevant lighting/group/volume/Follow state restored |
| Playlist listing and pagination | PASS | Seven real playlists, two owned/five followed; offsets 0/2/4/6 returned 2/2/2/1 and preserved full-read URI order |
| Private/collaborative real playlists | UNVERIFIED on real account | Required scopes and mock coverage exist; all seven actual playlists are public/noncollaborative. No real sample was created; the controller released with this documented coverage limit |
| Save/remove and external saved-state reconciliation | PASS, scoped | Paused Connect exact-track WebSocket write to opposite state → direct provider check → prior state restored; external provider change reconciled through WebSocket after 31 seconds, then restored. Track races and pending/error behavior have automated coverage |
| Failed launch/disconnection recovery | PASS, scoped | Pending UI launch followed by browser reload produced exactly one observed dashboard intent/unique request ID over 45 s, with fresh account/context/Gym Connect/group/Follow confirmation. A production confirmation error recovered through explicit retry to `already_playing`, with no new context-play/activation/transfer mutations over a second 45 s observation; detailed evidence below |
| Natural authorization expiry recovery | PASS | Read-only inspection before restart found the Desktop cache naturally expired with refresh present (`expiresAt=1792286211`). After ordinary actual playback activation, without a manual refresh call, inspection found it unexpired (`expiresAt=1792290049`) with refresh present. Fresh launch confirmation establishes automatic recovery after natural expiry |
| Actual Fire viewport | PASS | Physical photographs establish dashboard iframe inner/document/visual 1224×614 CSS px, visual scale 1, DPR 1.5; screen 1280×800 landscape-primary |
| Responsive states | PASS, browser scope | Actual production HA host at 1280×614 with 56 px sidebar yields iframe inner/client/visual 1224×614, scale 1, DPR 1 emulation and no overflow. All seven real playlist titles/owners with valid artwork are visible; fixtures cover 375×812 and 960×540. New UI has not been observed on the physical Fire |
| Trial/production release and released source on remote main | PASS | Final atomic trial and production releases each matched all 68 current local build files, manifest and served bytes; ten deployed backend files match HEAD source hashes. Released source `304a901065a427efa88bb5282ed88813d22ffcaf` pushed by normal fast-forward and exact `git ls-remote` verification. Later documentation-only commits do not alter released runtime |

The Fire photos include a Silk address bar, HA sidebar and Android navigation.
The user calls this the HA app; this is not evidence of a chrome-free fullscreen
viewport. The measured music card remains x=647.796875, y=150,
width=556.203125, height=232 CSS px. Existing controller preview evidence includes
no tablet overflow, 44 px heart, visible Fire/phone error, paused Connect save,
TV-disabled heart, and grouping/Follow remaining available after heart save.
Sticky playlist feedback stayed visible for both first and last items in a
56-item fixture during pending/error states at 1224×614 and 375×812. All seven
real playlist titles/owners remain visible with valid artwork. The empty
960×540 state, broken-art fallback and long names were inspected without overflow.
The 44 px heart's focus, paused save, TV-disabled state, visible error and particle
cleanup were checked in the browser. Animation timings (save 420 ms/remove 240 ms),
reduced motion, pending races and stale heart responses have unit coverage.
Simulated viewports supplement the physical measurement; they are not physical
Fire proof. See [dated UI and acceptance QA](../docs/canvas-qa/spotify-connect-2026-10-17.md).

## Current installation and protected recovery records

The full live backend was verified at commit `8f01e72`. The reviewed gateway
update from `6545cef` was subsequently copied to HA, SHA256
`a680b92a4534df39579318882e9b755471d7941247185ba4fcccc34f80bacb91`;
configuration check and normal HA Core restart passed, preserving the paused
Gym + Bedroom group, Follow on/saved Gym source and baseline volumes. Fresh
post-restart reversed-group and restored-group launches passed; this supersedes
the earlier pending gateway recheck. Frontend or documentation changes do not
imply a newer household dashboard deployment.
Final release and source verification are recorded below. After the latest
production/reconnect checks, a fresh snapshot confirmed Gym coordinator +
Bedroom group, Follow on with saved Gym source, Gym .20 / Bedroom .19, mood idle
and paused source; the controller restored that paused state after testing.
Living Room/Bathroom were idle after transfer. The prior track/queue was not
restored; no exact prior-track or queue-restoration claim is made.

- Backend runtime backup: `/homeassistant/backups.local/dashboard-music-runtime-20261018T004733191Z`.
- Owned component YAML backup: `/homeassistant/backups.local/dashboard-music-20261018T004745349110Z`.
- Gateway update backup: `/homeassistant/backups.local/dashboard-music-gateway-20261018T011727616Z`.
- Relay installation backup: `/homeassistant/backups.local/dashboard-spotify-relay-20261018T002244009423Z`.
- Relay credential merge backup: `/homeassistant/backups.local/spotify-relay-credentials-20261018T002705Z`.
- Relay add-on `local_dashboard_spotify_relay`, version 1.0.0; stable name `Dashboard Relay d41bd14b`, configured Connect ID `ccd3841721c7b3bc03a5859311f40e34975b3817`.
- Relay durable credential file `/data/credentials/credentials.json` is mode 0600; bootstrap credential is absent. It is deliberately outside the upstream anonymous `/data/cache` volume. The separately merged SpotifyPlus store is `/config/.storage/SpotifyWebApiPython_librespot_credentials.json` inside HA Core (`/homeassistant/.storage/SpotifyWebApiPython_librespot_credentials.json` through SSH); unrelated account entries were preserved. Desktop token cache `/config/.storage/spotifyplus_tokens.json` is mode 0600. Other component files and unrelated shared integration storage remain untouched.

Credentials stay in ignored private tooling and HA/integration storage. They do
not belong in source, build variables, logs, screenshots, reports or Git. Consent
requires human interaction; token presence alone never proves matching account
or valid Desktop authorization. Review current ownership before targeted rollback;
never restore shared `.storage` snapshots over other integrations.

## Observed environment and selected release

- Home Assistant Core **2026.9.3**, Python **3.14.6**, HA OS 18.3, aarch64 Raspberry Pi 4. Core Python comes from the initial `system_health/info` websocket event, not the SSH add-on (Python 3.14.7).
- Existing HACS 2.0.5, Sonos, standard Spotify, and read-only `dashboard_spotify` are retained. SpotifyPlus was absent before this task.
- HACS repository `thlucas1/homeassistantcomponent_spotifyplus`, repository ID `763230666`, downloaded release **v1.0.224**. HACS writes `v1.0.224` into the installed manifest; the release source says `1.0.224`. Both identify the same pin.
- [Release v1.0.224](https://github.com/thlucas1/homeassistantcomponent_spotifyplus/releases/tag/v1.0.224), dated 2026-10-08. Published zip SHA256: `0007ba680ff45c8b191d6e09bb10703c99c1e60afd184e78b526c93ab88dc820` (upstream GitHub release metadata; downloaded by HACS, not independently hash-verified here).
- [Pinned manifest](https://github.com/thlucas1/homeassistantcomponent_spotifyplus/blob/v1.0.224/custom_components/spotifyplus/manifest.json): `numpy>=2.3.2`, `oauthlib>=3.2.2`, `platformdirs>=4.1.0`, `requests_oauthlib>=1.3.1`, `smartinspectpython>=3.0.38`, `spotifywebapipython>=1.0.296`. These are upstream lower bounds, not a fully locked Python environment. Later read-only inspection of HA Core's installed metadata confirmed `spotifywebapipython==1.0.296`; the five reviewed auth source files matched the private local pinned venv byte-for-byte.
- HACS metadata minimum HA 2023.8.0; [spotifywebapipython 1.0.296 metadata](https://pypi.org/project/spotifywebapipython/1.0.296/) requires Python >=3.11.0. The observed runtime satisfies these stated minima; the HA configuration flow completed dependency import and live read services worked. The package was subsequently verified inside HA Core's container as 1.0.296.

## Safe installer usage

Run from the repository. Credentials are read directly from the existing checkout's ignored `.env`; do not copy that file into the worktree or print it.

```sh
node --dns-result-order=ipv4first scripts/configure-dashboard-music.mjs --env /Users/yann510/github/home-assistant-dashboard/.env
node --dns-result-order=ipv4first scripts/configure-dashboard-music.mjs --env /Users/yann510/github/home-assistant-dashboard/.env --install
node --dns-result-order=ipv4first scripts/configure-dashboard-music.mjs --env /Users/yann510/github/home-assistant-dashboard/.env --rollback /homeassistant/backups.local/dashboard-music-20261017T170231376043Z
```

Default inspection reads runtime, integrations, installed manifest, token-presence boolean, and registered service schemas. It never installs or changes configuration. It deliberately does not infer valid Desktop authorization or matching account from a token file's existence; `ready:false` remains until authorization/account evidence is independently established. `validatePreflight(report)` is the pure guard for a verified report. Installation checks runtime, backs up first, downloads the pinned release via HACS, and verifies its manifest. It does not initiate playback or silently restart HA.

Original protected preinstallation backup: `/homeassistant/backups.local/dashboard-music-20261017T170231376043Z`. Directory mode 0700, credential-bearing snapshots mode 0600. Contains prior `core.config_entries`, `application_credentials`, HACS data/repositories, and task manifest. No prior SpotifyPlus directory/token file existed. A second diagnostic retry backup, `/homeassistant/backups.local/dashboard-music-20261017T170243989232Z`, already contains the new integration; use the original when reverting this installation. The first run downloaded correctly but stopped at the `v` prefix comparison; the comparison now has a regression test.

New installations record `installed-artifact.json` beside the backup: the actual installed manifest version plus a SHA256 fingerprint of component paths, file contents, and symlink targets (excluding generated Python bytecode). Automatic rollback requires that ownership record, unchanged installed files, and matching current HACS version before issuing any removal/downgrade. Newer versions, same-version edits, missing files, missing HACS ownership, and older backups without an installation record are refused without destructive commands. **The pre-fix backups above have no ownership record and now require manual review; do not rerun installation merely to adopt the current state.**

Rollback uses the specific task backup, HACS operations, and only the SpotifyPlus integration directory. It also removes a custom HACS repository registration only when this task added it. It never restores all shared `.storage` files over other integrations' settings. If SpotifyPlus is configured, remove only this task's new SpotifyPlus config entry through HA first; the script refuses to remove entries automatically. Settings subsequently added through interactive setup (e.g. a task-created SpotifyPlus application credential) must be removed through HA individually if abandoning setup. Keep the original shared snapshots only for manual recovery, not blanket restore. Existing standard Spotify and catalog-read integrations must remain.

`.local` DNS returned unreachable IPv6 addresses to some local Node versions after restart. Explicit IPv4 ordering restored HTTP 200; this was local tooling behavior, not evidence of a failed HA restart. Core's dependency setup reported `Attempting install of spotifywebapipython>=1.0.296` at 13:04:46 local; do not restart or duplicate config flows while dependency installation is running.

## Authorization and verified provider boundary

HA OAuth uses the separate application credential **Dashboard SpotifyPlus
(existing Spotify developer app)** and entity
`media_player.spotifyplus_yann_luche_thibodeau`. The profile matches the entity's
`sp_user_id` and the standard Spotify entry's canonical account ID; Premium and
actually granted scopes were verified. Required scopes include
`playlist-read-private`, `playlist-read-collaborative`, `user-library-read`,
`user-library-modify` and SpotifyPlus's playback/profile scopes. Existing standard
Spotify, Sonos and catalog-read integrations remain installed.

The separate [Spotify Desktop authorization](https://github.com/thlucas1/homeassistantcomponent_spotifyplus/wiki/Device-Configuration-Options#spotify-desktop-player-authentication-configuration)
is complete. The reviewed generator v1.2 uses `http://127.0.0.1:4381/login`, the
built-in Desktop client and `streaming` scope. The wiki's developer-app
`http://127.0.0.1:8080/` example is distinct. The private pinned setup venv is
`/Users/yann510/.codex/spotify-connect-auth.local/venv` with
`spotifywebapipython==1.0.296` and `lxml`; it is not a source artifact. Desktop
tokens were backed up and merged privately, preserving other account cache
entries. `device_loginid` uses the verified canonical account. The supported
Sonos `authorization_code` activation path succeeded with an empty password;
this is observed behavior for this pinned target/path, not a general guarantee
for other authentication branches.

All SpotifyPlus services select the fixed account by `entity_id`. REST
response-capable calls return
`{changed_states, service_response: {user_profile, result}}`; HA WebSocket service
responses use `{context, response}`. Required response services use
`return_response:true`. Never log a full profile response: it contains email.
Extract and verify account identity on the server.

| Service | Verified use |
| --- | --- |
| `get_playlist_favorites` | Explicit `limit`, slot `offset`, `sort_result:false`; current-account `/me/playlists` order |
| `get_spotify_connect_devices` | `refresh:true`; PascalCase `Items` discovery records; registry RINCON and fresh native get-info establish Sonos identity |
| `get_player_playback_state` | Fresh account/device/context/item/playing evidence; initial non-Connect Sonos music was correctly not treated as a Connect session |
| `zeroconf_device_getinfo` / `zeroconf_device_connect` | Fresh native identity and explicit Sonos activation; connect requires `return_response:true` |
| `player_media_play_context` | Exact playlist URI and explicit relay device only; no Sonos context-play fallback |
| `player_transfer_playback` | Explicit Sonos target and relay-from ID; command acknowledgement alone does not confirm playback |
| `check_track_favorites` / `save_track_favorites` / `remove_track_favorites` | Always explicit captured exact track ID; write followed by confirmed read-back |

The pinned 1.0.296 source implements track check via GET
`/me/library/contains?uris=...`, save via PUT `/me/library?uris=...`, and removal
via DELETE `/me/library?uris=...`; live check/save/remove succeeded. Do not use
`get_playlists_for_user` as the default: it delegates to deprecated
`/users/{id}/playlists`. `get_playlist_favorites` uses current-account
`/me/playlists`. Discovery `DeviceInfo.DeviceId` is a Spotify Connect hash,
not the stable Sonos RINCON identifier; names/group suffixes are not permanent IDs.

## Physical viewport probe removal

The temporary production `dashboard-viewport-probe-loader` is already absent.
Do not restore its stale original HTML. The read-only probe sent no telemetry.
Its historical backup is
`/homeassistant/backups.local/dashboard-viewport-probe-20261017T130220`;
before-index SHA256
`15af06773fe05cd4b3c6d9bff537cdefb09310bf6698ed54c3d2904b3772212e`,
after-probe SHA256
`155a2baf6ecb06a42426bfcc9374c4eaee500e17e3f10106fb0bb8fc7581615f`.
These are diagnostic historical hashes, not the final dashboard release hashes.
A standalone diagnostic page cannot establish the embedded iframe viewport.

## Fixed-account library component

`custom_components/dashboard_music` exposes authenticated WebSocket commands
`dashboard_music/playlists`, `dashboard_music/track_saved`, and
`dashboard_music/set_track_saved`. Configuration selects one SpotifyPlus entity;
there is no client account selector. The component derives and pins the canonical
account from that entity's registry/config entry, checks the existing SpotifyPlus
runtime profile and granted library scopes, and validates response profile IDs.
Only playlist URI/title/owner/artwork and confirmed track-save booleans reach the
socket. A user needs account-entity read permission for reads and both read and
control permission for saves. Playlist reads do not depend on Sonos availability.

The library uses the verified `get_playlist_favorites` service with
`sort_result:false`, preserving slot offsets across null entries and duplicate
titles. The pinned SpotifyPlus service schema caps offsets at **10000**. The
public request validator accepts 0–100000, but an offset above the upstream cap
returns an explicit `unavailable` error before a provider call. Previous pages and
the next cursor remain available; a large library is never declared complete at
that limit. Membership checks refresh from offset zero and scan no more than 200
pages or 30 seconds before explicitly rejecting an unestablished membership.

Playlist pages stay fresh for 60 seconds (at most 200 cached pages); track saves
stay fresh for 30 seconds (at most 500 tracks). Each track's writes and read-back
are serialized, with actual returned state used even if a save did not take
hold. Provider calls time out after 12 seconds, and provider rate limits retain
a shared account cooldown with `Retry-After` clamped to 1–300 seconds. An upstream
executor operation may still finish after a caller timeout. The gateway retains
that operation and rejects same-track reads or writes while it remains pending,
including cached confirmations. After settlement, a fresh read establishes state
before another mutation or confirmation. Retained operations are bounded at eight
per account, with at most 500 uncertain tracks awaiting reconciliation; excess
mutations fail before provider dispatch. This component does not retry writes.

After separately copying the component code, explicit library-only YAML setup is:

```sh
node scripts/configure-dashboard-music.mjs --env /absolute/path/to/.env --configure-component media_player.spotifyplus_yann_luche_thibodeau
```

This mode performs its own read-only registry/config-entry/provider account and
scope verification; Desktop consent is a separate playback gate. It refuses a
pre-existing `dashboard_music` stanza, backs up `configuration.yaml` under a
protected task directory, then appends an owned stanza with only
`spotifyplus_entity` and the four existing `speakers`. Review/check HA
configuration before restarting; configuration preparation does not demonstrate
Connect or Jam readiness. To undo only that exact unchanged stanza:

```sh
node scripts/configure-dashboard-music.mjs --env /absolute/path/to/.env --rollback-component /homeassistant/backups.local/dashboard-music-YYYYMMDDTHHMMSSffffffZ
```

Rollback preserves surrounding and later YAML changes and refuses a modified or
missing owned block. Existing SpotifyPlus installation ownership/rollback guards
are unchanged. These installer guards describe configuration ownership; current live component,
playback, and save/remove results are recorded in the acceptance matrix above.

## Relay playback backend contract

`dashboard_music.play_spotify` is a response-only HA service accepting exactly
`playlist_uri`, `source_entity`, and `request_id`. Identity comes from the HA
caller context. It requires account and affected-speaker read/control permission,
resolves the actual Sonos coordinator (including the saved Follow me source),
and validates the full reported group graph. Completed results are retained for
five minutes, account/user bound, up to 128 requests. A different simultaneous
request returns busy; it is never queued for later playback. The response deadline
is 30 seconds. A timeout or disconnect retains delegated effects and the account
and manual-mood guards until the actual services settle, with no late handoff or
automatic replay after that request has ended.

The backend-only optional `relay_device_id` is the relay's exact 40-character
Connect ID. Library and save operations remain usable without it. The owned YAML
installer accepts `--configure-component ENTITY --relay-device HEX40`, includes
the relay in its initial backed-up stanza, and fingerprints that exact block for
rollback. Clients cannot choose an account, relay, device ID, or host address.

The supported pinned route starts the exact context only on that freshly verified,
unrestricted, non-Sonos relay listed for the configured account. After fresh relay
account/device/context/playing confirmation, it calls `zeroconf_device_connect`
on the registry-RINCON-matched Sonos discovery endpoint with
`verify_device_list_entry:false`, `pre_disconnect:false`, fixed verified account
username/loginid, and an empty password for the verified `authorization_code`
token type. This service requires `return_response:true`; its account-verified
acknowledgment is not playback confirmation. It then calls
`player_transfer_playback` with explicit target and relay-from IDs, `play:true`,
`delay:0.5`, and `force_activate_device:true`, without requesting a response.
That last flag does not replace the preceding unconditional Zeroconf activation.
No context-play call ever targets Sonos, and no Sonos local-queue fallback exists.

Confirmation combines fresh account/context/playing evidence with actual native
Sonos `Spotify Connect` state and unchanged coordinator, group, and Follow me
snapshot. `get_spotify_connect_devices(refresh:true)` refreshes dynamic cloud
discovery; it does not re-probe every cached LAN `DeviceInfo`. SpotifyPlus may
also normalize a restricted cloud device's absent ID by cached display name.
The adapter never presents that value as a raw Spotify ID: it additionally calls
the supported read-only `zeroconf_device_getinfo` service for currently discovered
Sonos coordinators, concurrently at most four and within a bounded read deadline.
Each response must match the exact discovered Connect ID and the target's stable
Sonos registry RINCON identity. Actual native remote names and aliases must be
unique against the other outputs and non-Sonos discovery aliases. Thus a restricted
group named `Gym + 1` can be positively identified from its fresh native name;
the adapter never constructs that suffix. Known HA followers are excluded before
probing because their Connect endpoint can be disabled while stale discovery still
lists them. The live reversed group also produced a `getInfoError` / status
9999 / `IsSonos:false` discovery placeholder for the known Gym follower. Local
regressions now cover that exact shape: exclusion requires matching discovery
Name/Key/RemoteName, one stable registry RINCON match, no duplicate discovery
identity, and fresh complete consistent HA topology proving it is a follower.
Coordinator, unknown, ambiguous, malformed and inconsistent-topology placeholders
remain errors. Independent task review approved this narrow fix; the reviewed
gateway passed configuration check/restart and live reversed-group recheck.
Starting from an empty cloud session after restart, `play_spotify` confirmed
Bedroom coordinator + Gym follower; after restoring the group it confirmed Gym
coordinator + Bedroom. Exact current-track reads resolved correctly for both.
Unknown speakers, changed identities, missing evidence, and ambiguous names fail
closed.

`dashboard_music/current_track` is an authenticated read-only WebSocket command
accepting `{source_entity}` and returning
`{source_entity: resolvedCoordinator, track_uri: exactSpotifyTrackUriOrNull}`.
It requires account and group read permission but no relay configuration. Fresh
account/device identity, native `Spotify Connect` source, playing/paused state,
and a valid non-local track item are required. TV, local queues, episodes,
unrelated active devices, and changed source/topology never supply a guessed URI.
This supports the real `x-sonos-vli` session-wrapper content ID, which contains no
exact track URI. It makes no playback or library mutation.

Manual launch durably releases only mood playback ownership in the affected group,
including a mood-owned follower whose stop command would forward to its coordinator.
New mood activation, End, retry, and mode restoration return busy during delegated
manual playback. The long network transaction does not hold the mood engine lock:
Follow me motion joins, light-off departures, and observations remain available.
The short lock is used for earlier-effect settlement and durable ownership release.
Persistence failure prevents launch; caller timeout does not pretend an older
executor command stopped. Existing mood presets keep their existing playback route.

Pure tests cover service payloads, identity drift/ambiguity, grouped missing IDs,
true executor lifetimes, request races, affected-control ownership, Follow me,
and the current-track permission/source boundary. `tests_ha/test_dashboard_music_setup.py`
adds isolated real-HA registration/schema/context tests. Actual household release
and final acceptance evidence is recorded separately by the rollout controller;
the backend author's tests do not stand in for those checks.

## Automated verification and limits

Controller evidence before this task: `ha core check` passed; **40 isolated native
HA tests passed in 3.317s** on actual Core Python 3.14.6 at backend `8f01e72`.
Those tests used fake providers and changed no household state. Earlier local
full-suite counts are historical and do not certify the final integrated release.

Task 6 used Node **24.10.0** and existing lockfile-installed dependencies:

- `VITE_FOLDER_NAME=dashboard npm test -- src/canvas/CanvasMusic.test.tsx src/SpeakerPlayback.test.tsx`: **2 files, 136 tests passed**.
- `python3 -m unittest discover -s home-assistant/tests -p test_dashboard_music_playback.py -v`: **25 tests passed**.

New coverage exercises external coordinator changes during a launch and handoff,
a retained manual Follow handoff while launch is pending, one transport skip
while acknowledgements/topology change, per-member volume, and failed-start
recovery after reconnection with no automatic replay. The first eight regressions passed existing production guards. The subsequent
actual follower-placeholder fixture reproduced a missing discovery guard and
received the narrow backend fix described above. No transport rerouting was
needed. These are mock regressions, not live Spotify/Jam acceptance.

`PYTHONPATH=home-assistant/tests python3 -m unittest test_dashboard_music_connect test_dashboard_music_gateway test_dashboard_music_current_track test_dashboard_music_playback -v`: **70 tests passed** after the discovery fix. The actual-shape positive regression first failed at the invalid discovery ID check; unknown/coordinator/ambiguous and malformed topology cases continue to fail closed.

The final controller run for `304a901` passed **759 JavaScript tests in 48 files
(15.20 s)**, lint, dashboard build (2.09 s) and `git diff --check`. The unchanged
backend's **274 pure Python tests (3.314 s, one existing skip)** passed at
`6545cef`; the unchanged relay's **8 unit tests** passed separately. After the
final installer fix, **9 Python installer tests** passed. The build's existing
large-chunk advisory remains. Pure Python tests do not establish the actual HA
Core runtime; the 40 native HA tests above belong to `8f01e72`, before the gateway
update. The controller's affected live restart/reversed-group checks passed as
recorded above; no newer native test-suite count is implied.

Fresh independent whole-branch review raised four findings. They were fixed in
`304a901`; one scoped independent rereview confirmed all four addressed with no
new Critical or Important findings. Task-level independent review evidence and
the live acceptance records also informed release approval.

## Live reconnect and recoverable uncertain confirmation

The controller clicked a playlist, observed pending UI and reloaded the browser.
A 45-second HA `call_service` observation captured one dashboard intent and one
unique request ID. Fresh configured account/context/target evidence confirmed
Gym Spotify Connect with group and Follow preserved; paused state was restored.

The first production click displayed a generic Spotify confirmation error even
though fresh cloud and native evidence showed the selected context playing on
Gym. The exact failed provider read was not captured, so no provider status or
root cause is assigned. An explicit UI retry returned **Already playing** and
closed the chooser. A separate 45-second HA bus observation captured one new
dashboard intent and zero Spotify context-play, activation or transfer mutations:
the retry reconciled the active session without restarting it. This establishes
recoverable uncertainty, not a guarantee that provider calls never fail. The
fresh Gym + Bedroom / .20 + .19 / Follow on + saved Gym / mood idle snapshot was
preserved and source paused after testing. Starting a different playlist creates
a new playback context; these checks do not promise preservation of an existing
Jam across that action.

## Atomic release and remote source verification

| Target | Verified release | Current build verification |
| --- | --- | --- |
| Trial | `spotify-connect-trial-20261018T013219Z-304a901` | All 68 current local build files match served manifest and bytes; index SHA256 `b2918b9b0b066dbfbca5f9f4f452dc7434a629680c8a6e19233769b2e7b471b3`; main JS `assets/index-DHWcdo8A.js` |
| Production | `spotify-connect-20261018T013607Z-304a901` | All 68 current local build files match served manifest and bytes; index SHA256 `84d0cd1aa68fa5e421784cb2124f81b602c700f88aa2ff127227edf2665a1d61`; main JS `assets/index-DciSzNpS.js`, SHA256 `18bff94fc5f746d0f4d3b591818b2f23b89f0cb158d8b1164bbf9b75f2b27680` |

The production HA browser loaded the new `index-DciSzNpS.js` counterpart and
verified the real account/library and session behavior. Ten deployed backend
files match the final HEAD source hashes. Normal fast-forward push moved
`origin/main` from `fd15ad5` to released source
`304a901065a427efa88bb5282ed88813d22ffcaf`; `git ls-remote` independently returned
that exact SHA. Documentation-only commits after that source do not change the
released runtime.
The existing atomic deployment tools retain the previous dashboard for
`npm run rollback:dashboard`; backend recovery remains scoped to the ownership
records above.
