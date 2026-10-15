import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfigurationPacket, buildIpSetupPacket, parseLantronixResponse } from '../src/lantronix.js';

test('builds the vendor documented IP-SETUP assignment datagram', () => {
  const packet = buildIpSetupPacket('00:20:4A:12:34:56', '192.168.10.239');
  assert.equal(packet.toString('hex'), '49502d534554555000003456c0a80aef');
});

test('parses an XPort identity response', () => {
  const response = Buffer.alloc(30);
  response[3] = 0xf7;
  response.write('XPT', 8, 'ascii');
  Buffer.from('00204a123456', 'hex').copy(response, 24);
  assert.deepEqual(parseLantronixResponse(response), {
    kind: 'identity', mac: '00:20:4A:12:34:56', model: 'XPT'
  });
});

test('parses and safely updates a setup record', () => {
  const response = Buffer.alloc(124);
  response[3] = 0xf9;
  Buffer.from([192, 168, 1, 39]).copy(response, 4);
  response[10] = 8;
  Buffer.from([192, 168, 1, 1]).copy(response, 16);
  const parsed = parseLantronixResponse(response);
  assert.equal(parsed.ip, '192.168.1.39');
  assert.equal(parsed.subnetMask, '255.255.255.0');
  assert.equal(parsed.gateway, '192.168.1.1');

  const changed = buildConfigurationPacket(parsed.raw, {
    ip: '192.168.10.239', subnetMask: '255.255.255.0', gateway: '192.168.10.1'
  });
  assert.equal(changed[3], 0xfd);
  assert.deepEqual([...changed.subarray(4, 8)], [192, 168, 10, 239]);
  assert.equal(changed[10], 8);
  assert.deepEqual([...changed.subarray(16, 20)], [192, 168, 10, 1]);
});

test('interprets a zero host-bit field as the legacy class-based default', () => {
  const response = Buffer.alloc(124);
  response[3] = 0xf9;
  Buffer.from([192, 168, 1, 39]).copy(response, 4);
  response[10] = 0;
  const parsed = parseLantronixResponse(response);
  assert.equal(parsed.subnetMask, '255.255.255.0');
});
