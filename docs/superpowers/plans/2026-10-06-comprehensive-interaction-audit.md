# Dashboard interaction audit

## Spec

User request: test all dashboard interactions; fix discovered bugs and confusing interactions; record uncertain product choices; verify computer, tablet and mobile behavior. Repository AGENTS.md requires existing design consistency and verified commits pushed directly to origin/main without force-push. Physical outcomes require actual observation and cannot be certified by simulated UI tests.

## Global Constraints

- Work in /Users/yann510/.codex/worktrees/house-status-20261006 from baseline 321f87d. Preserve unrelated checkouts.
- Reuse existing components, theme tokens and interaction states; maintain comfortable touch targets and focus states.
- Never replay stale writes after connection interruption. Local preview commands must remain simulated.
- Existing detail appliance semantics are authoritative: stop means Idle; pause means Paused; run with finish/finished means Finished; unknown/unavailable take precedence.
- Commit tested fixes. Controller handles final verification, deployment assessment and fast-forward push.

## Task 1: Fix audit defects

Read /tmp/dashboard-interaction-audit-20261006.md and /tmp/dashboard-usability-audit-20261006.md.

1. Reproduce and fix retained seek gestures across in-place socket disconnect/ready events. Cancel gesture/draft/timer on lifecycle interruption, disable changes and changed entity/media identity where relevant. A cancelled old pointerup must send no write; a fresh gesture must work. Add meaningful custom pointer regressions covering horizontal seek, vertical cancel, pointer cancellation, Escape/blur/capture loss, keyboard, and in-place reconnect. Do not change normal seek semantics gratuitously.
2. Share appliance classification between Pulse and AppliancesCard so all machine/job combinations agree under the authoritative semantics above. Regression cover stop/pause/run+finish, unknown/unavailable and disconnected states; preserve estimates and icon behavior.
3. Match House Pulse DOM/keyboard order to existing visual order (mode feedback, health notices, attention notices, activities, snoozed controls). Remove CSS-only notice reordering. Verify ordering with simultaneous notices and activities.
4. Fix All devices results grid overflow at narrow/zoomed widths by clamping grid minimum and allowing long text to wrap. Browser baseline at 280x600 has dialog body clientWidth 241 and scrollWidth 251 for search light. Preserve normal designs.

Run affected tests and TypeScript/scoped lint, commit all fixes and write report with exact commands/results, reproduction evidence, changes, and concerns. Do not spawn agents. Do not deploy, push or issue real device commands.

## Task 2: Acceptance evidence

Controller exercises every primary local-preview family (moods/modes, room and device lights, settings, blinds, transport/seek/favourites/group/volume/follow, weather, search/back/close, thermostat/vacuum, reminders) plus failure/offline/empty/recovery states, keyboard/reduced motion and responsive viewports. Independent task and whole-change reviews gate fixes. Record coverage and uncertain product choices in docs/canvas-qa/comprehensive-interactions-2026-10-06.md. Run full automated frontend/backend regression suites, lint, typecheck and production build. Review deployment script and publish verified frontend if feasible under existing project authorization, then verify release and fast-forward push origin/main. Clearly report physical-device/live-hardware limits.
