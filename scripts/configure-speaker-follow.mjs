import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createConnection, createLongLivedTokenAuth } from 'home-assistant-js-websocket';

const root = fileURLToPath(new URL('../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
const { VITE_HA_URL: url, VITE_HA_TOKEN: token } = process.env;
if (!url || !token) throw new Error('Missing Home Assistant URL or token.');
const desired = JSON.parse(await readFile(resolve(root, 'home-assistant/speaker-follow.json'), 'utf8'));
async function api(path, data) {
  const response = await fetch(`${url}${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
const states = await api('/api/states');
if (states.find(e => e.entity_id === 'input_boolean.speaker_follow_motion')?.state === 'on' ||
    states.find(e => e.entity_id === 'input_text.speaker_follow_source')?.state.startsWith('media_player.')) {
  throw new Error('Turn Follow me off and finish ungrouping before updating its configuration.');
}
const scriptPath = `/api/config/script/config/${desired.script.id}`;
const oldScriptResponse = await fetch(`${url}${scriptPath}`, { headers: { Authorization: `Bearer ${token}` } });
if (!oldScriptResponse.ok && oldScriptResponse.status !== 404) throw new Error(`Cannot back up script: ${oldScriptResponse.status}`);
const backup = {
  script: oldScriptResponse.ok ? await oldScriptResponse.json() : null,
  automations: [],
};
for (const automation of desired.automations) {
  backup.automations.push({
    entity_id: automation.entity_id,
    state: states.find(e => e.entity_id === automation.entity_id)?.state,
    config: await api(`/api/config/automation/config/${automation.config.id}`),
  });
}
await mkdir(resolve(root, 'backups.local'), { recursive: true });
const backupFile = resolve(root, `backups.local/speaker-follow-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(backupFile, JSON.stringify(backup, null, 2));
console.log(`Saved configuration backup: ${backupFile}`);
const connection = await createConnection({ auth: createLongLivedTokenAuth(url, token) });
try {
  for (const helper of desired.helpers) {
    const domain = helper.type.split('/')[0];
    const items = await connection.sendMessagePromise({ type: `${domain}/list` });
    const id = helper.name.toLowerCase().replaceAll(' ', '_');
    if (!states.some(e => e.entity_id === `${domain}.${id}`) && !items.some(item => item.id === id)) {
      await connection.sendMessagePromise(helper);
    }
    if (domain === 'input_text' && (!states.some(e => e.entity_id === `${domain}.${id}`) || states.find(e => e.entity_id === `${domain}.${id}`)?.state === 'unknown')) {
      await api('/api/services/input_text/set_value', { entity_id: `${domain}.${id}`, value: '' });
    }
  }
  const entity_id = desired.automations.map(automation => automation.entity_id);
  await api('/api/services/automation/turn_off', { entity_id, stop_actions: true });
  try {
    await api(scriptPath, desired.script.config);
    for (const automation of desired.automations) {
      await api(`/api/config/automation/config/${automation.config.id}`, automation.config);
    }
    await api('/api/services/automation/turn_on', { entity_id });
  } catch (error) {
    // Roll back the existing automations; leave the new helpers off on a failed first install.
    for (const automation of backup.automations) {
      await api(`/api/config/automation/config/${automation.config.id}`, automation.config);
      await api(`/api/services/automation/turn_${automation.state === 'on' ? 'on' : 'off'}`, { entity_id: automation.entity_id });
    }
    if (backup.script) await api(scriptPath, backup.script);
    throw error;
  }
  const installed = await api('/api/states');
  const ids = [...entity_id, 'script.speaker_follow_motion', 'input_boolean.speaker_follow_motion', 'input_text.speaker_follow_source'];
  console.log(JSON.stringify(installed.filter(entity => ids.includes(entity.entity_id)).map(({ entity_id, state }) => ({ entity_id, state })), null, 2));
} finally {
  connection.close();
}
