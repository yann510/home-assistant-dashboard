"""Exercise the patched connection loop with a deterministic fake broker."""
import ast
import asyncio
import logging
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from test_light_effect_preservation import BASELINE, ROOT

class BrokerError(Exception):pass

class Connection:
    def __init__(self, broker):
        self.broker=broker;self.subscriptions=[];self.published=[];self.events=asyncio.Queue()
    async def __aenter__(self):
        self.broker.connections.append(self)
        return self
    async def __aexit__(self,*args):pass
    async def subscribe(self,topic):self.subscriptions.append(topic)
    async def publish(self,topic,payload):self.published.append((topic,payload))
    @property
    def messages(self):return self
    def __aiter__(self):return self
    async def __anext__(self):
        value=await self.events.get()
        if isinstance(value,Exception):raise value
        return value

class MqttReconnectTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        with tempfile.TemporaryDirectory() as temp:
            for name in ('light.py','__init__.py','services.yaml'):shutil.copy2(BASELINE/name,Path(temp)/name)
            subprocess.run(['patch','-p1','-i',str(ROOT/'lepro-extension/integration.patch')],cwd=temp,check=True,capture_output=True)
            tree=ast.parse((Path(temp)/'light.py').read_text())
        wrapper=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='MQTTClientWrapper')
        self.broker=SimpleNamespace(connections=[])
        self.connect_allowed=asyncio.Event();self.connect_allowed.set()
        broker=self.broker;allowed=self.connect_allowed
        class Factory(Connection):
            def __init__(self,**kwargs):super().__init__(broker)
            async def __aenter__(self):
                await allowed.wait()
                return await super().__aenter__()
        namespace={'asyncio':asyncio,'Client':Factory,'MqttError':BrokerError,'_LOGGER':logging.getLogger('test-mqtt')}
        exec(compile(ast.Module(body=[wrapper],type_ignores=[]),'patched-mqtt.py','exec'),namespace)
        self.wrapper=namespace['MQTTClientWrapper'](None,'host',8883,None,'test')
        self.wrapper.RECONNECT_DELAY=.001
    async def asyncTearDown(self):await self.wrapper.disconnect()
    async def until(self,predicate):
        async with asyncio.timeout(.2):
            while not predicate():await asyncio.sleep(.001)
    async def test_connection_drop_resubscribes_and_receives_reports_without_a_command(self):
        reports=[];reported=asyncio.Event()
        async def receive(message):reports.append(message);reported.set()
        self.wrapper.set_message_callback(receive)
        await self.wrapper.connect()
        await self.wrapper.subscribe('le/gym/prp/#')
        await self.until(lambda:self.broker.connections and self.broker.connections[0].subscriptions)
        await self.broker.connections[0].events.put(BrokerError('connection lost'))
        await self.until(lambda:len(self.broker.connections)==2)
        second=self.broker.connections[1]
        self.assertEqual(second.subscriptions,['le/gym/prp/#'])
        await second.events.put('device reply')
        await asyncio.wait_for(reported.wait(),.2)
        self.assertEqual(reports,['device reply'])
    async def test_subscribe_before_connect_retains_topic(self):
        await self.wrapper.subscribe('le/neon/prp/#')
        await self.until(lambda:bool(self.broker.connections))
        self.assertEqual(self.broker.connections[0].subscriptions,['le/neon/prp/#'])
    async def test_cancelled_offline_publish_never_replays(self):
        self.connect_allowed.clear()
        with self.assertRaises(TimeoutError):
            async with asyncio.timeout(.01):await self.wrapper.publish('le/neon/prp/set','old command')
        self.connect_allowed.set()
        await self.until(lambda:bool(self.broker.connections))
        self.assertEqual(self.broker.connections[0].published,[])
    async def test_disconnect_cancels_reconnect(self):
        await self.wrapper.connect()
        await self.until(lambda:bool(self.broker.connections))
        await self.wrapper.disconnect()
        self.assertIsNone(self.wrapper.client)
        self.assertTrue(self.wrapper._loop_task.done())
