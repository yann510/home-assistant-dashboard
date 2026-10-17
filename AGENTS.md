# UI consistency

## Target device

The main dashboard runs on an Amazon Fire HD 10 tablet in landscape. Use the current dashboard at this tablet format for UI design, mockups, and validation, preserving the surrounding dashboard when comparing changes. Confirm the browser's effective CSS viewport and display scaling rather than assuming the physical display resolution is the browser viewport. Existing simulated tablet measurements are documented in `docs/canvas-qa/fire-hd-10-2026-10-06.md`; they do not establish the physical tablet's actual browser viewport.

## Completion workflow

The user wants completed, verified work for this project committed and pushed directly to `origin/main`, without a pull request or another confirmation. Fetch first and integrate any remote changes safely; never force-push. When working in a separate worktree, a normal `git push origin HEAD:main` is appropriate after verifying that it is a fast-forward. Preserve unrelated changes in other checkouts. Deployment and pushing are separate steps: do not leave a completed deployment only on a local branch.

For future UI changes, reuse the dashboard's existing components, theme tokens, colors, borders, corner radii, typography, and interaction states. Inspect comparable existing controls before adding or restyling controls. Avoid browser-default checkbox styling and hard-coded button colors that conflict with the dashboard design.

Keep controls visually compact while preserving comfortable phone and tablet touch targets. Check enabled, disabled, selected, and focus states in the local preview. Propose a different visual style only when the user explicitly asks for a redesign.
