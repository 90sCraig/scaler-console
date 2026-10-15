const options = (entries) => entries.map(([value, label]) => ({ value, label }));
const select = (id, label, group, functionCode, entries, extra = {}) => ({ id, label, group, functionCode, kind: 'select', options: options(entries), ...extra });
const number = (id, label, group, functionCode, min, max, step = 1, extra = {}) => ({ id, label, group, functionCode, kind: 'number', min, max, step, ...extra });
const toggle = (id, label, group, functionCode, extra = {}) => ({ id, label, group, functionCode, kind: 'toggle', ...extra });

const mainWindow = { window: 0 };
const outputResolutions = [
  'Native', '640×480 · 60 Hz', '640×480 · 75 Hz', '800×600 · 50 Hz', '800×600 · 60 Hz', '800×600 · 75 Hz',
  '1024×768 · 50 Hz', '1024×768 · 60 Hz', '1024×768 · 75 Hz', '1280×768 · 50 Hz', '1280×768 · 60 Hz',
  '1280×800 · 60 Hz', '1280×1024 · 50 Hz', '1280×1024 · 60 Hz', '1280×1024 · 75 Hz', '1360×768 · 60 Hz',
  '1366×768 · 50 Hz', '1366×768 · 60 Hz', '1400×1050 · 50 Hz', '1400×1050 · 60 Hz', '1600×900 · 60 Hz',
  '1600×1200 · 50 Hz', '1600×1200 · 60 Hz', '1680×1050 · 60 Hz', '1920×1200 · 60 Hz', '480i · 60 Hz',
  '480p · 60 Hz', '576i · 50 Hz', '576p · 50 Hz', '720p · 50 Hz', '720p · 59.94 Hz', '720p · 60 Hz',
  '1080p · 23.976 Hz', '1080p · 24 Hz', '1080p · 25 Hz', '1080p · 29.97 Hz', '1080p · 30 Hz',
  '1080p · 50 Hz', '1080p · 59.94 Hz', '1080p · 60 Hz', '2K · 50 Hz', '2K · 60 Hz'
].map((label, value) => [value, label]);

