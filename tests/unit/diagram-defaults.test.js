import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIAGRAM_DEFAULTS, MODES, readDiagramDefaults } from '../../src/diagram-defaults.js';

const LAYOUT_IDS = ['lr', 'tb', 'columns'];

test('opens a new diagram in Columns, in View mode, at the All level, with proxies and machine names on', () => {
  assert.deepEqual({ ...DIAGRAM_DEFAULTS }, { layout: 'columns', level: 'all', proxies: true, machineNames: true, mode: 'view' });
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
      { layout: 'lr', level: 'references', proxies: false, machineNames: false, mode: 'edit' },
      { layout: 'lr', level: 'references', proxies: false, machineNames: false, mode: 'edit' },
    ],
    ['a known layout', { layout: 'tb' }, { layout: 'tb' }],
    ['an unknown layout', { layout: 'radial' }, {}],
    ['a layout that is not a string', { layout: 3 }, {}],
    ['the Edit mode', { mode: 'edit' }, { mode: 'edit' }],
    ['an unknown mode', { mode: 'build' }, {}],
    ['the Entities level', { level: 'entities' }, { level: 'entities' }],
    ['the Configurable level', { level: 'configurable' }, { level: 'configurable' }],
    ['an unknown level', { level: 'some' }, {}],
    ['a level that is not a string', { level: 2 }, {}],
    ['an inherited level', Object.create({ level: 'entities' }), {}],
    ['a Fields switch turned on', { fields: true }, { level: 'all' }],
    ['a Fields switch turned off', { fields: false }, { level: 'entities' }],
    ['a Fields switch that is not a boolean', { fields: 'false' }, {}],
    ['an inherited Fields switch', Object.create({ fields: false }), {}],
    ['a Fields switch beside a valid level', { fields: false, level: 'configurable' }, { level: 'configurable' }],
    ['a Fields switch beside an invalid level', { fields: false, level: 'some' }, { level: 'entities' }],
    ['a switch turned off', { proxies: false }, { proxies: false }],
    ['a switch that is not a boolean', { proxies: 'false', machineNames: 0 }, {}],
    ['an inherited object property', Object.create({ layout: 'lr', mode: 'edit' }), {}],
    ['an unknown key', { theme: 'dark' }, {}],
  ];
}
