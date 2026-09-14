# UI consistency

## Completion workflow

The user wants completed, verified work for this project committed and pushed directly to `origin/main`, without a pull request or another confirmation. Fetch first and integrate any remote changes safely; never force-push. When working in a separate worktree, a normal `git push origin HEAD:main` is appropriate after verifying that it is a fast-forward. Preserve unrelated changes in other checkouts. Deployment and pushing are separate steps: do not leave a completed deployment only on a local branch.

For future UI changes, reuse the dashboard's existing components, theme tokens, colors, borders, corner radii, typography, and interaction states. Inspect comparable existing controls before adding or restyling controls. Avoid browser-default checkbox styling and hard-coded button colors that conflict with the dashboard design.

Keep controls visually compact while preserving comfortable phone and tablet touch targets. Check enabled, disabled, selected, and focus states in the local preview. Propose a different visual style only when the user explicitly asks for a redesign.
