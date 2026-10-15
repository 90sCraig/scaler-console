import net from 'node:net';
import { encodeAction, encodeGet, encodeSet, parseResponse } from './protocols/legacy-y.js';

export function validateTarget(host, port) {
  if (net.isIP(host) !== 4) throw new Error('Enter a valid IPv4 address');
  const octets = host.split('.').map(Number);
  const isPrivate = octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254);
  if (!isPrivate) throw new Error('Only local network addresses are allowed');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Enter a valid TCP port');
}

export function transact({ host, port, command = '\r', timeout = 1800 }) {
  validateTarget(host, port);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = '';
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(response);
    };

    socket.setTimeout(timeout);
    socket.on('connect', () => socket.write(command, 'ascii'));
    socket.on('data', (chunk) => {
      response += chunk.toString('ascii');
      if (response.includes('>')) finish();
    });
    socket.on('timeout', () => finish(new Error('The device did not reply in time')));
    socket.on('error', (error) => finish(new Error(`Could not connect: ${error.message}`)));
    socket.on('close', () => {
      if (!settled) response ? finish() : finish(new Error('The device closed the connection without replying'));
    });
  });
}

export async function testConnection(target) {
  const raw = await transact({ ...target, command: '\r' });
  return { ok: raw.includes('>'), raw: raw.trim() };
}

export async function readSetting(target, setting) {
  const raw = await transact({ ...target, command: encodeGet(setting.functionCode) });
  const parsed = parseResponse(raw);
  if (!parsed.ok) throw new Error(`Unexpected reply: ${parsed.raw}`);
  if (parsed.controlType !== 1 || parsed.functionCode !== setting.functionCode) throw new Error(`Unexpected reply: ${parsed.raw}`);
  if (!Number.isInteger(parsed.value)) throw new Error(`Missing value in reply: ${parsed.raw}`);
  return parsed.value;
}

export async function writeSetting(target, setting, value) {
  if (['readonly', 'firmware'].includes(setting.kind)) throw new Error('This value cannot be changed');
  if (setting.kind === 'action') {
    const raw = await transact({ ...target, command: encodeAction(setting.functionCode, setting.fixedValue ?? null) });
    const parsed = parseResponse(raw);
    if (!parsed.ok || parsed.controlType !== 0 || parsed.functionCode !== setting.functionCode) throw new Error(`Unexpected reply: ${parsed.raw}`);
    return parsed.value;
  }
  if (value === undefined || value === null || value === '') throw new Error('Choose a value before sending this command');
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue)) throw new Error('The setting value must be an integer');
  if (['range', 'number'].includes(setting.kind) && (numericValue < setting.min || numericValue > setting.max || (numericValue - setting.min) % setting.step !== 0)) {
    throw new Error(`${setting.label} must be between ${setting.min} and ${setting.max}`);
  }
  if (setting.kind === 'toggle' && ![0, 1].includes(numericValue)) throw new Error('Toggle values must be 0 or 1');
  if (['select', 'actionSelect'].includes(setting.kind) && !setting.options.some((option) => option.value === numericValue)) {
    throw new Error(`Unsupported value for ${setting.label}`);
  }

  const command = setting.kind === 'actionSelect'
    ? encodeAction(setting.functionCode, numericValue)
    : encodeSet(setting.functionCode, numericValue);
  const raw = await transact({ ...target, command });
  const parsed = parseResponse(raw);
  if (!parsed.ok || parsed.controlType !== 0 || parsed.functionCode !== setting.functionCode) throw new Error(`Unexpected reply: ${parsed.raw}`);
  if (setting.kind !== 'actionSelect' && !Number.isInteger(parsed.value)) throw new Error(`Missing value in reply: ${parsed.raw}`);
  return parsed.value;
}

export function probePort(host, port, timeout = 300) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (open) => { socket.destroy(); resolve(open); };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}
