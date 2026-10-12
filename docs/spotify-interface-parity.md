# Spotify-style music navigation and behavior

Goal: a music interface that feels very similar to Spotify in everyday browsing and listening, within this Home Assistant dashboard.

The user's accepted constraints remain: a compact unified home, no wide sidebar, playlists first, Sonos favourites and personal track suggestions below, the library within home, visible Liked songs, normal catalog search, direct playlist playback from the main card, current dashboard theme, and persistent playback controls.

## Verification targets

- Home exposes real personal playlists, Liked songs, top/recent tracks, favourites and library collections with artwork and clear actions.
- Playable playlist cards start playback; a distinct secondary action browses tracks without starting audio.
- Collection detail displays real artwork and track lists, a collection play action where supported, and local find within loaded tracks.
- Search displays compact playable song results and supports catalog discovery across songs, albums, artists and playlists, with clear filters and pagination.
- Home, backward and forward navigation preserve browsing/search context and scroll position; speaker selection returns to the previous music context.
- Playback remains tied to the selected Sonos coordinator and observed device state, including play/pause, previous/next, seek and volume.
- A real queue can be viewed and refreshed; supported Spotify items can be added or played next without replacing current audio. Queue state is never simulated in production.
- Shuffle and repeat controls reflect supported device state, respect grouping/disconnection guards and manual playback ownership.
- Phone and short tablet layouts preserve visible navigation, comfortable touch targets, readable song rows and persistent controls. Loading, empty, error, disabled and keyboard focus states remain usable.

## Current evidence and next work

At 389376e, the first target and direct playlist playback are live; Liked songs loads real saved tracks. Collection actions, track rows and history are the active implementation slice.

Catalog search currently searches tracks only. Broader types require extending the authenticated dashboard_spotify adapter, installing it, and restarting Home Assistant.

Read-only live inspection confirms all four Sonos players advertise feature flags 8321599 and expose shuffle/repeat attributes. sonos.get_queue is registered; a call returned the real Living Room queue as an array of 50 entries at response[entityId]. Official integration supports media_player.play_media enqueue add/next for Spotify media, but arbitrary Sonos favourites must not inherit enqueue because their integration branch replaces playback.

Shuffle/repeat also need the house_moods manual service-intent observer updated so a manual gesture releases playback ownership. Existing queue/play_media calls already participate in that ownership handling.

Library edits are not currently available: the Home Assistant Spotify integration requests library read access. Any future save/unsave or playlist editing action needs a proven authorized API path; do not display a working-looking control that cannot persist its change.

## Catalog implementation brief

Pinned test runtime is Home Assistant2026.9.3 with spotifyaio2.0.2. Next typed search should accept kind all/track/playlist/album/artist, preserving omitted-kind track compatibility. All shows grouped sections with independent totals and offsets; selected kinds paginate one category. Cache and in-flight identity must include authorized account and kind. Existing direct HTTP OAuth refresh avoids spotifyaio.search's missing offset support.

The server must generate album/playlist/artist browse IDs as spotify://<authorized-entry>/spotify:<kind>:<id> using the authorized config entry. Raw URIs can play through Sonos, but cannot browse via the HA Spotify bridge. Artists are browsing-only for Sonos. Normalize real artwork, title, artists and useful metadata; reject malformed or unplayable tracks. No client-supplied entry ID may select credentials.

The HA browse bridge omits artist/duration metadata and has no collection pagination contract. Rich, complete collection pages will need a bounded backend detail endpoint. Development-mode third-party playlist detail may be restricted to owner/collaborator access; preserve Play and report unavailable detail clearly rather than displaying an empty playlist.

Primary references: [Spotify Search API](https://developer.spotify.com/documentation/web-api/reference/search), [2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide), [HA Spotify browse bridge](https://raw.githubusercontent.com/home-assistant/core/2026.9.3/homeassistant/components/spotify/browse_media.py), [Sonos media browser](https://raw.githubusercontent.com/home-assistant/core/2026.9.3/homeassistant/components/sonos/media_browser.py), [Sonos queue action](https://www.home-assistant.io/actions/sonos.get_queue/).