const commonSettings = [
  select('inputSource', 'Main input', 'Signal', 120, [[13, 'HDMI 1'], [14, 'HDMI 2'], [10, 'HDMI 3'], [15, 'HDMI 4'], [11, 'PC 1'], [12, 'PC 2'], [9, 'Composite video'], [16, 'DisplayPort']], mainWindow),
  select('displayMode', 'Display mode', 'Signal', 110, [[0, 'Single window'], [1, 'Picture-in-picture'], [2, 'Picture + picture'], [3, 'Split'], [4, 'Customized']]),

  number('brightness', 'Brightness', 'Picture', 410, -400, 400, 1, mainWindow),
  number('contrast', 'Contrast', 'Picture', 420, 0.1, 1.6, 0.1, mainWindow),
  number('color', 'Color', 'Picture', 430, 0.1, 1.6, 0.1, mainWindow),
  number('blackLevel', 'Black level', 'Picture', 450, -80, 80, 1, mainWindow),
  select('gamma', 'Gamma', 'Picture', 460, [[0, 'Off'], [1, '0.4'], [2, '0.8'], [3, '1.2'], [4, '1.6'], [5, '2.0'], [6, '2.4'], [7, '2.8']], mainWindow),

  select('deinterlacing', 'Deinterlacing', 'Picture processing', 311, [[0, 'Line doubler'], [1, 'Motion adaptive']], mainWindow),
  select('deinterlacingSync', 'Deinterlacing sync', 'Picture processing', 312, [[0, 'Current field'], [1, 'Older field']], mainWindow),
  select('filmMode', 'Film mode', 'Picture processing', 320, [[0, 'Off'], [1, 'Follow input'], [2, '24PsF']], mainWindow),
  number('diagonalCorrection', 'Diagonal correction', 'Picture processing', 330, 0, 3, 1, mainWindow),
  select('motionSensitivity', 'Motion sensitivity', 'Picture processing', 340, [[0, 'Level 1'], [1, 'Level 2'], [2, 'Level 3'], [3, 'Level 4'], [4, 'Level 5']], mainWindow),
  number('horizontalSharpness', 'Horizontal sharpness', 'Picture processing', 510, -10, 10, 1, mainWindow),
  number('verticalSharpness', 'Vertical sharpness', 'Picture processing', 520, -10, 10, 1, mainWindow),
  number('mosquitoNoiseReduction', 'Mosquito noise reduction', 'Picture processing', 531, 0, 3, 1, mainWindow),
  number('combingNoiseReduction', 'Combing noise reduction', 'Picture processing', 532, 0, 3, 1, mainWindow),
  number('temporalNoiseReduction', 'Temporal noise reduction', 'Picture processing', 533, 0, 3, 1, mainWindow),
  number('blockNoiseReduction', 'Block noise reduction', 'Picture processing', 534, 0, 3, 1, mainWindow),
  { id: 'autoAdjust', label: 'Auto adjust picture', group: 'Picture processing', functionCode: 480, kind: 'action', fixedValue: 1, window: 0 },

  select('aspectRatio', 'Aspect ratio', 'Output', 610, [[0, 'Follow input'], [1, 'Follow output'], [2, 'Best fit'], [3, 'Letterbox']], mainWindow),
  select('overscan', 'Overscan', 'Output', 620, [[0, 'Off'], [1, '5%'], [2, '10%']], mainWindow),
  select('outputResolution', 'Output resolution', 'Output', 631, outputResolutions),
  select('masterConnection', 'Master output', 'Output', 632, [[0, 'HDMI 1'], [1, 'HDMI 2'], [2, 'HDBaseT']]),
  select('deepColor', 'Deep color', 'Output', 633, [[0, 'Off'], [1, 'Follow output']]),
  select('outputColorSpace', 'Output color space', 'Output', 634, [[0, 'RGB'], [1, 'YPbPr 4:2:2'], [2, 'YPbPr 4:4:4']]),

  toggle('freeze', 'Freeze image', 'Quick controls', 741),
  toggle('blank', 'Blank output', 'Quick controls', 742),
  toggle('mute', 'Mute audio', 'Quick controls', 743),

  number('outputVolume', 'Output volume', 'Audio', 212, -80, 20),
  number('balance', 'Balance', 'Audio', 220, -10, 10),
  number('treble', 'Treble', 'Audio', 230, -18, 18),
  number('bass', 'Bass', 'Audio', 240, -18, 18),
  number('lipSync', 'Lip-sync delay (ms)', 'Audio', 271, 0, 90),

  select('noSignalColor', 'No-signal color', 'Device setup', 735, [[0, 'Gray'], [1, 'Blue'], [2, 'Black']]),
  select('autoSwitching', 'Automatic switching', 'Device setup', 736, [[0, 'Off'], [1, 'Scan'], [2, 'Last connected']]),
  select('testPattern', 'Test pattern', 'Device setup', 760, [[0, 'Off'], [1, 'Slide bar'], [2, 'Color bars']]),
  { id: 'inputFormat', label: 'Detected input format', group: 'Diagnostics', functionCode: 710, kind: 'readonly', window: 0,
    statusLabels: { 0: 'NTSC', 1: 'PAL-M', 2: 'PAL-60', 3: 'NTSC 4.43', 4: 'NTSC', 5: 'SECAM', 6: 'PAL', 7: 'PAL-N', 245: 'No signal', 255: 'No signal' } }
];

function createProfile(id, model, summary) {
  return {
    id,
    manufacturer: 'Kramer',
    model,
    family: 'VP-773 / VP-773A / VP-773AMP',
    protocol: 'protocol-3000-y',
    defaultPort: 5000,
    alternatePorts: [],
    lantronixDiscovery: false,
    inputStatusFunctionCode: 710,
    inputStatusWindow: 0,
    noSignalValues: [245, 255],
    initialGroups: ['Signal', 'Picture', 'Picture processing', 'Output', 'Quick controls'],
    summary,
    connectionNote: 'Connect directly to the scaler Ethernet port. Protocol 3000 uses TCP port 5000 by default.',
    settings: commonSettings
  };
}

export const vp773 = createProfile('vp-773', 'VP-773', '8-input ProScale presentation switcher / scaler');
export const vp773a = createProfile('vp-773a', 'VP-773A', '8-input ProScale presentation switcher / scaler with amplified audio');
export const vp773amp = createProfile('vp-773amp', 'VP-773AMP', '8-input ProScale presentation switcher / scaler with power amplifier');
