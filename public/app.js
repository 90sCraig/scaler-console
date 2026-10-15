const $ = (selector) => document.querySelector(selector);
const elements = {
  form: $('#connectForm'), profile: $('#profileSelect'), host: $('#hostInput'), port: $('#portInput'),
  theme: $('#themeSelect'),
  scan: $('#scanButton'), scanResults: $('#scanResults'), refresh: $('#refreshButton'), firmware: $('#firmwareButton'), firmwarePanel: $('#firmwarePanel'), pill: $('#connectionPill'),
  modelLine: $('#modelLine'), profileNote: $('#profileNote'), empty: $('#emptyState'), controls: $('#controls'),
  signalInput: $('#signalInput'), signalOutput: $('#signalOutput'), toast: $('#toast'),
  networkDialog: $('#networkDialog'), networkForm: $('#networkForm'), networkMac: $('#networkMac'),
  networkModel: $('#networkModel'), networkIp: $('#networkIp'), networkMask: $('#networkMask'), networkGateway: $('#networkGateway'),
  recovery: $('#recoveryButton'), localAddress: $('#localAddress'), deviceAddress: $('#deviceAddress'),
  networkExplanation: $('#networkExplanation'), deviceStatus: $('#deviceStatus'), advancedNetworkFields: $('#advancedNetworkFields'),
  networkModeNote: $('#networkModeNote')
};
elements.firmwareGuide = $('#firmwareGuideDialog');
elements.firmwareGuideSteps = $('#firmwareGuideSteps');

let profiles = [];
let activeProfile = null;
let connected = false;
let controlsBound = false;
let networkMode = 'discovered';
let selectedDevice = null;
let discoveredNetworks = [];
let toastTimer;
let lastState = {};

init();

elements.theme.value = document.documentElement.dataset.theme || 'classic';
elements.theme.addEventListener('change', () => {
  document.documentElement.dataset.theme = elements.theme.value;
  try { localStorage.setItem('kramer-theme', elements.theme.value); } catch { /* Selection still applies for this session. */ }
});

async function init() {
  try {
    const data = await api('/api/profiles');
    profiles = data.profiles;
    for (const profile of profiles) {
      elements.profile.add(new Option(`${profile.manufacturer} ${profile.model}`, profile.id));
    }
    activeProfile = profiles[0];
    elements.port.value = activeProfile?.defaultPort || 5000;
    const saved = JSON.parse(localStorage.getItem('kramer-target') || 'null');
    if (saved) {
      elements.host.value = saved.host || '';
      elements.port.value = saved.port || activeProfile.defaultPort;
      elements.profile.value = saved.profileId || activeProfile.id;
    }
    updateProfile();
  } catch (error) { showToast(error.message, true); }
}

elements.profile.addEventListener('change', () => updateProfile(true));
elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = elements.form.querySelector('[type="submit"]');
  setLoading(button, true);
  try {
    const target = getTarget();
    const candidatePorts = [...new Set([target.port, activeProfile.defaultPort, ...(activeProfile.alternatePorts || [])])];
    let connectedPort = null;
    let lastError;
    for (const port of candidatePorts) {
      try {
        const result = await api('/api/test', { method: 'POST', body: JSON.stringify({ ...target, port }) });
        if (!result.ok) throw new Error('The device did not return its command prompt');
        connectedPort = port;
        break;
      } catch (error) { lastError = error; }
    }
    if (!connectedPort) throw lastError || new Error('The scaler did not answer');
    target.port = connectedPort;
    elements.port.value = connectedPort;
    connected = true;
    localStorage.setItem('kramer-target', JSON.stringify(target));
    setConnection(true);
    renderControls();
    await refreshState();
  } catch (error) {
    connected = false;
    setConnection(false);
    showToast(error.message, true);
  } finally { setLoading(button, false); }
});

elements.refresh.addEventListener('click', () => refreshState());
elements.firmware.addEventListener('click', checkFirmware);
elements.firmwarePanel.addEventListener('click', (event) => {
  if (event.target.closest('#firmwareUpdateGuide')) elements.firmwareGuide.showModal();
});
$('#firmwareGuideClose').addEventListener('click', () => elements.firmwareGuide.close());
$('#firmwareGuideDone').addEventListener('click', () => elements.firmwareGuide.close());
$('#firmwareGuideRecheck').addEventListener('click', () => { elements.firmwareGuide.close(); checkFirmware(); });
elements.scan.addEventListener('click', scanNetwork);
elements.recovery.addEventListener('click', openLabelRecovery);
$('#dialogClose').addEventListener('click', () => elements.networkDialog.close());
$('#dialogCancel').addEventListener('click', () => elements.networkDialog.close());
elements.networkForm.addEventListener('submit', assignNetworkAddress);

