import http from 'node:http';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { getProfile, listProfiles } from './profiles/index.js';
import { probePort, readSetting, testConnection, validateTarget, writeSetting } from './device-client.js';
import { checkVp729Firmware, readVp729Firmware } from './firmware.js';
import { assignLantronixAddress, assignLantronixAddressByMac, discoverLantronix, getLocalNetworks, lantronixAddressInUse, validateLantronixAssignment } from './lantronix.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const recoveryHelper = fileURLToPath(new URL('./recovery-helper.js', import.meta.url));
let activePort = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const execFileAsync = promisify(execFile);
let recoveryInProgress = false;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Unexpected server error' });
  }
});

async function handleApi(request, response, url) {
  if (request.method === 'POST' && request.headers.origin && request.headers.origin !== `http://127.0.0.1:${activePort}`) {
    return sendJson(response, 403, { error: 'Request came from a different site' });
  }
  if (request.method === 'GET' && url.pathname === '/api/profiles') {
    return sendJson(response, 200, { profiles: listProfiles() });
  }

  if (request.method === 'GET' && url.pathname === '/api/discover') {
    const subnet = url.searchParams.get('subnet');
    const scanPort = Number(url.searchParams.get('port') || 10001);
    if (!/^((10|192\.168|172\.(1[6-9]|2\d|3[01]))\.)\d{1,3}$/.test(subnet || '')) {
      return sendJson(response, 400, { error: 'Use a local /24 subnet such as 192.168.10' });
    }
    const devices = [];
    let cursor = 1;
    const workers = Array.from({ length: 48 }, async () => {
      while (cursor < 255) {
        const host = `${subnet}.${cursor++}`;
        if (await probePort(host, scanPort)) devices.push({ host, port: scanPort });
      }
    });
    await Promise.all(workers);
    return sendJson(response, 200, { devices });
  }

  if (request.method === 'GET' && url.pathname === '/api/lantronix/discover') {
    const devices = await discoverLantronix();
    return sendJson(response, 200, { devices, networks: getLocalNetworks() });
  }

  if (request.method === 'GET' && url.pathname === '/api/network/interfaces') {
    return sendJson(response, 200, { networks: getLocalNetworks() });
  }

  if (request.method === 'POST' && url.pathname === '/api/lantronix/assign') {
    const body = await readBody(request);
    const result = await assignLantronixAddress({
      mac: body.mac,
      ip: String(body.ip || ''),
      subnetMask: String(body.subnetMask || ''),
      gateway: String(body.gateway || '')
    });
    return sendJson(response, 200, result);
  }

  if (request.method === 'POST' && url.pathname === '/api/lantronix/recover') {
    if (process.platform !== 'win32') return sendJson(response, 400, { error: 'Automatic recovery requires Windows' });
    if (recoveryInProgress) return sendJson(response, 409, { error: 'Network recovery is already running' });
    recoveryInProgress = true;
    try {
      const body = await readBody(request);
      const result = await recoverLantronixAddress(body);
      return sendJson(response, 200, result);
    } finally {
      recoveryInProgress = false;
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/lantronix/assign-by-mac') {
    const body = await readBody(request);
    const result = await assignLantronixAddressByMac({
      mac: String(body.mac || ''),
      ip: String(body.ip || '')
    });
    return sendJson(response, 200, result);
  }

  if (request.method === 'POST' && url.pathname === '/api/test') {
    const body = await readBody(request);
    const { target } = contextFrom(body);
    const result = await testConnection(target);
    return sendJson(response, 200, result);
  }

  if (request.method === 'POST' && url.pathname === '/api/firmware/check') {
    const body = await readBody(request);
    const { profile, target } = contextFrom(body);
    if (profile.firmwareCheck !== 'vp729') return sendJson(response, 400, { error: 'Firmware checking is not available for this model yet' });
    return sendJson(response, 200, await checkVp729Firmware(target));
  }

  if (request.method === 'POST' && url.pathname === '/api/state') {
    const body = await readBody(request);
    const { profile, target } = contextFrom(body);
    const availableGroups = new Set(profile.settings.map((setting) => setting.group));
    const groups = body.groups ?? profile.initialGroups ?? [...availableGroups];
    if (!Array.isArray(groups) || !groups.every((group) => availableGroups.has(group))) {
      return sendJson(response, 400, { error: 'Choose valid setting groups to read' });
    }
    const state = {};
    const errors = {};
    let inputStatus = null;
    if (profile.inputStatusFunctionCode !== undefined) {
      try { inputStatus = await readSetting(target, { functionCode: profile.inputStatusFunctionCode, window: profile.inputStatusWindow }); }
      catch { /* Older firmware may not expose input status. */ }
    }
    for (const setting of profile.settings.filter((item) => groups.includes(item.group) && !['action', 'actionSelect'].includes(item.kind))) {
      try { state[setting.id] = setting.kind === 'firmware' ? await readVp729Firmware(target) : await readSetting(target, setting); }
      catch (error) { errors[setting.id] = error.message; }
    }
    return sendJson(response, 200, { state, errors, inputStatus, groups });
  }

  if (request.method === 'POST' && url.pathname === '/api/setting') {
    const body = await readBody(request);
    const { profile, target } = contextFrom(body);
    const setting = profile.settings.find((item) => item.id === body.settingId);
    if (!setting) return sendJson(response, 404, { error: 'That setting is not supported by this model' });
    if (setting.confirm && body.confirm !== true) return sendJson(response, 400, { error: 'Confirm this action before sending it to the scaler' });
    const value = await writeSetting(target, setting, body.value);
    return sendJson(response, 200, { ok: true, settingId: setting.id, value });
  }

  sendJson(response, 404, { error: 'Not found' });
}

async function recoverLantronixAddress(body) {
  const devices = await discoverLantronix({ timeout: 1800 });
  const mac = String(body.mac || '').toUpperCase();
  const device = devices.find((item) => item.mac === mac);
  if (!device || !device.configurable) throw new Error('Find this device again before moving it');
  const interfaces = networkInterfaces();
  const interfaceName = Object.entries(interfaces).find(([, entries]) =>
    entries.some((entry) => entry.family === 'IPv4' && entry.address === device.interfaceAddress))?.[0];
  if (!interfaceName) throw new Error('The Ethernet adapter that found this device is no longer available');

  const assignment = {
    ip: String(body.ip || ''),
    subnetMask: String(body.subnetMask || ''),
    gateway: String(body.gateway || '')
  };
  validateLantronixAssignment({ ...assignment, interfaceAddress: device.interfaceAddress });
  if (await lantronixAddressInUse(assignment.ip)) {
    throw new Error(`${assignment.ip} is already responding on the network; choose another address`);
  }

  const oldParts = device.currentIp.split('.');
  if (oldParts.length !== 4 || device.subnetMask !== '255.255.255.0') {
    throw new Error('Automatic recovery currently supports devices on a /24 network');
  }
  const temporaryIp = `${oldParts.slice(0, 3).join('.')}.${oldParts[3] === '10' ? '11' : '10'}`;
  const folder = join(tmpdir(), `kramer-recovery-${randomUUID()}`);
  const jobPath = join(folder, 'request.json');
  await mkdir(folder);
  try {
    await writeFile(jobPath, JSON.stringify({
      interfaceName,
      interfaceAddress: device.interfaceAddress,
      oldIp: device.currentIp,
      temporaryIp,
      mac,
      ...assignment
    }), 'utf8');

    const quotePs = (value) => `'${value.replace(/'/g, "''")}'`;
    const argumentsForNode = `"${recoveryHelper}" "${jobPath}"`;
    const command = `$process = Start-Process -FilePath ${quotePs(process.execPath)} -ArgumentList ${quotePs(argumentsForNode)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $process.ExitCode`;
    try {
      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]);
    } catch (error) {
      try { await readFile(`${jobPath}.result`, 'utf8'); }
      catch { throw new Error('Windows administrator approval was canceled or the recovery helper could not start'); }
    }

    const result = JSON.parse(await readFile(`${jobPath}.result`, 'utf8'));
    if (!result.restored) {
      throw new Error(`${result.error || 'Recovery stopped'}. Check the Windows Ethernet settings and remove the temporary ${temporaryIp} address if it remains.`);
    }
    return result;
  } finally {
    // Cleanup must never replace the recovery result with a filesystem error.
    await Promise.allSettled([
      rm(jobPath, { force: true }),
      rm(`${jobPath}.result`, { force: true })
    ]);
    try { await rmdir(folder); } catch (error) {
      console.warn(`Recovery temporary folder was not removed: ${error.message}`);
    }
  }
}

