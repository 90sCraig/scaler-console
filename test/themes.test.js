import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../public/theme-init.js', import.meta.url), 'utf8');

test('restores a saved broadcast theme', () => {
  const document = { documentElement: { dataset: { theme: 'classic' } } };
  runInNewContext(script, { document, localStorage: { getItem: () => 'broadcast' } });
  assert.equal(document.documentElement.dataset.theme, 'broadcast');
});

test('restores every Theme.Park palette', () => {
  const themeParkThemes = [
    'tp-aquamarine', 'tp-hotline', 'tp-hotpink', 'tp-dracula', 'tp-dark', 'tp-organizr',
    'tp-space-gray', 'tp-overseerr', 'tp-plex', 'tp-nord', 'tp-maroon'
  ];
  for (const theme of themeParkThemes) {
    const document = { documentElement: { dataset: { theme: 'classic' } } };
    runInNewContext(script, { document, localStorage: { getItem: () => theme } });
    assert.equal(document.documentElement.dataset.theme, theme);
  }
});

test('ignores unknown themes and unavailable storage', () => {
  const document = { documentElement: { dataset: { theme: 'classic' } } };
  runInNewContext(script, { document, localStorage: { getItem: () => 'unknown' } });
  assert.equal(document.documentElement.dataset.theme, 'classic');
  runInNewContext(script, { document, localStorage: { getItem: () => { throw new Error('blocked'); } } });
  assert.equal(document.documentElement.dataset.theme, 'classic');
});
