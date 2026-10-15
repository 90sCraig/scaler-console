import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';
import net from 'node:net';

export const LDP_PORT = 30718;
const QUERY_DEVICE = Buffer.from([0x00, 0x00, 0x00, 0xf6]);
const QUERY_SETUP = Buffer.from([0x00, 0x00, 0x00, 0xf8]);
const discoveryCache = new Map();

export async function discoverLantronix({ timeout = 2600 } = {}) {
  const interfaces = localInterfaces();
  const responses = new Map();

  await Promise.all(interfaces.map((network) => discoverOnInterface(network, timeout, responses)));

  const candidates = new Map();
  for (const response of responses.values()) {
    if (!response.identity) continue;
    const setup = response.setup;
    const device = {
      mac: response.identity.mac,
      model: response.identity.model || 'Lantronix device',
      currentIp: setup?.ip || response.address,
      subnetMask: setup?.subnetMask || null,
      gateway: setup?.gateway || null,
      interfaceAddress: response.interfaceAddress,
      configurable: Boolean(setup)
    };
    const previous = candidates.get(device.mac);
    const score = Number(device.configurable) + 2 * Number(addressesShareSubnet(device.currentIp, device.interfaceAddress, device.subnetMask || '255.255.255.0'));
    if (!previous || score > previous.score) candidates.set(device.mac, { device, setupRecord: setup?.raw, score });
  }

  const devices = [];
  for (const { device, setupRecord } of candidates.values()) {
    discoveryCache.set(device.mac, { device, setupRecord, discoveredAt: Date.now() });
    devices.push(device);
  }
  pruneCache();
  return devices.sort((a, b) => a.currentIp.localeCompare(b.currentIp, undefined, { numeric: true }));
}

export async function assignLantronixAddress({ mac, ip, subnetMask, gateway }) {
  const normalizedMac = normalizeMac(mac);
  const cached = discoveryCache.get(normalizedMac);
  if (!cached || Date.now() - cached.discoveredAt > 5 * 60_000) {
    throw new Error('Discover this device again before changing its address');
  }
  if (!cached.setupRecord) throw new Error('The device did not expose a setup record, so it cannot be changed safely');

  validateLantronixAssignment({ ip, subnetMask, gateway });

  const conflicts = await lantronixAddressInUse(ip);
  if (conflicts) throw new Error(`${ip} is already responding on the network; choose another address`);

  const record = buildConfigurationPacket(cached.setupRecord, { ip, subnetMask, gateway });
  let configured = false;
  const isDirectlyReachable = addressesShareSubnet(
    cached.device.currentIp,
    cached.device.interfaceAddress,
    cached.device.subnetMask || '255.255.255.0'
  );

  if (isDirectlyReachable) {
    // When both ends share a subnet, FD is atomic: the old address receives the
    // complete setup record, acknowledges it, then restarts on the new address.
    try {
      const reply = await sendUdpAndWait(cached.device.currentIp, record, 1800, cached.device.interfaceAddress);
      configured = reply.length >= 4 && reply.subarray(0, 4).equals(Buffer.from([0, 0, 0, 0xfb]));
    } catch {}
    await delay(1800);
  } else {
    const assignment = buildIpSetupPacket(normalizedMac, ip);
    await broadcastPacket(assignment, {
      sourcePort: LDP_PORT,
      interfaceAddress: cached.device.interfaceAddress,
      limitedBroadcastOnly: true
    });

    // IP-SETUP has no acknowledgement. After its restart, send the complete
    // record to the new address to persist its mask and gateway.
    await delay(2400);
    for (let attempt = 0; attempt < 5 && !configured; attempt += 1) {
      try {
        const reply = await sendUdpAndWait(ip, record, 1200);
        configured = reply.length >= 4 && reply.subarray(0, 4).equals(Buffer.from([0, 0, 0, 0xfb]));
      } catch {
        if (attempt < 4) await delay(900);
      }
    }
  }

  let observedIp = null;
  try {
    const observed = await discoverLantronix({ timeout: 1800 });
    observedIp = observed.find((device) => device.mac === normalizedMac)?.currentIp || null;
  } catch {}

  const moved = observedIp === ip;
  if (!moved && observedIp && !configured) {
    return {
      ok: false,
      ip: observedIp,
      configured: false,
      message: `The module did not accept the new address. It remains at ${observedIp}; no settings changed.`
    };
  }

  discoveryCache.delete(normalizedMac);
  return {
    ok: moved || configured,
    ip,
    configured,
    restoreComputerNetwork: isDirectlyReachable && !addressesShareSubnet(ip, cached.device.interfaceAddress, subnetMask),
    message: configured
      ? `Address changed to ${ip}; the network interface is restarting`
      : moved
        ? `The module moved to ${ip}. It did not acknowledge the saved mask and gateway, so those settings should be checked after reconnecting.`
        : `The address command was sent, but the module could not be found afterward. Find devices again before retrying.`
  };
}