function contextFrom(body) {
  const profile = getProfile(body.profileId);
  if (!profile) throw new Error('Choose a supported device model');
  return { profile, target: { ...targetFrom(body, profile.defaultPort), protocol: profile.protocol } };
}

function targetFrom(body, fallbackPort = 5000) {
  const target = { host: String(body.host || ''), port: Number(body.port || fallbackPort) };
  validateTarget(target.host, target.port);
  return target;
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32_000) throw new Error('Request is too large');
  }
  try { return JSON.parse(body || '{}'); }
  catch { throw new Error('Request body must be valid JSON'); }
}

async function serveStatic(response, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safe = normalize(relative).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, safe);
  if (!file.startsWith(root)) return sendJson(response, 404, { error: 'Not found' });
  try {
    const content = await readFile(file);
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(content);
  } catch {
    const content = await readFile(join(root, 'index.html'));
    response.writeHead(200, { 'content-type': mime['.html'], 'cache-control': 'no-store' });
    response.end(content);
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(data));
}

export function startServer({ port = Number(process.env.PORT || 4173), host = '127.0.0.1' } = {}) {
  if (server.listening) {
    const address = server.address();
    return Promise.resolve({ server, host, port: address.port });
  }

  activePort = port;
  return new Promise((resolveStart, rejectStart) => {
    const onError = (error) => {
      server.off('listening', onListening);
      rejectStart(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      activePort = address.port;
      console.log(`Scaler Console is ready at http://${host}:${activePort}`);
      resolveStart({ server, host, port: activePort });
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

const isDirectLaunch = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectLaunch) {
  startServer().catch((error) => {
    console.error(`Scaler Console could not start: ${error.message}`);
    process.exitCode = 1;
  });
}
