import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BULK_FIELDS_LABEL, inspectorTrail, NEW_FIELD_LABEL } from '../../src/inspector-trail.js';

// An Article with a Body field, an Article field with no label, a Page entity
// with no label and an annotation.
const NODES = {
  'node.article': { label: 'Article', entity: undefined },
  'node.page': { label: '', entity: undefined },
  'field:node.article:field_body': { label: 'Body', entity: 'node.article' },
  'field:node.article:field_blank': { label: '', entity: 'node.article' },
  'field:node.gone:field_body': { label: 'Body', entity: 'node.gone' },
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
