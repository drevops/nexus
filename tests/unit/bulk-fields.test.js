import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFieldLine, parseFieldLines } from '../../src/bulk-fields.js';
import { FIELD_TYPES, MAX_CARDINALITY, REFERENCE_FIELD_TYPES } from '../../src/model.js';

// The canvas the lines are parsed against: an Article that already has a
// body, a 'field_tags' reference defined on another entity and 2 entities a
// reference can target.
const CONTEXT = {
  taken: ['field_body'],
  existing: [
    { name: 'field_body', label: 'Body', fieldType: 'text_with_summary', cardinality: 1 },
    { name: 'field_tags', label: 'Tags', fieldType: 'entity_reference', cardinality: -1 },
  ],
  entityIds: ['node.article', 'taxonomy_term.tags'],
};

function field(name, label, overrides = {}) {
  return { name: name, label: label, fieldType: 'string', cardinality: 1, required: false, targets: [], ...overrides };
}

test('lists the reference types among the field types', () => {
  for (const type of REFERENCE_FIELD_TYPES) {
    assert.ok(FIELD_TYPES.includes(type), type + ' is not a field type');
  }

  assert.equal(MAX_CARDINALITY, 10);
});

test('parses a line into a field definition', async (t) => {
  for (const [name, line, expected] of dataProviderFieldLines()) {
    await t.test(name, () => {
      assert.deepEqual(parseFieldLines(line, CONTEXT), [{ line: 1, text: line.trim(), field: expected }]);
    });
  }
});

function dataProviderFieldLines() {
  return [
    ['a label gets a field_ machine name', 'Summary', field('field_summary', 'Summary')],
    ['a label with spaces and symbols', 'Hero image & caption', field('field_hero_image_caption', 'Hero image & caption')],
    ['a label already prefixed keeps 1 prefix', 'Field Subtitle', field('field_subtitle', 'Field Subtitle')],
    ['a bare machine name gets a label without its prefix', 'field_subtitle', field('field_subtitle', 'Subtitle')],
    ['a bare machine name without a prefix', 'subtitle', field('subtitle', 'Subtitle')],
    ['a label and a machine name', 'Main summary (field_summary)', field('field_summary', 'Main summary')],
    ['a machine name in parentheses is converted', 'Summary (Field Summary)', field('field_summary', 'Summary')],
    ['a label holding parentheses', 'Size (cm) (field_size)', field('field_size', 'Size (cm)')],
    ['an empty label in front of a machine name', '(field_size)', field('field_size', 'Size')],
    ['surrounding spaces are trimmed', '   Summary   ', field('field_summary', 'Summary')],
    ['a field type', 'Summary, text_long', field('field_summary', 'Summary', { fieldType: 'text_long' })],
    ['a field type in capitals', 'Summary, TEXT_LONG', field('field_summary', 'Summary', { fieldType: 'text_long' })],
    ['a limited cardinality', 'Gallery, image, 5', field('field_gallery', 'Gallery', { fieldType: 'image', cardinality: 5 })],
    ['the highest limited cardinality', 'Gallery, 10', field('field_gallery', 'Gallery', { cardinality: 10 })],
    ['an unlimited cardinality as a word', 'Gallery, image, Unlimited', field('field_gallery', 'Gallery', { fieldType: 'image', cardinality: -1 })],
    ['an unlimited cardinality as -1', 'Gallery, -1', field('field_gallery', 'Gallery', { cardinality: -1 })],
    ['required', 'Summary, Required', field('field_summary', 'Summary', { required: true })],
    [
      'a reference with 2 targets',
      'Related, entity_reference, unlimited, node.article, taxonomy_term.tags',
      field('field_related', 'Related', { fieldType: 'entity_reference', cardinality: -1, targets: ['node.article', 'taxonomy_term.tags'] }),
    ],
    [
      'a target listed twice counts once',
      'Related, entity_reference, node.article, node.article',
      field('field_related', 'Related', { fieldType: 'entity_reference', targets: ['node.article'] }),
    ],
    [
      'the options in any order',
      'Related, required, 3, node.article, entity_reference_revisions',
      field('field_related', 'Related', { fieldType: 'entity_reference_revisions', cardinality: 3, required: true, targets: ['node.article'] }),
    ],
    ['tabs split columns', 'Summary\ttext_long\trequired', field('field_summary', 'Summary', { fieldType: 'text_long', required: true })],
    ['empty columns are skipped', 'Summary,, text_long,  ,', field('field_summary', 'Summary', { fieldType: 'text_long' })],
    [
      'an existing field name reuses its definition',
      'field_tags, taxonomy_term.tags',
      field('field_tags', 'Tags', { fieldType: 'entity_reference', cardinality: -1, targets: ['taxonomy_term.tags'] }),
    ],
    [
      'the columns override a reused definition',
      'Labels (field_tags), list_string, 2',
      field('field_tags', 'Labels', { fieldType: 'list_string', cardinality: 2 }),
    ],
    ['a reused definition keeps its cardinality', 'field_tags', field('field_tags', 'Tags', { fieldType: 'entity_reference', cardinality: -1 })],
  ];
}

test('reports why a line cannot be used', async (t) => {
  for (const [name, line, error] of dataProviderBrokenLines()) {
    await t.test(name, () => {
      assert.deepEqual(parseFieldLines(line, CONTEXT), [{ line: 1, text: line, error: error }]);
    });
  }
});

