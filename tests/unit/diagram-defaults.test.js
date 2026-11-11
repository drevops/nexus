import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIAGRAM_DEFAULTS, MODES, readDiagramDefaults } from '../../src/diagram-defaults.js';

const LAYOUT_IDS = ['lr', 'tb', 'columns'];

test('opens a new diagram in Columns, in View mode, with fields, proxies and machine names on', () => {
  assert.deepEqual({ ...DIAGRAM_DEFAULTS }, { layout: 'columns', fields: true, proxies: true, machineNames: true, mode: 'view' });
});

test('lists the View and Edit modes in order', () => {
  assert.deepEqual(
    MODES.map((mode) => [mode.id, mode.label]),
    [
      ['view', 'View'],
      ['edit', 'Edit'],
    ],
  );
});

test('reads the stored settings and keeps the default for anything missing or invalid', async (t) => {
  for (const [name, stored, expected] of dataProviderStoredDefaults()) {
    await t.test(name, () => {
      assert.deepEqual(readDiagramDefaults(stored, LAYOUT_IDS), { ...DIAGRAM_DEFAULTS, ...expected });
    });
  }
});

function dataProviderStoredDefaults() {
  return [
    ['nothing stored', undefined, {}],
    ['null', null, {}],
    ['a value that is not an object', 'lr', {}],
    ['an empty object', {}, {}],
    [
      'every setting changed',
      { layout: 'lr', fields: false, proxies: false, machineNames: false, mode: 'edit' },
      { layout: 'lr', fields: false, proxies: false, machineNames: false, mode: 'edit' },
    ],
    ['a known layout', { layout: 'tb' }, { layout: 'tb' }],
    ['an unknown layout', { layout: 'radial' }, {}],
    ['a layout that is not a string', { layout: 3 }, {}],
    ['the Edit mode', { mode: 'edit' }, { mode: 'edit' }],
    ['an unknown mode', { mode: 'build' }, {}],
    ['a switch turned off', { proxies: false }, { proxies: false }],
    ['a switch that is not a boolean', { fields: 'false', machineNames: 0 }, {}],
    ['an inherited object property', Object.create({ layout: 'lr', mode: 'edit' }), {}],
    ['an unknown key', { theme: 'dark' }, {}],
  ];
}
