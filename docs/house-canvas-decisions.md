# House Canvas implementation decisions

Decisions made while executing the approved production plan, in order. Each includes the practical cost if it needs to change.

1. Define shared CanvasRoute in task 1 rather than task 6 — avoids incompatible navigation contracts — cost if wrong is small type refactor.

2. Add explicit targetless command correlation in task 2 — blinds cannot use fake entity targets — cost if wrong is command adapter rework.

3. While an Open/Close request is pending, Stop targets its captured movement rooms even if selection changes or empties; label the action accordingly — reconciles empty-selection disabling with the stronger emergency Stop requirement — cost if wrong is stopping a room the user has since deselected, never initiating new movement.

4. Replace reused HAKitVacuumControls in Canvas with a scoped explicit-action CanvasVacuum — installed source shows fan-speed writes on mount and no visible error path, contradicting spec no automatic writes — cost if wrong is extra maintained control code; Classic vacuum remains unchanged.

5. Follow latest user-supplied AGENTS completion instruction to push verified source to origin/main after safe fetch/integration, superseding older branch-only plan wording; retain optional Canvas and separate trial deployment — source integration does not adopt the new dashboard as default — cost if wrong is reverting source commits, not replacing the live dashboard.

The latest repository completion instruction governs source publication to main. Canvas remains an optional view and is deployed separately for the tablet trial; the existing deployed dashboard is preserved. Physical device acceptance remains pending user observations.
