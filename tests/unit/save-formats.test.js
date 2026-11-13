import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_FORMATS, findSaveFormat } from '../../src/save-formats.js';
import { hasIcon } from '../../src/icons.js';

test('lists JSON, PNG, SVG, CSV, Markdown and HTML in menu order', () => {
  assert.deepEqual(
    SAVE_FORMATS.map((format) => format.id),
    ['json', 'png', 'svg', 'csv', 'md', 'html'],
  );
});

test('describes every save format completely', () => {
  for (const format of SAVE_FORMATS) {
    assert.ok(format.label, format.id + ' has no label');
    assert.ok(hasIcon(format.icon), format.id + ' has an icon that is not drawn');
    assert.match(format.title, /^Save the /, format.id + ' has no title');
  }
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
    ['CSV', 'csv', 'CSV'],
    ['Markdown', 'md', 'Markdown'],
    ['HTML', 'html', 'HTML'],
    ['an id in capitals', 'SVG', null],
    ['an unknown id', 'pdf', null],
    ['an inherited object property', 'constructor', null],
    ['the prototype key', '__proto__', null],
    ['an empty string', '', null],
    ['null', null, null],
    ['undefined', undefined, null],
  ];
}
