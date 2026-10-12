# Playlist playback and Liked songs

User correction: playlist cover/title clicks should start playback, and Liked songs should be visible on music home.

Implementation d0aeac1 prioritizes playable items over folder expansion using the existing confirmed Sonos playback controller and original media ID/type. Pending, disabled and unavailable guards remain in place. Nonplayable categories and See all still browse. The actual Spotify saved-tracks category appears once as a compact artwork shortcut above the playlist grid.

Verification:
- Regression tests failed before the fix for playlist title playback and shortcut placement, then passed.
- Full suite: 40 files, 641 tests passed. ESLint and production TypeScript/Vite build passed.
- Two independent reviews passed without significant findings.
- Controlled preview: clicking a playlist changed simulated playback without entering a folder; Liked songs opened saved tracks.
- Phone 375×812 and tablet 960×540: Liked songs visible without scrolling; persistent controls fit. Keyboard focus reaches the shortcut with visible theme outline.
- Production release music-playlist-actions-20261012 verified and promoted. Served HTML exactly matches built dist/index.html.
- Live Liked songs shortcut loaded 48 real saved tracks including Fly and Step by Step; returned to music home afterward. Live playback was not triggered because the current speaker was playing TV.
