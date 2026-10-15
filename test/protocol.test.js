import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { encodeAction, encodeGet, encodeSet, parseResponse } from '../src/protocols/legacy-y.js';
import { validateTarget, writeSetting } from '../src/device-client.js';
import { compareVersions, parseVp729FirmwareReply, parseVp729ReleasePage, checkVp729Firmware } from '../src/firmware.js';
import { vp729 } from '../src/profiles/vp-729.js';

test('encodes VP-729 get commands', () => {
  assert.equal(encodeGet(25), 'Y 1 25\r');
});

test('encodes VP-729 set commands including signed values', () => {
  assert.equal(encodeSet(48, -111), 'Y 0 48 -111\r');
});

test('encodes no-parameter and parameterized actions', () => {
  assert.equal(encodeAction(11), 'Y 0 11\r');
  assert.equal(encodeAction(72, 3), 'Y 0 72 3\r');
  assert.equal(encodeAction(48, -111), 'Y 0 48 -111\r');
});

test('VP-729 profile covers every current documented function', () => {
  const ids = vp729.settings.map((setting) => setting.id);
  assert.equal(new Set(ids).size, ids.length);
  const codes = new Set(vp729.settings.map((setting) => setting.functionCode));
  const missing = Array.from({ length: 157 }, (_, code) => code).filter((code) => !codes.has(code));
  assert.deepEqual(missing, [133, 134]); // Removed in Kramer's command-set history.
  for (const setting of vp729.settings) {
    assert.ok(setting.group && setting.label);
    if (['select', 'actionSelect'].includes(setting.kind)) assert.ok(setting.options.length);
    if (['range', 'number'].includes(setting.kind)) assert.ok(setting.min < setting.max && setting.step > 0);
  }
});

test('sends a no-parameter action to a local test device', async () => {
  let received = '';
  const server = net.createServer((socket) => socket.on('data', (chunk) => {
    received += chunk.toString('ascii');
    socket.write('Z 0 11\r\n>');
  }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const value = await writeSetting({ host: '127.0.0.1', port: server.address().port }, { kind: 'action', functionCode: 11 });
    assert.equal(received, 'Y 0 11\r');
    assert.equal(value, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('parses a normal device response and prompt', () => {
  assert.deepEqual(parseResponse('Z 1 25 32\r\n>'), {
    ok: true, controlType: 1, functionCode: 25, value: 32, raw: 'Z 1 25 32'
  });
});

test('rejects public network targets', () => {
  assert.throws(() => validateTarget('8.8.8.8', 10001), /local network/);
  assert.doesNotThrow(() => validateTarget('192.168.10.119', 10001));
});

test('reads both VP-729 firmware components from its text reply', () => {
  assert.deepEqual(parseVp729FirmwareReply('Y 1 76\r\nZ 1 76 VTB 1.29     Audio 2.18\r\n>'), { master: '1.29', audio: '2.18' });
  assert.throws(() => parseVp729FirmwareReply('Z 1 76 129\r\n>'), /unrecognized format/);
});

test('extracts current firmware from Kramer’s product page and compares numeric versions', () => {
  const page = '<a>VP-728/729 Audio Firmware</a> Version: 2.31 <a>VP-728/729 Master Firmware</a> Version: 1.29';
  assert.deepEqual(parseVp729ReleasePage(page), { master: '1.29', audio: '2.31' });
  assert.equal(compareVersions('1.29', '1.29.0'), 0);
  assert.equal(compareVersions('2.18', '2.31'), -1);
  assert.equal(compareVersions('2.100', '2.31'), 1);
});

test('firmware check reports partial update and never claims current when Kramer is unavailable', async () => {
  const server = net.createServer((socket) => socket.on('data', () => socket.write('Z 1 76 VTB 1.29     Audio 2.18\r\n>')));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const target = { host: '127.0.0.1', port: server.address().port };
  try {
    const result = await checkVp729Firmware(target, async () => ({ ok: true, text: async () => '<a>VP-728/729 Audio Firmware</a> Version: 2.31 <a>VP-728/729 Master Firmware</a> Version: 1.29' }));
    assert.equal(result.status, 'update-available');
    assert.deepEqual(result.components, { master: 'current', audio: 'update-available' });
    assert.equal(result.changelog.length, 2);
    assert.match(result.changelog[0].items[0], /factory hardware changes/);
    const offline = await checkVp729Firmware(target, async () => { throw new Error('offline'); });
    assert.equal(offline.status, 'unverified');
    assert.equal(offline.latest, null);
    assert.deepEqual(offline.installed, { master: '1.29', audio: '2.18' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
