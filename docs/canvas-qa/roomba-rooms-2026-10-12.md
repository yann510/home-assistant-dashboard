# Roomba room selection

Added seven iRobot Smart Map room names supplied by the user: bedroom, bathroom, breakfast room, kitchen, office, living room, guest bedroom. All are selected by default; individual room toggles and All rooms follow existing Canvas selection styling. Draft selection survives dialog navigation. Empty selections disable Start. Controls lock while disconnected, unavailable, pending, or during an existing mission. Paused missions show Resume cleaning and retain their original targets.

Selecting all rooms retains vacuum.start. A subset sends one google_assistant_sdk.send_text_command with the captured rooms joined by “and”; it never falls back to a whole-house run on failure. The user confirmed Google Assistant room cleaning already works. Service acknowledgement does not verify room execution, and the UI states this explicitly. Existing Pause, Stop, Dock, Locate and fan controls retain their routing.

Validation: tests first failed before implementation; final suite passed 631 tests across 40 files. Lint and build:dashboard passed. Independent task and final reviews found no issues. Local simulated browser checks at 390×844 and 768×1024 covered default selection, toggles, 44px touch targets, keyboard focus, empty selection, single Kitchen cleaning, active locks, paused resume, rejected room command, and disconnected controls. No browser console errors were observed. No live cleaning command was sent; physical room execution remains unverified.

Implementation commit: 0062400.

Published release roomba-rooms-20261012-0062400 using the repository hash-verified atomic publisher. HTTP verification confirmed release identity and matched served HTML and referenced JavaScript/CSS against the local production build. Pushed to origin/main; original dirty checkout preserved.
