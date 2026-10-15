import { vp729 } from './vp-729.js';

export const vp728 = {
  ...vp729,
  id: 'vp-728',
  model: 'VP-728',
  summary: '9-input ProScale presentation switcher / scaler (serial control)',
  alternatePorts: [],
  lantronixDiscovery: false,
  connectionNote: 'The VP-728 has no built-in Ethernet. Connect through a TCP-to-RS-232 bridge configured for 9600 baud, 8 data bits, no parity, 1 stop bit, and no flow control.'
};
