"""Curated attention rules. Pure, clock-injected, independent of Home Assistant."""
from copy import deepcopy
from datetime import datetime, timezone
import math
import uuid

BAD = {'unknown', 'unavailable', ''}
FINISH = {'finish', 'finished'}
INACTIVE = BAD | FINISH | {'none', 'ready', 'stop', 'off', 'idle', 'pause'}
BATTERIES = {
    'sensor.hue_motion_sensor_1_battery': 'Bedroom',
    'sensor.hue_motion_sensor_2_battery': 'Front door',
    'sensor.hue_motion_sensor_1_battery_3': 'Bedroom closet',
    'sensor.hue_motion_sensor_1_battery_2': 'Gym',
}
DEVICES = {
    **{f'climate.thermostat_{room}': f'{room.title()} thermostat' for room in ('office', 'gym', 'bedroom')},
    'binary_sensor.hue_motion_sensor_1_motion': 'Bedroom motion sensor',
    'binary_sensor.hue_motion_sensor_2_motion': 'Front door motion sensor',
    'binary_sensor.hue_motion_sensor_1_motion_3': 'Bedroom closet motion sensor',
    'binary_sensor.hue_motion_sensor_1_motion_2': 'Gym motion sensor',
}
APPLIANCES = ('washer', 'dryer', 'dishwasher')
ENTITIES = set(BATTERIES) | set(DEVICES) | {
    'vacuum.roomba', 'binary_sensor.roomba_bin_full', 'binary_sensor.rpi_power_status',
    'binary_sensor.coda_4680_fiz_wan_status', 'sensor.hilo_gateway', 'sensor.house_mood',
    'input_boolean.speaker_follow_motion', 'input_text.speaker_follow_source', 'script.speaker_follow_motion',
} | {f'sensor.{kind}_{kind}_{field}_state' for kind in APPLIANCES for field in ('job', 'machine')}

def iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()

