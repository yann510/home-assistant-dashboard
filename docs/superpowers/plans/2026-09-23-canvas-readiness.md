# House Canvas readiness implementation plan

**Goal:** Apply the approved pre-production refinements while preserving the current dashboard and prototype branch.
**Architecture:** Keep the isolated prototype as the reviewable design. Audit real dashboard controllers before reuse in an optional live view. Never equate a service acknowledgement with a measured device outcome.
**Tech stack:** Prototype HTML/CSS/ES modules; production React/HAKit.
**Spec:** Approved in-chat refinements: direct speaker/player access, explicit command feedback, feature preservation, stable activity layout, physical-device validation, optional live rollout.

- [x] Route speaker name directly to Speakers and track directly to Player.
- [x] Reserve activity space with quiet empty state; preserve device positions as activity changes.
- [x] Demonstrate pending, success and failure feedback with explicit simulated outcomes and retry.
- [x] Record source-grounded feature audit and unresolved integration gates.
- [x] Verify tablet/phone browser layouts, interactions and relevant checks.
- [ ] Resolve live-integration scope with user; actual hardware acceptance requires the mounted tablet/iPhone.

Live view must remain opt-in on the PoC branch. No deployment or default-view replacement in this phase. Do not issue live home commands as part of browser verification.

Scope clarification sent to user: prototype refinements/audit versus also building the optional live view. No reply received during this pass; live integration has not begun. Hardware acceptance remains outstanding.
