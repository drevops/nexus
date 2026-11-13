import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SORT, SORT_COLUMNS, numberFields, sortFields, isDefaultSort, nextSort } from '../../src/field-table.js';

// Returns a field record as the controller's records() lists it, with the
// given values over blank defaults.
function record(entityId, name, values = {}) {
  return {
    id: entityId + '.' + name,
    entityId,
    field: name,
    name,
    type: 'string',
    kind: 'single',
    cardinality: 1,
    required: false,
    refs: [],
    description: '',
    defaultValue: '',
    allowedValues: [],
    translatable: null,
    ...values,
  };
}

// The machine names of the records of 1 entity, in order.
function names(records, entityId = 'node.article') {
  return records.filter((r) => r.entityId === entityId).map((r) => r.name);
}

test('numbers each field by its place in its entity', () => {
  const records = numberFields([record('node.article', 'a'), record('node.page', 'b'), record('node.article', 'c'), record('node.page', 'd')]);

  assert.deepEqual(
    records.map((r) => [r.entityId, r.name, r.position]),
    [
      ['node.article', 'a', 1],
      ['node.article', 'c', 2],
      ['node.page', 'b', 1],
      ['node.page', 'd', 2],
    ],
  );
});

test('leaves the records it numbers unchanged', () => {
  const input = [record('node.article', 'a')];

  numberFields(input);

  assert.equal('position' in input[0], false);
});

test('keeps the entities in the order of their first fields', () => {
  const records = numberFields([record('node.page', 'a'), record('node.article', 'b'), record('node.page', 'c')]);
  const sorted = sortFields(records, { column: 'field', direction: 'descending' });

  assert.deepEqual(
    sorted.map((r) => r.entityId),
    ['node.page', 'node.page', 'node.article'],
  );
});

test('sorts the fields of each entity by a column', async (t) => {
  for (const [name, fields, column, ascending, descending] of dataProviderSortColumn()) {
    await t.test(name, () => {
      const records = numberFields(fields.map(([fieldName, values]) => record('node.article', fieldName, values)));

      assert.deepEqual(names(sortFields(records, { column, direction: 'ascending' })), ascending);
      assert.deepEqual(names(sortFields(records, { column, direction: 'descending' })), descending);
    });
  }
});

// Each case lists the fields in diagram order, the column, and the machine
// names in ascending and in descending order. Blank cells come last both ways,
// and equal values keep the diagram order.
function dataProviderSortColumn() {
  return [
    ['position', [['b'], ['a'], ['c']], 'position', ['b', 'a', 'c'], ['c', 'a', 'b']],
    [
      'field label, ignoring case and reading numbers as numbers',
      [
        ['x', { field: 'Item 10' }],
        ['y', { field: 'item 2' }],
        ['z', { field: 'Alpha' }],
      ],
      'field',
      ['z', 'y', 'x'],
      ['x', 'y', 'z'],
    ],
    [
      'field type',
      [
        ['x', { type: 'text_long' }],
        ['y', { type: 'boolean' }],
        ['z', { type: 'entity_reference' }],
      ],
      'type',
      ['y', 'z', 'x'],
      ['x', 'z', 'y'],
    ],
    [
      'cardinality, with unlimited after every limit and the badges after it',
      [
        ['system', { kind: 'system', cardinality: 1 }],
        ['unlimited', { kind: 'multi', cardinality: -1 }],
        ['three', { kind: 'multi', cardinality: 3 }],
        ['calculated', { kind: 'calculated', cardinality: 1 }],
        ['one', {}],
      ],
      'cardinality',
      ['one', 'three', 'unlimited', 'calculated', 'system'],
      ['system', 'calculated', 'unlimited', 'three', 'one'],
    ],
    [
      'required, with optional fields as blanks',
      [['x'], ['y', { required: true }], ['z'], ['w', { required: true }]],
      'required',
      ['y', 'w', 'x', 'z'],
      ['y', 'w', 'x', 'z'],
    ],
    [
      'references by their labels',
      [
        ['x', { refs: [{ id: 'node.page', label: 'Page' }] }],
        ['y'],
        [
          'z',
          {
            refs: [
              { id: 'node.article', label: 'Article' },
              { id: 'node.page', label: 'Page' },
            ],
          },
        ],
      ],
      'references',
      ['z', 'x', 'y'],
      ['x', 'z', 'y'],
    ],
    ['help text', [['x', { description: 'Shown second.' }], ['y'], ['z', { description: 'A note.' }]], 'description', ['z', 'x', 'y'], ['x', 'z', 'y']],
    ['default value', [['x'], ['y', { defaultValue: 'wide' }], ['z', { defaultValue: 'narrow' }]], 'defaultValue', ['z', 'y', 'x'], ['y', 'z', 'x']],
    [
      'allowed values by their labels',
      [['x', { allowedValues: [{ value: 'b', label: 'Beta' }] }], ['y', { allowedValues: [{ value: 'a', label: 'Alpha' }] }], ['z']],
      'allowedValues',
      ['y', 'x', 'z'],
      ['x', 'y', 'z'],
    ],
    [
      'translatability, with an unknown one as a blank',
      [['x', { translatable: false }], ['y'], ['z', { translatable: true }]],
      'translatable',
      ['z', 'x', 'y'],
      ['x', 'z', 'y'],
    ],
    [
      'equal values in diagram order both ways',
      [
        ['x', { type: 'string' }],
        ['y', { type: 'boolean' }],
        ['z', { type: 'string' }],
      ],
      'type',
      ['y', 'x', 'z'],
      ['x', 'z', 'y'],
    ],
  ];
}