function updateProfile(resetPort = false) {
  activeProfile = profiles.find((profile) => profile.id === elements.profile.value) || profiles[0];
  if (!activeProfile) return;
  elements.modelLine.textContent = `${activeProfile.manufacturer} ${activeProfile.model} · ${activeProfile.family}`;
  if (resetPort) elements.port.value = activeProfile.defaultPort;
  elements.profileNote.textContent = activeProfile.connectionNote || '';
  elements.profileNote.hidden = !activeProfile.connectionNote;
  elements.scan.hidden = !activeProfile.lantronixDiscovery;
  elements.scan.parentElement.classList.toggle('single', !activeProfile.lantronixDiscovery);
  elements.recovery.hidden = !activeProfile.lantronixDiscovery;
  if (!activeProfile.lantronixDiscovery) elements.scanResults.hidden = true;
}

function getTarget() {
  return { profileId: activeProfile.id, host: elements.host.value.trim(), port: Number(elements.port.value) };
}

function setConnection(isOnline) {
  elements.pill.classList.toggle('online', isOnline);
  elements.pill.querySelector('b').textContent = isOnline ? `${elements.host.value} connected` : 'Not connected';
  elements.refresh.disabled = !isOnline;
  elements.firmware.disabled = !isOnline || !activeProfile?.firmwareCheck;
  if (!isOnline) elements.firmwarePanel.hidden = true;
  document.body.classList.toggle('online-main', isOnline);
}

function renderControls() {
  elements.empty.hidden = true;
  elements.controls.hidden = false;
  elements.firmwarePanel.hidden = true;
  lastState = {};
  const groups = activeProfile.settings.reduce((result, setting) => {
    if (!result.has(setting.group)) result.set(setting.group, []);
    result.get(setting.group).push(setting);
    return result;
  }, new Map());
  const initialGroups = activeProfile.initialGroups || [...groups.keys()];
  elements.controls.innerHTML = [...groups].map(([group, settings]) => `
    <details class="control-group" data-group="${escapeHtml(group)}" ${initialGroups.includes(group) ? 'open' : ''}>
      <summary class="group-title"><span><h3>${escapeHtml(group)}</h3><p>${groupDescription(group)}</p></span><small>${settings.length} ${settings.length === 1 ? 'control' : 'controls'}</small></summary>
      <div class="control-grid">${settings.map(renderSetting).join('')}</div>
    </details>`).join('');

  elements.controls.querySelectorAll('details').forEach((section) => section.addEventListener('toggle', () => {
    const readable = activeProfile.settings.some((item) => item.group === section.dataset.group && !['action', 'actionSelect'].includes(item.kind));
    if (section.open && connected && readable && !initialGroups.includes(section.dataset.group)) refreshState([section.dataset.group]);
  }));

  if (!controlsBound) {
    elements.controls.addEventListener('change', handleControlChange);
    elements.controls.addEventListener('input', handleRangeInput);
    elements.controls.addEventListener('click', handleToggleClick);
    elements.controls.addEventListener('click', handleActionClick);
    controlsBound = true;
  }
}

