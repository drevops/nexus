import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEL_ORDER, getState, focusPanel, openPanel, togglePanel, closePanel, openTableFor, openInspector, importLayout } from '../../src/store.js';

// The store holds 1 state per module, so these tests share it and run in
// order. Node has no window, so the store starts from its default layout.

const SELECTION = { kind: 'entity', id: 'node.article' };

function zIndexOf(id) {
  return getState().panels[id].z;
}

// Panel ids from the bottom of the stack to the top.
function stack() {
  return [...PANEL_ORDER].sort((a, b) => zIndexOf(a) - zIndexOf(b));
}

function zIndexes() {
  return PANEL_ORDER.map(zIndexOf).sort((a, b) => a - b);
}

// The state values for the keys of the expected object.
function stateFor(expected) {
  return Object.fromEntries(Object.keys(expected).map((key) => [key, getState()[key]]));
}

const BAND = zIndexes();

test('lists every panel of the store once in the panel order', () => {
  assert.deepEqual([...PANEL_ORDER].sort(), Object.keys(getState().panels).sort());
});

test('gives each panel its own z-index from a band of consecutive values', () => {
  assert.deepEqual(
    BAND,
    PANEL_ORDER.map((id, i) => BAND[0] + i),
  );
});

test('stacks the panels in the panel order until one is raised', () => {
  assert.deepEqual(stack(), PANEL_ORDER);
});

test('opens a raised panel on top and keeps the others in order', async (t) => {
  for (const [name, id, raise, expected] of dataProviderRaise()) {
    await t.test(name, () => {
      const others = stack().filter((other) => other !== id);

      assert.notEqual(stack().at(-1), id, id + ' is on top before it is raised');
      raise();

      assert.deepEqual(stack(), [...others, id]);
      assert.deepEqual(zIndexes(), BAND);
      assert.equal(getState().panels[id].open, true);
      assert.deepEqual(stateFor(expected), expected);
    });
  }
});

// Each case raises a panel that the case before it left below the top.
function dataProviderRaise() {
  return [
    ['focusing an open panel', 'legend', () => focusPanel('legend'), {}],
    ['opening a closed panel', 'settings', () => openPanel('settings'), {}],
    ['toggling a closed panel', 'entities', () => togglePanel('entities'), {}],
    ['opening the fields table for an entity', 'table', () => openTableFor('node.article'), { tableFilter: 'node.article' }],
    ['opening the inspector', 'inspector', () => openInspector(SELECTION), { selected: SELECTION }],
  ];
}

test('keeps the stack when the top panel is raised again', () => {
  const before = PANEL_ORDER.map(zIndexOf);

  focusPanel(stack().at(-1));

  assert.deepEqual(PANEL_ORDER.map(zIndexOf), before);
});

test('keeps a closed panel in its place in the stack', () => {
  const before = PANEL_ORDER.map(zIndexOf);

  closePanel('table');

  assert.equal(getState().panels.table.open, false);
  assert.deepEqual(PANEL_ORDER.map(zIndexOf), before);
});

test('ignores a z-index in an imported layout', () => {
  const before = PANEL_ORDER.map(zIndexOf);

  importLayout({ panels: { table: { open: true, z: 1000 } } });

  assert.equal(getState().panels.table.open, true);
  assert.deepEqual(PANEL_ORDER.map(zIndexOf), before);
});

test('keeps every z-index in the band however often panels are raised', async (t) => {
  for (const [name, ids] of dataProviderRaiseSequence()) {
    await t.test(name, () => {
      for (const id of ids) {
        focusPanel(id);

        assert.equal(stack().at(-1), id);
        assert.deepEqual(zIndexes(), BAND);
      }
    });
  }
});

function dataProviderRaiseSequence() {
  return [
    ['1 panel 45 times', Array(45).fill('legend')],
    ['2 panels in turn 500 times each', Array.from({ length: 1000 }, (_, i) => (i % 2 ? 'table' : 'settings'))],
    ['every panel in turn 200 times', Array.from({ length: 200 }, () => PANEL_ORDER).flat()],
  ];
}
