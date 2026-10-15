// Additional VP-728/729 commands from Kramer's RS-232 command set v2.7.
// Keeping these separate makes the core controls easy to find in the model profile.
const options = (labels, start = 0) => labels.map((label, index) => ({ value: start + index, label }));
const source = options(['Universal 1', 'Universal 2', 'Universal 3', 'Universal 4', 'VGA 1', 'VGA 2', 'HDMI 1', 'HDMI 2']);
const profileSlots = options(Array.from({ length: 8 }, (_, index) => `Profile ${index + 1}`));
const customSlots = options(['Custom 1', 'Custom 2', 'Custom 3', 'Custom 4']);
const polarity = options(['Negative', 'Positive']);
const signalStatusLabels = {
  98: 'No input detected', 99: 'Other format',
  101: 'NTSC', 102: 'PAL', 103: 'PAL-M', 104: 'PAL-N',
  105: 'NTSC 4.43', 106: 'SECAM', 107: 'PAL-60'
};
const select = (id, label, group, functionCode, choices) => ({ id, label, group, functionCode, kind: 'select', options: choices });
const range = (id, label, group, functionCode, min, max, step = 1) => ({ id, label, group, functionCode, kind: 'range', min, max, step });
const number = (id, label, group, functionCode, min, max, note, step = 1) => ({ id, label, group, functionCode, kind: 'number', min, max, step, note });
const toggle = (id, label, group, functionCode) => ({ id, label, group, functionCode, kind: 'toggle' });
const action = (id, label, group, functionCode, extra = {}) => ({ id, label, group, functionCode, kind: 'action', ...extra });
const actionSelect = (id, label, group, functionCode, choices, confirm) => ({ id, label, group, functionCode, kind: 'actionSelect', options: choices, confirm });
const status = (id, label, group, functionCode, statusLabels) => ({ id, label, group, functionCode, kind: 'readonly', statusLabels });

