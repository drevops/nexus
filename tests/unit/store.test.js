import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getState, focusPanel, openPanel, togglePanel, closePanel, openTableFor, openInspector, importLayout } from '../../src/store.js';

// The store holds 1 state per module, so these tests share it and run in
// order. Node has no window, so the store starts from its default layout.

const PANELS = Object.keys(getState().panels);

const SELECTION = { kind: 'entity', id: 'node.article' };

function zIndexOf(id) {
  return getState().panels[id].z;
}

const START_Z = zIndexOf(PANELS[0]);

// Panel ids from the bottom of the stack to the top, leaving out 1 panel.
// Panels that share a z-index keep the store's order.
function stackWithout(id) {
  return [...PANELS].sort((a, b) => zIndexOf(a) - zIndexOf(b)).filter((other) => other !== id);
}

function isOnTop(id) {
  return PANELS.every((other) => other === id || zIndexOf(other) < zIndexOf(id));
}

// The z-indexes of the panels that have been raised, lowest first.
function raisedZIndexes() {
  const raised = PANELS.map(zIndexOf).filter((z) => z !== START_Z);

  return raised.sort((a, b) => a - b);
}

// The state values for the keys of the expected object.
function stateFor(expected) {
  return Object.fromEntries(Object.keys(expected).map((key) => [key, getState()[key]]));
}

test('starts with no panel raised', () => {
  assert.deepEqual(raisedZIndexes(), []);
});

test('opens a raised panel above every other and keeps the others in order', async (t) => {
  for (const [name, id, raise, expected] of dataProviderRaise()) {
    await t.test(name, () => {
      const others = stackWithout(id);

      assert.equal(isOnTop(id), false, id + ' is on top before it is raised');
      raise();

      const raised = raisedZIndexes();

      assert.equal(isOnTop(id), true);
      assert.deepEqual(stackWithout(id), others);
      assert.ok(raised[0] > START_Z);
      assert.deepEqual(
        raised,
        raised.map((z, i) => raised[0] + i),
      );
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
  const before = PANELS.map(zIndexOf);
  const top = PANELS.find(isOnTop);

  focusPanel(top);

  assert.deepEqual(PANELS.map(zIndexOf), before);
});

test('keeps a closed panel in its place in the stack', () => {
  const before = PANELS.map(zIndexOf);

  closePanel('table');

  assert.equal(getState().panels.table.open, false);
  assert.deepEqual(PANELS.map(zIndexOf), before);
});

test('ignores a z-index in an imported layout', () => {
  const before = PANELS.map(zIndexOf);

  importLayout({ panels: { table: { open: true, z: 1000 } } });

  assert.equal(getState().panels.table.open, true);
  assert.deepEqual(PANELS.map(zIndexOf), before);
});

test('keeps the raised panels in 1 band however often they are raised', async (t) => {
  PANELS.forEach((id) => focusPanel(id));
  const band = raisedZIndexes();

  assert.equal(band.length, PANELS.length);

  for (const [name, ids] of dataProviderRaiseSequence()) {
    await t.test(name, () => {
      for (const id of ids) {
        focusPanel(id);

        assert.equal(isOnTop(id), true);
        assert.deepEqual(raisedZIndexes(), band);
      }
    });
  }
});

function dataProviderRaiseSequence() {
  return [
    ['1 panel 45 times', Array(45).fill('legend')],
    ['2 panels in turn 500 times each', Array.from({ length: 1000 }, (_, i) => (i % 2 ? 'table' : 'settings'))],
    ['every panel in turn 200 times', Array.from({ length: 200 }, () => PANELS).flat()],
  ];
}
