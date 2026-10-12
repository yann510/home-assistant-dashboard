# Short tablet collection layout

Root cause: collection metadata and the 44px Play collection button occupied a vertical stack. Adding release date and loaded count increased its height even though the existing short viewport rules reduced artwork and text sizes. At the reproduced 960 × 540 viewport, the first 58px song row ended at 411.2px while the scroll content ended at 369px.

The short tablet breakpoint (width at least 850px and height at most 660px) now places the Play button beside the metadata in a second grid column. It spans the five possible text rows: title, subtitle, description, release date, and loaded count. Text retains wrapping, metadata remains visible, and the existing theme and minimum 44px button height remain in effect. Phone and taller viewport rules are unchanged.

Checks completed: `npm run lint`, `npx tsc -b`, `npm exec vite build`, and `git diff --check` pass. Vite reports its existing large chunk advisory. No CSS implementation-mirroring test was added. Real viewport geometry and interaction verification remain with the parent agent before deployment and push.
