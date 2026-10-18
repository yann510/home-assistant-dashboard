"""Supported-service relay route, fixed identities and real response shapes."""
import asyncio
import copy
from types import SimpleNamespace as NS
import unittest
from test_dashboard_music_gateway import Services, make_hass, ACCOUNT, ENTITY, P1, TRACK
from custom_components.dashboard_music.gateway import SpotifyGateway
from custom_components.dashboard_music.models import MusicError
from custom_components.dashboard_music.playback import PlaybackController, SpeakerPort
from test_dashboard_music_playback import house, Listed
from custom_components.house_moods.sonos import SPEAKERS

SOURCE = 'media_player.gym'
RINCON = 'RINCON_48A6B88280DE01400'
TARGET = 'c44a7df0f87b5b45cba58d953767c52ed2ec269a'
RELAY = 'a' * 40


def device(device_id, name, sonos=False):
    return {'Id': device_id, 'Name': name, 'IsSonos': sonos, 'IsRestricted': False,
            'IsInDeviceList': not sonos, 'IsActiveDevice': False,
            'DeviceInfo': {'DeviceId': device_id, 'RemoteName': name, 'IsAvailable': True,
                           'TokenType': 'authorization_code' if sonos else 'default'},
            'DiscoveryResult': {'Name': 'sonos' + RINCON + '._spotify-connect._tcp.local.' if sonos else name + '._spotify-connect._tcp.local.',
                                'Key': ('sonos' + RINCON + '._spotify-connect._tcp.local.').lower() if sonos else name.lower(),
                                'HostIpAddress': '192.168.0.40' if sonos else '172.30.32.1',
                                'HostIpPort': 1400 if sonos else 24879,
                                'SpotifyConnectCPath': '/spotifyzc' if sonos else '/', 'SpotifyConnectVersion': '1'}}


class ConnectServices(Services):
    def __init__(self):
        super().__init__()
        self.devices = [device(TARGET, 'Gym', True), device(RELAY, 'Silent relay')]
        self.cloud = {'device': {'id': TARGET, 'name': 'Gym', 'is_active': True, 'is_restricted': True},
                      'is_playing': True, 'context': {'uri': P1}, 'device_music_source': 'SPOTIFY_CONNECT',
                      'item': {'type': 'track', 'uri': TRACK, 'is_local': False}, 'is_device_state': False}
        self.activation = {'Status': 101, 'SpotifyError': 0, 'StatusString': 'OK'}
        self.delayed = None
        self.native = {}
    def has_service(self, *_):
        return True
    async def async_call(self, domain, name, data, **kwargs):
        self.calls.append((domain, name, copy.deepcopy(data), kwargs))
        if self.delayed and name == self.delayed[0]:
            await self.delayed[1].wait()
        if name == 'get_spotify_connect_devices':
            result = {'Items': copy.deepcopy(self.devices)}
        elif name == 'get_player_playback_state':
            result = copy.deepcopy(self.cloud)
        elif name == 'zeroconf_device_connect':
            result = self.activation
        elif name == 'zeroconf_device_getinfo':
            raw = next(d for d in self.devices if d['DiscoveryResult']['HostIpAddress'] == data['host_ipv4_address'])
            result = self.native.get(raw['Id'], {'Status': 101, 'DeviceId': raw['Id'], 'RemoteName': raw['Name'],
                                                'BrandDisplayName': 'Sonos', 'TokenType': 'authorization_code', 'Aliases': []})
        elif name in ('player_media_play_context', 'player_transfer_playback'):
            return None
        else:
            raise AssertionError(name)
        return {'user_profile': {'id': self.account}, 'result': result}


class ConnectGatewayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.hass, account_registry, entry, runtime = make_hass()
        self.services = self.hass.services = ConnectServices()
        runtime.session.token['scope'] += ' user-read-playback-state user-modify-playback-state user-read-private'
        self.sonos_registry = NS(platform='sonos', device_id='trusted-device')
        self.device_registry = NS(identifiers={('sonos', RINCON)})
        self.hass.states.get = lambda entity: NS(state='playing', attributes={'sp_user_id': ACCOUNT} if entity == ENTITY else {'source': 'Spotify Connect', 'group_members': [entity]})
        self.gateway = SpotifyGateway(self.hass, ENTITY, lambda entity: account_registry if entity == ENTITY else self.sonos_registry if entity == SOURCE else None,
                                      relay_device_id=RELAY, device_registry_get=lambda _: self.device_registry)

    async def test_exact_relay_context_then_unconditional_activation_and_explicit_transfer(self):
        target = await self.gateway.resolve_device(SOURCE)
        relay = await self.gateway.resolve_relay()
        await self.gateway.start_playlist(P1, relay)
        await self.gateway.handoff(target)
        mutations = [(name, data, kwargs['return_response']) for _, name, data, kwargs in self.services.calls if name not in ('get_spotify_connect_devices', 'get_player_playback_state', 'zeroconf_device_getinfo')]
        self.assertEqual(mutations, [
            ('player_media_play_context', {'entity_id': ENTITY, 'context_uri': P1, 'device_id': RELAY, 'delay': .5}, False),
            ('zeroconf_device_connect', {'entity_id': ENTITY, 'host_ipv4_address': '192.168.0.40', 'host_ip_port': 1400,
                'cpath': '/spotifyzc', 'version': '1', 'use_ssl': False, 'username': ACCOUNT, 'password': '', 'loginid': ACCOUNT,
                'pre_disconnect': False, 'verify_device_list_entry': False, 'delay': .5}, True),
            ('player_transfer_playback', {'entity_id': ENTITY, 'device_id': TARGET, 'device_id_from': RELAY, 'play': True,
                'delay': .5, 'force_activate_device': True}, False)])
        self.assertTrue(all(domain == 'spotifyplus' for domain, *_ in self.services.calls))
        self.assertTrue(all(data.get('refresh') is True for _, name, data, _ in self.services.calls if name == 'get_spotify_connect_devices'))

    async def test_sonos_context_or_arbitrary_relay_id_never_dispatches(self):
        await self.gateway.resolve_device(SOURCE)
        await self.gateway.resolve_relay()
        for ident in (TARGET, 'arbitrary', 'b' * 40):
            with self.assertRaises(MusicError):
                await self.gateway.start_playlist(P1, ident)
        self.assertFalse(any(name == 'player_media_play_context' for _, name, *_ in self.services.calls))

    async def test_unconfigured_restricted_sonos_or_unlisted_relay_is_rejected(self):
        for field, value in (('IsSonos', True), ('IsRestricted', True), ('IsInDeviceList', False)):
            self.services.devices[1] = device(RELAY, 'Silent relay')
            self.services.devices[1][field] = value
            with self.subTest(field=field), self.assertRaises(MusicError):
                await self.gateway.resolve_relay()
        self.gateway.relay_device_id = None
        with self.assertRaises(MusicError) as caught:
            await self.gateway.resolve_relay()
        self.assertEqual(caught.exception.code, 'not_configured')

    async def test_stable_rincon_identity_rejects_name_only_and_mapping_drift(self):
        target = await self.gateway.resolve_device(SOURCE)
        await self.gateway.resolve_relay()
        self.device_registry.identifiers = {('sonos', 'RINCON_OTHER')}
        with self.assertRaises(MusicError):
            await self.gateway.handoff(target)
        self.assertFalse(any(name == 'zeroconf_device_connect' for _, name, *_ in self.services.calls))

    async def test_duplicate_device_names_and_aliases_fail_closed(self):
        for duplicate in (device('b' * 40, 'Gym'), device('b' * 40, 'Other')):
            if duplicate['Name'] == 'Other':
                duplicate['DeviceInfo']['RemoteName'] = 'gym'
            self.services.devices = [device(TARGET, 'Gym', True), device(RELAY, 'Silent relay'), duplicate]
            with self.assertRaises(MusicError):
                await self.gateway.resolve_device(SOURCE)

    async def test_fresh_playback_requires_exact_id_and_native_connect_source(self):
        await self.gateway.resolve_device(SOURCE)
        state = await self.gateway.playback_state()
        self.assertEqual((state.account_id, state.device_id, state.context_uri, state.track_uri, state.is_connect), (ACCOUNT, TARGET, P1, TRACK, True))
        for ident, source, synthesized in ((None, 'Spotify Connect', False), ('b' * 40, 'Spotify Connect', False), (TARGET, 'TV', False), (TARGET, 'Spotify Connect', True)):
            self.services.cloud['device']['id'] = ident
            self.services.cloud['device']['name'] = 'Unknown name' if ident is None else 'Gym'
            self.services.cloud['is_device_state'] = synthesized
            self.hass.states.get = lambda entity: NS(state='playing', attributes={'source': source, 'sp_user_id': ACCOUNT, 'group_members': [entity]})
            result = await self.gateway.playback_state()
            self.assertIsNot(result.is_connect, True)

    async def test_group_cloud_missing_id_uses_fresh_native_identity_instead_of_cached_name(self):
        await self.gateway.resolve_device(SOURCE)
        self.services.cloud['device'].update(id=None, name='Gym + 1')
        self.services.cloud['device_music_source'] = None
        self.services.native[TARGET] = {'Status': 101, 'DeviceId': TARGET, 'RemoteName': 'Gym + 1',
                                       'BrandDisplayName': 'Sonos', 'TokenType': 'authorization_code', 'Aliases': []}
        state = await self.gateway.playback_state()
        self.assertEqual((state.device_id, state.is_connect, state.track_uri), (TARGET, True, TRACK))
        native_calls = [(data, kwargs['return_response']) for _, name, data, kwargs in self.services.calls if name == 'zeroconf_device_getinfo']
        self.assertEqual(native_calls, [({'entity_id': ENTITY, 'host_ipv4_address': '192.168.0.40', 'host_ip_port': 1400,
                                        'cpath': '/spotifyzc', 'version': '1', 'use_ssl': False}, True)])

    async def test_native_identity_drift_or_duplicate_group_alias_cannot_confirm(self):
        await self.gateway.resolve_device(SOURCE)
        self.services.cloud['device'].update(id=None, name='Gym + 1')
        self.services.native[TARGET] = {'Status': 101, 'DeviceId': 'b' * 40, 'RemoteName': 'Gym + 1',
                                       'BrandDisplayName': 'Sonos', 'TokenType': 'authorization_code', 'Aliases': []}
        with self.assertRaises(MusicError):
            await self.gateway.playback_state()
        self.services.native[TARGET]['DeviceId'] = TARGET
        self.services.devices.append(device('b' * 40, 'Gym + 1'))
        with self.assertRaises(MusicError):
            await self.gateway.playback_state()

    async def test_stale_discovery_follower_is_excluded_using_current_ha_group(self):
        follower = 'media_player.bedroom'
        raw = device('b' * 40, 'Bedroom', True)
        old = RINCON
        fresh = 'RINCON_48A6B882839001400'
        raw['DiscoveryResult']['Name'] = raw['DiscoveryResult']['Name'].replace(old, fresh)
        raw['DiscoveryResult']['Key'] = raw['DiscoveryResult']['Name'].lower()
        raw['DiscoveryResult']['HostIpAddress'] = '192.168.0.29'
        self.services.devices.append(raw)
        registry = self.gateway.registry_get
        self.gateway.registry_get = lambda entity: NS(platform='sonos', device_id='follower-device') if entity == follower else registry(entity)
        devices = self.gateway.device_registry_get
        self.gateway.device_registry_get = lambda ident: NS(identifiers={('sonos', fresh)}) if ident == 'follower-device' else devices(ident)
        original = self.hass.states.get
        self.hass.states.get = lambda entity: NS(state='playing', attributes={'source': 'Spotify Connect', 'group_members': [SOURCE, follower]}) if entity in (SOURCE, follower) else original(entity)
        await self.gateway.resolve_device(SOURCE)
        self.services.cloud['device'].update(id=None, name='Gym + 1')
        self.services.native[TARGET] = {'Status': 101, 'DeviceId': TARGET, 'RemoteName': 'Gym + 1',
                                       'BrandDisplayName': 'Sonos', 'TokenType': 'authorization_code', 'Aliases': []}
        state = await self.gateway.playback_state()
        self.assertEqual((state.device_id, state.is_connect), (TARGET, True))
        self.assertEqual([data['host_ipv4_address'] for _, name, data, _ in self.services.calls if name == 'zeroconf_device_getinfo'], ['192.168.0.40'])
    async def test_episode_local_and_malformed_items_never_supply_track_uri(self):
        await self.gateway.resolve_device(SOURCE)
        for item in ({'type': 'episode', 'uri': TRACK}, {'type': 'track', 'uri': TRACK, 'is_local': True}, {'type': 'track', 'uri': 'spotify:track:bad'}, None):
            self.services.cloud['item'] = item
            self.assertIsNone((await self.gateway.playback_state()).track_uri)

    async def test_activation_failure_or_topology_guard_prevents_transfer(self):
        target = await self.gateway.resolve_device(SOURCE)
        await self.gateway.resolve_relay()
        self.services.activation = {'Status': 203, 'SpotifyError': 1}
        with self.assertRaises(MusicError):
            await self.gateway.handoff(target)
        self.assertFalse(any(name == 'player_transfer_playback' for _, name, *_ in self.services.calls))
        self.services.activation = {'Status': 101, 'SpotifyError': 0}
        with self.assertRaises(MusicError):
            await self.gateway.handoff(target, guard=lambda: False)
        self.assertFalse(any(name == 'player_transfer_playback' for _, name, *_ in self.services.calls))

    async def test_timeout_preserves_delegated_playback_until_settled(self):
        await self.gateway.resolve_relay()
        release = asyncio.Event()
        self.services.delayed = ('player_media_play_context', release)
        self.gateway.call_timeout = .01
        with self.assertRaises(MusicError):
            await self.gateway.start_playlist(P1, RELAY)
        settled = asyncio.create_task(self.gateway.wait_playback_settled())
        await asyncio.sleep(0)
        self.assertFalse(settled.done())
        release.set()
        await settled
        self.assertEqual(sum(name == 'player_media_play_context' for _, name, *_ in self.services.calls), 1)


