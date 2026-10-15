export function encodeGet(functionCode) {
  assertInteger(functionCode, 'function code');
  return `Y 1 ${functionCode}\r`;
}

export function encodeSet(functionCode, value) {
  assertInteger(functionCode, 'function code');
  assertInteger(value, 'value');
  return `Y 0 ${functionCode} ${value}\r`;
}

export function encodeAction(functionCode, value = null) {
  assertInteger(functionCode, 'function code');
  if (value !== null) assertInteger(value, 'value');
  return `Y 0 ${functionCode}${value === null ? '' : ` ${value}`}\r`;
}

export function parseResponse(raw) {
  const clean = String(raw).replace(/>/g, '').trim();
  const match = clean.match(/Z\s+(\d+)\s+(\d+)(?:\s+(-?\d+))?/i);
  if (!match) {
    return { ok: false, raw: clean, error: clean || 'Empty response' };
  }

  return {
    ok: true,
    controlType: Number(match[1]),
    functionCode: Number(match[2]),
    value: match[3] === undefined ? null : Number(match[3]),
    raw: clean
  };
}

function assertInteger(value, label) {
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer`);
}
