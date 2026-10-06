# Dashboard interaction audit

## Spec

User request: test all dashboard interactions; fix discovered bugs and confusing interactions; record uncertain product choices; verify computer, tablet and mobile behavior. Repository AGENTS.md requires existing design consistency and verified commits pushed directly to origin/main without force-push. The user explicitly accepts Chromium simulation as sufficient acceptance. Physical outcomes are outside this software acceptance and are not certified by simulated UI tests.

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

## Accepted usability follow-up (October 6)

The user delegated choices 1,3,5,6,7 to controller judgment, declined thermostat power/HVAC controls, accepted docked vacuum fan selection, and explicitly chose Chromium testing as sufficient. Bounded design was reflected in chat; proceed under this delegated authority. Baseline b3e8904, same isolated worktree and Global Constraints. Existing completed tasks remain completed.

## Task 3: Specific destinations, inventory and browser navigation

- Individual speaker, thermostat and appliance directory results must open the existing category panel and scroll/focus/highlight the specific result. Merely navigating must never join speakers, change source, write thermostat state or act on appliances. Retain the full category for context.
- Preserve category shortcuts above a browsable full inventory when query is empty. Keep current case/whitespace search, no-match/Clear, retained query, scroll restoration and destination focus on Back. Individual entries should not duplicate category cards in full inventory. Reuse existing design and44px touch targets; no horizontal overflow at280/320/393/768/960/1440.
- Browser/mobile Back traverses details then directory then overview; Forward traverses the recorded UI history. In-app Back, Close and Escape remain coherent with browser history without empty phantom steps, unintended page exits or stale dialog resurrection after a reload. Close returns to overview; ordinary Browser Forward may revisit a valid panel from the current mount, matching normal browser history. Preserve unrelated history state and initial URL/query; no router/dependency installation. Reload should load a sensible overview and future Back should not reopen old stale panels. Cover rapid Back/Close and nested details with meaningful regressions and real Chromium history tests.
- Do not change thermostat HVAC/power controls.
- Use focused behavioral regressions; full frontend suite once before commit, scoped lint and TypeScript as appropriate. Self-review, commit only task files, report commands/results and any concerns. No agents, real device writes, deploy or push. Controller reviews separately.

## Task 4: Docked vacuum fan, explicit blind Stop and favourite continuity

- Show supported fan settings while docked. Set fan speed sends only set_fan_speed, observes the reported fan value, and never starts cleaning implicitly. Preserve capability/offline/pending/unavailable guards and honest rejection/unconfirmed feedback.
- Keep primary Stop's recent-command targeting for90seconds (not physical movement evidence). When selected rooms differ, visibly distinguish primary Stop recent from a separate Stop selected action; explicitly name targets, no selection means selected action disabled, and preserve immediate Stop while movement ACK is pending. Snapshot target sets, preserve failure/retry and prevent stale replay. Touch targets remain≥44px and narrow layouts do not overflow.
- Avoid restarting an already-playing favourite when reliable identity is available: exact meaningful content identity or a previously observed successful selection for the same source and unchanged playback identity. No title-only guess. Show clear Already playing feedback and close gallery for this verified no-op. Paused media must still resume/request playback; another favourite must still send and close only on observed change.
- If an ACK succeeds and the speaker keeps playing but metadata does not confirm the selection, show neutral accepted/unverified status instead of a misleading failure. Keep retry available and gallery open; do not promote ACK to verified selection or physically confirmed playback. Real failures/disconnects retain honest error paths. Guard stale source/generation changes. Tests must cover same favourite, false title matches, changed/paused media, offline/disconnect and unchanged-metadata acknowledged selection.
- Do not alter thermostat power/HVAC controls.
- Focused behavioral regressions; full frontend suite once before commit, scoped lint/TypeScript as appropriate. Self-review, commit only task files, report exact commands/results/concerns. No agents, real writes, deploy or push.

## Task 5: Final Chromium acceptance and publish

Controller exercises new flows through desktop/tablet/mobile Chromium with touch/keyboard, default/enlarged text, offline and failure. Task and broad independent reviews gate changes. Verify full tests (latest implementer), lint/build, guarded frontend deployment+HTTP hashes, live read-only release, normal FF origin/main push. Update audit with resolved user decisions and Chromium acceptance scope; record genuine limitations without requiring physical certification to complete this user-approved scope.

## Completion evidence

All five tasks are complete. Final review findings (overlay history, read-only destination keyboard containment and traversal-test timing) are addressed in df3d4c2 and independently approved. Final frontend verification passes563tests across36files, full lint and TypeScript/production build. Chromium desktop/tablet/phone/touch/keyboard, enlarged text, offline/rejected/unchanged-state interactions pass; backend code remains unchanged from the previously verified suites.

Guarded frontend release df3d4c2 is deployed, with193manifest files and68local build files matching hashes. Signed-in read-only live connection, inventory, specific-row focus and browser Back pass; live phone/tablet inventory has no overflow and console warning/error logs are empty. All seven user usability decisions are implemented, including respecting the declined HVAC controls. Normal fast-forward publication to origin/main completes the project workflow. No open software finding or user decision remains; physical behavior is outside the user-approved Chromium acceptance scope.
