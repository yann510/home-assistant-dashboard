# Dashboard Spotify Relay

A local **aarch64** Home Assistant add-on for staging a Spotify Connect playlist before transferring the session to Sonos. This does not implement the dashboard launch/transfer path or prove live Spotify/Sonos/Jam acceptance.

## Audio and process isolation

The image reuses a prebuilt librespot 0.8.0 binary. Our entrypoint bypasses the upstream launcher, prepares only `/data` and `/tmp/dashboard-relay`, clears supplementary groups, and drops to UID/GID 1000 before starting PulseAudio or librespot. Child environments are explicitly selected; inherited upstream audio/debug/credential variables cannot select another backend. Child output is suppressed to protect account data; logs report generic lifecycle failures.

PulseAudio starts with `-n` and our explicit configuration: one private Unix protocol socket and one `module-null-sink`, 44.1 kHz, stereo, signed 16-bit PCM. Its timer paces playback normally. No automatic hardware discovery, shared HA audio socket, TCP audio, extra control server, physical devices, host filesystem mounts, privileged mode or audio group membership is requested. The 0700 runtime directory protects its Unix socket; anonymous socket authentication is restricted by that directory. Librespot points explicitly at this server/sink with Pulse autospawn disabled. Missing, extra, or unhealthy sinks terminate both children. TERM/INT and either child exiting trigger bounded cleanup.

Host networking enables mDNS and Spotify's required LAN zeroconf pairing endpoint on TCP **24879**. This endpoint is part of librespot discovery; it is not an added HTTP control API. Reserve this port on the HA host. There is no public audio socket. The manifest starts at boot, and the installer enables Supervisor watchdog checks against the Connect endpoint. The process also checks the private sink itself. Leave protection mode enabled.

## Pinned upstream and licenses

`giof71/librespot@sha256:e2dfcd776c73069b98820a849ccce48842e1381cea069b76e15327dcbfa5cd88` is the **linux/arm64** platform manifest resolved and pulled on 2026-10-17. Its binary reports `librespot 0.8.0 d36f9f1 (Built on 2026-03-14, Build ID: E2csXGin, Profile: release)` and includes `pulseaudio` and `libmdns` support.

The image's BuildKit provenance reports source [GioF71/librespot-docker at 187dfb5](https://github.com/GioF71/librespot-docker/tree/187dfb5d467c7e9863d999972bf27a2765a6b800), built 2026-03-14. Its [Dockerfile](https://github.com/GioF71/librespot-docker/blob/187dfb5d467c7e9863d999972bf27a2765a6b800/Dockerfile) builds upstream v0.8.0 with `pulseaudio-backend` and `with-libmdns`; provenance completeness marks materials false and reproducible false, so it is build metadata, not an independent source audit. The immutable platform digest and actual executable were checked locally.

