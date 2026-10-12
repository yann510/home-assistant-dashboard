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
