"""Run every motion guard case through HA's actual RestrictedPython sandbox."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tests'))
import test_motion_mood_guard

class MotionSandboxTests(test_motion_mood_guard.MotionGuardTests):
    def run_script(self,*args,**kwargs):
        return super().run_script(*args,**kwargs,restricted=True)
