"""Compare normalized control state; native payloads are never approximated."""
PROGRESSION_FIELDS = {'media_position', 'media_position_updated_at', 'media_title', 'media_artist', 'media_album_name', 'media_duration'}

def matches(target, expected, observed):
    if 'native' in expected:
        # Snapshot timestamps/freshness metadata are durable replay evidence,
        # not part of the device's writable effect configuration.
        return 'native' in observed and expected['native'] == observed['native']
    ignored = PROGRESSION_FIELDS if target.endswith('#playback') else set()
    for key, value in expected.items():
        if key in ignored:
            continue
        if key not in observed:
            return False
        actual = observed[key]
        if key == 'brightness' and target.startswith('light.') and 'native' not in expected:
            if isinstance(value, (int, float)) and isinstance(actual, (int, float)) and abs(value - actual) <= 2:
                continue
        if key == 'hs_color' and target.startswith('light.'):
            if (isinstance(value, (list, tuple)) and isinstance(actual, (list, tuple))
                    and len(value) == len(actual) == 2
                    and all(isinstance(a, (int, float)) and isinstance(b, (int, float))
                            and abs(a - b) <= 0.01 + 1e-12 for a, b in zip(value, actual))):
                continue
        if value != actual:
            return False
    return True

def classify(target, observed, expected, journal, session_id, context_id, now):
    """A context is an attributable command origin, not arbitrary report context.

    Adapters map their command and parent contexts to session_id. An explicit
    external command relinquishes ownership even when its value is identical.
    Unknown reports during transition are deferred; fresh End/readback decides.
    """
    if context_id == session_id:
        return 'ack'
    if context_id is not None:
        return 'external'
    if matches(target, expected, observed):
        return 'ack'
    if any(target in entry['targets'] and now <= entry.get('until', 0) for entry in journal):
        return 'pending'
    return 'external'
