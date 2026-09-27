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
