# House Canvas — third dashboard concept

## Agreed intent

Create a complete interactive visual prototype alongside Classic and Quiet Home. The user wants an artistic, playful design with a modern touch and has approved a warm charcoal canvas, abstract artwork, and coral, lavender, and butter-yellow accents. The prototype is an exploration on the proof-of-concept branch, not a production replacement.

The primary device is a wall-mounted Amazon Fire HD 10 in landscape, running full-screen. An Amazon order email confirmed the model, but not its generation. The secondary device is the smaller iPhone 16 Pro or 17 Pro. Device viewport sizes have not been measured; physical display pixels must not be treated as CSS viewport dimensions.

Success means everyday controls fit comfortably on one tablet overview, with full details one tap away. Phone use can scroll. The user's priorities are lights and blinds, visible Day/Night controls, mood selection, now-playing music, current temperature, contextual attention items, and an All devices destination. Thermostat controls are secondary.

## Visual direction

Use warm charcoal surfaces, cream text, rounded geometry, a clear sans-serif typeface, and original lightweight geometric artwork. Artwork gives mood selection personality without competing with labels. Accents change with the selected mood, while status labels and icons remain consistent. Avoid continuous animation, expensive blur effects, tiny text, and colour-only state indicators. Respect reduced motion and maintain readable contrast.

## Tablet overview

- A compact header contains an explicit Day/Night segmented control, date/time, current outdoor temperature and condition, and All devices. Weather opens the forecast.
- A middle band pairs mood selection with music. Expose the existing Love, Unwind, Dinner, Party, and Gym choices plus a clear way to end a mood. Music shows artwork, track and artist, speaker room, play/pause, skip, and volume. Further source and speaker options open details.
- A room grid uses the existing room names: Living room, Bedroom, Office, Kitchen, Gym, Entry, and Toilet. Each room has a labelled light toggle and a separate detail target. Living room, Bedroom, and Gym also expose distinct Open, Stop, and Close blind buttons. Never nest a control inside a clickable card button.
- A compact attention area shows the most relevant reminder or running activity, plus access to additional items. Its space is reserved so new reminders do not move frequently used controls. An empty state is quiet and brief.

Start layout verification at 1280 × 800 and a conservative 960 × 600 CSS viewport. These are test sizes, not confirmed device measurements. Compress decorative space before reducing touch targets. If an unusually small viewport cannot fit the overview, allow scrolling rather than clipping controls. Final hardware fit remains subject to the tablet's actual browser viewport.

## Phone layout

Use the same visual language in a vertical layout: Day/Night and weather, attention when applicable, mood, room controls, and music. Keep All devices accessible and a compact music transport available while scrolling without covering content. Full music controls open on tap. Respect safe areas and verify widths from 375 to 440 CSS pixels. Aim for touch targets of at least 44 × 44 CSS pixels across both layouts.

## Details and interactions

Details open in a side sheet on tablet and a bottom sheet on phone, with a visible title and close button, Escape dismissal, focus containment, background scroll locking, and focus restoration.

- Room details: individual lights, power, brightness, supported colour choices, and room blind commands where available.
- Mood: select, show active state, change, and end. Day/Night state is independently visible.
- Music: play/pause, next/previous, volume, room/source selection, and favourite selection with simulated results.
- Forecast: readable sample hourly and daily views.
- Attention: inspect and dismiss a sample completed-appliance reminder; inspect running activity. Additional notices are available without expanding the overview indefinitely.
- All devices: searchable room/category directory containing lights, blinds, speakers, thermostat, appliances, and vacuum. Each entry opens relevant simulated controls or status, with a back path to the directory.

Blind controls acknowledge a command but do not invent measured positions: the current integration supplies no position feedback. Show unavailable device states and useful empty search results.

## Prototype implementation boundary

Build an independent static page under `public/concepts/house-canvas/`, using local HTML, CSS, JavaScript, and assets. Keep existing concept URLs and the live dashboard unchanged. The standalone page contains a subtle Prototype label and a separate demo menu for resetting sample data and switching between everyday, busy, and nighttime scenarios.

Maintain one local state model shared by overview and detail controls; reset or refresh restores sample state. No Home Assistant connection, credentials, external device commands, or production deployment. Use the existing source as an inventory reference, not as a live backend. Prototype controls should respond meaningfully rather than provide decorative dead ends.

## Validation and handoff

Inspect rendered tablet and phone layouts, including the busy scenario, long music titles, unavailable controls, and open sheets. Check page overflow, full tablet overview fit at the reference sizes, touch targets, legibility, and focus visibility. Exercise all primary actions, shared state across sheets, directory search/back navigation, scenario reset, and keyboard dismissal. Run JavaScript syntax and diff checks. Deliver a browser preview with both sizes verified and report any actual-hardware sizing limitation honestly.

## Next stage

The conversational design is approved. Review this written brief, then create the implementation plan and build the prototype through the agreed development workflow.
