"""Execute patched platform setup; simulate only external HA/network boundaries."""
import ast
import asyncio
from contextlib import asynccontextmanager
import hashlib
import json
import logging
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from types import SimpleNamespace
import unittest
from test_light_effect_preservation import BASELINE, ROOT

class PlatformNotReady(Exception):
    pass

class ConnectionFailure(Exception):
    pass

class Response:
    status = 200
    def __init__(self, value): self.value = value
    async def __aenter__(self):
        if isinstance(self.value, BaseException): raise self.value
        return self
    async def __aexit__(self, *args): pass
    async def json(self): return self.value

class Session:
    def __init__(self, failure=None, stage='login'):
        self.failure, self.stage = failure, stage
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass
    def post(self, url, **kwargs):
        return Response(self.failure if self.stage == 'login' and self.failure else {'code': 0, 'data': {'token': 'test'}})
    def get(self, url, **kwargs):
        if url == self.stage and self.failure: return Response(self.failure)
        values = {
            'profile': {'data': {'uid': 'test', 'mqtt': {'root': 'root', 'cert': 'cert', 'host': 'broker', 'port': 8883}}},
            'family': {'data': {'list': [{'fid': 'family'}]}},
            'devices': {'data': {'list': [{'did': 'neon', 'series': 'N1'}]}},
        }
        return Response(values[url])

class Broker:
    async def connect(self): pass
    async def subscribe(self, topic): pass
    def set_message_callback(self, callback): pass

async def noop(*args): pass


def load_setup(name, namespace):
    with tempfile.TemporaryDirectory() as temp:
        target = Path(temp)
        for file in ('light.py', '__init__.py', 'services.yaml', 'number.py', 'switch.py'):
            shutil.copy2(BASELINE / file, target / file)
        for patch in ('integration.patch', 'startup-retry.patch'):
            path = ROOT / 'lepro-extension' / patch
            subprocess.run(['patch', '-p1', '-i', str(path)], cwd=target, check=True, capture_output=True)
        tree = ast.parse((target / name).read_text())
    # Keep real setup/login code, replacing imports and device/framework classes only.
    functions = [node for node in tree.body if isinstance(node, ast.AsyncFunctionDef)
                 and node.name in ('async_setup_entry', '_async_setup_entry', 'async_login', 'async_startup_session')]
    namespace.update(HomeAssistant=object, ConfigEntry=object, AddEntitiesCallback=object,
                     asynccontextmanager=asynccontextmanager, PlatformNotReady=PlatformNotReady, DOMAIN='lepro_led',
                     _LOGGER=logging.getLogger('test-startup'), asyncio=SimpleNamespace(sleep=noop))
    exec(compile(ast.Module(body=functions, type_ignores=[]), name, 'exec'), namespace)
    return namespace['async_setup_entry']

class StartupRetryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.entry = SimpleNamespace(entry_id='entry', async_on_unload=lambda callback: None)
        self.hass = SimpleNamespace(
            data={'lepro_led': {'entry': {'account': 'test', 'password': 'test', 'persistent_mac': 'test'}}},
            config=SimpleNamespace(config_dir=self.temp.name), async_add_executor_job=self.executor)
        self.added = []
        self.session = Session()
        self.namespace = dict(aiohttp=SimpleNamespace(ClientSession=lambda: self.session, ClientConnectionError=ConnectionFailure),
            os=os, hashlib=hashlib, time=time, json=json, __file__='light.py',
            REGIONS={'eu': 'host'}, LOGIN_PATH='/login', USER_PROFILE_PATH='', FAMILY_LIST_PATH='', DEVICE_LIST_PATH='',
            async_login=None, download_cert_file=noop, create_ssl_context=lambda *args: None,
            MQTTClientWrapper=lambda *args, **kwargs: Broker(),
            NativeStateBridge=lambda **kwargs: SimpleNamespace(close=lambda: None),
            LeproLedLight=lambda device, *args: SimpleNamespace(_did=device['did']))
        self.namespace.update(USER_PROFILE_PATH='/profile', FAMILY_LIST_PATH='/family', DEVICE_LIST_PATH='/devices')
        self.setup = load_setup('light.py', self.namespace)
        original_get = Session.get
        self.session.get = lambda url, **kwargs: original_get(self.session, url.rsplit('/', 1)[-1], **kwargs)

    async def executor(self, function, *args): return function(*args)

    async def test_dns_failure_is_retryable_then_recovery_adds_light(self):
        self.session.failure = ConnectionFailure('DNS server returned general failure')
        with self.assertRaises(PlatformNotReady):
            await self.setup(self.hass, self.entry, self.added.extend)
        self.assertEqual(self.added, [])
        self.session.failure = None
        await self.setup(self.hass, self.entry, self.added.extend)
        self.assertEqual([entity._did for entity in self.added], ['neon'])

    async def test_network_failure_at_each_cloud_stage_is_retryable(self):
        for stage in ('login', 'profile', 'family', 'devices'):
            for failure in (ConnectionFailure('offline'), TimeoutError('timed out')):
                with self.subTest(stage=stage, failure=type(failure).__name__):
                    self.session.stage, self.session.failure = stage, failure
                    with self.assertRaises(PlatformNotReady):
                        await self.setup(self.hass, self.entry, self.added.extend)
        self.assertEqual(self.added, [])

    async def test_certificate_network_failure_is_retryable(self):
        async def download(*args): raise ConnectionFailure('offline')
        self.namespace['download_cert_file'] = download
        with self.assertRaises(PlatformNotReady):
            await self.setup(self.hass, self.entry, self.added.extend)

    async def test_cancellation_and_programming_errors_are_not_retried(self):
        for failure in (asyncio.CancelledError(), ValueError('bad data')):
            self.session.failure = failure
            with self.assertRaises(type(failure)):
                await self.setup(self.hass, self.entry, self.added.extend)

    async def test_dependent_controls_retry_until_parent_light_exists(self):
        for platform, expected in (('number.py', 2), ('switch.py', 1)):
            with self.subTest(platform=platform):
                self.hass.data = {'lepro_led': {'entry': {}}}
                namespace = {name: lambda light: SimpleNamespace(_light=light) for name in
                             ('LeproSpeedNumber', 'LeproSensitivityNumber', 'LeproPowerSwitch')}
                setup = load_setup(platform, namespace)
                added = []
                with self.assertRaises(PlatformNotReady):
                    await setup(self.hass, self.entry, added.extend)
                self.assertEqual(added, [])
                self.hass.data['lepro_led']['entry']['entities'] = [SimpleNamespace(_did='neon')]
                await setup(self.hass, self.entry, added.extend)
                self.assertEqual(len(added), expected)
