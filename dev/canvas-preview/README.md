# Local dashboard preview

Open `/dev/canvas-preview/index.html?view=canvas&scene=busy` on the local Vite preview server. All entities and service responses are simulated; this page never controls the real house.

Use **Preview tools** in the bottom corner to select a scenario or reset local changes:

- **Everyday**: normal interactive controls, idle appliances.
- **Active appliances** (`scene=busy`): normal interactive controls plus appliance activity and a reminder in House Pulse.
- **Command failures** (`scene=failure`): deliberately rejects commands and forecast requests.
- **Mood recovery** (`scene=mood-recovery`): starts with a restoration problem; retry can recover.
- **Disconnected** (`scene=offline`): disconnected control states.

Selecting a scenario clears fault flags and resets simulated state. Refreshing resets the current scene. For focused tests, `fail=commands`, `fail=forecast`, and `unconfirmed` remain available as URL options.

This is an interaction preview, not a hardware emulator. Blind commands are accepted without fabricated position readings; appliance cycle timing, actual audio playback, physical motion-following, and real mood snapshot restoration require live hardware/backend testing.

## Music motion playground

Open `/dev/canvas-preview/index.html?view=canvas&musicPrototypes=1&artwork=1` to compare five decorative alternatives to the equalizer: **Orbit**, **Aurora**, **Floating notes**, **On air**, and **Mixtape**. Select a gallery tile to update the real dashboard card instantly, then use its simulated pause/play controls to see the resting state. The gallery remains in the playing state for comparison. At phone widths, swipe the gallery horizontally or use the radio buttons with a keyboard.

The optional `musicPrototype=orbit|aurora|notes|on-air|cassette` parameter chooses the initial tile. Add `media=paused` to begin with a paused card. All five respect reduced motion. They illustrate playback state and do not claim to measure audio. This opt-in development CSS and picker never enter the production application, and the standard preview stays unchanged without `musicPrototypes=1`.

## Aurora playback controls

Open `/dev/canvas-preview/index.html?view=canvas&auroraControls=1&artwork=1` to compare **Comet** (the default) and **Halo** on the actual music card. The active play button and progress marker use the card’s cream, cover copper, and dark ink. Pausing settles the motion and restores the cream card. Seeking still uses the track’s real position and native slider.

Use `progressPrototype=comet|halo` to select the initial style; the retired `flow` value falls back to Comet. Both styles respect reduced motion. These controls are opt-in development visuals and never enter the production application; the original five-option music gallery remains available separately.

## Tablet layout

The production dashboard automatically uses tablet typography and viewport rhythm at CSS viewport widths of at least 800px and heights of at least 540px. No query flag is needed; the former `tablet=1` option is retired. The preview uses the same production stylesheet.

Android status and navigation bars reduce the available CSS viewport. The overview shares that available height between feature cards and home controls, including short 960×540 viewports, while preserving 44px touch targets. Safe-area insets are respected. Error and accessibility content may grow naturally and remain scrollable; dialogs retain independently scrollable bodies.

See `docs/canvas-qa/fire-hd-10-2026-10-06.md` for measured scenarios, interaction checks, and physical-device limitations.

`?scene=health` shows curated speaker/light/presence offline cards after a simulated 15-minute outage and undocked Roomba low-battery guidance plus a noninteractive dashboard tablet charge reminder. Cards open existing controls without backend reminder actions.
