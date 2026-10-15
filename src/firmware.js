import { encodeGet } from './protocols/legacy-y.js';
import { transact } from './device-client.js';

export const VP729_FIRMWARE_URL = 'https://k.kramerav.com/support/product_downloads.asp?pid=1062&pt=5';
export const VP729_RELEASE_NOTES_URL = 'https://cdn.kramerav.com/web/downloads/releaseNotes/vp-728__vp-729_release_notes1.pdf';

const knownReleaseNotes = [
  {
    version: 'Master 1.29 / Audio 2.31', date: 'February 2015',
    items: [
      'Addresses occasional HDMI output video noise on some monitors. Kramer says the full fix also requires factory hardware changes; firmware alone behaves like Master 1.28.',
      'Known issue: switching to an HDMI-connected Blu-ray player can take up to 20 seconds in extreme cases.'
    ]
  },
  {
    version: 'Master 1.28 / Audio 2.31', date: 'June 2014',
    items: [
      'Fixes loss of audio after switching to an unconnected HDMI input, turning the scaler off with the remote, and connecting a source.',
      'Adds commands to read HDCP status for the selected input and output.'
    ]
  }
];

export function parseVp729FirmwareReply(raw) {
  const match = raw.match(/(?:^|[\r\n])Z\s+1\s+76\s+VTB\s+([0-9]+(?:\.[0-9]+)+)\s+Audio\s+([0-9]+(?:\.[0-9]+)+)/i);
  if (!match) throw new Error('The scaler returned a firmware version in an unrecognized format');
  return { master: match[1], audio: match[2] };
}

export async function readVp729Firmware(target) {
  const raw = await transact({ ...target, command: encodeGet(76) });
  return parseVp729FirmwareReply(raw);
}

export function parseVp729ReleasePage(html) {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');
  const master = text.match(/VP-728\s*\/\s*729\s+Master\s+Firmware\s+Version:\s*([0-9]+(?:\.[0-9]+)+)/i)?.[1];
  const audio = text.match(/VP-728\s*\/\s*729\s+Audio\s+Firmware\s+Version:\s*([0-9]+(?:\.[0-9]+)+)/i)?.[1];
  if (!master || !audio) throw new Error('Kramer’s page did not include both firmware versions');
  return { master, audio };
}

export function compareVersions(installed, latest) {
  const numbers = (value) => {
    if (!/^[0-9]+(?:\.[0-9]+)+$/.test(value)) throw new Error('Firmware version is not numeric');
    return value.split('.').map(Number);
  };
  const left = numbers(installed);
  const right = numbers(latest);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) < (right[index] || 0)) return -1;
    if ((left[index] || 0) > (right[index] || 0)) return 1;
  }
  return 0;
}

export async function checkVp729Firmware(target, fetchPage = fetch) {
  const installed = await readVp729Firmware(target);
  const result = { installed, latest: null, status: 'unverified', sourceUrl: VP729_FIRMWARE_URL, releaseNotesUrl: VP729_RELEASE_NOTES_URL, checkedAt: new Date().toISOString() };
  try {
    const response = await fetchPage(VP729_FIRMWARE_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Kramer returned HTTP ${response.status}`);
    result.latest = parseVp729ReleasePage(await response.text());
    if (result.latest.master === '1.29' && result.latest.audio === '2.31') result.changelog = knownReleaseNotes;
    result.components = Object.fromEntries(['master', 'audio'].map((name) => {
      const comparison = compareVersions(installed[name], result.latest[name]);
      return [name, comparison < 0 ? 'update-available' : comparison > 0 ? 'ahead' : 'current'];
    }));
    result.status = Object.values(result.components).includes('update-available') ? 'update-available'
      : Object.values(result.components).includes('ahead') ? 'ahead' : 'current';
  } catch (error) {
    result.verificationError = `Could not verify Kramer’s current releases: ${error.message}`;
  }
  return result;
}
