# Spotify music browser activation — 2026-10-12

Implemented in `539294e` and published as `spotify-browser-20261012-539294e` to the existing `/local/dashboard/` destination. The user approved the Home Assistant restart separately after reviewing the completed feature.

## Behavior

Open **Music** from the music card's library button. Home shows Spotify Top Tracks and Recently played; Your library includes Playlists and Liked songs. These collections come from the configured Spotify account through Home Assistant's Sonos media browser. Song search uses the authenticated `dashboard_spotify/search` websocket command, with pagination and server-side refresh of the existing Spotify OAuth session. No new login or browser Spotify secret is needed. Suggestions are personal listening collections, not Spotify's proprietary Home feed.

Playback uses the existing shared Sonos controller, confirmation, grouping and mood ownership guards. The browser keeps playback, volume, Follow me and destination controls available while its music list scrolls.

## Verification

- Frontend: 619 tests passed; lint, TypeScript and production dashboard build passed.
- Spotify backend: 13 tests passed using real Home Assistant 2026.9.3 websocket/schema/permission interfaces.
- Installer: 9 tests passed, including private backup permissions, atomic configuration replacement, concurrent-edit rollback and exact configuration-byte preservation.
- Existing Home Assistant regression suite: 83 tests passed. Existing pure Python suite: 164 passed, one skipped.
- Independent backend and frontend reviews approved after the reported installer and pagination fixes.
- Chromium at 375×812 and 960×640 verified Home → search → pagination → library → playlist browsing, visible persistent controls, no page errors and no horizontal overflow.
- After the restart, authenticated live search for Daft Punk returned playable tracks with artwork and working second-page requests. Spotify result totals can vary between pages.
- Live personal collections: 7 playlists, 48 liked songs, 48 recently played entries and 48 top-track entries exposed by the current browse response.
- Served production HTML exactly matches the verified build, and its JavaScript/CSS assets return HTTP 200. Deployment byte verification completed before promotion; the previous release remains retained by the existing publisher.
- Mood and Follow me states matched the snapshot captured immediately before restart. No verification command started music or changed speakers/lights.

## Backend activation and recovery

The new component is `home-assistant/custom_components/dashboard_spotify/`, enabled by one `dashboard_spotify: {}` entry. The installer is `node scripts/install-dashboard-spotify.mjs --install --config-root /config` (also supports `/homeassistant`). It validates Home Assistant configuration and never requests a restart itself. Existing installations are refused for manual upgrade review.

The live configuration backup is `/config/configuration.yaml.spotify-backup-287745de-3296-40ee-9f1a-a755460835c0`, created with private permissions outside the served dashboard directory. The existing `npm run rollback:dashboard` command can restore the retained frontend release without altering the Spotify extension. Backend rollback requires restoring the private configuration backup/removing the new component and a separately coordinated restart; preserve subsequent configuration edits.

## Execution decision

Work used fetched current `origin/main` in an isolated checkout because the original local checkout was 227 commits behind and had unpublished changes. Those local changes were preserved. If that older unpublished work is needed, it remains separate and must be integrated deliberately rather than replacing the newer deployed dashboard.
