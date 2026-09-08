# Gym audio dropout — investigation resumed September 7, 2026

**The motion logic completed its join and did not stop Gym before Follow me was turned off. The cause of the earlier audible silence is not yet proven.**

## Recorded sequence

All times below are September 5 in America/Toronto (EDT).

| Time | Evidence |
| --- | --- |
| 12:37:31.867 | Follow me enabled; original speaker saved as Living Room. |
| 12:37:40.454 | Gym motion started the room join automation. |
| 12:37:41.644 | Join completed; Gym appeared in Living Room's group. |
| 12:37:54.429 | Gym motion sensor cleared. No audio action ran. |
| 12:37:57.542 | Repeated motion skipped joining because Gym was already grouped. |
| 12:38:11.547 | Motion-off light automation began its 180-second delay. It targets the Hilo Gym light, not the Sonos speakers. |
| 12:38:12.263 | Bathroom joined the existing Living Room + Gym group. |
| 12:38:48.247 | An explicit Follow me disable command turned the mode off. |
| 12:38:48.936–49.404 | Gym and Bathroom detached; Living Room continued playing. |

Gym's recorded local volume remained 36%, with mute false. Full recorder attribute history confirms Gym remained in the group throughout this interval. The group leader reported playing “Napkins.”

## Why the earlier playback test was insufficient

The installed Home Assistant 2025.5.3 Sonos integration resolves a follower's coordinator at `homeassistant/components/sonos/media_player.py:265–267`. Its `media` property returns that coordinator's media object at lines 334–336. Entity state is derived from that shared object's playback status at lines 279–296; title and source are also shared at lines 384–391. Local volume and mute are separate at lines 313–320.

Consequently, a grouped Gym speaker can report **playing even if no sound comes out of Gym**. The previous tests verified service responses, grouping, and coordinator playback. They did not verify sustained audible output. This corrects the scope of the previous verification report.

## Automation and error audit

All 35 readable automation/script configurations and both related Python helpers were inspected. No automatic Gym pause, mute, volume, speaker-power, or motion-off ungroup action was found. The TV ungrouping rule last ran March 30, 2024. An older alarm routine that can stop Bedroom last ran September 28, 2024.

Retained Home Assistant logs from September 5 at 12:35 through this investigation contain no Sonos/SoCo/UPnP/AVTransport errors, join/unjoin exceptions, lost-speaker warnings, or subscription-renewal failures. The earlier 12:23 UPnP 1001 error was a separate, confirmed Gym join timeout. The Spotify integration logged a revoked refresh token at 12:37:54.825; that alone does not explain Gym-only silence while the Sonos coordinator continues.

Surviving native trace IDs:

- Gym join: `05c02acb4d80b47781b5d8bbf0bda4f1`
- Repeated Gym motion: `c5b790b77bc03d346759b049e154da34`
- Gym motion-off light timer: `83f9c306fc9ff93fb98b86cb86ff5e95`

The installed Hakit 5.1.6 source map also shows that its playback and mute commands are user-event handlers. Its update effects maintain display progress and slider state; no timer stops Gym after joining.

## Direct speaker checks

Gym is a bonded stereo pair: the visible right speaker at `192.168.0.40` and hidden left speaker at `192.168.0.25`. Both remained present in Sonos topology and reported firmware `96.1-79270`, matching the other rooms. Both use Wi-Fi on channel 11; Ethernet links are down.

On September 7, 20 read-only ping requests per device produced:

| Device | Packet loss | Average round trip | Maximum round trip |
| --- | --- | --- | --- |
| Gym right | 0/20 | 11.639 ms | 38.503 ms |
| Gym left | 0/20 | 10.763 ms | 37.316 ms |
| Living Room | 0/20 | 10.897 ms | 40.562 ms |
| Bathroom | 0/20 | 16.443 ms | 98.523 ms |

These measurements show current reachability, not audio delivery during the September 5 failure. Cumulative radio/bridge counters were collected but do not establish an incident-specific network fault. No reboot, pairing change, router change, playback command, or automation edit was made during this resumed investigation.

## Remaining hypotheses and discriminating test

1. **A Sonos audio delivery or stereo-pair issue: moderate confidence as a category, exact cause unknown.** It fits audible silence while the room stays grouped and reachable. It is still necessary to establish whether one or both Gym speakers stopped.
2. **Transient Wi-Fi interference: plausible but unproven.** Current pings do not reproduce it. Sonos documents interference as a possible cause of [music-service dropouts](https://support.sonos.com/en-us/article/music-service-audio-stops-or-skips).
3. **A motion-off automation stopping audio: contradicted by the available traces and configuration.**

The next useful comparison is a listening test with Follow me off: manually group Gym with Living Room in Sonos, using the same audio source, and leave it playing for a few minutes. If Gym still goes silent, the failure also exists outside the dashboard/motion path. If it only happens with Follow me, capture the exact silence time and state/trace data during that run. Reproduce before changing pairing or network settings.

If Sonos-specific diagnostics are needed, its app can [submit a diagnostic snapshot](https://support.sonos.com/en/article/submit-diagnostics) for Sonos Support. None was submitted by this investigation.

Raw recorder history, topology, and local diagnostic responses are retained under `backups.local/`. No speculative fix was deployed.
