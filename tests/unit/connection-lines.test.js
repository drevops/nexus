import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINE_DEFAULTS, LINE_OPTIONS, curveStyle, readLineSettings } from '../../src/connection-lines.js';

test('lists right-angled lines first and makes them the default', () => {
  assert.deepEqual(LINE_OPTIONS.map((option) => option.id), ['right-angled', 'straight']);
  assert.deepEqual(LINE_DEFAULTS, { style: 'right-angled' });
});

test('fills in the connection line settings from saved ones', async (t) => {
  for (const [name, saved, expected] of dataProviderReadLineSettings()) {
    await t.test(name, () => {
      assert.deepEqual(readLineSettings(saved), expected);
    });
  }
});

function dataProviderReadLineSettings() {
  return [
    ['nothing saved', undefined, LINE_DEFAULTS],
    ['null', null, LINE_DEFAULTS],
    ['a string', 'straight', LINE_DEFAULTS],
    ['an empty object', {}, LINE_DEFAULTS],
    ['right-angled', { style: 'right-angled' }, { style: 'right-angled' }],
    ['straight', { style: 'straight' }, { style: 'straight' }],
    ['an unknown style', { style: 'curved' }, LINE_DEFAULTS],
    ['a style in another case', { style: 'Straight' }, LINE_DEFAULTS],
    ['a style that is not a string', { style: 1 }, LINE_DEFAULTS],
    ['a curve style instead of an id', { style: 'bezier' }, LINE_DEFAULTS],
    ['an inherited style', Object.create({ style: 'straight' }), LINE_DEFAULTS],
    ['an unknown key', { style: 'straight', width: 3 }, { style: 'straight' }],
  ];
}

test('draws each line style with its Cytoscape curve style', async (t) => {
  for (const [name, saved, expected] of dataProviderCurveStyle()) {
    await t.test(name, () => {
      assert.equal(curveStyle(saved), expected);
    });
  }
});

function dataProviderCurveStyle() {
  return [
    ['nothing saved', undefined, 'taxi'],
    ['right-angled', { style: 'right-angled' }, 'taxi'],
    ['straight', { style: 'straight' }, 'bezier'],
    ['an unknown style', { style: 'curved' }, 'taxi'],
  ];
}