export async function assignLantronixAddressByMac({ mac, ip }) {
  const normalizedMac = normalizeMac(mac);
  assertLocalAddress(ip, 'IP address');

  if (await lantronixAddressInUse(ip)) {
    throw new Error(`${ip} is already responding on the network; choose another address`);
  }

  const assignment = buildIpSetupPacket(normalizedMac, ip);
  // Older XPort modules do not acknowledge IP-SETUP. Repeating the small
  // vendor-documented datagram makes label-assisted recovery more reliable.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await broadcastPacket(assignment);
    if (attempt < 2) await delay(180);
  }

  return {
    ok: true,
    ip,
    configured: false,
    labelAssisted: true,
    message: `Address command sent for ${normalizedMac}. The existing subnet mask is unchanged; wait about 10 seconds, then connect to ${ip}.`
  };
}

export function validateLantronixAssignment({ ip, subnetMask, gateway, interfaceAddress }) {
  assertLocalAddress(ip, 'IP address');
  assertNetmask(subnetMask);
  assertLocalAddress(gateway, 'Gateway', true);
  if (ip === gateway) throw new Error('The IP address and gateway cannot be the same');
  if (interfaceAddress && !addressesShareSubnet(ip, interfaceAddress, subnetMask)) {
    throw new Error('Choose an IP address on this computer’s network');
  }
}

export async function lantronixAddressInUse(ip) {
  return tcpConflictCheck(ip);
}

export function getLocalNetworks() {
  return localInterfaces().map((network) => ({
    address: network.address,
    subnetMask: network.netmask,
    broadcast: network.broadcast,
    suggestedGateway: `${network.address.split('.').slice(0, 3).join('.')}.1`
  }));
}

export function parseLantronixResponse(message) {
  if (!Buffer.isBuffer(message) || message.length < 4) return null;
  const opcode = message[3];
  if (opcode === 0xf7 && message.length >= 30) {
    return {
      kind: 'identity',
      mac: formatMac(message.subarray(24, 30)),
      model: printable(message.subarray(8, 11))
    };
  }
  if (opcode === 0xf9 && message.length >= 124) {
    const ip = bytesToIp(message.subarray(4, 8));
    return {
      kind: 'setup',
      ip,
      subnetMask: hostBitsToMask(message[10], ip),
      gateway: bytesToIp(message.subarray(16, 20)),
      raw: Buffer.from(message)
    };
  }
  return null;
}

export function buildIpSetupPacket(mac, ip) {
  const macBytes = parseMac(mac);
  const packet = Buffer.alloc(16);
  packet.write('IP-SETUP', 0, 'ascii');
  packet[8] = 0;
  packet[9] = 0;
  packet[10] = macBytes[4];
  packet[11] = macBytes[5];
  ipToBytes(ip).copy(packet, 12);
  return packet;
}

export function buildConfigurationPacket(setupRecord, { ip, subnetMask, gateway }) {
  if (!Buffer.isBuffer(setupRecord) || setupRecord.length < 124 || setupRecord[3] !== 0xf9) {
    throw new Error('Invalid Lantronix setup record');
  }
  const packet = Buffer.from(setupRecord);
  packet[3] = 0xfd;
  ipToBytes(ip).copy(packet, 4);
  packet[10] = maskToHostBits(subnetMask);
  ipToBytes(gateway).copy(packet, 16);
  return packet;
}

function discoverOnInterface(network, timeout, responses) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const finish = () => { try { socket.close(); } catch {} resolve(); };
    socket.on('error', finish);
    socket.on('message', (message, remote) => {
      const parsed = parseLantronixResponse(message);
      if (!parsed) return;
      const key = `${remote.address}|${network.address}`;
      const existing = responses.get(key) || { address: remote.address, interfaceAddress: network.address };
      existing[parsed.kind] = parsed;
      responses.set(key, existing);
    });
    socket.bind(0, network.address, () => {
      socket.setBroadcast(true);
      for (const destination of new Set([network.broadcast, '255.255.255.255'])) {
        socket.send(QUERY_DEVICE, LDP_PORT, destination);
        socket.send(QUERY_SETUP, LDP_PORT, destination);
      }
    });
    setTimeout(finish, timeout);
  });
}

function broadcastPacket(packet, { sourcePort = 0, interfaceAddress = null, limitedBroadcastOnly = false } = {}) {
  const available = localInterfaces();
  const interfaces = interfaceAddress
    ? available.filter((network) => network.address === interfaceAddress)
    : available;
  if (!interfaces.length) return Promise.reject(new Error('The Ethernet adapter that found this device is no longer available'));
  return Promise.all(interfaces.map((network) => new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', reject);
    socket.bind(sourcePort, network.address, () => {
      socket.setBroadcast(true);
      const destinations = limitedBroadcastOnly
        ? ['255.255.255.255']
        : [...new Set([network.broadcast, '255.255.255.255'])];
      let pending = destinations.length;
      const done = (error) => {
        if (error) { socket.close(); reject(error); return; }
        pending -= 1;
        if (pending === 0) { socket.close(); resolve(); }
      };
      for (const destination of destinations) socket.send(packet, LDP_PORT, destination, done);
    });
  })));
}