test('sorts by position for an unknown column', () => {
  const records = numberFields([record('node.article', 'b'), record('node.article', 'a')]);

  assert.deepEqual(names(sortFields(records, { column: 'colour', direction: 'ascending' })), ['b', 'a']);
});

test('sorts in diagram order without a sort', () => {
  const records = numberFields([record('node.article', 'b'), record('node.article', 'a')]);

  assert.deepEqual(names(sortFields(records)), ['b', 'a']);
});

test('lists a sortable column for every column a test sorts by', () => {
  const columns = dataProviderSortColumn().map((testCase) => testCase[2]);

  assert.deepEqual([...new Set(columns)].sort(), [...SORT_COLUMNS].sort());
});

test('tells the diagram order from every other sort', async (t) => {
  for (const [name, sort, expected] of dataProviderDefaultSort()) {
    await t.test(name, () => {
      assert.equal(isDefaultSort(sort), expected);
    });
  }
});

function dataProviderDefaultSort() {
  return [
    ['the default sort', DEFAULT_SORT, true],
    ['position ascending', { column: 'position', direction: 'ascending' }, true],
    ['position descending', { column: 'position', direction: 'descending' }, false],
    ['another column ascending', { column: 'type', direction: 'ascending' }, false],
  ];
}

test('cycles a column from ascending to descending to the diagram order', async (t) => {
  for (const [name, sort, column, expected] of dataProviderNextSort()) {
    await t.test(name, () => {
      assert.deepEqual(nextSort(sort, column), expected);
    });
  }
});

function dataProviderNextSort() {
  return [
    ['a new column from the default', DEFAULT_SORT, 'type', { column: 'type', direction: 'ascending' }],
    ['a column sorted ascending', { column: 'type', direction: 'ascending' }, 'type', { column: 'type', direction: 'descending' }],
    ['a column sorted descending', { column: 'type', direction: 'descending' }, 'type', DEFAULT_SORT],
    ['another column from a descending one', { column: 'type', direction: 'descending' }, 'field', { column: 'field', direction: 'ascending' }],
    ['position from the default', DEFAULT_SORT, 'position', { column: 'position', direction: 'descending' }],
    ['position from descending', { column: 'position', direction: 'descending' }, 'position', DEFAULT_SORT],
  ];
}