export const expandedSettings = [
  // Input setup
  ...[1, 2, 3, 4].map((code) => select(`input${code}Type`, `Universal ${code} signal type`, 'Input setup', code, options(['Component', 'Y/C', 'Composite video']))),
  select('inputColorFormat', 'Input color format', 'Input setup', 5, options(['Auto', 'RGB', 'YUV'])),
  select('inputVideoStandard', 'Input video standard', 'Input setup', 6, options(['Auto', 'NTSC', 'PAL', 'PAL-M', 'PAL-N', 'NTSC 4.43', 'SECAM', 'PAL-60'])),
  number('inputHPosition', 'Input horizontal position', 'Input setup', 7, 1, 4095, 'Maximum depends on the input mode.'),
  number('inputVPosition', 'Input vertical position', 'Input setup', 8, 2, 4095, 'Maximum depends on the input mode.'),
  number('inputFrequency', 'Input frequency adjustment', 'Input setup', 9, 0, 4095, 'Maximum depends on the input mode.'),
  range('inputPhase', 'Input phase', 'Input setup', 10, 0, 31),
  action('autoImage', 'Auto-adjust input image', 'Input setup', 11),

  // Picture processing
  select('outputGamma', 'Output gamma', 'Picture processing', 17, options(['Gamma 1', 'Gamma 2', 'Gamma 3', 'Gamma 4', 'Gamma 5'])),
  select('filmMode', 'Film mode', 'Picture processing', 18, options(['Auto', 'Video', 'Film'])),
  select('temporalNoise', 'Temporal noise reduction', 'Picture processing', 19, options(['Off', 'Low', 'Medium', 'High'])),
  select('mosquitoNoise', 'Mosquito noise reduction', 'Picture processing', 20, options(['Off', 'Low', 'Medium', 'High'])),
  toggle('blockNoise', 'Block noise reduction', 'Picture processing', 21),
  select('detailEnhancement', 'Detail enhancement', 'Picture processing', 22, options(['Off', 'Low', 'Medium', 'High'])),
  select('lumaTransition', 'Luma transition enhancement', 'Picture processing', 23, options(['Off', 'Low', 'High'])),
  select('chromaTransition', 'Chroma transition enhancement', 'Picture processing', 24, options(['Off', 'Low', 'High'])),

  // Layout and scaling
  select('outputHdmiType', 'HDMI output type', 'Layout & scaling', 26, options(['Auto', 'HDMI', 'DVI'])),
  range('hPan', 'Horizontal pan', 'Layout & scaling', 28, -16, 16),
  range('vPan', 'Vertical pan', 'Layout & scaling', 29, -16, 16),
  range('hZoom', 'Horizontal zoom', 'Layout & scaling', 30, -8, 8),
  range('vZoom', 'Vertical zoom', 'Layout & scaling', 31, -8, 8),
  select('zoom', 'Zoom', 'Layout & scaling', 32, options(['100%', '150%', '200%', '225%', '250%', '275%', '300%', '325%', '350%', '375%', '400%', 'Custom'])),
  range('customZoom', 'Custom zoom', 'Layout & scaling', 33, 0, 32),
  range('zoomHPan', 'Zoom horizontal pan', 'Layout & scaling', 34, 0, 31),
  range('zoomVPan', 'Zoom vertical pan', 'Layout & scaling', 35, 0, 31),
  toggle('overscan', 'Overscan', 'Layout & scaling', 138),

  // Picture in picture
  toggle('pip', 'Picture-in-picture', 'Picture-in-picture', 36),
  select('pipType', 'Layout mode', 'Picture-in-picture', 37, options(['Picture-in-picture', 'Picture + picture', 'Split'])),
  select('pipSource', 'Second input', 'Picture-in-picture', 38, source),
  select('pipSize', 'Window size', 'Picture-in-picture', 39, options(['1/25', '1/16', '1/9', '1/4', 'Custom'])),
  range('pipHPosition', 'Window horizontal position', 'Picture-in-picture', 40, 0, 128),
  range('pipVPosition', 'Window vertical position', 'Picture-in-picture', 41, 0, 128),
  range('pipHSize', 'Window width', 'Picture-in-picture', 42, 0, 255),
  range('pipVSize', 'Window height', 'Picture-in-picture', 43, 0, 255),
  toggle('pipFrame', 'Window frame', 'Picture-in-picture', 44),
  select('pipFrameColor', 'Frame color', 'Picture-in-picture', 45, options(['Red', 'Green', 'Blue'])),

  // Audio
  select('audioInputType', 'Audio input type', 'Audio', 46, options(['Analog', 'S/PDIF'])),
  range('audioInputVolume', 'Input volume', 'Audio', 47, -22, 22),
  range('audioOutputVolume', 'Output volume', 'Audio', 48, -100, 24),
  action('volumeUp', 'Volume up', 'Audio', 48, { fixedValue: 111 }),
  action('volumeDown', 'Volume down', 'Audio', 48, { fixedValue: -111 }),
  range('audioBass', 'Bass', 'Audio', 49, -36, 36),
  range('audioTreble', 'Treble', 'Audio', 50, -36, 36),
  range('audioBalance', 'Balance', 'Audio', 51, -10, 10),
  toggle('audioLoudness', 'Loudness', 'Audio', 52),
  select('audioDelayMode', 'Audio delay mode', 'Audio', 53, options(['Dynamic', 'User-defined'])),
  range('audioDelay', 'Audio delay', 'Audio', 54, 0, 340, 2),
  select('usbAudioInput', 'USB audio source', 'Audio', 55, options(['No audio', 'Universal 1', 'Universal 2', 'Universal 3', 'Universal 4', 'VGA 1', 'VGA 2'])),
  select('hdmi1AudioInput', 'HDMI 1 audio source', 'Audio', 150, [...source.slice(0, 6), { value: 6, label: 'HDMI 1' }]),
  select('hdmi2AudioInput', 'HDMI 2 audio source', 'Audio', 151, [...source.slice(0, 6), { value: 6, label: 'HDMI 2' }]),

  // Geometry
  select('geometryApplication', 'Geometry mode', 'Geometry', 56, options(['Keystone', 'Anyplace', 'Rotation'])),
  select('geometryLocation', 'Display location', 'Geometry', 57, options(['Front', 'Ceiling', 'Rear', 'Rear ceiling'])),
  range('horizontalKeystone', 'Horizontal keystone', 'Geometry', 58, -40, 40),
  range('verticalKeystone', 'Vertical keystone', 'Geometry', 59, -30, 30),
  ...[
    [60, 'Top left horizontal'], [61, 'Top left vertical'],
    [62, 'Top right horizontal'], [63, 'Top right vertical'],
    [64, 'Bottom left horizontal'], [65, 'Bottom left vertical'],
    [66, 'Bottom right horizontal'], [67, 'Bottom right vertical']
  ].map(([code, label]) => number(`geometry${code}`, label, 'Geometry', code, -2000, 2000)),
  range('pincushion', 'Pincushion / barrel', 'Geometry', 69, -20, 20),
  range('rotation', 'Rotation', 'Geometry', 70, -180, 180),
  action('resetProjection', 'Reset corner projection', 'Geometry', 68, { confirm: 'Reset all corner-projection adjustments?' }),
  action('resetGeometry', 'Reset all geometry', 'Geometry', 71, { confirm: 'Reset all geometry adjustments?' }),

  // Presets and device setup
  actionSelect('savePreset', 'Save settings to profile', 'Presets', 72, profileSlots, 'Overwrite the selected profile with the current settings?'),
  actionSelect('recallPreset', 'Recall saved profile', 'Presets', 73, profileSlots, 'Recall this profile? It will change the scaler settings.'),
  toggle('frameLock', 'Frame lock', 'Device setup', 74),
  select('modeSet1', 'Mode set 1', 'Device setup', 77, options(['1400×1050 · 60 Hz', '1680×1050 · 60 Hz'])),
  select('modeSet2', 'Mode set 2', 'Device setup', 78, options(['1280×1024 · 75 Hz', '1280×1024 · 76 Hz'])),
  select('modeSet3', 'Mode set 3', 'Device setup', 147, options(['1280×768 · 60 Hz', '1366×768 · 60 Hz'])),
  select('osdPosition', 'On-screen menu position', 'Device setup', 79, options(['Center', 'Top left', 'Top right', 'Bottom left', 'Bottom right'])),
  select('osdTimeout', 'On-screen menu timeout', 'Device setup', 80, options(['5 sec', '10 sec', '20 sec', '30 sec', '60 sec', '90 sec', 'Off'])),
  select('logo', 'Logo', 'Device setup', 81, options(['Off', 'On', 'Custom'])),
  select('blankColor', 'Blank color', 'Device setup', 82, options(['Black', 'Blue'])),
  select('background', 'Background', 'Device setup', 84, options(['Black', 'Blue', 'Custom', 'Disable analog sync'])),
  toggle('saveLock', 'Save lock', 'Device setup', 85),
  toggle('inputLock', 'Input lock', 'Device setup', 86),
  select('blankKeyFunction', 'Blank key behavior', 'Device setup', 87, options(['Blank + mute', 'Blank only', 'Mute only'])),
  select('freezeKeyFunction', 'Freeze key behavior', 'Device setup', 88, options(['Freeze + mute', 'Freeze only', 'Mute only'])),
  select('hdcpSetting', 'HDCP setting', 'Device setup', 135, options(['Follow output', 'Follow input'])),
  select('switchingMode', 'Switching mode', 'Device setup', 139, options(['Seamless', 'Fast'])),
  select('autoImageMode', 'Auto-image mode', 'Device setup', 140, options(['Manual', 'Auto'])),
  toggle('hdmi1HotPlug', 'HDMI 1 hot plug', 'Device setup', 148),
  toggle('hdmi2HotPlug', 'HDMI 2 hot plug', 'Device setup', 149),
  toggle('hdmi1InputHdcp', 'HDMI 1 input HDCP', 'Device setup', 153),
  toggle('hdmi2InputHdcp', 'HDMI 2 input HDCP', 'Device setup', 154),

  // Front-panel and USB slideshow actions
  ...[
    [92, 'Info'], [93, 'Menu'], [94, 'Up'], [95, 'Down'], [96, 'Left'],
    [97, 'Right'], [98, 'Enter'], [99, 'Picture'], [100, 'Swap']
  ].map(([code, label]) => action(`remote${code}`, label, 'Remote keys', code)),
  select('slideshowInterval', 'Slideshow interval', 'Slideshow', 146, options(['Minimum', 'Low', 'Medium', 'Long', 'Maximum', 'Off'])),
  action('slideshowStart', 'Start slideshow', 'Slideshow', 141),
  action('slideshowStop', 'Stop slideshow', 'Slideshow', 142),
  action('slideshowPause', 'Pause slideshow', 'Slideshow', 143),
  action('slideshowNext', 'Next image', 'Slideshow', 144),
  action('slideshowPrevious', 'Previous image', 'Slideshow', 145),

  // Read-only diagnostics
  { id: 'firmwareRevision', label: 'Installed firmware', group: 'Diagnostics', functionCode: 76, kind: 'firmware' },
  status('mainInputStatus', 'Main input status code', 'Diagnostics', 103, signalStatusLabels),
  status('pipInputStatus', 'Second input status code', 'Diagnostics', 104, signalStatusLabels),
  status('inputHdcpStatus', 'Input HDCP status', 'Diagnostics', 155, { 0: 'Off', 1: 'On' }),
  status('outputHdcpStatus', 'Output HDCP status', 'Diagnostics', 156, { 0: 'Off', 1: 'On' }),

  // Custom timings. The device validates interdependent maxima; these are outer UI bounds.
  select('customInputSlot', 'Custom input slot', 'Advanced input timing', 136, customSlots),
  number('inputHT', 'Horizontal total (HT)', 'Advanced input timing', 105, 512, 3071),
  number('inputHW', 'Horizontal width (HW)', 'Advanced input timing', 106, 32, 3071, 'Upper limit depends on other timing values.'),
  number('inputHS', 'Horizontal sync (HS)', 'Advanced input timing', 107, 80, 3071, 'Upper limit depends on other timing values.'),
  number('inputHA', 'Horizontal active (HA)', 'Advanced input timing', 108, 640, 1920, 'Must also be at most HT − 92.'),
  select('inputHP', 'Horizontal polarity (HP)', 'Advanced input timing', 109, polarity),
  number('inputVT', 'Vertical total (VT)', 'Advanced input timing', 110, 384, 2047),
  number('inputVW', 'Vertical width (VW)', 'Advanced input timing', 111, 2, 2047, 'Upper limit depends on other timing values.'),
  number('inputVS', 'Vertical sync (VS)', 'Advanced input timing', 112, 15, 2047, 'Upper limit depends on other timing values.'),
  number('inputVA', 'Vertical active (VA)', 'Advanced input timing', 113, 480, 1200, 'Must also be at most VT − 16.'),
  select('inputVP', 'Vertical polarity (VP)', 'Advanced input timing', 114, polarity),
  number('inputOclkInteger', 'Clock integer', 'Advanced input timing', 115, 26, 164),
  number('inputOclkDecimal', 'Clock decimal', 'Advanced input timing', 116, 0, 99, 'Combined clock must be >25 and <165.'),
  toggle('inputTimingEnable', 'Enable custom input timing', 'Advanced input timing', 117),
  action('saveInputTiming', 'Save custom input timing', 'Advanced input timing', 118, { confirm: 'Save these custom input timings?' }),

  select('customOutputSlot', 'Custom output slot', 'Advanced output timing', 137, customSlots),
  number('outputHT', 'Horizontal total (HT)', 'Advanced output timing', 119, 512, 3071),
  number('outputHW', 'Horizontal width (HW)', 'Advanced output timing', 120, 32, 3071, 'Upper limit depends on other timing values.'),
  number('outputHS', 'Horizontal sync (HS)', 'Advanced output timing', 121, 80, 3071, 'Upper limit depends on other timing values.'),
  number('outputHA', 'Horizontal active (HA)', 'Advanced output timing', 122, 640, 1920, 'Must also be at most HT − 92.'),
  select('outputHP', 'Horizontal polarity (HP)', 'Advanced output timing', 123, polarity),
  number('outputVT', 'Vertical total (VT)', 'Advanced output timing', 124, 384, 2047),
  number('outputVW', 'Vertical width (VW)', 'Advanced output timing', 125, 2, 2047, 'Upper limit depends on other timing values.'),
  number('outputVS', 'Vertical sync (VS)', 'Advanced output timing', 126, 15, 2047, 'Upper limit depends on other timing values.'),
  number('outputVA', 'Vertical active (VA)', 'Advanced output timing', 127, 480, 1200, 'Must also be at most VT − 16.'),
  select('outputVP', 'Vertical polarity (VP)', 'Advanced output timing', 128, polarity),
  number('outputOclkInteger', 'Clock integer', 'Advanced output timing', 129, 26, 164),
  number('outputOclkDecimal', 'Clock decimal', 'Advanced output timing', 130, 0, 99, 'Combined clock must be >25 and <165.'),
  action('saveOutputTiming', 'Save custom output timing', 'Advanced output timing', 131, { confirm: 'Save these custom output timings?' }),
  action('setCurrentOutputTiming', 'Use custom output timing', 'Advanced output timing', 132, { confirm: 'Switch the output to this custom timing? Your display may lose the picture.' }),

  // Maintenance actions are explicit and never run during a settings read.
  action('captureLogo', 'Capture custom logo', 'Maintenance', 83, { confirm: 'Capture the current image as the custom logo?' }),
  action('readPreferredEdid', 'Read display preferred timing', 'Maintenance', 152),
  action('factoryReset', 'Factory reset', 'Maintenance', 75, { confirm: 'Factory reset the scaler? This will erase its settings and may change its network address.', dangerous: true })
];
