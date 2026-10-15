import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { discoverLantronix, assignLantronixAddress } from './lantronix.js';

const jobPath = process.argv[2];
let job;
let addressAdded = false;
let coexistenceChanged = false;
let originalCoexistence;
let restored = true;
let result;

try {
  if (process.platform !== 'win32') throw new Error('Automatic network recovery requires Windows');
  job = JSON.parse(await readFile(jobPath, 'utf8'));
  const { interfaceName, interfaceAddress, oldIp, temporaryIp, mac, ip, subnetMask, gateway } = job;
  if (!interfaceName || !interfaceAddress || !oldIp || !temporaryIp || !mac || !ip || !subnetMask || !gateway) {
    throw new Error('Incomplete recovery request');
  }

  const active = (networkInterfaces()[interfaceName] || []).some((entry) => entry.family === 'IPv4' && entry.address === interfaceAddress);
  if (!active) throw new Error('The selected Ethernet adapter changed before recovery started');

  const dhcp = readDhcp(interfaceName);
  if (dhcp !== 'Enabled') throw new Error('Automatic recovery requires this adapter to use DHCP');

  const interfaceDetails = execFileSync('netsh.exe', ['interface', 'ipv4', 'show', 'interface', interfaceName], { encoding: 'utf8', timeout: 10000 });
  const coexistence = interfaceDetails.match(/DHCP\/Static IP coexistence\s*:\s*(enabled|disabled)/i);
  if (!coexistence) throw new Error('Windows did not report the adapter’s DHCP coexistence setting');
  originalCoexistence = coexistence[1].toLowerCase();
  if (originalCoexistence === 'disabled') {
    coexistenceChanged = true;
    netsh('set', 'interface', `interface=${interfaceName}`, 'dhcpstaticipcoexistence=enabled', 'store=active');
  }

  // Add a second, temporary address while retaining the DHCP lease, gateway,
  // and DNS. The active store also discards it on reboot if interrupted.
  addressAdded = true;
  netsh('add', 'address', `name=${interfaceName}`, `address=${temporaryIp}`, 'mask=255.255.255.0', 'skipassource=true', 'store=active');
  await waitForAddress(interfaceName, temporaryIp, 8000);
  if (readDhcp(interfaceName) !== 'Enabled') throw new Error('Windows disabled DHCP while adding the temporary address');
  await waitForPreferredAddress(interfaceName, temporaryIp, 12000);
  if (!(networkInterfaces()[interfaceName] || []).some((entry) => entry.family === 'IPv4' && entry.address === interfaceAddress)) {
    throw new Error('Windows lost the original DHCP address during recovery');
  }

  const devices = await discoverLantronix({ timeout: 2300 });
  const device = devices.find((item) => item.mac === mac && item.currentIp === oldIp);
  if (!device) throw new Error(`The Kramer did not respond at ${oldIp} after temporary network access was applied`);

  result = await assignLantronixAddress({ mac, ip, subnetMask, gateway });
  if (!result.ok) throw new Error(result.message || 'The Kramer did not accept the new address');
} catch (error) {
  result = { ok: false, error: error.message || String(error) };
} finally {
  if (addressAdded) {
    try {
      netsh('delete', 'address', `name=${job.interfaceName}`, `address=${job.temporaryIp}`, 'store=active');
    } catch (error) {
      restored = false;
      result = { ok: false, error: `${result?.error || 'Recovery stopped'}. Windows could not remove the temporary address: ${error.message}` };
    }
  }
  if (job?.interfaceName) {
    try {
      if (readDhcp(job.interfaceName) !== 'Enabled') {
        netsh('set', 'address', `name=${job.interfaceName}`, 'source=dhcp', 'store=active');
      }
    } catch (error) {
      restored = false;
      result = { ok: false, error: `${result?.error || 'Recovery stopped'}. Windows could not restore DHCP: ${error.message}` };
    }
  }
  if (coexistenceChanged) {
    try {
      netsh('set', 'interface', `interface=${job.interfaceName}`, `dhcpstaticipcoexistence=${originalCoexistence}`, 'store=active');
    } catch (error) {
      restored = false;
      result = { ok: false, error: `${result?.error || 'Recovery stopped'}. Windows could not restore the adapter setting: ${error.message}` };
    }
  }
  if (job?.interfaceName && job?.interfaceAddress) {
    try { await waitForAddress(job.interfaceName, job.interfaceAddress, 8000); }
    catch { restored = false; result = { ok: false, error: 'The original DHCP address was not present after recovery. Check Windows Ethernet settings.' }; }
  }
  if (jobPath) {
    await writeFile(`${jobPath}.result`, JSON.stringify({ ...result, restored }), 'utf8');
  }
}

function netsh(...args) {
  execFileSync('netsh.exe', ['interface', 'ipv4', ...args], { encoding: 'utf8', timeout: 15000 });
}

function readDhcp(interfaceName) {
  return execFileSync('powershell.exe', [
    '-NoProfile', '-Command',
    `(Get-NetIPInterface -InterfaceAlias '${interfaceName.replace(/'/g, "''")}' -AddressFamily IPv4).Dhcp`
  ], { encoding: 'utf8', timeout: 10000 }).trim();
}

async function waitForAddress(name, address, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = (networkInterfaces()[name] || []).some((entry) => entry.family === 'IPv4' && entry.address === address);
    if (found) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Ethernet did not return to ${address} in time`);
}

async function waitForPreferredAddress(name, address, timeout) {
  const deadline = Date.now() + timeout;
  let state = '';
  while (Date.now() < deadline) {
    state = execFileSync('powershell.exe', [
      '-NoProfile', '-Command',
      `(Get-NetIPAddress -InterfaceAlias '${name.replace(/'/g, "''")}' -IPAddress '${address}' -AddressFamily IPv4).AddressState`
    ], { encoding: 'utf8', timeout: 10000 }).trim();
    if (state === 'Preferred') return;
    if (state === 'Duplicate') break;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  throw new Error(`The temporary address ${address} could not be used (${state || 'unknown state'})`);
}