class Engine:
    def __init__(self, now, saved=None):
        self.started = now
        self.states = {}
        self.pending = {}
        self.events = deepcopy((saved or {}).get('events', {}))
        # Never count a process outage as continuous observation. Persisted completed
        # episodes survive, but a finish first seen on startup is never backfilled.
        self.cycles = {kind: {'active': bool((saved or {}).get('cycles', {}).get(kind, {}).get('active')), 'gap': True} for kind in APPLIANCES}
        self.vacuum_session = False
        self.battery_latched = deepcopy((saved or {}).get('battery_latched', {}))
        self.battery_severity = (saved or {}).get('battery_severity', 0)

    def serialize(self):
        return {'events': deepcopy(self.events), 'battery_latched': deepcopy(self.battery_latched),
                'battery_severity': self.battery_severity, 'cycles': deepcopy(self.cycles)}

    def prime(self, states, now):
        """Initial snapshot is context, never evidence of a new completion."""
        self.states = dict(states)
        self.vacuum_session = self.value('vacuum.roomba') in {'cleaning', 'returning'}
        for kind in APPLIANCES:
            job = self.value(f'sensor.{kind}_{kind}_job_state')
            machine = self.value(f'sensor.{kind}_{kind}_machine_state')
            if machine == 'stop' or job in FINISH:
                self.cycles[kind]['active'] = False
            elif (job not in INACTIVE or machine == 'run') and f'complete:{kind}' not in self.events:
                self.cycles[kind]['active'] = True
                self.cycles[kind]['gap'] = True
        self.tick(now)

    def value(self, entity):
        return self.states.get(entity, '')

    def emit(self, key, now, title, detail, icon, target, tone='amber', snooze=3600, kind='condition'):
        if key not in self.events:
            self.events[key] = {'id': key, 'episode': uuid.uuid4().hex, 'occurred_at': iso(now),
                                'snoozed_until': None, 'kind': kind}
        self.events[key].update(title=title, detail=detail, icon=icon, target=target,
                                tone=tone, snooze_seconds=snooze)

    def condition(self, key, truth, now, delay, clear_delay, **display):
        # None is unknown: retain confirmed episodes and restart all dwell timers.
        if truth is None:
            self.pending.pop(key, None)
            return
        old = self.pending.get(key)
        if old is None or old[0] != truth:
            self.pending[key] = (truth, now)
        elapsed = now - self.pending[key][1]
        if truth and elapsed >= delay:
            self.emit(key, self.pending[key][1], **display)
        elif not truth and elapsed >= clear_delay:
            self.events.pop(key, None)

    def update(self, entity, value, attrs, now):
        previous = self.value(entity)
        self.states[entity] = value
        if previous == value:
            self.tick(now)
            return
        if entity == 'vacuum.roomba':
            if value in {'cleaning', 'returning'}:
                self.vacuum_session = True
            elif value == 'docked':
                self.vacuum_session = False
        for kind in APPLIANCES:
            prefix = f'sensor.{kind}_{kind}_'
            if not entity.startswith(prefix):
                continue
            cycle = self.cycles[kind]
            is_job = entity == prefix + 'job_state'
            if value in BAD:
                if cycle['active']:
                    cycle['gap'] = True
            elif is_job and value in FINISH and previous not in FINISH:
                if cycle['active'] and not cycle['gap']:
                    self.emit(f'complete:{kind}', now, f'{kind.title()} finished',
                              'Tap Done to dismiss this update. Unloading is not detected.', kind,
                              'appliances', 'blue', 3600, 'completion')
                cycle['active'] = False
                self.events.pop(f'paused:{kind}', None)
                self.events.pop(f'lost:{kind}', None)
            elif (is_job and value not in INACTIVE) or (not is_job and value == 'run' and self.value(prefix + 'job_state') not in FINISH):
                if not cycle['active']:
                    self.events.pop(f'complete:{kind}', None)
                cycle['active'] = True
                if is_job or self.value(prefix + 'job_state') not in INACTIVE:
                    cycle['gap'] = False
            elif not is_job and value == 'stop':
                cycle['active'] = False
        self.tick(now)

    def tick(self, now):
        for key, item in list(self.events.items()):
            if item['kind'] == 'completion' and now - datetime.fromisoformat(item['occurred_at']).timestamp() >= 86400:
                del self.events[key]
        if now < self.started + 120:
            return
        def binary(entity):
            value = self.value(entity)
            return None if value not in {'on', 'off'} else value == 'on'
        wan = self.value('binary_sensor.coda_4680_fiz_wan_status')
        self.condition('wan', None if wan in BAD else wan == 'off', now, 120, 60,
                       title='Internet connection unavailable', detail='The router reports its internet connection is down.',
                       icon='connection', target='details', tone='red', snooze=3600)
        self.condition('router', wan in BAD, now, 600, 60,
                       title='Router status unavailable', detail='Internet connectivity cannot be confirmed.',
                       icon='connection', target='details', snooze=14400)
        self.condition('power', binary('binary_sensor.rpi_power_status'), now, 60, 300,
                       title='Home Assistant power issue', detail='Check the power supply and USB power cable. No power action is automatic.',
                       icon='power', target='details', tone='red', snooze=14400)
        self.condition('bin', binary('binary_sensor.roomba_bin_full'), now, 60, 60,
                       title='Empty Roomba bin', detail='Roomba reports that its bin is full.', icon='bin', target='vacuum', snooze=14400)
        vacuum = self.value('vacuum.roomba')
        self.condition('vacuum_error', None if vacuum in BAD else vacuum == 'error', now, 60, 60,
                       title='Roomba needs attention', detail='Roomba reports an error. Check the robot and its controls below.',
                       icon='bin', target='vacuum', tone='red', snooze=3600)
        paused = None
        if vacuum == 'paused' and self.vacuum_session:
            paused = True
        elif vacuum in {'cleaning', 'returning', 'docked'}:
            paused = False
        self.condition('vacuum_paused', paused, now, 600, 60,
                       title='Roomba paused', detail='Cleaning has been paused for at least 10 minutes.', icon='bin', target='vacuum', snooze=3600)
        for kind, cycle in self.cycles.items():
            machine = self.value(f'sensor.{kind}_{kind}_machine_state')
            job = self.value(f'sensor.{kind}_{kind}_job_state')
            self.condition(f'paused:{kind}', None if machine in BAD else machine == 'pause' and cycle['active'], now, 600, 0,
                           title=f'{kind.title()} paused', detail='The cycle has been paused for at least 10 minutes.', icon=kind, target='appliances')
            lost = cycle['active'] and (machine in BAD or job in BAD) and machine not in {'stop', 'pause'} and job not in FINISH | {'none'}
            self.condition(f'lost:{kind}', lost, now, 600, 0,
                           title=f'{kind.title()} status unavailable', detail='A cycle was running. Completion cannot be confirmed.', icon=kind, target='appliances')
            if f'lost:{kind}' in self.events:
                self.events.pop(f'paused:{kind}', None)
        for entity, label in DEVICES.items():
            self.condition(f'offline:{entity}', self.value(entity) in BAD, now, 600, 60,
                           title=f'{label} unavailable', detail='Reliable status has been missing for at least 10 minutes.',
                           icon='heat' if entity.startswith('climate.') else 'connection',
                           target='temperature' if entity.startswith('climate.') else 'details', snooze=14400)
        gateway = self.value('sensor.hilo_gateway')
        self.condition('hilo', gateway in BAD or gateway == 'off', now, 600, 60,
                       title='Hilo gateway status unavailable', detail='Gateway connectivity cannot be confirmed. Thermostat availability is checked separately.',
                       icon='heat', target='temperature', snooze=14400)
        self.batteries(now)
        mood = self.value('sensor.house_mood')
        self.condition('mood_recovery', None if mood in BAD else mood == 'recovery_required', now, 0, 0,
                       title='House mood needs recovery', detail='Use Retry restoration in House Mood below.', icon='recovery', target='mood', tone='red')
        follow = self.value('input_boolean.speaker_follow_motion')
        script = self.value('script.speaker_follow_motion')
        source = self.value('input_text.speaker_follow_source')
        recovery = None if follow in BAD or script in BAD or source in {'unknown', 'unavailable'} or 'input_text.speaker_follow_source' not in self.states else follow == 'off' and script == 'off' and source.startswith('media_player.')
        self.condition('speaker_recovery', recovery, now, 5, 0,
                       title='Speaker cleanup needs retry', detail='Use Retry cleanup in the speaker controls below.', icon='recovery', target='speaker', tone='red')

    def batteries(self, now):
        for entity, label in BATTERIES.items():
            try:
                value = float(self.value(entity))
                valid = math.isfinite(value) and 0 <= value <= 100
            except ValueError:
                valid = False
                value = 0
            low = self.battery_latched.get(entity)
            truth = None if not valid or (low is not None and 20 < value < 25) else value <= 20
            key = 'battery_dwell:' + entity
            old = self.pending.get(key)
            if truth is None:
                self.pending.pop(key, None)
            else:
                if old is None or old[0] != truth:
                    self.pending[key] = (truth, now)
                if now - self.pending[key][1] >= 1800:
                    if truth:
                        self.battery_latched[entity] = value
                    else:
                        self.battery_latched.pop(entity, None)
            if entity in self.battery_latched and valid:
                self.battery_latched[entity] = value
        if not self.battery_latched:
            self.events.pop('batteries', None)
            self.battery_severity = 0
            return
        severity = 2 if min(self.battery_latched.values()) <= 10 else 1
        detail = ', '.join(f'{BATTERIES[e]}: {v:g}%' for e, v in self.battery_latched.items())
        title = 'Sensor battery very low' if severity == 2 else 'Sensor battery low'
        if len(self.battery_latched) > 1:
            title = f'{len(self.battery_latched)} sensor batteries ' + ('very low' if severity == 2 else 'low')
        elif len(self.battery_latched) == 1:
            entity, value = next(iter(self.battery_latched.items()))
            title = f'{BATTERIES[entity]} sensor battery ' + ('very low' if severity == 2 else 'low') + f' · {value:g}%'
        if severity > self.battery_severity:
            self.events.pop('batteries', None)
        self.emit('batteries', now, title, detail, 'battery', 'details', snooze=604800)
        self.battery_severity = max(severity, self.battery_severity)

    def items(self, now):
        items = deepcopy(list(self.events.values()))
        wan = 'wan' in self.events
        hilo = 'hilo' in self.events
        rooms = [DEVICES[k.removeprefix('offline:')] for k in self.events if k.startswith('offline:climate.')]
        result = []
        for item in items:
            key = item['id']
            if key == 'vacuum_paused' and 'vacuum_error' in self.events:
                continue
            if wan and (key.startswith('lost:') or key.startswith('offline:climate.') or key == 'hilo'):
                continue
            if hilo and key.startswith('offline:climate.'):
                continue
            if key == 'hilo' and rooms:
                item['detail'] += ' Affected: ' + ', '.join(rooms) + '.'
            result.append(item)
        def priority(item):
            key = item['id']
            if key in {'power', 'wan', 'router', 'hilo', 'mood_recovery', 'speaker_recovery'}: rank = 0
            elif key == 'bin' or key == 'vacuum_error': rank = 1
            elif item['kind'] == 'completion': rank = 2
            elif key == 'batteries': rank = 4
            else: rank = 3
            return (rank, item['occurred_at'], key)
        return sorted(result, key=priority)

    def action(self, action, key, episode, now):
        item = self.events.get(key)
        if not item or item['episode'] != episode:
            return False
        if action == 'dismiss':
            if item['kind'] != 'completion':
                return False
            del self.events[key]
        elif action == 'snooze':
            item['snoozed_until'] = iso(now + item['snooze_seconds'])
        elif action == 'unsnooze':
            item['snoozed_until'] = None
        else:
            return False
        return True
