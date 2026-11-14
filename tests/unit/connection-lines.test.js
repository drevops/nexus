import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINE_DEFAULTS, LINE_OPTIONS, MERGED_TURN, lineOption, lineStyle, readLineSettings } from '../../src/connection-lines.js';
import { hasIcon } from '../../src/icons.js';

test('lists right-angled lines first and makes them the default', () => {
  assert.deepEqual(
    LINE_OPTIONS.map((option) => option.id),
    ['right-angled', 'merged', 'straight'],
  );
  assert.deepEqual(LINE_DEFAULTS, { style: 'right-angled' });
});

test('gives each line style a label, a title and an icon', () => {
  for (const option of LINE_OPTIONS) {
    assert.ok(option.label, option.id);
    assert.ok(option.title, option.id);
    assert.ok(hasIcon(option.icon), option.id);
  }
});

test('finds a line style by its id', async (t) => {
  for (const [name, id, expected] of dataProviderLineOption()) {
    await t.test(name, () => {
      assert.equal(lineOption(id), expected);
    });
  }
});

function dataProviderLineOption() {
  return [
    ['right-angled', 'right-angled', LINE_OPTIONS[0]],
    ['merged', 'merged', LINE_OPTIONS[1]],
    ['straight', 'straight', LINE_OPTIONS[2]],
    ['an unknown id', 'curved', undefined],
    ['an empty id', '', undefined],
    ['no id', undefined, undefined],
  ];
}

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
    ['merged', { style: 'merged' }, { style: 'merged' }],
    ['straight', { style: 'straight' }, { style: 'straight' }],
    ['an unknown style', { style: 'curved' }, LINE_DEFAULTS],
    ['a style in another case', { style: 'Straight' }, LINE_DEFAULTS],
    ['a style that is not a string', { style: 1 }, LINE_DEFAULTS],
    ['a curve style instead of an id', { style: 'bezier' }, LINE_DEFAULTS],
    ['an inherited style', Object.create({ style: 'straight' }), LINE_DEFAULTS],
    ['an unknown key', { style: 'straight', width: 3 }, { style: 'straight' }],
  ];
}

test('draws each line style with its Cytoscape edge style', async (t) => {
  for (const [name, saved, expected] of dataProviderLineStyle()) {
    await t.test(name, () => {
      assert.deepEqual(lineStyle(saved), expected);
    });
  }
});

function dataProviderLineStyle() {
  return [
    ['nothing saved', undefined, { 'curve-style': 'taxi', 'taxi-turn': '50%' }],
    ['right-angled', { style: 'right-angled' }, { 'curve-style': 'taxi', 'taxi-turn': '50%' }],
    ['merged', { style: 'merged' }, { 'curve-style': 'taxi', 'taxi-turn': MERGED_TURN + 'px' }],
    ['straight', { style: 'straight' }, { 'curve-style': 'bezier' }],
    ['an unknown style', { style: 'curved' }, { 'curve-style': 'taxi', 'taxi-turn': '50%' }],
  ];
}

test('returns a copy of the edge style', () => {
  const style = lineStyle({ style: 'merged' });

  style['curve-style'] = 'bezier';

  assert.equal(lineStyle({ style: 'merged' })['curve-style'], 'taxi');
});
