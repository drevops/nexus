import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_FORMATS, SAVE_MENU, findSaveFormat } from '../../src/save-formats.js';
import { hasIcon } from '../../src/icons.js';

test('lists a CSV submenu, DOT, HTML, JSON, Markdown, Mermaid, PNG and SVG in menu order', () => {
  assert.deepEqual(
    SAVE_MENU.map((entry) => entry.label),
    ['CSV', 'Graphviz DOT', 'HTML', 'JSON', 'Markdown', 'Mermaid', 'PNG', 'SVG'],
  );
  assert.deepEqual(
    SAVE_MENU[0].formats.map((format) => format.label),
    ['Bundles', 'Fields', 'References'],
  );
});

test('lists every format in menu order with the submenu in place', () => {
  assert.deepEqual(
    SAVE_FORMATS.map((format) => format.id),
    ['bundles-csv', 'csv', 'references-csv', 'dot', 'html', 'json', 'md', 'mermaid', 'png', 'svg'],
  );
});

test('sorts the menu and each submenu alphabetically by label', () => {
  const sorted = (labels) => labels.toSorted((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const lists = [SAVE_MENU, ...SAVE_MENU.filter((entry) => entry.formats).map((entry) => entry.formats)];

  for (const list of lists) {
    const labels = list.map((entry) => entry.label);

    assert.deepEqual(labels, sorted(labels));
  }
});

test('describes every menu entry and save format completely', () => {
  for (const entry of SAVE_MENU.concat(SAVE_FORMATS)) {
    assert.ok(entry.label, entry.title + ' has no label');
    assert.ok(hasIcon(entry.icon), entry.label + ' has an icon that is not drawn');
    assert.match(entry.title, /^Save the /, entry.label + ' has no title');
  }
});

test('gives every format an id and no submenu entry one', () => {
  for (const entry of SAVE_MENU) {
    assert.equal(Object.hasOwn(entry, 'id'), !entry.formats, entry.label);
  }

  assert.ok(SAVE_FORMATS.every((format) => typeof format.id === 'string' && !format.formats));
});

test('draws a different icon for each menu entry and format', () => {
  const icons = SAVE_MENU.concat(SAVE_FORMATS.filter((format) => !SAVE_MENU.includes(format))).map((entry) => entry.icon);

  assert.equal(new Set(icons).size, icons.length);
});

test('finds a save format by its id', async (t) => {
  for (const [name, id, expected] of dataProviderFindSaveFormat()) {
    await t.test(name, () => {
      const format = findSaveFormat(id);

      assert.equal(format ? format.label : null, expected);
    });
  }
});

function dataProviderFindSaveFormat() {
  return [
    ['JSON', 'json', 'JSON'],
    ['PNG', 'png', 'PNG'],
    ['SVG', 'svg', 'SVG'],
    ['the fields CSV', 'csv', 'Fields'],
    ['the bundles CSV', 'bundles-csv', 'Bundles'],
    ['the references CSV', 'references-csv', 'References'],
    ['Markdown', 'md', 'Markdown'],
    ['HTML', 'html', 'HTML'],
    ['Mermaid', 'mermaid', 'Mermaid'],
    ['DOT', 'dot', 'Graphviz DOT'],
    ['an id in capitals', 'SVG', null],
    ['an unknown id', 'pdf', null],
    ['an inherited object property', 'constructor', null],
    ['the prototype key', '__proto__', null],
    ['an empty string', '', null],
    ['null', null, null],
    ['undefined', undefined, null],
  ];
}
