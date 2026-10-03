import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENTITY_TYPES, ENTITY_TYPE_ORDER, findEntityType } from '../../src/entity-types.js';
import { machineName } from '../../src/names.js';

const ROOT = join(import.meta.dirname, '..', '..');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');

test('lists each built-in entity type once, in diagram order', () => {
  assert.deepEqual(ENTITY_TYPE_ORDER, ['node', 'taxonomy_term', 'media', 'paragraph', 'block_content', 'user', 'external']);
  assert.deepEqual(
    ENTITY_TYPES.map((entry) => entry.type),
    ENTITY_TYPE_ORDER,
  );
});

test('describes every built-in entity type completely', () => {
  for (const entry of ENTITY_TYPES) {
    assert.ok(entry.label, entry.type + ' has no label');
    assert.match(entry.color, /^#[0-9a-f]{6}$/, entry.type + ' has no hex colour');
    assert.ok(entry.symbol, entry.type + ' has no symbol');
    assert.ok(entry.bundleBase, entry.type + ' has no bundle base');
    assert.equal(machineName(entry.bundleBase), entry.bundleBase, entry.type + ' has a bundle base that is not a machine name');
  }
});

test('finds a built-in entity type by its machine name', async (t) => {
  for (const [name, type, expected] of dataProviderFindEntityType()) {
    await t.test(name, () => {
      const entry = findEntityType(type);

      assert.equal(entry ? entry.label : null, expected);
    });
  }
});

function dataProviderFindEntityType() {
  return [
    ['a content type', 'node', 'Content type'],
    ['a vocabulary', 'taxonomy_term', 'Vocabulary'],
    ['an external entity', 'external', 'External entity'],
    ['a custom type', 'widget', null],
    ['an inherited object property', 'constructor', null],
    ['an empty string', '', null],
    ['undefined', undefined, null],
  ];
}

test('offers a palette button for every built-in entity type, in order', () => {
  const palette = [...INDEX.matchAll(/data-add-entity="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(palette, ENTITY_TYPE_ORDER);
});

test('paints no palette swatch colour in the markup', () => {
  const swatches = [...INDEX.matchAll(/<span class="palette__swatch"[^>]*>/g)].map((match) => match[0]);

  assert.equal(swatches.length, ENTITY_TYPE_ORDER.length);
  assert.deepEqual(
    swatches.filter((swatch) => swatch.includes('style=')),
    [],
  );
});
