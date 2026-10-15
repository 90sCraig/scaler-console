export function encodeGet(functionCode, window = null) {
  assertInteger(functionCode, 'function code');
  assertWindow(window);
  return `#Y 1,${functionCode}${window === null ? '' : `,${window}`}\r`;
}

export function encodeSet(functionCode, value, window = null) {
  assertInteger(functionCode, 'function code');
  assertNumber(value, 'value');
  assertWindow(window);
  return `#Y 0,${functionCode},${formatNumber(value)}${window === null ? '' : `,${window}`}\r`;
}

export function encodeAction(functionCode, value = 0, window = null) {
  return encodeSet(functionCode, value, window);
}

export function parseResponse(raw) {
  const clean = String(raw).replace(/[\r\n]+/g, ' ').trim();
  const match = clean.match(/~\d+@Y\s+([01]),(\d+)(?:,(-?\d+(?:\.\d+)?))?(?:,[01])?(?:\s+(OK|ERR.*))?/i);
  if (!match) return { ok: false, raw: clean, error: clean || 'Empty response' };
  const result = match[4] || '';
  return {
    ok: !/^ERR/i.test(result),
    controlType: Number(match[1]),
    functionCode: Number(match[2]),
    value: match[3] === undefined ? null : Number(match[3]),
    raw: clean,
    error: /^ERR/i.test(result) ? result : undefined
  };
}

export function isCompleteResponse(raw) {
  return /[\r\n]/.test(raw) && /~\d+@Y\s+/i.test(raw);
}

function formatNumber(value) {
  return Number(value).toString();
}

function assertNumber(value, label) {
  if (!Number.isFinite(Number(value))) throw new TypeError(`${label} must be a number`);
}

function assertInteger(value, label) {
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer`);
}

function assertWindow(value) {
  if (value !== null && ![0, 1].includes(value)) throw new TypeError('window must be 0, 1, or null');
}