function dataProviderBrokenLines() {
  return [
    ['no letter or digit in the name', '???, string', 'No machine name in “???”'],
    ['no machine name in parentheses', 'Summary ( ), string', 'No machine name in “Summary ( )”'],
    ['an unknown column', 'Summary, strnig', '“strnig” is not a field type, a cardinality, “required” or an entity id'],
    ['2 field types', 'Summary, string, text_long', 'More than 1 field type: “string” and “text_long”'],
    ['2 cardinalities', 'Summary, 2, unlimited', 'More than 1 cardinality'],
    ['a cardinality of 0', 'Summary, 0', 'Cardinality “0” is not 1 to 10 or unlimited'],
    ['a cardinality above the highest', 'Summary, 11', 'Cardinality “11” is not 1 to 10 or unlimited'],
    ['a negative cardinality other than -1', 'Summary, -2', 'Cardinality “-2” is not 1 to 10 or unlimited'],
    ['a target that is not on the canvas', 'Related, entity_reference, node.page', 'No entity “node.page” on the canvas'],
    ['a target on a field that is not a reference', 'Summary, string, node.article', 'Only a reference field can target “node.article”'],
    ['a target on a field that defaults to a string', 'Summary, node.article', 'Only a reference field can target “node.article”'],
    ['a name the entity already has', 'Body', 'The entity already has “field_body”'],
    ['a machine name the entity already has', 'Text (field_body), text_long', 'The entity already has “field_body”'],
  ];
}

test('numbers each line and skips blank and comment lines', () => {
  const text = '\n# Content\nSummary\n\n  # Media  \r\nGallery, image\n   \n';

  assert.deepEqual(parseFieldLines(text, CONTEXT), [
    { line: 3, text: 'Summary', field: field('field_summary', 'Summary') },
    { line: 6, text: 'Gallery, image', field: field('field_gallery', 'Gallery', { fieldType: 'image' }) },
  ]);
});

test('reports a name listed twice on the later line only', () => {
  assert.deepEqual(parseFieldLines('Summary\nfield_summary, text_long\nSummary, 2', CONTEXT), [
    { line: 1, text: 'Summary', field: field('field_summary', 'Summary') },
    { line: 2, text: 'field_summary, text_long', error: '“field_summary” is on an earlier line' },
    { line: 3, text: 'Summary, 2', error: '“field_summary” is on an earlier line' },
  ]);
});

test('parses nothing from empty text', async (t) => {
  for (const [name, text] of [
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['blank lines', '\n  \n\t\n'],
  ]) {
    await t.test(name, () => {
      assert.deepEqual(parseFieldLines(text, CONTEXT), []);
    });
  }
});

test('parses without a context', () => {
  assert.deepEqual(parseFieldLines('field_body, node.article'), [
    { line: 1, text: 'field_body, node.article', error: 'No entity “node.article” on the canvas' },
  ]);
  assert.deepEqual(parseFieldLines('field_body'), [{ line: 1, text: 'field_body', field: field('field_body', 'Body') }]);
});

test('accepts the field types the context lists', () => {
  const context = { ...CONTEXT, fieldTypes: [...FIELD_TYPES, 'telephone'] };

  assert.deepEqual(parseFieldLines('Phone, telephone', context), [
    { line: 1, text: 'Phone, telephone', field: field('field_phone', 'Phone', { fieldType: 'telephone' }) },
  ]);
  assert.equal(parseFieldLines('Phone, telephone', CONTEXT)[0].error, '“telephone” is not a field type, a cardinality, “required” or an entity id');
});

test('writes a field definition as a line', async (t) => {
  for (const [name, definition, expected] of dataProviderFormattedFields()) {
    await t.test(name, () => {
      assert.equal(formatFieldLine(definition), expected);
    });
  }
});

function dataProviderFormattedFields() {
  return [
    ['a single string field', field('field_summary', 'Summary'), 'Summary (field_summary), string, 1'],
    ['a limited cardinality', field('field_gallery', 'Gallery', { fieldType: 'image', cardinality: 4 }), 'Gallery (field_gallery), image, 4'],
    ['an unlimited cardinality', field('field_gallery', 'Gallery', { cardinality: -1 }), 'Gallery (field_gallery), string, unlimited'],
    ['a required field', field('field_summary', 'Summary', { required: true }), 'Summary (field_summary), string, 1, required'],
    [
      'a reference with targets',
      field('field_related', 'Related', { fieldType: 'entity_reference', cardinality: -1, required: true, targets: ['node.article', 'taxonomy_term.tags'] }),
      'Related (field_related), entity_reference, unlimited, required, node.article, taxonomy_term.tags',
    ],
    ['a label with commas and tabs', field('field_name', 'Name, first\tlast'), 'Name  first last (field_name), string, 1'],
    ['an empty label', field('field_name', ''), 'field_name, string, 1'],
    ['no targets property', { name: 'field_name', label: 'Name', fieldType: 'string', cardinality: 1 }, 'Name (field_name), string, 1'],
  ];
}

test('reads a written line back as the same definition', async (t) => {
  for (const [name, definition] of dataProviderRoundTrips()) {
    await t.test(name, () => {
      const line = formatFieldLine(definition);

      assert.deepEqual(parseFieldLines(line, { ...CONTEXT, taken: [] }), [{ line: 1, text: line, field: definition }]);
    });
  }
});

function dataProviderRoundTrips() {
  return [
    ['a single string field', field('field_summary', 'Summary')],
    ['a label that differs from its machine name', field('field_lede', 'Opening paragraph', { fieldType: 'text_long', required: true })],
    ['a label holding parentheses', field('field_size', 'Size (cm)', { fieldType: 'decimal' })],
    ['a machine name without a prefix', field('body', 'Body', { fieldType: 'text_with_summary' })],
    [
      'a reference with targets',
      field('field_related', 'Related', { fieldType: 'entity_reference', cardinality: 3, targets: ['node.article', 'taxonomy_term.tags'] }),
    ],
    ['a reused field whose definition differs', field('field_tags', 'Keywords', { cardinality: 1 })],
  ];
}