class FinalDiscoveryServices(ConnectServices):
    """Hold real gateway I/O at final discovery or an already-dispatched play."""
    def __init__(self):
        super().__init__()
        self.cloud['is_playing'] = False
        self.hold_final_discovery = False
        self.discovery_entered, self.discovery_release = asyncio.Event(), asyncio.Event()
        self.mutation_entered, self.mutation_release = asyncio.Event(), asyncio.Event()
        self.mutation_release.set()
        self.submitted, self.effects = [], []
    async def async_call(self, domain, name, data, **kwargs):
        if name == 'get_spotify_connect_devices' and self.hold_final_discovery:
            self.discovery_entered.set()
            await self.discovery_release.wait()
        if name == 'player_media_play_context':
            self.submitted.append((name, data['context_uri'], data['device_id']))
            self.mutation_entered.set()
            await self.mutation_release.wait()
            self.effects.append(('play', data['context_uri'], data['device_id']))
            self.cloud.update(is_playing=True, device={'id': RELAY, 'name': 'Silent relay', 'is_restricted': False})
        elif name in ('zeroconf_device_connect', 'player_transfer_playback'):
            self.submitted.append((name,))
        return await super().async_call(domain, name, data, **kwargs)


class FinalDiscoveryGateway(SpotifyGateway):
    async def start_playlist(self, *args, **kwargs):
        # Preserve the complete production method; instrument only its external
        # discovery boundary so preceding read-only preflight can finish.
        self.hass.services.hold_final_discovery = True
        return await super().start_playlist(*args, **kwargs)


class RealLaunchBoundaryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.hass, account, _, runtime = make_hass()
        runtime.session.token['scope'] += ' user-read-playback-state user-modify-playback-state user-read-private'
        self.services = self.hass.services = FinalDiscoveryServices()
        local, self.states, _ = house()
        self.hass.auth = local.auth
        self.states[ENTITY] = NS(state='idle', attributes={'sp_user_id': ACCOUNT})
        for entity in SPEAKERS:
            self.states[entity].attributes['source'] = 'Spotify Connect'
        self.hass.states.get = self.states.get
        sonos = NS(platform='sonos', device_id='trusted-device')
        self.gateway = FinalDiscoveryGateway(self.hass, ENTITY,
            lambda entity: account if entity == ENTITY else sonos if entity == SOURCE else None,
            relay_device_id=RELAY, device_registry_get=lambda _: NS(identifiers={('sonos', RINCON)}))
        self.player = PlaybackController(Listed(), self.gateway, SpeakerPort(self.hass, ENTITY, SPEAKERS))
        self.player.deadline, self.player.poll_interval = .08, .005
    async def asyncTearDown(self):
        self.services.discovery_release.set()
        self.services.mutation_release.set()
        await self.player.close()
        await self.player.wait_settled()
    async def launch(self, request='intent'):
        return await self.player.play(P1, SOURCE, request, 'user', context_id='ha-context')
    async def test_deadline_during_final_discovery_never_dispatches_context_or_handoff(self):
        task = asyncio.create_task(self.launch())
        await asyncio.wait_for(self.services.discovery_entered.wait(), 1)
        self.assertEqual((await task)['status'], 'unconfirmed')
        self.assertEqual(self.services.submitted, [])
        self.services.discovery_release.set()
        await self.player.wait_settled()
        self.assertEqual(self.services.submitted, [])
    async def test_cancellation_during_final_discovery_never_dispatches_context_or_handoff(self):
        task = asyncio.create_task(self.launch())
        await asyncio.wait_for(self.services.discovery_entered.wait(), 1)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.services.discovery_release.set()
        await self.player.wait_settled()
        self.assertEqual(self.services.submitted, [])
    async def test_topology_change_during_final_discovery_never_dispatches_context_or_handoff(self):
        task = asyncio.create_task(self.launch())
        await asyncio.wait_for(self.services.discovery_entered.wait(), 1)
        for entity in (SOURCE, 'media_player.living_room'):
            self.states[entity].attributes['group_members'] = ['media_player.living_room', SOURCE]
        self.services.discovery_release.set()
        self.assertEqual((await task)['status'], 'unconfirmed')
        await self.player.wait_settled()
        self.assertEqual(self.services.submitted, [])
    async def test_dispatched_effect_retains_account_and_mood_until_true_settlement_without_handoff(self):
        from test_dashboard_music_moods import runtime
        mood = runtime()
        self.assertTrue((await mood.engine.activate('unwind'))['success'])
        self.hass.data['house_moods'] = mood
        self.gateway.call_timeout = .01
        self.services.discovery_release.set()
        self.services.mutation_release.clear()
        task = asyncio.create_task(self.launch())
        await asyncio.wait_for(self.services.mutation_entered.wait(), 1)
        self.assertEqual((await task)['status'], 'unconfirmed')
        self.assertEqual(self.services.effects, [])
        self.assertEqual((await self.launch('another-intent'))['status'], 'busy')
        self.assertFalse((await mood.engine.activate('dinner'))['success'])
        self.assertFalse(mood.engine._lock.locked())
        self.services.mutation_release.set()
        await self.player.wait_settled()
        self.assertEqual(self.services.effects, [('play', P1, RELAY)])
        self.assertEqual(self.services.submitted, [('player_media_play_context', P1, RELAY)])
        self.assertFalse(mood.engine._manual_playback_active)
