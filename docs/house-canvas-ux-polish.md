# Canvas usability follow-up — September 23, 2026

The optional Canvas view keeps its existing palette, artwork and overview composition. Classic and Quiet navigation remain available.

- Dialog title, Close and nested Back stay in a persistent header; only the body scrolls. Forward navigation resets the body, while Back restores the previous list position, search and activation focus. The scrollport includes room for focus outlines.
- Favourite tiles with missing or failed artwork show a readable playlist title. Actual artwork stays title-free, tiles remain square, and the redundant visible favourites heading is removed. Long fallback titles wrap to three lines; the complete playlist name remains the button's accessible name.
- The compact speaker-volume opener reports `Muted` when every target reports mute, or `Some muted` when only some do. Unknown/unavailable targets do not establish mute. Opening Speakers and relative volume commands retain their existing behavior.
- Snoozed reminder choices now live inside the existing horizontal House pulse scroll row. Expanding several reminders preserves the reserved band and sends the same episode-specific unsnooze command; restore controls remain disabled while saving.
- Day/Night buttons stay in their compact pill. Pending, failed and unconfirmed feedback appears first in House pulse, with concise mode-specific text, full error text for assistive technology/hover, and a dismiss button for errors. New feedback is revealed within the row; confirmed success disappears because the selected button already communicates it.

## Automated verification

- `npm test`: **340 tests passed across 30 files**.
- `npx tsc -b`: passed.
- ESLint on all changed TypeScript/TSX files, including the controlled preview: passed.
- `npm run build:canvas-trial`: passed. Vite still reports its bundle-size advisory.

Behavior regressions cover dialog focus trapping, close restoration, forward/reset and Back/restore scroll, searched directory focus, mode failure/dismiss/retry/observed success, missing and broken art, all/partial/unknown mute state, command-free speaker navigation, and multiple snoozed episode restoration with the pending lock. Existing volume and command safety coverage remains in the full suite.

## Controlled browser verification

The root agent drove the local preview in the Codex in-app browser; this entry uses a fake connection and never connects to Home Assistant. Browser checks confirmed:

- At **960 × 600**, a rejected Night command leaves the document at **960 × 600**, header at **52 px**, and House pulse at **62 px**. Feedback and Dismiss stay in the row, with no overlay or header distortion.
- Tablet All lights scrolled **537 px** retains Close at **x=836, y=40**, size **49.9 × 45.2 px**. Body client/scroll widths both measure **801 px**.
- At **375 × 812**, the 24-hour forecast scrolled **1014 px** retains Close at **x=309, y=24**, size **49.9 × 45.2 px**. Body client/scroll widths both measure **332 px**.
- Phone All lights retains Close at its bottom. Nested Back restores the previous **925 px** scroll position and trigger focus.
- At **393 px**, expanding three snoozes keeps document width **382 px** within the viewport while the contained row has **1096 px** of scrollable content.
- At **375 px**, all three Player favourite tiles measure **102.33 px square**. The artwork tile has no text, fallback titles remain legible with three-line ellipsis and complete accessible labels, and the visible heading is absent.
- Phone All devices scrolled **1834 px** retains Close at **x=309, y=24**, size **49.9 × 45.2 px**. Body widths both measure **332 px**, and document width stays **375 px**.
- The muted overview opener exposes its state-bearing accessible name. Missing and broken artwork show readable titles; actual artwork stays title-free.

Controlled scenarios are available at `/dev/canvas-preview/index.html?view=canvas`: `scene=snoozed`, `muted=1`, `long=1&brokenArt=1`, and `scene=busy` (rejected command). Normal Night activation reports its observed state; `unconfirmed=1` keeps the mock acknowledgement without the state change.

## Live access and limits

The corrected LAN trial URL, `/local/canvas-trial/index.html?view=canvas`, now reaches the normal Home Assistant authorization screen in the in-app browser, showing Username, Password and Log in. No credentials were entered. The earlier wrong-folder access issue is superseded by this successful login-screen reachability check. Authenticated live UI/state updates, Fire tablet/iPhone hardware acceptance and physical command outcomes remain pending. No real-home commands were sent during this follow-up.

## Spacing follow-up

Reviewed source `f840c3976828df2835fe755bf3e098ed2dc8cae3` applies a shared 4/8/12/16/20/24 px spacing scale to Canvas and its dialogs. Overview columns use equal 16 px gaps; Lights and Blinds have matched 44 px heading rows and 8 × 16 px card insets. Dialog content aligns beneath its header while preserving the focus gutter and phone safe-area padding. Speaker sections and Advanced actions have consistent gaps. Forecast tabs remain equal-width touch targets, and pulse focus outlines sit inside the scroll row. Classic and Quiet behavior, service calls and command handlers are unchanged.

Verification: **340 tests across 30 files**, TypeScript, targeted ESLint and the Canvas trial build passed. The final CSS-only corrections were followed by another successful build and whitespace check. The existing Vite bundle-size advisory remains. Independent review passed with no blocking findings.

The root agent inspected the controlled preview through CUA:

- At 960 × 600 in the busy state, the document remains exactly 960 × 600, both overview gaps are 16 px, Lights/Blinds headings align and the pulse focus outline is fully visible.
- Speakers header/content begin at x=74/74.5; body client and scroll widths both measure 813 px.
- At 375 px, weather tabs share y=119.2, each measuring 50 × 102.66 px with 8 px gaps. Header/body content align at x=20; body client and scroll widths both measure 336 px, with no horizontal overflow.

Screenshots were inspected in CUA; no new screenshot files were saved. Authenticated live updates and physical Fire tablet/iPhone checks remain pending. No real-home commands were issued.

## Header control height follow-up

Reviewed source `287c1bc5c5521b64b58282cd35540fb2f05275e1` sets a 52 px minimum outer height on the two direct Canvas header buttons and the Day/Night group. Day/Night buttons retain their 44 px touch targets. The root agent measured all three outer controls at 52 px at both 960 px and 375 px widths; the tablet document still fits 960 × 600, and phone wrapping remains intact. Type checking and an explicit `npm run build:canvas-trial` passed; independent review approved the three-line CSS change. The last full suite remains the preceding 340-test run; it was not rerun for this CSS-only correction. Authenticated live and physical-device checks remain pending.
