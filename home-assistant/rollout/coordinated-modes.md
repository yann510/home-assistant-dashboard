# Coordinated Day/Night rollout (not deployed)

The captured live routines in the interaction-testing workspace show Night disables Morning, switches the toilet off, and stages LocalTuya DP22 at raw126 on seven mapped devices. Day disables Night and stages raw1000. Neither routine powers all lights on/off. The original queued script suppresses per-device failures, so a helper update never proves staging completed.

The new `house_moods.apply_mode` runs those effects inside the mood transaction lock. Reapplying the already-on mode ends an active mood. Mood-controlled lights that the selected routine stages relinquish restoration ownership before any device write, preventing a brighter baseline flash; other owned controls restore normally. Mode steps and retry evidence are durable. Failures stay in recovery; retries skip completed steps and preserve explicit manual changes. Successful response means service acceptance, not physical DP confirmation.

Busy/recovery ruling: starting, restoring, and recovery-required sessions reject conflicting mode requests. An active mood can be superseded. This deliberately uses the normal busy guard rather than preempting a partially committed device operation. The UI explains disabled mode controls. External helper requests during a busy transaction are rejected, then their premature helper changes are repaired under the coordinator lock; no physical mode routine is replayed. Helper state is never used as completion evidence.

Before enabling:

1. Install the integration files and preserve private session storage.
2. Disable (do not delete) all three legacy mode automations named in `coordinated-modes.yaml`. Stop their in-flight actions and the old brightness script before restarting the integration. Remove any other independent calls to the brightness script from mode routines.
3. Merge `house_moods.coordinated_modes: true` and the replacement scheduled automation from the example; keep all unrelated configuration.
4. Restart Home Assistant. Verify `sensor.house_mood.attributes.mode_control` is `coordinated-v1`. Missing/enabled legacy automation entities fail closed. Rollback disables the new schedule and opt-in before reenabling the legacy routines.
5. Update voice/routine integrations to call `house_moods.apply_mode` where possible. Ordinary `input_boolean.turn_on`/`toggle` service calls are intercepted, including already-on reapplication, and routed through the same coordinator. Arbitrary direct state writes are not a supported mode-command interface.

The frontend uses the new service only when the capability is advertised. Against existing unmodified HA, mode buttons work only when no mood is active; active/busy/recovery moods block unsafe legacy helper writes. No migration or hardware verification has been performed as part of these local tests.

The new schedule does not silently queue mode changes through a busy/recovery session. A rejected 9:30 request is visible in its service result/automation trace and must be retried after resolving the existing operation.

### Previously-off LocalTuya lights

Home Assistant reports `brightness: null` while these lights are off, hiding the raw staged DP22 value. When a mood changes the brightness of an owned, previously-off LocalTuya light, End restores power-off first and then stages that single device to the captured exclusive base-mode default (Night raw126 or Day raw1000). It does this only if the base mode is unchanged and the device has not been manually overridden during the mood. Devices whose brightness was never changed by the mood are not restaged. A failed DP service remains unresolved recovery even if power-off succeeded; retry persists across restart.

This is the approved **base-mode default** policy, not an exact raw snapshot or a claim of physical DP confirmation. An unseen custom raw brightness staged before the mood may return to the mode default. No private LocalTuya internals are guessed. With missing/conflicting mode helpers there is no known default, so ordinary power restoration cannot additionally guarantee staged brightness. Existing sessions captured before this metadata was introduced also retain their original restoration behavior.