function sendUdpAndWait(host, packet, timeout, sourceAddress) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const finish = (error, message) => {
      if (settled) return;
      settled = true;
      socket.close();
      error ? reject(error) : resolve(message);
    };
    socket.once('error', (error) => finish(error));
    socket.once('message', (message) => finish(null, message));
    if (sourceAddress) socket.bind(0, sourceAddress, () => socket.send(packet, LDP_PORT, host));
    else socket.bind(0, () => socket.send(packet, LDP_PORT, host));
    setTimeout(() => finish(new Error('No acknowledgement')), timeout);
  });
}

function localInterfaces() {
  const results = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal || entry.netmask === '255.255.255.255') continue;
      if (!isPrivateIpv4(entry.address)) continue;
      results.push({ address: entry.address, netmask: entry.netmask, broadcast: calculateBroadcast(entry.address, entry.netmask) });
    }
  }
  return results;
}

function calculateBroadcast(address, mask) {
  return address.split('.').map((part, index) => (Number(part) | (255 ^ Number(mask.split('.')[index])))).join('.');
}

function addressesShareSubnet(first, second, mask) {
  if (net.isIP(first) !== 4 || net.isIP(second) !== 4 || net.isIP(mask) !== 4) return false;
  const toInteger = (value) => value.split('.').reduce((result, part) => ((result << 8) | Number(part)) >>> 0, 0);
  return (toInteger(first) & toInteger(mask)) === (toInteger(second) & toInteger(mask));
}

function normalizeMac(mac) {
  const bytes = parseMac(mac);
  return formatMac(bytes);
}

function parseMac(mac) {
  const clean = String(mac || '').replace(/[^0-9a-f]/gi, '');
  if (!/^[0-9a-f]{12}$/i.test(clean)) throw new Error('Invalid hardware address');
  return Buffer.from(clean, 'hex');
}

function formatMac(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(':').toUpperCase();
}

function ipToBytes(ip) {
  if (net.isIP(ip) !== 4) throw new Error('Invalid IPv4 address');
  return Buffer.from(ip.split('.').map(Number));
}

function bytesToIp(bytes) {
  return [...bytes].join('.');
}

function printable(bytes) {
  return bytes.toString('ascii').replace(/[^\x20-\x7e]/g, '').trim();
}

function maskToHostBits(mask) {
  assertNetmask(mask);
  const bits = mask.split('.').map((part) => Number(part).toString(2).padStart(8, '0')).join('');
  return 32 - bits.indexOf('0');
}

function hostBitsToMask(hostBits, ip) {
  if (!Number.isInteger(hostBits) || hostBits < 0 || hostBits > 32) return null;
  // Legacy XPort firmware uses zero to mean its class-based default rather
  // than zero host bits. For a 192.x Class C address that default is /24.
  if (hostBits === 0) {
    const firstOctet = Number(String(ip || '').split('.')[0]);
    hostBits = firstOctet < 128 ? 24 : firstOctet < 192 ? 16 : 8;
  }
  const networkBits = 32 - hostBits;
  const bits = `${'1'.repeat(networkBits)}${'0'.repeat(hostBits)}`;
  return [0, 8, 16, 24].map((offset) => parseInt(bits.slice(offset, offset + 8), 2)).join('.');
}

function assertNetmask(mask) {
  if (net.isIP(mask) !== 4) throw new Error('Enter a valid subnet mask');
  const bits = mask.split('.').map((part) => Number(part).toString(2).padStart(8, '0')).join('');
  if (!/^1*0*$/.test(bits) || !bits.includes('1') || !bits.includes('0')) throw new Error('Enter a contiguous subnet mask');
}

function assertLocalAddress(ip, label, allowZero = false) {
  if (allowZero && ip === '0.0.0.0') return;
  if (net.isIP(ip) !== 4 || !isPrivateIpv4(ip)) throw new Error(`${label} must be a private IPv4 address`);
  const last = Number(ip.split('.')[3]);
  if (last === 0 || last === 255) throw new Error(`${label} cannot be a network or broadcast address`);
}

function isPrivateIpv4(ip) {
  if (net.isIP(ip) !== 4) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

async function tcpConflictCheck(ip) {
  const ports = [80, 5000, 9999, 10001];
  const results = await Promise.all(ports.map((port) => new Promise((resolve) => {
    const socket = net.createConnection({ host: ip, port });
    const done = (open) => { socket.destroy(); resolve(open); };
    socket.setTimeout(220);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  })));
  return results.some(Boolean);
}

function pruneCache() {
  for (const [mac, value] of discoveryCache) {
    if (Date.now() - value.discoveredAt > 5 * 60_000) discoveryCache.delete(mac);
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
