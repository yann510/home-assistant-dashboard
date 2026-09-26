# Mood-owned lights defer both motion-on and delayed motion-off commands.
# Read the current mood at each write, including after a no-motion sleep.
strip_only_off = (
    "light.office_bulbs", "light.light_living_room_bulbs", "light.light_toilet",
    "light.light_bedroom", "light.light_front_door", "light.light_kitchen",
    "light.light_laundry_room", "light.bedroom_closet", "light.gym",
)

def mood_owns_light(entity_id):
    mood = hass.states.get("sensor.house_mood")
    return (entity_id in strip_only_off and mood is not None and mood.state != "idle"
            and (mood.attributes.get("active_mood") in ("love", "party")
                 or mood.attributes.get("pending_mood") in ("love", "party")))

# Inputs
person_detected_entity = data.get("person_detected_entity")
lumen_sensor = data.get("lumen_sensor")
lumen_threshold = float(data.get("lumen_threshold", 0))
light_target_one = data.get("light_target_one")
light_target_two = data.get("light_target_two")
no_motion_wait = data.get("no_motion_wait", 120)
optional_script_on = data.get("optional_script_on")
time_off_text_entity = data.get("time_off_text_entity")
# Day mode must be on for a light to turn on. A caller may override the entity,
# while auto-off keeps working regardless of the mode.
gate_entity = data.get("gate_entity", "input_boolean.morning_mode")
# Optional entity (e.g. input_boolean.night_mode) that must be "off" for the
# light to turn on. Only blocks turn-on; auto-off keeps working regardless.
block_entity = data.get("block_entity")

light = hass.states.get(light_target_one)
light_state = light.state if light else None
motion = hass.states.get(person_detected_entity)
motion_state = motion.state if motion else None

if motion_state == "on":
    logger.info(f"Motion detected, setting turn off time to null")
    hass.services.call("input_text", "set_value", {"entity_id": time_off_text_entity, "value": ""})

    if optional_script_on:
        hass.services.call("script", "turn_on", {"entity_id": optional_script_on})

    ignore_lumen = lumen_threshold <= 0
    current_lumen = float(hass.states.get(lumen_sensor).state) if lumen_sensor and hass.states.get(lumen_sensor) else 0
    gate_state = hass.states.get(gate_entity) if gate_entity else None
    gate_open = gate_entity is None or (gate_state is not None and gate_state.state == "on")
    block_state = hass.states.get(block_entity) if block_entity else None
    is_blocked = block_entity is not None and block_state is not None and block_state.state == "on"
    if not gate_open:
        logger.info(f"Gate entity {gate_entity} is not on, skipping turn on")
    if is_blocked:
        logger.info(f"Block entity {block_entity} is on, skipping turn on")
    should_turn_on = light_state == "off" and gate_open and not is_blocked and (ignore_lumen or current_lumen < lumen_threshold)
    if should_turn_on:
        if not mood_owns_light(light_target_one):
            hass.services.call("light", "turn_on", {"entity_id": light_target_one})
        if light_target_two and not mood_owns_light(light_target_two):
            hass.services.call("light", "turn_on", {"entity_id": light_target_two})
    else:
        logger.info("Light already on or lumen threshold exceeded")
elif motion_state == "off":
    # Preserve the helper's display format, but compare full dates locally so a
    # wait crossing midnight is safe. Each waiter belongs to one vacancy episode.
    vacancy_started = motion.last_changed
    future_off_time = datetime.datetime.now() + datetime.timedelta(seconds=no_motion_wait)
    future_time_off_formatted = f"{future_off_time.hour:02}:{future_off_time.minute:02}:{future_off_time.second:02}"
    logger.info(f"No motion detected, will turn off light in {no_motion_wait} seconds at {future_time_off_formatted}")
    hass.services.call("input_text", "set_value", {"entity_id": time_off_text_entity, "value": future_time_off_formatted})

    time.sleep(no_motion_wait)

    def vacancy_still_due():
        current_motion = hass.states.get(person_detected_entity)
        deadline = hass.states.get(time_off_text_entity)
        return (current_motion is not None and current_motion.state == "off"
                and current_motion.last_changed == vacancy_started
                and deadline is not None and deadline.state == future_time_off_formatted
                and datetime.datetime.now() >= future_off_time)

    # Recheck before each write: restarting an automation need not cancel its
    # already-running Python sleep. Never trust a surviving deadline alone.
    if vacancy_still_due() and not mood_owns_light(light_target_one):
        hass.services.call("light", "turn_off", {"entity_id": light_target_one})
    if light_target_two and vacancy_still_due() and not mood_owns_light(light_target_two):
        hass.services.call("light", "turn_off", {"entity_id": light_target_two})
else:
    # Missing/unknown/unavailable presence is not evidence that the room is empty.
    hass.services.call("input_text", "set_value", {"entity_id": time_off_text_entity, "value": ""})
    logger.info("Presence is unavailable; cancelling automatic light shutdown")
