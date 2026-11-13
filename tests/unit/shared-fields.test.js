import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldSharing, usedInTitle } from '../../src/shared-fields.js';

// Returns a field record with the keys fieldSharing() reads. The entity label
// is the bundle name capitalised.
function record(entityId, name, values = {}) {
  const [entityType, bundle] = entityId.split('.');

  return {
    id: 'field:' + entityId + ':' + name,
    entityId,
    entity: bundle.charAt(0).toUpperCase() + bundle.slice(1),
    entityType,
    name,
    kind: 'single',
    field: name,
    ...values,
  };
}

// The entity ids of the bundles sharing a record's storage.
function bundlesOf(sharing, entityId, name) {
  return sharing.get('field:' + entityId + ':' + name).map((bundle) => bundle.entityId);
}

test('groups fields by entity type and machine name', async (t) => {
  for (const [name, records, entityId, fieldName, expected] of dataProviderSharing()) {
    await t.test(name, () => {
      assert.deepEqual(bundlesOf(fieldSharing(records), entityId, fieldName), expected);
    });
  }
});

// Each case lists the records, the field to look up and the entity ids of the
// bundles expected to share its storage, in entity label order.
function dataProviderSharing() {
  return [
    ['a field on 1 bundle', [record('node.article', 'field_tags')], 'node.article', 'field_tags', ['node.article']],
    [
      'a field on several bundles, sorted by entity label',
      [record('node.page', 'field_tags'), record('node.event', 'field_tags'), record('node.article', 'field_tags')],
      'node.page',
      'field_tags',
      ['node.article', 'node.event', 'node.page'],
    ],
    [
      'only fields with the same machine name',
      [record('node.article', 'field_image'), record('node.page', 'field_main_image'), record('node.event', 'field_image')],
      'node.article',
      'field_image',
      ['node.article', 'node.event'],
    ],
    [
      'only bundles of the same entity type',
      [record('node.article', 'field_image'), record('media.image', 'field_image'), record('paragraph.hero', 'field_image')],
      'node.article',
      'field_image',
      ['node.article'],
    ],
    [
      'a bundle with the machine name twice, once',
      [record('node.article', 'field_tags'), record('node.article', 'field_tags', { id: 'field:node.article:field_tags:2' }), record('node.page', 'field_tags')],
      'node.page',
      'field_tags',
      ['node.article', 'node.page'],
    ],
    [
      'bundles with the same label, by entity id',
      [record('node.page', 'field_tags', { entity: 'Same' }), record('node.article', 'field_tags', { entity: 'Same' })],
      'node.page',
      'field_tags',
      ['node.article', 'node.page'],
    ],
    [
      'entity labels by their numbers, ignoring case',
      [record('node.b', 'field_tags', { entity: 'item 10' }), record('node.a', 'field_tags', { entity: 'Item 2' })],
      'node.a',
      'field_tags',
      ['node.a', 'node.b'],
    ],
    ['a base field, as no bundles', [record('node.article', 'title', { kind: 'system' }), record('node.page', 'title', { kind: 'system' })], 'node.article', 'title', []],
    [
      'a calculated field, as no bundles',
      [record('node.article', 'path', { kind: 'calculated' }), record('node.page', 'path', { kind: 'calculated' })],
      'node.article',
      'path',
      [],
    ],
    [
      'a configurable field that shares a base field name, without the base field',
      [record('node.article', 'title', { kind: 'system' }), record('node.page', 'title')],
      'node.page',
      'title',
      ['node.page'],
    ],
    ['a field without a machine name, as no bundles', [record('node.article', '', { id: 'blank' }), record('node.page', '')], 'node.page', '', []],
    [
      'a field without an entity type, as no bundles',
      [record('node.article', 'field_tags', { entityType: '' }), record('node.page', 'field_tags', { entityType: '' })],
      'node.article',
      'field_tags',
      [],
    ],
    [
      'an entity type and name that join into the same text, apart',
      [record('node.article', 'field_tags', { entityType: 'a"b', name: 'c' }), record('node.page', 'field_tags', { entityType: 'a', name: 'b"c' })],
      'node.article',
      'field_tags',
      ['node.article'],
    ],
  ];
}

test('lists each sharing bundle with its own label for the field', () => {
  const records = [record('node.article', 'field_image', { field: 'Image' }), record('node.page', 'field_image', { field: 'Main image' })];

  assert.deepEqual(fieldSharing(records).get('field:node.article:field_image'), [
    { entityId: 'node.article', entity: 'Article', fieldId: 'field:node.article:field_image', field: 'Image' },
    { entityId: 'node.page', entity: 'Page', fieldId: 'field:node.page:field_image', field: 'Main image' },
  ]);
});

test('gives every record the same list as the others of its storage', () => {
  const sharing = fieldSharing([record('node.article', 'field_tags'), record('node.page', 'field_tags')]);

  assert.deepEqual(sharing.get('field:node.article:field_tags'), sharing.get('field:node.page:field_tags'));
});

test('maps every record, and nothing else', () => {
  const records = [record('node.article', 'field_tags'), record('node.article', 'title', { kind: 'system' })];

  assert.deepEqual([...fieldSharing(records).keys()], ['field:node.article:field_tags', 'field:node.article:title']);
  assert.equal(fieldSharing([]).size, 0);
});

test('leaves the records it groups unchanged', () => {
  const records = [record('node.page', 'field_tags'), record('node.article', 'field_tags')];
  const copy = structuredClone(records);

  fieldSharing(records);

  assert.deepEqual(records, copy);
});

test('words the hover text of a bundle count', async (t) => {
  for (const [name, bundles, expected] of dataProviderUsedInTitle()) {
    await t.test(name, () => {
      assert.equal(usedInTitle(bundles), expected);
    });
  }
});

function dataProviderUsedInTitle() {
  return [
    ['no bundles', [], ''],
    ['1 bundle', [{ entity: 'Article' }], 'Used in 1 bundle: Article'],
    ['several bundles', [{ entity: 'Article' }, { entity: 'Event' }, { entity: 'Page' }], 'Used in 3 bundles: Article, Event, Page'],
  ];
}
