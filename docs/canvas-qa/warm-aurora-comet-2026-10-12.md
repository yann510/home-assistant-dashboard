# Warm Aurora and Comet — 2026-10-12

The selected production design replaces the decorative equalizer with warm cream/copper Aurora ribbons inside the enabled pause button. The pause symbol stays above the decorative layers. Comet progress uses the existing native slider and real track position; no audio analysis or separate progress clock is introduced. Full-card artwork and drift require active playback and successfully loaded artwork. Paused, buffering, busy, error, or disconnected states show the original cream card, retaining the small cover and applicable Spotify links. Reduced-motion CSS disables continuous ribbons and background drift.

Only the three product/test files were promoted from the prototype branch. The comparison galleries remain parked on `codex/music-motion-prototypes`; they are not part of this production change. Latest remote Night presence commits were preserved.

## Verification

- Production commit `59a1774`: all 663 frontend tests across 39 files, lint, and dashboard build passed. Independent review approved without actionable findings.
- Normal local preview, without prototype selectors, showed the selected warm Aurora button and Comet marker. Both Aurora pseudo-elements animate while playing; the card returns to cream with data-artwork false after Pause. Small cover and controls remain mounted.
- Native keyboard seeking updates the actual value, `--speaker-range-fill`, and time label.
- Phone 375 × 812 and tablet 960 × 540: no horizontal document overflow. Central transport retains its 44px target. Temporary viewport overrides were reset.
- No physical audio/device commands or Home Assistant restart were used for verification.

Playing-state simulated screenshot retained with chat: `comet-final-playing-preview.jpg`.

## Production release

Atomic release `warm-aurora-comet-20261012` was verified and promoted. Served HTML matches the final build. Live Chrome shows the paused speaker on the original cream background with data-artwork false, the small cover, exact Spotify track links, enabled Resume, and no equalizer element. Playing behavior was verified in the simulated production-component preview above. Live screenshot retained with this chat: `warm-comet-live.jpg`.
