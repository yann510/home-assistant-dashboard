# Music artwork atmosphere — 2026-10-12

The music card uses the current album artwork behind a dark gradient, preserving the sharp cover thumbnail and existing controls. During confirmed playing state, artwork drifts gently over 28 seconds and four lilac equalizer bars move beside the title. Paused/buffering playback stops both; paused artwork receives a calmer shade. Missing, failed, idle, unavailable, and disconnected artwork falls back to the original cream card. Reduced-motion CSS disables continuous animation. These bars indicate playback, not measured audio levels.

## Verification

- Implementation commit `332ca47`: all 663 tests across 39 files, lint, and dashboard build passed.
- Independent review approved after fixes for command-error motion gating and bright-artwork contrast. The minimum 72% dark overlay gives approximately 4.93:1 foreground contrast over pure white artwork; paused shading is stronger.
- Local simulated Chrome preview confirmed the drift and equalizer animation names/durations while playing and `none` for all five animation targets after Pause. No physical audio commands were sent.
- Phone 375 × 812 and tablet 960 × 540 showed readable artwork/controls and no horizontal overflow. Temporary viewport overrides were reset.
- Broken-image fixture restored cream styling. Offline fixture removed artwork and active motion. Pure-white artwork fixture retained readable title, volume, time, and room text.
- Keyboard navigation retained visible offwhite focus. The existing speaker volume dialog opened correctly. Existing Spotify track links, favourites, playback, seek, volume, rooms, and Follow me remain in place.
- Reduced-motion behavior was reviewed through the CSS media rule and tests; OS accessibility settings were not changed for testing.

Playing-state simulated screenshot retained with this chat: `music-atmosphere-playing-preview.jpg`.

## Production

Atomic release `music-artwork-atmosphere-20261012` was verified and promoted. Served HTML exactly matches the build. Live Chrome displays the actual Know Some artwork and retains the exact Spotify track links. The real speaker is paused, with all five new animation targets reporting `none`; playing behavior was verified in the simulated preview above. No Home Assistant restart or physical playback changes were performed. Live screenshot retained with this chat: `music-atmosphere-live.jpg`.