This provides the small maintained binary reuse required here without compiling Rust on HA. The [HA community Spotify add-on manifest](https://github.com/hassio-addons/app-spotify-connect/blob/main/spotify/config.yaml) requests shared HA audio, and its [launcher](https://github.com/hassio-addons/app-spotify-connect/blob/main/spotify/rootfs/etc/services.d/librespot/run) passes the bootstrap token in argv and clears cached credentials when its token option is empty. Those defaults conflict with private audio and token-absent cache preservation here, so we reuse the prebuilt binary instead. We preserve the upstream image's Apache 2.0 license and librespot's MIT license in the accompanying `LICENSE.*` files; the image retains Debian package copyright notices. The added Debian PulseAudio package is installed without recommended packages. Apt dependencies remain distribution-managed; the pinned component is the actual upstream librespot image/binary.

Primary references: [librespot release](https://github.com/librespot-org/librespot/releases/tag/v0.8.0), [startup flags/environment/device identity](https://github.com/librespot-org/librespot/blob/v0.8.0/src/main.rs), [credential serialization](https://github.com/librespot-org/librespot/blob/v0.8.0/core/src/authentication.rs), [credential cache](https://github.com/librespot-org/librespot/blob/v0.8.0/core/src/cache.rs), [HA add-on configuration](https://developers.home-assistant.io/docs/add-ons/configuration/), [Supervisor 2026.09.2 API routes](https://github.com/home-assistant/supervisor/blob/2026.09.2/supervisor/api/__init__.py).

## Installation and ownership

Use Node 24. The SSH add-on needs Python 3, its local add-on source mount at `/addons`, the HA config mount at `/homeassistant`, and existing Supervisor API access through its `SUPERVISOR_TOKEN`/`HASSIO_TOKEN` environment. The relay itself receives no Supervisor or HA API access. If those existing mounts/access are unavailable, inspection fails and the controller must arrange the normal HA local add-on source installation; this tool does not escalate host access or modify the SSH add-on.

```sh
node scripts/configure-spotify-relay.mjs --env /protected/setup.env
node scripts/configure-spotify-relay.mjs --env /protected/setup.env --install
node scripts/configure-spotify-relay.mjs --env /protected/setup.env --start /homeassistant/backups.local/dashboard-spotify-relay-TIMESTAMP
node scripts/configure-spotify-relay.mjs --env /protected/setup.env --rollback /homeassistant/backups.local/dashboard-spotify-relay-TIMESTAMP
```

Only the first command is read-only. The env file uses the existing `VITE_SSH_HOSTNAME`, `VITE_SSH_USERNAME`, `VITE_SSH_PASSWORD` convention. Never commit this file. Install refuses any existing source directory or installed add-on, writes a private record before staging files, reloads the Supervisor store, builds/installs `local_dashboard_spotify_relay`, and enables boot/watchdog without starting it. No overwrite, update or adoption of another installation is automatic.

The independent 0700 backup namespace is `/homeassistant/backups.local/dashboard-spotify-relay-*`. Since installation only permits an absent baseline, its backup is an ownership/absence record rather than a copy of HA configuration. The record stores a hash of the installation UUID and hashes of the exact source and add-on settings; it contains no tokens or copied HA storage. Start and rollback require the same host, complete install record, source, version and settings. Runtime state changes are allowed. Rollback uninstalls only this owned add-on and removes only its unchanged source; this also deletes the add-on's own private account data. Concurrent edits or uncertain installation completion fail closed for controller inspection. No automatic uninstall follows a failed install.

## Private account bootstrap and identity

Provision a valid, short-lived Spotify Desktop access token privately as **`/data/bootstrap-token`** (0600, owned by UID/GID 1000, under the relay's 0700 add-on data directory). The controller must supply it through protected host/container file access after independent review. Do not put it in add-on options, a Dockerfile, command arguments, source, a terminal command literal, logs or Git. The installer deliberately has no token argument. No token has been read or provisioned by worker tests.

With no existing cache, the entrypoint loads the token into librespot's supported `LIBRESPOT_ACCESS_TOKEN` child environment, never argv. It removes the bootstrap file only after the cache parses as a complete upstream credential record: nonempty canonical username, supported numeric authentication type and nonempty base64 authentication bytes. A partial or malformed cache keeps the bootstrap for recovery, including after restart; no account identity is inferred from the token. With a cache already present, the bootstrap is ignored and existing credentials are preserved; absence or an empty bootstrap never clears a valid cache. Explicit credential rotation/recovery is a separate controller action.

Credentials persist at **`/data/credentials/credentials.json`**, 0600 within 0700 directories, directly inside HA’s durable `/data` mount. The upstream image declares anonymous volumes at `/data/cache`, `/data/system-cache`, `/cargo-home` and `/user/config`; we use none of them. In particular, placing credentials under `/data/cache` would shadow HA’s durable data with an anonymous volume that Supervisor deletes when recreating a container. Upstream JSON contains `username` (canonical account string or null), `auth_type` (numeric protobuf authentication enum), and `auth_data` (base64 reusable authentication bytes). Treat the complete file as secret; do not print it. SpotifyPlus/API may need a private merge of this canonical account record into its separate librespot credential store for relay reactivation. The installer does not edit that shared store; its controller must preserve all other account records and keep a scoped rollback.

Identity persists separately at **`/data/identity.json`** with `name` and `device_id`; it contains no token. Librespot v0.8.0 derives the Connect ID as lowercase SHA1 of its exact name, so our generated `Dashboard Relay <8 hex characters>` name stays fixed across restarts. There is no unsupported `--device-id` flag. Configure the backend with this exact device ID only after checking fresh account/discovery evidence.

Stock librespot discovery accepts pairing from another LAN account. This add-on is not an account ACL. Keep the LAN trusted, provision only the configured account, and enforce the fixed account and exact device ID in the backend before each staging/transfer; a switched account must fail that validation. Do not claim authentication, refresh/restart login or SpotifyPlus activation compatibility until tested against the actual account.

## Verification

```sh
python3 -m unittest discover -s home-assistant/addons/dashboard_spotify_relay/tests -v
python3 -m unittest discover -s scripts/tests -p 'test_spotify_relay_installer.py' -v
VITE_FOLDER_NAME=dashboard npx vitest run scripts/configure-spotify-relay.test.ts
docker build --platform linux/arm64 -t dashboard-spotify-relay:test home-assistant/addons/dashboard_spotify_relay
SPOTIFY_RELAY_TEST_IMAGE=dashboard-spotify-relay:test python3 -m unittest discover -s home-assistant/addons/dashboard_spotify_relay/tests -p test_container_persistence.py -v
```

Local arm64 runtime inspection verified UID/GID 1000, empty supplementary groups and zero effective capabilities for the supervisor/PulseAudio/librespot; only the Unix and null-sink modules; no `/dev/snd`; 0700 private directories; and a three-second PCM stream draining in approximately four seconds rather than racing to `/dev/null`. A separate network-disabled arm64 regression ran the real supervisor and PulseAudio with a fixture player, removed each container with `docker rm -v`, and recreated it against the same HA-style `/data` bind mount. Identical fixture credentials and identity survived, with no bootstrap token and all prior anonymous volumes removed. These are sink timing and storage persistence checks, not actual Spotify playlist acceptance. Real HA boot/watchdog, canonical-account bootstrap/refresh/restart, repeated relay staging/transfer, cold Sonos, coordinator changes, Spotify-visible control and Jam remain controller acceptance gates.
