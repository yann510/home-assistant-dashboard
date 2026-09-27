# Final fix report

Base: `fb07559`. Scope: Chill action lifecycle, its contract tests, voice prompt, and setup explanation. No deployment, push, or real Home Assistant/OpenAI calls.

## RED

Added two regression tests before changing the action. Each checks that reconciliation itself makes no second service call and that a later explicit request can activate.

Command:

```text
.venv-ha-2026/bin/python -m unittest home-assistant/tests_ha/test_chill_assist_action.py
```

Output (the two failures; the other 16 tests passed):

```text
......F..........F
======================================================================
FAIL: test_failed_activation_recovery_then_clean_idle_allows_later_request
homeassistant.exceptions.HomeAssistantError: Chill activation could not be confirmed from House Mood status.
AssertionError: "did not start" does not match "Chill activation could not be confirmed from House Mood status."

FAIL: test_uncertainty_then_clean_other_mood_allows_later_request
homeassistant.exceptions.HomeAssistantError: Chill activation could not be confirmed from House Mood status.
AssertionError: "did not start" does not match "Chill activation could not be confirmed from House Mood status."

Ran 18 tests in 0.260s
FAILED (failures=2)
```

## GREEN

The completed-operation guard now recognizes fresh, current, clean idle and another named active mood as resolved outcomes. It clears the guard and raises an explanatory error without dispatching a physical command. A subsequent explicit request may activate. Missing, stale, pending, transitional, recovery, error-bearing, and active-without-mood states retain the guard. Fresh clean Chill still returns `already_active` without a write. The prompt distinguishes known failure, recovery, busy state, and unconfirmed outcome, and explicitly handles `already_active`.

Commands and results:

```text
.venv-ha-2026/bin/python -m unittest home-assistant/tests_ha/test_chill_assist_action.py home-assistant/tests_ha/test_chill_assist_api.py home-assistant/tests_ha/test_chill_assist_conversation.py
Ran 28 tests in 0.525s
OK

.venv-ha-2026/bin/python -m unittest discover -s home-assistant/tests_ha -p 'test_*.py' -q
Ran 83 tests in 2.367s
OK

git diff --check
(no output; exit 0)
```

The HA runs printed expected custom-integration warnings; the full suite also logged an expected mocked OpenAI timeout test. Neither failed a test. Self-review checked freshness against the current sensor object, no dispatch during reconciliation, no guard clearing for recovery/errors/invalid active mood, and no unrelated source changes. No remaining code concern found within this scope.
