# Spotify app handoff — 2026-10-12

The dashboard's original heart opens Sonos Favourites again. The Spotify catalog browser remains parked on `codex/spotify-music-browser`; main contains no custom catalog search UI. Favourites now offers an Open Spotify app link (`spotify:`) and a separate Spotify web player link (`https://open.spotify.com/`, with `noopener noreferrer`). Existing Sonos playback controls are unchanged.

## Verification

- All 617 frontend tests passed; lint and dashboard build passed.
- Independent review approved implementation commit `351753b` without actionable findings.
- Atomic release `spotify-app-handoff-20261012` was verified and promoted. The served dashboard HTML exactly matches the built HTML.
- Live dashboard shows Open favourites instead of Browse music. The sheet shows both Spotify links and seven real Sonos favourites, without the custom catalog/search screen.
- Phone 375 × 812 and tablet 960 × 540: no horizontal document overflow. Both links have 44px touch targets; keyboard focus has the theme's lilac 2px outline. Temporary viewport overrides were reset.
- App and web links were clicked in the Codex in-app browser. The dashboard stayed intact. No new in-app tab appeared; external application/browser launch could not be observed because native computer-use permissions are unavailable. Native launch on users' phones/tablets remains unverified; the browser or webview must permit external link handling.
- No playback actions, backend changes, or Home Assistant restart were performed.

Live screenshot retained with this chat: `spotify-app-handoff-live.jpg`.

## Artwork and title entry points

The user confirmed the app handoff works in Chrome. Commit `7387bfc` adds the same `spotify:` destination to the current album artwork and song title. Status placeholders remain noninteractive, with the heart and playback controls unchanged. Independent review approved the change; all 621 frontend tests, lint, and dashboard build passed.

Release `spotify-track-handoff-20261012` was verified and promoted; served HTML matches the build. The live Chrome dashboard exposes both links. Keyboard focus on the title has the music card's 2px currentColor outline. At 375 × 812, artwork is 72 × 72 and title height is 44px, without horizontal document overflow; the viewport was reset. Screenshot retained with the chat: `spotify-track-links-live.jpg`. Both links open the Spotify app itself, rather than a particular album or song. Native launch was not separately reverified for these two entry points.
