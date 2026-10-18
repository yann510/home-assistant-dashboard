# Liked Songs — 2026-10-18

The user identified the missing Liked Songs collection as their most important
picker entry. Source `163882f` pins **Liked Songs / Your saved songs** first,
with a heart tile. It is searchable and remains present when regular playlist
listing is empty or fails. Regular playlist counts and pagination are unchanged.

The launcher accepts the exact `spotify:collection:tracks` sentinel in addition
to strict playlist URIs. The backend constructs the provider collection URI from
the already verified account and stages that context on the silent relay before
the existing guarded Sonos activation/transfer. It does not enumerate or copy
saved tracks. Only the generic and verified account's exact collection aliases
normalize for confirmation; arbitrary account-specific client inputs remain
invalid. Existing permission, account, topology, mood, deadline, idempotency and
pending-effect guards remain in place.

The pinned SDK documents the account collection context. Upstream notes that
collection contexts are not part of Spotify's official Web API contract:
[SpotifyPlus Card collection context documentation](https://github.com/thlucas1/spotifyplus_card/wiki/Configuration-Options#userpresets-track-favorites-large-library).
This route is verified against the current household, rather than assuming
that direct Sonos collection playback is supported.

## Verification

- Full JavaScript run: **763 tests, 49 files passed**, 11.88 s.
- Full Python run: **277 tests run successfully, one existing skip**, 3.548 s.
- Lint, TypeScript, whitespace check and production build passed.
- Independent scoped review of the complete feature found no actionable issues.
- Local 1224×614 and 375×812 previews show Liked Songs first without horizontal
  overflow; the local button opened playback and closed the picker on success.
- Before backend implementation, a real native collection context started on
  the silent relay and transferred to Gym. Fresh Spotify account/context/output
  and native Sonos Spotify Connect matched; Gym group and volume were unchanged.
  Gym was paused afterward. No copied playlist or limited track list was used.
- Five backend files were deployed with previous-source hash guards and backups
  at `/homeassistant/backups.local/dashboard-music-liked-songs-20261018T163709274Z`.
  All ten deployed component source files match the repository. HA config check
  passed before restart. Later release acceptance is recorded below.

The Fire's previously measured physical CSS viewport is 1224×614 at DPR 1.5,
visual scale 1. Browser preview uses those CSS dimensions; this change has not
been operated directly on the physical Fire. Source-level follow/group guards
and regression tests remain unchanged; prior human Jam/Follow acceptance is
recorded in [the original release record](spotify-connect-2026-10-17.md).

## Live backend acceptance

HA configuration check and ordinary restart completed successfully. Through the
actual authenticated dashboard service, the collection launch returned
`confirmed`; an identical request returned the identical result, and a new
explicit same-context intent returned `already_playing`. Fresh provider context
matched the configured account's collection, exact current-track identity was
resolved, its saved state was true, and native Sonos reported Spotify Connect.
Group, volume, Follow on/off state and saved Follow source all remained unchanged.

After the checks, Gym was paused again. A fresh household snapshot confirmed
Living Room paused/self/.32, Bathroom idle/self/.29, Bedroom idle/self/.19 and
Gym paused/self/.20, Follow on, mood idle and cloud playback false. The test
changed Gym's selected context; it does not claim prior queue restoration.

## Production picker acceptance

Release `spotify-connect-liked-songs-20261018-163882f` was atomically promoted.
All 68 current local build files matched served manifest and HTTP bytes. Index
SHA256: `d9eae95099afa14d471e3961efad253b3f2409f13a1e85b1a0daa389847e36a6`.
Main JS `assets/index-BG9Ysq4y.js`, SHA256
`127c0219166ea72acbc95722c3dd99e9dcd61ef876888303f62f5f4f91857d2c`.

The actual production HA iframe measured 1224×614 and displayed Liked Songs as
its first choice, separate from “7 playlists loaded”. Clicking the new tile
closed the sheet and announced **Playing Liked Songs**. Fresh native/cloud
reads confirmed Gym playing via Spotify Connect with Follow on and unchanged
self group/.20 volume; the UI Pause control then restored paused playback.
Screenshot: `backups.local/spotify-connect-qa/liked-songs-production.png`.

After the required restart, House Pulse initially displayed its intentional
120-second attention startup grace. Its sensor retained three reminder items
with numeric state and ready false; no reminder data was modified by this task.
A subsequent fresh sensor read confirmed ready true with all three reminder
items retained; the surrounding production House Pulse recovered normally.
The final household snapshot remains paused with the same groups/volumes,
Follow on, mood idle and cloud playback false.
