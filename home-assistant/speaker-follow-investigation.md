# Speaker motion following investigation — 2026-09-05

The previous control grouped every available speaker when enabled. The intended behavior is to arm room motion, preserve the original playback speaker, and remove followers when disabled.

## Confirmed failure

Home Assistant logged a WebSocket join failure at 12:23:10 local time:

`Error calling SonosSpeaker.join on Living Room: UPnP Error 1001 received from 192.168.0.40`

Live Sonos discovery and the Home Assistant registry identify that address as Gym. The installed Home Assistant 2025.5.3 implementation joins requested speakers sequentially (`homeassistant/components/sonos/speaker.py`, lines 952–957). Bathroom and Bedroom joined; Gym timed out, leaving exactly the partial group observed in Home Assistant. The reason for the device timeout is unresolved; all speakers reported the same firmware. Subsequent individual Gym joins succeeded.

An earlier HTTP request also failed across dashboard/Home Assistant origins. The control now uses the existing authenticated WebSocket, including inside the Home Assistant app.

## Correction

`SpeakerCard.tsx` calls a queued Home Assistant script. Enable stores the original coordinator and sets the mode helper; it sends no media command. Each existing room automation passes only its own speaker on motion. Disable clears the mode before removing followers. Any later queued motion run rechecks the mode and stops. A retained source after failed cleanup cannot be overwritten by enable; the dashboard offers an ungrouping retry.

Native testing exposed another error-reporting issue: Home Assistant accepts a script service call even when a script `stop` action aborts with `error: true`. The [2025.5.3 script implementation](https://github.com/home-assistant/core/blob/2025.5.3/homeassistant/helpers/script.py) handles that as an internal abort. The script now returns explicit success or validation error data, and the UI requests and checks that response. An empty response is treated as incomplete execution.

## Verification

- New motion-control tests failed against the previous implementation; all 13 speaker tests and 6 existing tests now pass.
- Native Home Assistant test: enable preserved the group; disable kept Living Room playing alone; motion while off did nothing; Bathroom, Bedroom, then Gym each joined only after its own automation was triggered; duplicate motion left the group unchanged; final disable restored Living Room alone. This sequence passed twice.
- Native WebSocket tests confirmed validation messages reach the caller, a pending original source cannot be overwritten, and successful enable/disable return explicit confirmation.
- TypeScript, ESLint, production build, and whitespace checks pass.
- Deployed browser test: the button enabled following without grouping, remained on after reload, and a Bathroom motion action joined Bathroom while the dashboard was closed. Reopening and switching off removed Bathroom and kept Living Room playing. No browser errors were logged. The live configuration matches the repository after Home Assistant's normal service/action and automation-key normalization.

The live tests invoked the existing automations' motion actions; they did not physically walk through the rooms. The existing sensor mappings cover Bathroom, Bedroom, and Gym. Configuration backups and live state snapshots are retained locally under `backups.local/`.
