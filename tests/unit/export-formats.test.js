import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_FORMATS, findExportFormat, loadExportFormat, saveExportFormat } from '../../src/export-formats.js';
import { hasIcon } from '../../src/icons.js';

const STORAGE_KEY = 'nexusExportFormat';

// A window whose localStorage starts with the given items and records every
// item set in `stored`.
function storageWindow(items) {
  const stored = new Map(Object.entries(items));

  return {
    stored: stored,
    localStorage: {
      getItem: (key) => (stored.has(key) ? stored.get(key) : null),
      setItem: (key, value) => stored.set(key, String(value)),
    },
  };
}

// A window whose localStorage throws on every read and write, as a full or
// disabled storage does.
function failingStorageWindow() {
  const fail = () => {
    throw new Error('QuotaExceededError');
  };

  return { localStorage: { getItem: fail, setItem: fail } };
}

// A window that throws as soon as localStorage is accessed, as a browser
// that blocks site data does.
function blockedStorageWindow() {
  return Object.defineProperty({}, 'localStorage', {
    get: () => {
      throw new Error('SecurityError');
    },
  });
}

test('lists PNG, SVG and CSV in menu order', () => {
  assert.deepEqual(
    EXPORT_FORMATS.map((format) => format.id),
    ['png', 'svg', 'csv'],
  );
});

test('describes every export format completely', () => {
  for (const format of EXPORT_FORMATS) {
    assert.ok(format.label, format.id + ' has no label');
    assert.ok(hasIcon(format.icon), format.id + ' has an icon that is not drawn');
    assert.match(format.title, /^Export the /, format.id + ' has no title');
  }
});

test('finds an export format by its id', async (t) => {
  for (const [name, id, expected] of dataProviderFindExportFormat()) {
    await t.test(name, () => {
      const format = findExportFormat(id);

      assert.equal(format ? format.label : null, expected);
    });
  }
});

function dataProviderFindExportFormat() {
  return [
    ['PNG', 'png', 'PNG'],
    ['SVG', 'svg', 'SVG'],
    ['CSV', 'csv', 'CSV'],
    ['an id in capitals', 'SVG', null],
    ['an unknown id', 'pdf', null],
    ['an inherited object property', 'constructor', null],
    ['the prototype key', '__proto__', null],
    ['an empty string', '', null],
    ['null', null, null],
    ['undefined', undefined, null],
  ];
}

test('loads the stored export format', async (t) => {
  for (const [name, win, expected] of dataProviderLoadExportFormat()) {
    await t.test(name, () => {
      const format = loadExportFormat(win);

      assert.equal(format ? format.id : null, expected);
    });
  }
});

function dataProviderLoadExportFormat() {
  return [
    ['a stored format', storageWindow({ [STORAGE_KEY]: 'svg' }), 'svg'],
    ['nothing stored', storageWindow({}), null],
    ['a stored value that is no format', storageWindow({ [STORAGE_KEY]: 'pdf' }), null],
    ['a stored inherited object property', storageWindow({ [STORAGE_KEY]: 'constructor' }), null],
    ['a storage that cannot be read', failingStorageWindow(), null],
    ['a blocked storage', blockedStorageWindow(), null],
  ];
}

test('stores the export format under its own key', () => {
  const win = storageWindow({});

  saveExportFormat(win, findExportFormat('csv'));

  assert.deepEqual([...win.stored], [[STORAGE_KEY, 'csv']]);
});

test('loads every export format it stores', () => {
  for (const format of EXPORT_FORMATS) {
    const win = storageWindow({});

    saveExportFormat(win, format);

    assert.equal(loadExportFormat(win), format);
  }
});

test('ignores a storage that cannot be written', async (t) => {
  for (const [name, win] of dataProviderUnwritableStorage()) {
    await t.test(name, () => {
      assert.doesNotThrow(() => saveExportFormat(win, findExportFormat('png')));
    });
  }
});

function dataProviderUnwritableStorage() {
  return [
    ['a storage that cannot be written', failingStorageWindow()],
    ['a blocked storage', blockedStorageWindow()],
  ];
}
