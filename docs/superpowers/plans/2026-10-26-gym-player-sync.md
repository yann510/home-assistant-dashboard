# Gym mood player synchronization

## Goal
Starting or switching a mood updates Music metadata and selected speaker to its confirmed playback, replacing speaker preferences left by earlier playback. Explicit source choices after activation and paused mood queues remain controllable.

## Global Constraints
- Preserve unrelated checkouts and changes.
- Preserve Follow me saved-source/cleanup priority and pending room handoff pins.
- Use reported active mood playback ownership; do not select requested/unconfirmed moods or send device commands to synchronize display.
- Preserve deliberate manual source choices made after the current mood activation, and retain paused mood audio after manual transport releases mood ownership.
- No visual redesign; validate the current dashboard at 1224x614 CSS viewport, DPR 1.5, scale 1 (previously recorded Fire measurement).
- Verify, deploy guarded frontend release, and push fast-forward directly to origin/main.

## Task 1: Scope speaker preference to mood activation
Investigate useSpeakerSession and CanvasMusicProvider selection. Reproduce stale paused Living Room preference established by prior transport or source selection followed by active Gym playback ownership. Add failing CanvasMusic tests covering the user-visible title/artist, selected source, and subsequent transport destination. Implement the smallest fix that scopes old preferences across confirmed new mood activation/switch/session without stealing later manual choices. Cover repeated unrelated mood sensor updates, playback ownership release, new sessions of same mood, switching between moods, missing session identifiers in compatibility fixtures, and Follow/handoff priority with existing tests. Update any old expectations that contradict the explicit new-mood precedence requirement. Do not clear preferences merely on ownership-only sensor changes. Run targeted tests plus full tests/lint/typecheck/build as appropriate. Commit only scoped changes, write task report with root cause, exact failing/passing test evidence, changed files, commit and limitations. Do not deploy/push or spawn subagents.

## Implementation verification
- Scope local speaker preferences to the confirmed active mood's session ID and mood ID; leave ownership-only and unrelated sensor updates outside that identity.
- Clear older preferences synchronously on activation changes, preserving Follow source selection and handoff pins; choices made within that activation retain precedence.
- CanvasMusic regression tests cover prior transport/source preferences, same-mood fresh sessions, mood switches, compatibility fixtures without session IDs, and subsequent transport targets.
- Verified: 770 tests across 49 files; ESLint; TypeScript and dashboard production build. Build retains the existing large-chunk advisory.
