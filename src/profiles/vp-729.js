import { expandedSettings } from './vp-729-expanded.js';

const options = (entries) => entries.map(([value, label]) => ({ value, label }));

export const vp729 = {
  id: 'vp-729',
  manufacturer: 'Kramer',
  model: 'VP-729',
  family: 'VP-728 / VP-729',
  protocol: 'legacy-y',
  firmwareCheck: 'vp729',
  defaultPort: 5000,
  alternatePorts: [10001],
  lantronixDiscovery: true,
  connectionNote: 'Connect to the built-in Lantronix Ethernet interface. Scalers normally answer on TCP port 5000; some earlier units use 10001.',
  inputStatusFunctionCode: 103,
  initialGroups: ['Signal', 'Picture', 'Output', 'Quick controls'],
  summary: '9-input ProScale presentation switcher / scaler',
  inputs: ['Universal 1', 'Universal 2', 'Universal 3', 'Universal 4', 'VGA 1', 'VGA 2', 'HDMI 1', 'HDMI 2', 'USB'],
  settings: [
    {
      id: 'inputSource', label: 'Main input', group: 'Signal', functionCode: 0, kind: 'select',
      options: options([[0, 'Universal 1'], [1, 'Universal 2'], [2, 'Universal 3'], [3, 'Universal 4'], [4, 'VGA 1'], [5, 'VGA 2'], [6, 'HDMI 1'], [7, 'HDMI 2'], [8, 'USB']])
    },
    { id: 'brightness', label: 'Brightness', group: 'Picture', functionCode: 12, kind: 'range', min: 0, max: 100, step: 1 },
    { id: 'contrast', label: 'Contrast', group: 'Picture', functionCode: 13, kind: 'range', min: 0, max: 100, step: 1 },
    { id: 'color', label: 'Color', group: 'Picture', functionCode: 14, kind: 'range', min: 0, max: 100, step: 1 },
    { id: 'hue', label: 'Hue', group: 'Picture', functionCode: 15, kind: 'range', min: 0, max: 360, step: 1 },
    { id: 'sharpness', label: 'Sharpness', group: 'Picture', functionCode: 16, kind: 'range', min: 0, max: 100, step: 1 },
    {
      id: 'outputResolution', label: 'Output resolution', group: 'Output', functionCode: 25, kind: 'select',
      options: options([
        [0, 'Native HDMI'], [1, '640×480 · 60 Hz'], [2, '640×480 · 75 Hz'],
        [3, '800×600 · 50 Hz'], [4, '800×600 · 60 Hz'], [5, '800×600 · 75 Hz'],
        [6, '1024×768 · 50 Hz'], [7, '1024×768 · 60 Hz'], [8, '1024×768 · 75 Hz'],
        [9, '1280×768 · 50 Hz'], [10, '1280×768 · 60 Hz'], [11, '1280×720 · 60 Hz'],
        [12, '1280×800 · 60 Hz'], [13, '1280×1024 · 50 Hz'], [14, '1280×1024 · 60 Hz'],
        [15, '1280×1024 · 75 Hz'], [16, '1366×768 · 50 Hz'], [17, '1366×768 · 60 Hz'],
        [18, '1400×1050 · 50 Hz'], [19, '1400×1050 · 60 Hz'],
        [20, '1600×1200 · 50 Hz'], [21, '1600×1200 · 60 Hz'], [22, '1680×1050 · 60 Hz'],
        [23, '1920×1080 · 60 Hz'], [24, '1920×1200 · 60 Hz'], [25, '480p · 60 Hz'], [26, '576p · 60 Hz'],
        [27, '720p · 50 Hz'], [28, '720p · 60 Hz'], [29, '1080i · 50 Hz'], [30, '1080i · 60 Hz'],
        [31, '1080p · 50 Hz'], [32, '1080p · 60 Hz'], [33, '480p · 59.94 Hz'], [34, '720p · 59.94 Hz'],
        [35, '1080i · 59.94 Hz'], [36, '1080p · 23.98 Hz'], [37, '1080p · 29.97 Hz'], [38, '1080p · 59.94 Hz'],
        [96, 'Custom 1'], [97, 'Custom 2'], [98, 'Custom 3'], [99, 'Custom 4']
      ])
    },
    {
      id: 'aspectRatio', label: 'Aspect ratio', group: 'Output', functionCode: 27, kind: 'select',
      options: options([[0, 'Best fit'], [1, 'Letterbox'], [2, 'Follow output'], [3, 'Virtual wide'], [4, 'Follow input'], [5, 'Custom']])
    },
    { id: 'freeze', label: 'Freeze image', group: 'Quick controls', functionCode: 89, kind: 'toggle' },
    { id: 'blank', label: 'Blank output', group: 'Quick controls', functionCode: 90, kind: 'toggle' },
    { id: 'power', label: 'Output power', group: 'Quick controls', functionCode: 91, kind: 'toggle' },
    { id: 'mute', label: 'Mute audio', group: 'Quick controls', functionCode: 101, kind: 'toggle' },
    { id: 'lock', label: 'Lock front panel', group: 'Quick controls', functionCode: 102, kind: 'toggle' },
    ...expandedSettings
  ]
};
