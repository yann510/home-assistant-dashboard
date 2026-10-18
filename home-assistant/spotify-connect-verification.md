# SpotifyPlus Connect feasibility — 2026-10-17

Rollout gate: **NOT PASSED**. Installation, HA account OAuth, and live library reads are complete; Connect, Jam, and library writes remain unproven. The production playlist launcher has not changed. Do not start downstream rollout until the live gates below pass.

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

## Authorization handoff

HA OAuth is complete. The separate application credential, named **Dashboard SpotifyPlus (existing Spotify developer app)**, was registered using the existing developer app entirely inside the tooling; values were never printed or written to Git. The completed entity is `media_player.spotifyplus_yann_luche_thibodeau`. Live profile matches the entity's `sp_user_id`, and its account ID matches the standard Spotify config entry's `unique_id`. It reports Premium. Actually granted scopes include every required playlist, library, playback, and profile scope listed below. Desktop authorization is still pending.

1. Restart HA after HACS installation, then Settings → Devices & Services → Add Integration → SpotifyPlus. Register a separate HA application credential for SpotifyPlus. The existing developer application's client ID/secret can be reused privately, but its standard Spotify HA token cannot be substituted. User must confirm Yann's account and consent to the newly requested scopes. Never paste credentials/tokens into chat or Git.
2. Required account scopes include `playlist-read-private`, `playlist-read-collaborative`, `user-library-read`, `user-library-modify`, and playback/profile scopes requested by SpotifyPlus. Verify actually granted scopes, fixed account, and Premium status rather than assuming the consent request proves them.
3. Additional [Desktop authorization](https://github.com/thlucas1/homeassistantcomponent_spotifyplus/wiki/Device-Configuration-Options#spotify-desktop-player-authentication-configuration) is essential. Without it Sonos may use an invisible local queue, which fails this design.
4. A private local Python 3.13 venv is prepared at `/Users/yann510/.codex/spotify-connect-auth.local/venv`, with `spotifywebapipython==1.0.296` and `lxml`. The reviewed upstream [AuthTokenGenerator.py](https://github.com/thlucas1/SpotifyWebApiPython/blob/master/docs/include/samplecode/ZeroconfConnect/AuthTokenGenerator.py) is next to it. Run it there using `venv/bin/python AuthTokenGenerator.py`; it asks for three `Y` confirmations and gives the human two minutes to approve **Spotify for Desktop** in the browser. No consent has been bypassed.
5. Current generator v1.2 uses **http://127.0.0.1:4381/login**, built-in Desktop client, and `streaming` scope. The wiki's developer-app `http://127.0.0.1:8080/` example is distinct; do not change the reviewed generator callback to match that example. `tokenProfileId=None` uses the consenting account's canonical ID.
6. Once authorized, copy/merge `spotifyplus_tokens.json` privately into HA `.storage` after backing up any current file. Retain other accounts' cache entries. Restrict permissions and verify the Desktop token key matches the configured account without printing it.
7. `device_loginid` selects that canonical account. In the current API package, `authorization_code` and `accesstoken` Zeroconf branches still validate username/password as strings before constructing the OAuth blob; HA options require username/password paired. Whether an actual password is needed beyond this validation remains unproven. Do not promise passwordless activation or collect one in chat; inspect the actual target/auth path first.

## Service schemas — live reads verified, playback/writes pending

All services are under `spotifyplus` and require the fixed account's `entity_id`. The live registry confirmed every service below. REST returns `{changed_states, service_response: {user_profile, result}}`; response-capable registry entries report `response: {optional:false}`. Read responses use HA's `return_response:true` / REST `?return_response` and upstream envelopes `{user_profile: {...}, result: ...}`. The profile contains an email, so never log entire responses. Extract only needed account identity server-side.

| Service | Exact payload in addition to `entity_id` | Expected response from pinned source | Live status |
| --- | --- | --- | --- |
| `get_playlist_favorites` | `limit:20, offset:0, sort_result:false` (omit `limit_total`, `filter_criteria`) | `result` is `PlaylistPageSimplified`: paging + playlist items | PASS (7 playlists) |
| `get_spotify_connect_devices` | `refresh:true` | `result` is `SpotifyConnectDevices` with discovered identities | PASS (4 Sonos + Mac) |
| `get_player_playback_state` | optional `market`, `additional_types` | `result` is `PlayerPlayState`, including device/context/item | PASS (not playing) |
| `player_transfer_playback` | explicit `device_id`, `play:true`, `refresh_device_list:true` | no response; confirmation requires a fresh read | Unverified |
| `player_media_play_context` | `context_uri:"spotify:playlist:<id>", device_id:"<resolved target>"` | no response; confirmation requires a fresh read | Unverified |
| `check_track_favorites` | `ids:"<exact track id>"` | `result` maps full `spotify:track:<id>` URI to boolean | PASS (read-only current Living Room track: false) |
| `save_track_favorites` | `ids:"<captured exact track id>"` | no response; re-read saved state | Unverified |
| `remove_track_favorites` | `ids:"<captured exact track id>"` | no response; re-read saved state | Unverified |

Use **get_playlist_favorites**, which delegates to current-account `/me/playlists`. `get_playlists_for_user` delegates to deprecated `/users/{id}/playlists`, so it is not a safe default for this account's 2026 API access. The corrected preflight requires the former. Explicit `sort_result:false` preserves API order (upstream defaults to sorting names).

The inspected 1.0.296 source translates track IDs to full URIs and implements check via GET `/me/library/contains?uris=...`, save via PUT `/me/library?uris=...`, and removal via DELETE `/me/library?uris=...`. This is source evidence for migration support only, live check succeeded, while save/remove still require a user-selected test track and prior-state restoration.

### Exact live read shapes and payloads

`get_playlist_favorites` with `{entity_id, limit:2, offset:0, sort_result:false}` returned total 7. Offsets 0, 2, 4, 6 returned counts 2, 2, 2, 1; merged URIs exactly matched the full `limit:50` read and were unique. There are two owned and five followed playlists; no private/collaborative samples were present. Page keys: `date_last_refreshed`, `href`, `limit`, `next`, `offset`, `previous`, `total`, `items_count`, `items`. Item keys: `collaborative`, `description`, `external_urls`, `href`, `id`, `image_url`, `images`, `name`, `owner`, `public`, `snapshotId`, `tracks`, `type`, `uri`.

`get_spotify_connect_devices` with `{entity_id, refresh:true}` returned **PascalCase** collection keys `AgeLastRefreshed`, `DateLastRefreshed`, `ItemsCount`, `Items`. Record keys are `Id`, `Name`, `Title`, `IsActiveDevice`, `IsChromeCast`, `IsInDeviceList`, `IsRestricted`, `IsSonos`, `WasReConnected`, `DeviceIdActivated`, `DeviceInfo`, `DiscoveryResult`, `ZeroconfResponseInfo`. Bathroom, Bedroom, Gym and Living Room were `IsSonos:true`, `IsActiveDevice:false`; a Mac also appeared. All four use `DeviceInfo.TokenType:"authorization_code"`. `DeviceInfo.DeviceId` equals the current Spotify Connect hash, not the Sonos RINCON identifier. `DiscoveryResult.Name` is `sonosRINCON_<id>._spotify-connect._tcp.local.` and its lowercase `Key` contains the Sonos identifier. These service identities were matched to actual HA Sonos device-registry identifiers for all four rooms. Resolve the current coordinator using that registry/service evidence, with current IP as supporting evidence. Do not use room names alone or treat `Id`/group name as permanently stable.

`get_player_playback_state` with `{entity_id}` returned `is_playing:false`; existing Sonos music was not falsely treated as an active Spotify Connect session. Result keys are `is_empty`, `actions`, `context`, `currently_playing_type`, `device`, `device_music_source`, `is_advertisement`, `is_device_state`, `is_muted`, `is_playing`, `is_repeat_enabled`, `is_shuffle_enabled`, `progress_ms`, `repeat_state`, `shuffle_state`, `smart_shuffle`, `timestamp`, `item_type`, `item`.

`check_track_favorites` with `{entity_id, ids:"<track-id extracted from current Living Room Spotify URI>"}` succeeded and returned `{user_profile, result:{"spotify:track:<same-id>":false}}`. No save/remove was issued. Never omit `ids`: upstream can otherwise choose the current track, which would violate captured-track write semantics.

Live registry additional fields: `get_device_playback_state`: `entity_id,device_id`; `player_media_play_context`: `entity_id,context_uri,offset_uri,offset_position,position_ms,device_id,delay,shuffle,play_show_latest_episode`; `player_transfer_playback`: `entity_id,device_id,play,delay,refresh_device_list,force_activate_device,device_id_from`. The gateway must pass explicit validated target/account/context and re-read state after commands; a command success is not confirmation.

## Acceptance matrix

| Requirement | Status | Evidence / next step |
| --- | --- | --- |
| Runtime versions and existing integrations captured | PASS | Core system-health and read-only API/SSH inspection |
| Explicit pinned HACS installation + protected backup | PASS | Manifest v1.0.224 and original backup above |
| Real dependency import/config flow | PASS | HA wizard completed; registered services and real reads succeeded |
| Fixed Yann account and granted scopes | PASS | Profile/entity/config-entry identity match; required scopes present |
| Desktop consent | UNVERIFIED | Human Spotify for Desktop authorization pending |
| Registered service schemas and read response envelopes | PASS | Live registry, playlists, playback state, discovery and saved-state reads |
| Idle single speaker cold-start with phone closed | UNVERIFIED | Snapshot/restore idle independent speaker; avoid active Chill mood/Living Room |
| Existing group cold-start and changed coordinator | UNVERIFIED | Requires agreed group baseline and active-session preservation |
| Spotify same account/device/context and queue control | UNVERIFIED | User opens Spotify and observes active Connect session |
| Jam with second participant adding a track | UNVERIFIED | Explicit user participation; audio alone never proves Jam |
| Current playlists and pagination | PASS | 7 unique URIs; pages at offsets 0/2/4/6 returned 2/2/2/1 in full-read order |
| Private/collaborative playlist samples | UNVERIFIED | Scopes granted; account library has no samples |
| Save/check/remove and restore prior saved state | UNVERIFIED | User must choose test track before any writes |
| Token expiry/refresh and HA restart recovery | UNVERIFIED | After both auth paths succeed |
| Sonos transport/group/Follow me preserves Connect/Jam | UNVERIFIED | Real session testing after feasibility |
| Real Fire HA-app dashboard CSS viewport | UNVERIFIED | Temporary actual-frame probe deployed; user measurement pending |

No playback or library write was issued during this task. Keep existing playback/mood ownership untouched while waiting for Desktop consent. The active Chill mood and Living Room session are not a safe test fixture for this milestone.

## Viewport diagnostic support

Standalone `/local/dashboard-viewport.html` is a fallback only; its viewport may differ from HA app's embedded dashboard. The actual deployed dashboard index temporarily references `/local/dashboard-viewport-probe.js`. The read-only badge measures the dashboard frame's inner/client/visual dimensions, visual scale, DPR, screen, orientation, and UA; it sends no telemetry and has a close button.

Probe backup: `/homeassistant/backups.local/dashboard-viewport-probe-20261017T130220`. Dashboard index before SHA256: `15af06773fe05cd4b3c6d9bff537cdefb09310bf6698ed54c3d2904b3772212e`; after: `155a2baf6ecb06a42426bfcc9374c4eaee500e17e3f10106fb0bb8fc7581615f`. No dashboard assets changed. After measurement remove exactly `<script id="dashboard-viewport-probe-loader" src="/local/dashboard-viewport-probe.js"></script>` from the current index. Do not restore a stale whole index after another deployment. The probe did not exist before this task and can then be deleted; preserve a newer replacement if its bytes differ.

## Local validation

`npm ci` passed after the minimal optional transitive lock repair. `VITE_FOLDER_NAME=dashboard npm test` baseline passed 39 files / 664 tests; final passed **40 files / 678 tests**. Focused installer suite passed **14 tests**, with recorded missing-implementation and regression red/green runs. Scoped ESLint, Node syntax check, and Git whitespace checks passed. No frontend deployment was performed.

## Fixed-account library component (local implementation; not deployed)

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
are unchanged. No configuration mode, component deployment, save/remove call,
Connect playback, or Jam test was performed while implementing this component.

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
lists them. Unknown speakers, changed identities, missing evidence, and ambiguous
names fail closed.

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

The rollout controller ran isolated native tests in actual Core Python 3.14.6:
**39 passed in 3.689s**, including the new component setup/service Context/WS
schema/permission tests and existing integration, Follow light and startup
readiness tests. This temp HA used fake providers and changed no household
configuration or playback. Local final pure discovery passed **260 tests with
one existing skip**; JavaScript passed **698 tests**, lint and dashboard build
passed (existing bundle size warnings). Independent review and final live
rollout acceptance remain separate checkpoints.
