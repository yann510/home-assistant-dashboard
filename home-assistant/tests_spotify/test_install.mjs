import { test } from 'node:test';
import assert from 'node:assert/strict';
import {enableConfiguration,configRoot,install} from '../../scripts/install-dashboard-spotify.mjs';

test('configuration enablement is idempotent and rejects ambiguous existing config',()=>{
 const configured=enableConfiguration('default_config:\n');
 assert.equal(enableConfiguration(configured),configured);
 assert.throws(()=>enableConfiguration('dashboard_spotify:\n  token: secret\n'));
 assert.throws(()=>enableConfiguration('dashboard_spotify: {}\ndashboard_spotify: {}\n'));
 assert.throws(()=>configRoot('/config/../tmp'));
});
function memory(){
 const data=new Map([['/config/configuration.yaml',Buffer.from('default_config:\n')]]);
 const directories=new Set();
 const attrs=new Map([['/config/configuration.yaml',{mode:0o100600,uid:1000,gid:1000}]]);
 const writes=[];
 return {data,directories,attrs,writes,stat:async p=>attrs.get(p),setstat:async(p,a)=>attrs.set(p,{...attrs.get(p),...a}),realPath:async p=>p,readFile:async p=>data.get(p),writeFile:async(p,b,options)=>{writes.push({path:p,options});data.set(p,b);attrs.set(p,{mode:options?.mode??0o644,uid:1000,gid:1000})},exists:async p=>directories.has(p)||data.has(p),unlink:async p=>data.delete(p),rename:async(from,to)=>{data.set(to,data.get(from));data.delete(from);attrs.set(to,attrs.get(from));attrs.delete(from)},mkdir:async p=>directories.add(p),removeTree:async p=>{directories.delete(p);for(const key of data.keys())if(key.startsWith(p+'/'))data.delete(key)}};
}
const files=new Map([['manifest.json',Buffer.from('{}')],['__init__.py',Buffer.from('pass')],['search.py',Buffer.from('pass')]]);
test('installer verifies backup and config check before returning success',async()=>{
 const adapter=memory(); const result=await install(adapter,files,'/config',async()=> 'valid');
 assert.equal(adapter.data.get(result.backupPath).toString(),'default_config:\n');
 assert.match(adapter.data.get('/config/configuration.yaml').toString(),/dashboard_spotify: \{\}/);
 assert.ok(adapter.directories.has('/config/custom_components/dashboard_spotify'));
});
test('invalid config and network failures restore original config and remove integration',async()=>{
 for(const validate of [async()=> 'invalid',async()=> {throw new Error('offline')}]){
  const adapter=memory(); await assert.rejects(install(adapter,files,'/config',validate));
  assert.equal(adapter.data.get('/config/configuration.yaml').toString(),'default_config:\n');
  assert.ok(!adapter.directories.has('/config/custom_components/dashboard_spotify'));
 }
});
test('existing integration is never overwritten',async()=>{
 const adapter=memory();adapter.directories.add('/config/custom_components/dashboard_spotify');
 await assert.rejects(install(adapter,files,'/config',async()=> 'valid'));
 assert.equal(adapter.data.size,1);
});
test('partial staged config write leaves live config intact and cleans integration',async()=>{
 const adapter=memory();const write=adapter.writeFile;
 adapter.writeFile=async(p,b)=>{
  if(p.includes('.spotify-stage-')) {adapter.data.set(p,Buffer.from('partial'));throw new Error('lost connection')}
  return write(p,b);
 };
 await assert.rejects(install(adapter,files,'/config',async()=> 'valid'));
 assert.equal(adapter.data.get('/config/configuration.yaml').toString(),'default_config:\n');
 assert.ok(!adapter.directories.has('/config/custom_components/dashboard_spotify'));
});
test('configuration symlink and incomplete payload cannot trigger writes',async()=>{
 const adapter=memory();adapter.realPath=async p=>p.endsWith('configuration.yaml')?'/elsewhere/private.yaml':p;
 await assert.rejects(install(adapter,files,'/config',async()=> 'valid'));
 assert.equal(adapter.data.size,1);
 const other=memory();await assert.rejects(install(other,new Map([['manifest.json',Buffer.from('{}')]]),'/config',async()=> 'valid'));
 assert.equal(other.data.size,1);
});

test('concurrent configuration edits retain integration when rollback is unsafe',async()=>{
 const adapter=memory();
 await assert.rejects(install(adapter,files,'/config',async()=> {
  adapter.data.set('/config/configuration.yaml',Buffer.concat([adapter.data.get('/config/configuration.yaml'),Buffer.from('# concurrent setting\n')]));
  return 'invalid';
 }),/Rollback incomplete/);
 assert.ok(adapter.directories.has('/config/custom_components/dashboard_spotify'));
 assert.match(adapter.data.get('/config/configuration.yaml').toString(),/dashboard_spotify: \{\}/);
 assert.match(adapter.data.get('/config/configuration.yaml').toString(),/# concurrent setting/);
});
test('configuration ownership and mode are preserved with restrictive backups',async()=>{
 for(const mode of [0o600,0o640]){
  const adapter=memory();adapter.attrs.set('/config/configuration.yaml',{mode:0o100000|mode,uid:1234,gid:5678});
  const result=await install(adapter,files,'/config',async()=> 'valid');
  assert.deepEqual(adapter.attrs.get('/config/configuration.yaml'),{mode,uid:1234,gid:5678});
  assert.equal(adapter.attrs.get(result.backupPath).mode,0o600);
  for(const write of adapter.writes.filter(write=>/spotify-(stage|backup)-/.test(write.path))) assert.equal(write.options.mode,0o600);
 }
});
test('configuration append preserves every existing trailing byte',()=>{
 for(const original of ['default_config:  \n\n  \n','default_config: {}   ','default_config: {}\r\n\r\n']){
  const updated=enableConfiguration(original);
  assert.equal(updated.slice(0,original.length),original);
  assert.equal(updated,original+(original.endsWith('\n')?'\n':'\n\n')+'dashboard_spotify: {}\n');
 }
});
