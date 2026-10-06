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

## Tablet layout

The production dashboard automatically uses tablet typography and viewport rhythm at CSS viewport widths of at least 800px and heights of at least 540px. No query flag is needed; the former `tablet=1` option is retired. The preview uses the same production stylesheet.

Android status and navigation bars reduce the available CSS viewport. The overview shares that available height between feature cards and home controls, including short 960×540 viewports, while preserving 44px touch targets. Safe-area insets are respected. Error and accessibility content may grow naturally and remain scrollable; dialogs retain independently scrollable bodies.

See `docs/canvas-qa/fire-hd-10-2026-10-06.md` for measured scenarios, interaction checks, and physical-device limitations.

`?scene=health` shows curated speaker/light/presence offline cards after a simulated 15-minute outage and undocked Roomba low-battery guidance plus a noninteractive dashboard tablet charge reminder. Cards open existing controls without backend reminder actions.
