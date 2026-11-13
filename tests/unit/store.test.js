import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getState,
  focusPanel,
  openPanel,
  togglePanel,
  closePanel,
  openTableFor,
  openInspector,
  importLayout,
  exportLayout,
  dockPanel,
  dockedPanels,
  setPanelHeight,
  resizePanel,
  resetPanelSize,
  setTableSearch,
  setTableSort,
  PANEL_ORDER,
} from '../../src/store.js';
import { DEFAULT_SORT } from '../../src/field-table.js';

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

test('starts every panel without a height', () => {
  assert.deepEqual(
    PANELS.map((id) => getState().panels[id].height),
    PANELS.map(() => null),
  );
});

test('keeps a missing height when a layout is imported', () => {
  importLayout({ panels: { entities: { open: false, dock: 'left', height: null } } });

  assert.equal(getState().panels.entities.height, null);
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

// Imports a layout of closed, floating panels in the default order, with the
// given panels overridden.
function useLayout(entries) {
  const panels = Object.fromEntries(PANEL_ORDER.map((id, order) => [id, { open: false, dock: null, order, ...entries[id] }]));

  importLayout({ panels });
}

// The right rail holds entities, table, a closed settings and inspector; the
// left rail holds history, and legend floats.
function useRails() {
  useLayout({
    entities: { open: true, dock: 'right' },
    table: { open: true, dock: 'right' },
    settings: { open: false, dock: 'right' },
    legend: { open: true },
    history: { open: true, dock: 'left' },
    inspector: { open: true, dock: 'right' },
  });
}

function rails() {
  return { left: dockedPanels('left'), right: dockedPanels('right') };
}

test('starts with every panel in the default order', () => {
  assert.deepEqual(
    PANEL_ORDER.map((id) => getState().panels[id].order),
    PANEL_ORDER.map((id, i) => i),
  );
});

test('lists the open panels docked on a side in their order', () => {
  useRails();

  assert.deepEqual(rails(), { left: ['history'], right: ['entities', 'table', 'inspector'] });
});

test('docks a panel at an index among the open panels of a side', async (t) => {
  for (const [name, move, expected] of dataProviderDockPanel()) {
    await t.test(name, () => {
      useRails();
      move();

      assert.deepEqual(rails(), expected);
    });
  }
});

function dataProviderDockPanel() {
  return [
    ['moves a panel down past the next one', () => dockPanel('entities', 'right', 1), { left: ['history'], right: ['table', 'entities', 'inspector'] }],
    ['moves a panel up to the top', () => dockPanel('inspector', 'right', 0), { left: ['history'], right: ['inspector', 'entities', 'table'] }],
    ['moves a panel to the end', () => dockPanel('entities', 'right', 2), { left: ['history'], right: ['table', 'inspector', 'entities'] }],
    [
      'places a panel last for an index past the end',
      () => dockPanel('entities', 'right', 9),
      { left: ['history'], right: ['table', 'inspector', 'entities'] },
    ],
    [
      'leaves a panel dropped at its own index in place',
      () => dockPanel('table', 'right', 1),
      { left: ['history'], right: ['entities', 'table', 'inspector'] },
    ],
    ['moves a panel to the top of the other side', () => dockPanel('table', 'left', 0), { left: ['table', 'history'], right: ['entities', 'inspector'] }],
    ['moves a panel to the end of the other side', () => dockPanel('table', 'left', 1), { left: ['history', 'table'], right: ['entities', 'inspector'] }],
    [
      'docks a floating panel between 2 docked ones',
      () => dockPanel('legend', 'right', 1),
      { left: ['history'], right: ['entities', 'legend', 'table', 'inspector'] },
    ],
    [
      'moves and opens a closed panel on the other side',
      () => dockPanel('settings', 'left', 0),
      { left: ['settings', 'history'], right: ['entities', 'table', 'inspector'] },
    ],
    [
      'keeps a closed panel after the panel it followed',
      () => {
        dockPanel('inspector', 'right', 0);
        openPanel('settings');
      },
      { left: ['history'], right: ['inspector', 'entities', 'table', 'settings'] },
    ],
  ];
}

test('keeps the height of a panel moved within its side and clears it on the other side', () => {
  useRails();
  importLayout({ panels: { table: { open: true, dock: 'right', height: 300 } } });

  dockPanel('table', 'right', 0);
  assert.equal(getState().panels.table.height, 300);

  dockPanel('table', 'left', 0);
  assert.equal(getState().panels.table.height, null);
  assert.equal(getState().panels.table.dock, 'left');
});

test('saves the order of the panels with the layout and restores it', () => {
  useRails();
  dockPanel('inspector', 'right', 0);

  const saved = exportLayout();

  useRails();
  assert.deepEqual(dockedPanels('right'), ['entities', 'table', 'inspector']);

  importLayout(saved);
  assert.deepEqual(dockedPanels('right'), ['inspector', 'entities', 'table']);
});

test('keeps the order a panel has when the imported layout has none', () => {
  useRails();
  dockPanel('inspector', 'right', 0);

  importLayout({ panels: { inspector: { open: true, dock: 'right' }, entities: { open: true, dock: 'right', order: 'top' } } });

  assert.deepEqual(dockedPanels('right'), ['inspector', 'entities', 'table']);
});

test('keeps a docked panel height between the minimum and the maximum', async (t) => {
  for (const [name, height, maxHeight, expected] of dataProviderPanelHeight()) {
    await t.test(name, () => {
      setPanelHeight('legend', height, maxHeight);

      assert.equal(getState().panels.legend.height, expected);
    });
  }
});

function dataProviderPanelHeight() {
  return [
    ['a height below the maximum', 300, 500, 300],
    ['a height at the maximum', 500, 500, 500],
    ['a height above the maximum', 1200, 500, 500],
    ['a height below the minimum', 40, 500, 90],
    ['a maximum below the minimum', 300, 60, 90],
    ['a fractional height', 300.6, 500, 301],
    ['a fractional maximum', 800, 412.4, 412],
  ];
}

test('starts every panel without a size and the fields unsearched in diagram order', () => {
  assert.equal(getState().tableSearch, '');
  assert.deepEqual(getState().tableSort, DEFAULT_SORT);
  assert.deepEqual(
    PANELS.map((id) => getState().panels[id].size),
    PANELS.map(() => null),
  );
});

test('searches and sorts the fields table', () => {
  setTableSearch('summary');
  setTableSort({ column: 'type', direction: 'descending' });

  assert.equal(getState().tableSearch, 'summary');
  assert.deepEqual(getState().tableSort, { column: 'type', direction: 'descending' });

  setTableSearch('');
  setTableSort(DEFAULT_SORT);
});

test('floats a resized panel at its top-left corner with a size between the minimum and the maximum', async (t) => {
  for (const [name, box, maxSize, expected] of dataProviderResizePanel()) {
    await t.test(name, () => {
      importLayout({ panels: { table: { open: true, dock: null, pos: { right: 16, top: 16 } } } });

      resizePanel('table', box, maxSize);

      const panel = getState().panels.table;

      assert.deepEqual(panel.pos, { left: 100, top: 40 });
      assert.deepEqual(panel.size, expected);
    });
  }
});

function dataProviderResizePanel() {
  const max = { width: 900, height: 700 };

  return [
    ['a size within the bounds', { left: 100, top: 40, width: 500, height: 400 }, max, { width: 500, height: 400 }],
    ['a size at the maximum', { left: 100, top: 40, width: 900, height: 700 }, max, { width: 900, height: 700 }],
    ['a size above the maximum', { left: 100, top: 40, width: 1500, height: 1200 }, max, { width: 900, height: 700 }],
    ['a size below the minimum', { left: 100, top: 40, width: 50, height: 20 }, max, { width: 200, height: 90 }],
    ['a maximum below the minimum', { left: 100, top: 40, width: 500, height: 400 }, { width: 120, height: 60 }, { width: 200, height: 90 }],
    ['a fractional box', { left: 99.6, top: 40.4, width: 500.6, height: 400.4 }, max, { width: 501, height: 400 }],
  ];
}

test('returns a resized panel to the size of its content', () => {
  resizePanel('legend', { left: 0, top: 0, width: 400, height: 300 }, { width: 900, height: 700 });
  resetPanelSize('legend');

  assert.equal(getState().panels.legend.size, null);
});

test('saves the size of a panel with the layout and restores it', () => {
  resizePanel('history', { left: 20, top: 30, width: 420, height: 310 }, { width: 900, height: 700 });

  const saved = exportLayout();

  resetPanelSize('history');
  importLayout(saved);

  assert.deepEqual(getState().panels.history.size, { width: 420, height: 310 });
});

test('reads the size of a panel from an imported layout', async (t) => {
  for (const [name, entry, expected] of dataProviderImportedSize()) {
    await t.test(name, () => {
      resizePanel('settings', { left: 0, top: 0, width: 333, height: 222 }, { width: 900, height: 700 });

      importLayout({ panels: { settings: { open: true, ...entry } } });

      assert.deepEqual(getState().panels.settings.size, expected);
    });
  }
});

function dataProviderImportedSize() {
  const kept = { width: 333, height: 222 };

  return [
    ['a valid size', { size: { width: 410.4, height: 280 } }, { width: 410, height: 280 }],
    ['no size key', {}, kept],
    ['a null size', { size: null }, null],
    ['a size with text', { size: { width: '400', height: 300 } }, null],
    ['a size with a missing side', { size: { width: 400 } }, null],
    ['a size of 0', { size: { width: 0, height: 300 } }, null],
    ['a negative size', { size: { width: 400, height: -1 } }, null],
    ['an infinite size', { size: { width: Infinity, height: 300 } }, null],
    ['a size that is not an object', { size: 'wide' }, null],
  ];
}
