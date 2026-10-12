# Queue and Spotify listening controls

Frontend implementation cb6ee68 adds the selected Sonos coordinator's real queue, refresh/error/empty states, Spotify-only Play next and Add to queue actions, and capability-backed shuffle/repeat controls using observed Home Assistant attributes. A shared synchronous mutation guard excludes conflicting listening, transport, favourite, Follow me and room-grouping commands. Source changes, disconnects, StrictMode and service discovery lifetimes have regression coverage.

Backend 25b0b78 makes external shuffle/repeat gestures release targeted mood playback ownership. Backend b0ae3d0 adds authenticated typed catalog search for tracks, playlists, albums and artists while preserving omitted-kind legacy responses. Collection references come from the authorized account; artists expand without playback. The typed frontend is the next goal slice.

## Verification

- Full frontend suite: 43 files, 665 tests passed; ESLint and TypeScript/Vite production build passed. Later ce49df3 is CSS-only and its production build passed.
- Backend: 18 Spotify tests, 84 real Home Assistant integration tests, and 164 core tests passed, one core test skipped.
- Independent task reviews, fix reviews, whole-change review, real queue contract correction afc937d and CSS-only width correction ce49df3 passed.
- Live queue contract uses media_title/media_artist/media_album_name/media_content_id. Normalization and preview fixtures now match those real fields; malformed values have regression coverage.
- Live queue displays 50 named entries, beginning with Know Some by Vandelux. Refresh reads the device queue.
- Live shuffle toggled on and off; repeat cycled off/all/one/off. Observed speaker state and controls matched; original settings restored.
- Live Add to queue appended One More Time as entry 51. The original 50 entries and paused current track were preserved. After fresh identity/prefix validation, only the owned test entry was removed and the exact original queue was confirmed.
- Live Play next inserted the same test song at index 1, after the current paused track. Original queue order and paused track remained unchanged; the owned test item was removed and the exact original queue restored.
- Actual production viewport dimensions were measured for 656×926, 960×540 and 375×812. Metadata remains readable, the short tablet exposes a complete song row, and queue/shuffle/repeat controls have 44px touch targets. The browser override was reset afterward. Background preview resizing alone is insufficient because the viewport tool targets the active tab.
- Final release spotify-listening-20261012-polish verified and promoted; served HTML exactly matches dist/index.html. All implementation and verification commits were pushed to origin/main.

## Backend activation

Four reviewed runtime files were replaced with byte, drift, symlink and permission checks: house_moods/__init__.py and dashboard_spotify/__init__.py, search.py, manifest.json. Exact original files are retained privately in /config/codex-backups/spotify-listening-2e784926-b022-433b-9bbd-4f72a48327a2. Home Assistant configuration validation returned valid.

One restart was requested. The HTTP request timed out during shutdown; no second restart was sent. APIs returned and the saved house mood, Follow me, paused track, shuffle and repeat states matched exactly. Live typed all search then returned real song, playlist, album and artist groups, proving the new handler was active; legacy track search still worked.

Broader goal remains active: multi-type frontend search and complete, metadata-rich collection pagination are still pending.
