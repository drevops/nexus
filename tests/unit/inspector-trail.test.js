import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BULK_FIELDS_LABEL, inspectorTrail, NEW_FIELD_LABEL, selectionEntity } from '../../src/inspector-trail.js';

// An Article with a Body field and a proxy of the Page it references, an
// Article field with no label, a Page entity with no label and an annotation.
const NODES = {
  'node.article': { label: 'Article', entity: undefined },
  'node.page': { label: '', entity: undefined },
  'field:node.article:field_body': { label: 'Body', entity: 'node.article' },
  'field:node.article:field_blank': { label: '', entity: 'node.article' },
  'field:node.gone:field_body': { label: 'Body', entity: 'node.gone' },
  'proxy:field:node.article:field_body:node.page': { label: '', entity: 'node.article' },
  'proxy:field:node.gone:field_body:node.page': { label: '', entity: 'node.gone' },
  'note-1': { label: 'Sync API', entity: undefined },
};

function lookup(id) {
  return NODES[id] || null;
}

const ARTICLE = { label: 'Article', id: 'node.article' };

test('traces the screens above the open one', async (t) => {
  for (const [name, selected, expected] of dataProviderTrails()) {
    await t.test(name, () => {
      assert.deepEqual(inspectorTrail(selected, lookup), expected);
    });
  }
});

function dataProviderTrails() {
  return [
    ['nothing selected', null, []],
    ['an entity', { kind: 'entity', id: 'node.article' }, []],
    ['a field', { kind: 'field', id: 'field:node.article:field_body' }, [ARTICLE, { label: 'Body', id: null }]],
    ['a field with no label', { kind: 'field', id: 'field:node.article:field_blank' }, [ARTICLE, { label: 'field:node.article:field_blank', id: null }]],
    ['a field that is gone', { kind: 'field', id: 'field:node.article:field_gone' }, []],
    ['a field whose entity is gone', { kind: 'field', id: 'field:node.gone:field_body' }, []],
    ['a new field on an entity', { kind: 'new-field', entityId: 'node.article' }, [ARTICLE, { label: NEW_FIELD_LABEL, id: null }]],
    [
      'a new field on an entity with no label',
      { kind: 'new-field', entityId: 'node.page' },
      [
        { label: 'node.page', id: 'node.page' },
        { label: NEW_FIELD_LABEL, id: null },
      ],
    ],
    ['a new field on no entity', { kind: 'new-field' }, []],
    ['a new field on an entity that is gone', { kind: 'new-field', entityId: 'node.gone' }, []],
    ['bulk fields', { kind: 'bulk-fields', entityId: 'node.article' }, [ARTICLE, { label: BULK_FIELDS_LABEL, id: null }]],
    ['bulk fields on an entity that is gone', { kind: 'bulk-fields', entityId: 'node.gone' }, []],
    ['an annotation', { kind: 'annotation', id: 'note-1' }, []],
    ['a new entity', { kind: 'new-entity', entityType: 'node' }, []],
    ['a new annotation', { kind: 'new-annotation' }, []],
  ];
}

test('finds the entity a selection belongs to', async (t) => {
  for (const [name, selected, expected] of dataProviderSelectionEntities()) {
    await t.test(name, () => {
      assert.equal(selectionEntity(selected, lookup), expected);
    });
  }
});

function dataProviderSelectionEntities() {
  return [
    ['nothing selected', null, null],
    ['an entity', { kind: 'entity', id: 'node.article' }, 'node.article'],
    ['an entity that is gone', { kind: 'entity', id: 'node.gone' }, null],
    ['a field', { kind: 'field', id: 'field:node.article:field_body' }, 'node.article'],
    ['a field that is gone', { kind: 'field', id: 'field:node.article:field_gone' }, null],
    ['a field whose entity is gone', { kind: 'field', id: 'field:node.gone:field_body' }, null],
    ['a proxy', { kind: 'proxy', id: 'proxy:field:node.article:field_body:node.page' }, 'node.article'],
    ['a proxy whose entity is gone', { kind: 'proxy', id: 'proxy:field:node.gone:field_body:node.page' }, null],
    ['a new field on an entity', { kind: 'new-field', entityId: 'node.page' }, 'node.page'],
    ['a new field on no entity', { kind: 'new-field' }, null],
    ['bulk fields', { kind: 'bulk-fields', entityId: 'node.article' }, 'node.article'],
    ['bulk fields on an entity that is gone', { kind: 'bulk-fields', entityId: 'node.gone' }, null],
    ['an annotation', { kind: 'annotation', id: 'note-1' }, null],
    ['a new entity', { kind: 'new-entity', entityType: 'node' }, null],
  ];
}