function renderSetting(setting) {
  if (setting.kind === 'select') {
    return `<div class="control" data-setting="${setting.id}"><label><span>${escapeHtml(setting.label)}</span></label><select disabled><option value="" selected disabled>Reading…</option>${setting.options.map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
  }
  if (setting.kind === 'range') {
    return `<div class="control setting-unavailable" data-setting="${setting.id}"><label><span>${escapeHtml(setting.label)}</span><output class="value">Reading…</output></label><input type="range" min="${setting.min}" max="${setting.max}" step="${setting.step}" value="${setting.min}" style="--fill:0%" disabled></div>`;
  }
  if (setting.kind === 'number') {
    return `<div class="control number-control" data-setting="${setting.id}"><label><span>${escapeHtml(setting.label)}</span><output class="value">Reading…</output></label><div class="number-entry"><input type="number" aria-label="${escapeHtml(setting.label)}" min="${setting.min}" max="${setting.max}" step="${setting.step}" disabled><button class="button quiet apply-number" type="button" disabled>Apply</button></div>${setting.note ? `<small class="control-note">${escapeHtml(setting.note)}</small>` : ''}</div>`;
  }
  if (['readonly', 'firmware'].includes(setting.kind)) {
    return `<div class="control readout" data-setting="${setting.id}"><span>${escapeHtml(setting.label)}</span><output class="value">Reading…</output></div>`;
  }
  if (setting.kind === 'actionSelect') {
    return `<div class="control action-select" data-setting="${setting.id}"><label>${escapeHtml(setting.label)}</label><div class="number-entry"><select aria-label="${escapeHtml(setting.label)}">${setting.options.map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join('')}</select><button class="button quiet action-button" type="button">${escapeHtml(setting.label.startsWith('Save') ? 'Save' : 'Recall')}</button></div></div>`;
  }
  if (setting.kind === 'action') {
    return `<div class="control action-control" data-setting="${setting.id}"><button class="button ${setting.dangerous ? 'danger' : 'quiet'} action-button" type="button">${escapeHtml(setting.label)}</button><output class="value"></output></div>`;
  }
  return `<div class="control" data-setting="${setting.id}"><div class="toggle-row"><span>${escapeHtml(setting.label)}</span><button class="switch" type="button" role="switch" aria-pressed="false" aria-label="${escapeHtml(setting.label)}" disabled><i></i></button></div></div>`;
}

async function refreshState(groups = null) {
  if (!connected) return;
  setLoading(elements.refresh, true);
  try {
    const visibleGroups = groups || [...elements.controls.querySelectorAll('details[open]')].map((section) => section.dataset.group);
    const data = await api('/api/state', { method: 'POST', body: JSON.stringify({ ...getTarget(), groups: visibleGroups }) });
    lastState = { ...lastState, ...data.state };
    for (const setting of activeProfile.settings.filter((item) => visibleGroups.includes(item.group) && !['action', 'actionSelect'].includes(item.kind))) {
      const error = data.errors?.[setting.id];
      const status = !error ? 'ready' : /\bERR 3\b/.test(error) ? 'unavailable' : 'error';
      setSettingStatus(setting.id, status);
      if (status === 'ready') applyValue(setting.id, data.state[setting.id]);
    }
    if (lastState.inputSource !== undefined && lastState.outputResolution !== undefined) updateSignalPath(lastState, data.inputStatus);
    const errors = Object.values(data.errors || {});
    const unexpected = errors.filter((error) => !/\bERR 3\b/.test(error));
    if (unexpected.length) showToast(`${unexpected.length} settings could not be read`, true);
    else if (isNoSignal(data.inputStatus) && visibleGroups.includes('Picture')) showToast('No signal on the selected input; picture controls are unavailable');
    else if (errors.length) showToast(`${errors.length} ${errors.length === 1 ? 'setting is' : 'settings are'} unavailable on the device`);
    else showToast('Settings are up to date');
  } catch (error) { showToast(error.message, true); }
  finally { setLoading(elements.refresh, false); }
}

function setSettingStatus(id, status) {
  const container = elements.controls.querySelector(`[data-setting="${id}"]`);
  if (!container) return;
  const available = status === 'ready';
  container.classList.toggle('setting-unavailable', !available);
  container.title = available ? '' : status === 'unavailable' ? 'This setting is unavailable on the device right now' : 'This setting could not be read';
  container.querySelectorAll('select, input, button').forEach((control) => { control.disabled = !available; });
  const select = container.querySelector('select');
  if (select && !available) {
    select.querySelector('option[value=""]').textContent = status === 'unavailable' ? 'Unavailable' : 'Could not read';
    select.value = '';
  }
  const output = container.querySelector('output');
  if (output && !available) output.value = status === 'unavailable' ? 'Unavailable' : 'Could not read';
}

function applyValue(id, value) {
  const container = elements.controls.querySelector(`[data-setting="${id}"]`);
  const setting = activeProfile.settings.find((item) => item.id === id);
  if (!container || !setting || value === null) return;
  if (setting.kind === 'select') container.querySelector('select').value = value;
  if (setting.kind === 'range') {
    const range = container.querySelector('input');
    range.value = value;
    setRangeFill(range);
    container.querySelector('output').value = value;
  }
  if (setting.kind === 'number') {
    container.querySelector('input').value = value;
    container.querySelector('output').value = value;
  }
  if (setting.kind === 'firmware') {
    container.querySelector('output').value = `Master ${value.master} · Audio ${value.audio}`;
  }
  if (setting.kind === 'readonly') {
    const label = setting.statusLabels?.[value];
    container.querySelector('output').value = label ? `${value} · ${label}` : String(value);
  }
  if (setting.kind === 'toggle') container.querySelector('.switch').setAttribute('aria-pressed', String(value === 1));
}

async function checkFirmware() {
  if (!connected || !activeProfile?.firmwareCheck) return;
  setLoading(elements.firmware, true);
  elements.firmwarePanel.hidden = false;
  elements.firmwarePanel.innerHTML = '<p>Reading the scaler and checking Kramer’s published firmware…</p>';
  try {
    const data = await api('/api/firmware/check', { method: 'POST', body: JSON.stringify(getTarget()) });
    const headline = data.status === 'update-available' ? 'Firmware update available'
      : data.status === 'current' ? 'Firmware is up to date'
      : data.status === 'ahead' ? 'Installed firmware is newer than Kramer’s listing'
      : 'Could not verify the latest firmware';
    const version = (name, label) => `<div class="firmware-version"><span>${label}</span><strong>Installed ${escapeHtml(data.installed[name])}</strong><span>Kramer ${data.latest ? escapeHtml(data.latest[name]) : 'not verified'}</span><b class="${escapeHtml(data.components?.[name] || 'unverified')}">${data.components?.[name] === 'update-available' ? 'Update available' : data.components?.[name] === 'current' ? 'Current' : data.components?.[name] === 'ahead' ? 'Newer than listed' : 'Unverified'}</b></div>`;
    const changelog = data.changelog?.length ? `<div class="firmware-changelog"><h4>Release highlights</h4><p>From Kramer’s combined VP-728/729 notes; items are not always assigned to one firmware component.</p>${data.changelog.map((release) => `<div class="firmware-release"><strong>${escapeHtml(release.version)}</strong><small>${escapeHtml(release.date)}</small><ul>${release.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`).join('')}</div>` : '';
    const updateAction = data.status === 'update-available' ? '<button class="button primary" id="firmwareUpdateGuide" type="button">How to update</button>' : '';
    elements.firmwarePanel.innerHTML = `<div class="firmware-heading"><div><small>VP-729 firmware</small><h3>${headline}</h3></div><span>${data.status === 'update-available' ? '!' : data.status === 'current' ? '✓' : '?'}</span></div>
      <div class="firmware-versions">${version('master', 'Master')}${version('audio', 'Audio')}</div>
      <p>${data.verificationError ? escapeHtml(data.verificationError) : 'Read-only check. No firmware or settings were changed.'} <a href="${escapeHtml(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">View Kramer’s official downloads</a></p>
      ${changelog}<div class="firmware-actions">${updateAction}<a href="${escapeHtml(data.releaseNotesUrl)}" target="_blank" rel="noopener noreferrer">Full release notes</a></div>`;
    elements.firmwareGuideSteps.innerHTML = `${data.components?.audio === 'update-available' ? `<section><h3>Audio ${escapeHtml(data.installed.audio)} → ${escapeHtml(data.latest.audio)}</h3><ol>
      <li>Check for the rear <strong>AUDIO PROG.</strong> terminal connector and button. If either is absent, contact Kramer service.</li>
      <li>Download the official audio package and read Kramer’s manual, section 9, before starting.</li>
      <li>Connect the AUDIO PROG. terminal to the computer’s serial adapter: Tx to DB9 pin 2, Rx to pin 3, GND to pin 5.</li>
      <li>Press AUDIO PROG. first, then switch the scaler on. Kramer says this order is critical.</li>
      <li>In Atmel FLIP, select AT89C51RD2, load the package’s correct HEX file, choose the serial port at 9600 baud, connect, then run the update. Continue only when FLIP reports <strong>Memory Verify Pass</strong>.</li>
      <li>Power off, release AUDIO PROG., power on again, then select <strong>Recheck versions</strong> here.</li>
    </ol></section>` : ''}${data.components?.master === 'update-available' ? `<section><h3>Master ${escapeHtml(data.installed.master)} → ${escapeHtml(data.latest.master)}</h3><ol>
      <li>Download Kramer’s master firmware package and follow its included instructions.</li>
      <li>The VP-729 manual identifies <strong>Setup → Advanced Setup → Misc → Firmware Download</strong> as the USB update entry point. Use the package’s correct file and do not disconnect power during the update.</li>
      <li>After the unit restarts, select <strong>Recheck versions</strong> here.</li>
    </ol></section>` : ''}`;
  } catch (error) {
    elements.firmwarePanel.innerHTML = `<div class="firmware-heading"><div><small>VP-729 firmware</small><h3>Could not read the scaler</h3></div><span>!</span></div><p>${escapeHtml(error.message)}</p>`;
  } finally { setLoading(elements.firmware, false); }
}

async function handleControlChange(event) {
  if (!event.target.matches('select, input[type="range"]')) return;
  const container = event.target.closest('[data-setting]');
  const setting = activeProfile.settings.find((item) => item.id === container.dataset.setting);
  if (setting.kind === 'actionSelect') return;
  await saveSetting(container, Number(event.target.value));
}

function handleRangeInput(event) {
  if (!event.target.matches('input[type="range"]')) return;
  setRangeFill(event.target);
  event.target.closest('.control').querySelector('output').value = event.target.value;
}

async function handleToggleClick(event) {
  const button = event.target.closest('.switch');
  if (!button) return;
  const container = button.closest('[data-setting]');
  const nextValue = button.getAttribute('aria-pressed') === 'true' ? 0 : 1;
  await saveSetting(container, nextValue);
}

async function handleActionClick(event) {
  const button = event.target.closest('.action-button, .apply-number');
  if (!button) return;
  const container = button.closest('[data-setting]');
  const setting = activeProfile.settings.find((item) => item.id === container.dataset.setting);
  if (setting.kind === 'number' && container.querySelector('input').value === '') {
    showToast(`Enter a value for ${setting.label}`, true);
    return;
  }
  const value = setting.kind === 'actionSelect' ? Number(container.querySelector('select').value)
    : setting.kind === 'number' ? Number(container.querySelector('input').value) : undefined;
  await saveSetting(container, value);
}

async function saveSetting(container, value) {
  const settingId = container.dataset.setting;
  const setting = activeProfile.settings.find((item) => item.id === settingId);
  if (setting.confirm && !window.confirm(setting.confirm)) return;
  container.classList.add('setting-busy');
  try {
    const data = await api('/api/setting', { method: 'POST', body: JSON.stringify({ ...getTarget(), settingId, value, confirm: Boolean(setting.confirm) }) });
    if (!['action', 'actionSelect'].includes(setting.kind)) applyValue(settingId, data.value ?? value);
    if (settingId === 'inputSource' || settingId === 'outputResolution') updateSignalFromControls();
    if (settingId === 'inputSource' || settingId === 'recallPreset') await refreshState();
    else if (['pip', 'pipType', 'pipSize', 'zoom', 'geometryApplication', 'geometryLocation', 'audioDelayMode', 'customInputSlot', 'customOutputSlot', 'inputTimingEnable'].includes(settingId)) {
      await refreshState([setting.group]);
    }
    if (setting.kind === 'action' || setting.kind === 'actionSelect') {
      const output = container.querySelector('output');
      if (output && data.value != null) output.value = String(data.value);
    }
    showToast(`${setting.label} ${['action', 'actionSelect'].includes(setting.kind) ? 'sent' : 'updated'}`);
  } catch (error) { showToast(error.message, true); }
  finally { container.classList.remove('setting-busy'); }
}

async function scanNetwork() {
  elements.scanResults.hidden = false;
  elements.scanResults.innerHTML = `<p>Listening for Lantronix network modules…</p>`;
  setLoading(elements.scan, true);
  try {
    const data = await api('/api/lantronix/discover');
    discoveredNetworks = data.networks || [];
    elements.scanResults.innerHTML = data.devices.length ? `${renderDiscoverySummary(data.devices.length)}${data.devices.map(renderDiscoveredDevice).join('')}`
      : `<div class="scan-empty"><strong>No device replied</strong><p>If its Ethernet lights are on, use the MAC address printed beside its network socket.</p><button class="button quiet" type="button" data-label-recovery>Use the device label</button></div>`;
    elements.scanResults.querySelectorAll('[data-use-device]').forEach((button) => button.addEventListener('click', () => {
      elements.host.value = button.dataset.ip;
      elements.port.value = activeProfile.defaultPort;
      elements.scanResults.hidden = true;
      elements.form.requestSubmit();
    }));
    elements.scanResults.querySelectorAll('[data-configure-device]').forEach((button) => button.addEventListener('click', () => openNetworkDialog(button.dataset.mac, data.devices, data.networks)));
    elements.scanResults.querySelector('[data-label-recovery]')?.addEventListener('click', openLabelRecovery);
  } catch (error) { elements.scanResults.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
  finally { setLoading(elements.scan, false); }
}

function renderDiscoverySummary(count) {
  return `<div class="scan-summary">
    <strong>${count} ${count === 1 ? 'device' : 'devices'} found</strong>
    <span>${count === 1 ? 'Choose what you want to do with it.' : 'Choose a device to connect or change its network settings.'}</span>
  </div>`;
}

function renderDiscoveredDevice(device) {
  const reachable = sameSubnet(device.currentIp, device.interfaceAddress, device.subnetMask || '255.255.255.0');
  const model = String(device.model || '').replace(/[;,\s]+$/g, '').trim() || 'Lantronix module';
  const summary = reachable
    ? 'This device is on the same network and ready to connect.'
    : 'This device was found, but its address is outside this computer’s network.';
  const actions = reachable
    ? `<button class="button primary" type="button" data-use-device data-ip="${escapeHtml(device.currentIp)}">Connect to device</button>
      <button class="button quiet" type="button" data-configure-device data-mac="${escapeHtml(device.mac)}" ${device.configurable ? '' : 'disabled'}>Network settings</button>`
    : `<button class="button primary" type="button" data-configure-device data-mac="${escapeHtml(device.mac)}" ${device.configurable ? '' : 'disabled'}>Move to this network</button>`;

  return `<article class="found-device-card">
    <header class="found-device-heading">
      <div>
        <span class="device-kicker">Device address</span>
        <strong class="device-address">${escapeHtml(device.currentIp)}</strong>
      </div>
      <span class="reachability ${reachable ? 'reachable' : 'mismatch'}">${reachable ? 'Ready' : 'Needs setup'}</span>
    </header>
    <p class="device-summary">${summary}</p>
    <dl class="device-details">
      <div><dt>Network module</dt><dd>${escapeHtml(model)}</dd></div>
      <div><dt>MAC address</dt><dd><code>${escapeHtml(device.mac)}</code></dd></div>
      ${device.subnetMask ? `<div><dt>Subnet mask</dt><dd>${escapeHtml(device.subnetMask)}</dd></div>` : ''}
    </dl>
    <div class="device-card-actions">
      ${actions}
    </div>
  </article>`;
}

function openNetworkDialog(mac, devices, networks = discoveredNetworks) {
  const device = devices.find((item) => item.mac === mac);
  if (!device) return;
  selectedDevice = device;
  networkMode = 'discovered';
  const network = networks.find((item) => item.address === device.interfaceAddress) || networks[0] || fallbackNetwork();
  elements.networkMac.value = device.mac;
  elements.networkMac.readOnly = true;
  elements.networkModel.textContent = device.model || 'Lantronix module';
  elements.deviceStatus.textContent = 'Found automatically';
  elements.localAddress.textContent = network.address;
  elements.deviceAddress.textContent = device.currentIp;
  elements.networkIp.value = suggestedAddress(network.address);
  elements.networkMask.value = network.subnetMask || '255.255.255.0';
  elements.networkGateway.value = network.suggestedGateway;
  elements.advancedNetworkFields.hidden = false;
  elements.networkMask.required = true;
  elements.networkGateway.required = true;
  elements.networkExplanation.textContent = sameSubnet(device.currentIp, network.address, device.subnetMask || network.subnetMask)
    ? 'Choose a new address for the scaler. Its network interface will restart; video output will continue.'
    : 'The scaler is on a different network. Give it an address this computer can reach; video output will continue.';
  elements.networkModeNote.classList.remove('error');
  elements.networkModeNote.textContent = sameSubnet(device.currentIp, network.address, device.subnetMask || network.subnetMask)
    ? 'The new address will be checked for conflicts before anything is changed.'
    : 'Windows will ask for administrator approval. The app will add a temporary address, move the scaler, then remove that address. Your normal network connection stays on DHCP.';
  elements.networkDialog.showModal();
}

async function openLabelRecovery() {
  try {
    const data = discoveredNetworks.length ? { networks: discoveredNetworks } : await api('/api/network/interfaces');
    discoveredNetworks = data.networks || [];
    const network = discoveredNetworks[0] || fallbackNetwork();
    networkMode = 'label';
    selectedDevice = null;
    elements.networkMac.value = '';
    elements.networkMac.readOnly = false;
    elements.networkModel.textContent = 'Kramer scaler';
    elements.deviceStatus.textContent = 'Using rear label';
    elements.localAddress.textContent = network.address;
    elements.deviceAddress.textContent = 'Address unknown';
    elements.networkIp.value = suggestedAddress(network.address);
    elements.networkMask.value = network.subnetMask || '255.255.255.0';
    elements.networkGateway.value = network.suggestedGateway;
    elements.advancedNetworkFields.hidden = true;
    elements.networkMask.required = false;
    elements.networkGateway.required = false;
    elements.networkExplanation.textContent = 'Enter the MAC address printed beside the scaler’s Ethernet socket. The app can attempt an address change without knowing its current IP.';
    elements.networkModeNote.textContent = 'This recovery changes only the IP address. The scaler keeps its existing subnet mask and gateway.';
    elements.networkDialog.showModal();
    setTimeout(() => elements.networkMac.focus(), 50);
  } catch (error) { showToast(error.message, true); }
}

async function assignNetworkAddress(event) {
  event.preventDefault();
  const button = elements.networkForm.querySelector('[type="submit"]');
  elements.networkModeNote.classList.remove('error');
  setLoading(button, true);
  try {
    const requiresLocalAccess = networkMode === 'discovered' && selectedDevice
      && !sameSubnet(selectedDevice.currentIp, selectedDevice.interfaceAddress, selectedDevice.subnetMask || '255.255.255.0');
    const path = networkMode === 'label'
      ? '/api/lantronix/assign-by-mac'
      : requiresLocalAccess ? '/api/lantronix/recover' : '/api/lantronix/assign';
    if (requiresLocalAccess) elements.networkModeNote.textContent = 'Approve the Windows administrator prompt. The app will remove its temporary address when finished.';
    const result = await api(path, {
      method: 'POST',
      body: JSON.stringify({
        mac: elements.networkMac.value.trim(),
        ip: elements.networkIp.value.trim(),
        subnetMask: elements.networkMask.value.trim(),
        gateway: elements.networkGateway.value.trim()
      })
    });
    if (!result.ok) throw new Error(result.message || 'The device did not accept the new address');
    elements.networkDialog.close();
    elements.host.value = result.ip;
    elements.port.value = activeProfile.defaultPort;
    elements.scanResults.hidden = true;
    showToast(result.message, !result.configured);
    if (result.restoreComputerNetwork) {
      elements.scanResults.hidden = false;
      elements.scanResults.innerHTML = `<div class="restore-network"><strong>The Kramer moved to ${escapeHtml(result.ip)}</strong><p>Restore “Obtain an IP address automatically” and automatic DNS in Windows. Then select Connect.</p></div>`;
      return;
    }
    await reconnectAfterAssignment(result.ip);
  } catch (error) {
    elements.networkModeNote.textContent = error.message;
    elements.networkModeNote.classList.add('error');
    showToast(error.message, true);
  }
  finally { setLoading(button, false); }
}

async function reconnectAfterAssignment(ip) {
  elements.scanResults.hidden = false;
  elements.scanResults.innerHTML = `<div class="reconnect-status"><i></i><strong>Restarting the network interface</strong><p>Waiting for ${escapeHtml(ip)}…</p></div>`;
  await delay(4500);
  const ports = [...new Set([activeProfile.defaultPort, ...(activeProfile.alternatePorts || [])])];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    for (const port of ports) {
      try {
        await api('/api/test', { method: 'POST', body: JSON.stringify({ profileId: activeProfile.id, host: ip, port }) });
        elements.host.value = ip;
        elements.port.value = port;
        connected = true;
        localStorage.setItem('kramer-target', JSON.stringify(getTarget()));
        setConnection(true);
        renderControls();
        elements.scanResults.hidden = true;
        showToast(`Moved and connected at ${ip}:${port}`);
        await refreshState();
        return;
      } catch {}
    }
    if (attempt < 5) await delay(1600);
  }
  try {
    const discovery = await api('/api/lantronix/discover');
    const moved = discovery.devices.find((device) => device.currentIp === ip && device.mac === elements.networkMac.value.trim());
    if (moved) {
      elements.scanResults.innerHTML = `<div class="restore-network"><strong>The Kramer moved to ${escapeHtml(ip)}</strong><p>Its control port has not replied yet. Try Connect with ${ports.map((port) => `port ${port}`).join(', then ')}.</p></div>`;
      showToast(`Address changed to ${ip}; control port still needs checking`, true);
      return;
    }
  } catch {}
  elements.scanResults.innerHTML = `<div class="scan-empty"><strong>Control connection not ready</strong><p>Wait a few seconds, then use Find devices to check the scaler’s address.</p></div>`;
  showToast('The scaler has not answered on either control port', true);
}

function suggestedAddress(interfaceAddress) {
  const parts = interfaceAddress.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}.239`;
}

function fallbackNetwork() {
  return { address: '192.168.10.125', subnetMask: '255.255.255.0', suggestedGateway: '192.168.10.1' };
}

function sameSubnet(first, second, mask) {
  if (![first, second, mask].every((value) => /^\d{1,3}(\.\d{1,3}){3}$/.test(value || ''))) return false;
  const toInt = (value) => value.split('.').reduce((result, part) => ((result << 8) | Number(part)) >>> 0, 0);
  return (toInt(first) & toInt(mask)) === (toInt(second) & toInt(mask));
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function updateSignalPath(state, inputStatus) {
  const input = activeProfile.settings.find((item) => item.id === 'inputSource');
  const output = activeProfile.settings.find((item) => item.id === 'outputResolution');
  const inputLabel = input?.options.find((item) => item.value === state.inputSource)?.label || 'Unknown';
  elements.signalInput.textContent = isNoSignal(inputStatus) ? `${inputLabel} · No signal` : inputLabel;
  elements.signalOutput.textContent = output?.options.find((item) => item.value === state.outputResolution)?.label || 'Unknown';
  const pictureNote = elements.controls.querySelector('[data-group="Picture"] .group-title p');
  if (pictureNote) pictureNote.textContent = isNoSignal(inputStatus)
    ? 'No signal on the selected input. Connect a source or choose an active input.'
    : groupDescription('Picture');
}

function isNoSignal(value) {
  return (activeProfile.noSignalValues || [98]).includes(value);
}

function updateSignalFromControls() {
  const input = elements.controls.querySelector('[data-setting="inputSource"] select');
  const output = elements.controls.querySelector('[data-setting="outputResolution"] select');
  if (input) elements.signalInput.textContent = input.selectedOptions[0]?.textContent || 'Unknown';
  if (output) elements.signalOutput.textContent = output.selectedOptions[0]?.textContent || 'Unknown';
}

function setRangeFill(range) {
  const fill = ((range.value - range.min) / (range.max - range.min)) * 100;
  range.style.setProperty('--fill', `${fill}%`);
}

function groupDescription(group) {
  return ({
    Signal: 'Choose what reaches the main output.',
    Picture: 'Tune the active input.',
    Output: 'Match the connected display.',
    'Quick controls': 'Immediate front-panel actions.',
    'Input setup': 'Signal formats, positioning, and auto image.',
    'Picture processing': 'Noise reduction, gamma, and detail.',
    'Layout & scaling': 'Pan, zoom, HDMI type, and overscan.',
    'Picture-in-picture': 'Second source, window layout, and frame.',
    Audio: 'Levels, tone, routing, and delay.',
    Geometry: 'Projection shape and display orientation.',
    Presets: 'Save or recall one of eight profiles.',
    'Device setup': 'On-screen display, locks, switching, and HDCP.',
    'Remote keys': 'Send the front-panel navigation commands.',
    Slideshow: 'USB slideshow playback and interval.',
    Diagnostics: 'Read-only firmware and signal status.',
    'Advanced input timing': 'Custom source timing; use known-good values.',
    'Advanced output timing': 'Custom display timing; incorrect values may blank the screen.',
    Maintenance: 'Capture, display timing lookup, and factory reset.'
  })[group] || '';
}

async function api(path, options) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setLoading(button, loading) {
  button.classList.toggle('loading', loading);
  button.disabled = loading;
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', isError);
  elements.toast.classList.add('show');
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 3600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
