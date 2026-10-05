import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasIcon, icon } from '../../src/icons.js';

test('knows which icons it can draw', async (t) => {
  for (const [name, iconName, expected] of dataProviderHasIcon()) {
    await t.test(name, () => {
      assert.equal(hasIcon(iconName), expected);
    });
  }
});

function dataProviderHasIcon() {
  return [
    ['a stroked icon', 'landmark', true],
    ['the GitHub mark', 'github', true],
    ['the Nexus mark', 'nexus', true],
    ['an unknown icon', 'rocket', false],
    ['an inherited object property', 'constructor', false],
    ['an empty string', '', false],
  ];
}

test('draws the shapes of every template icon', () => {
  for (const name of ['landmark', 'droplet', 'chevron-right']) {
    assert.match(icon(name), /<(?:path|line|polygon|circle) /, name);
  }
});
