"""Resolve the registered gateway belonging to the monitored thermostats."""
def gateway_state(entries, states, config_ids):
    candidates = []
    for entry in entries:
        if (entry.get('platform') != 'hilo' or entry.get('config_entry_id') not in config_ids
                or entry.get('disabled_by') or not entry.get('unique_id', '').endswith('-hilo_gateway')):
            continue
        state = states.get(entry['entity_id'])
        if state is not None and not state.get('attributes', {}).get('restored'):
            candidates.append(state['state'])
    # Never pick an arbitrary healthy device when identity is ambiguous.
    return candidates[0] if len(candidates) == 1 and candidates[0] in {'on', 'off'} else 'unavailable'
