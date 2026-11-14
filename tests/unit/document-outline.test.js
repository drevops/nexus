import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentOutline, missingTargetLabel, noteParagraphs } from '../../src/document-outline.js';
import { savedDocument } from '../fixtures/saved-document.js';

test('outlines a saved document', () => {
  const outline = documentOutline(savedDocument);

  assert.equal(outline.title, 'Saved model');
  assert.deepEqual(
    outline.groups.map((group) => [group.type, group.label, group.heading, group.entities.map((entity) => entity.id)]),
    [
      ['node', 'Content type', 'Content types', ['node.article']],
      ['taxonomy_term', 'Vocabulary', 'Vocabularies', ['taxonomy_term.tags']],
      ['media', 'Media', 'Media types', ['media.*']],
    ],
  );
  assert.deepEqual(
    outline.entities.map((entity) => entity.id),
    ['node.article', 'taxonomy_term.tags', 'media.*'],
  );
  assert.deepEqual(outline.entity('node.article').fields[0], {
    name: 'field_tags',
    label: 'Tags',
    fieldType: 'entity_reference',
    kind: 'multi',
    cardinality: 3,
    required: true,
    note: 'Up to 3 tags.',
    targets: ['taxonomy_term.tags'],
  });
  assert.deepEqual(outline.entity('node.article').fields.find((field) => field.name === 'field_media').targets, ['media.*']);
  assert.equal(outline.entity('node.article').description, 'Use <em>articles</em> for news.');
  assert.equal(outline.entity('taxonomy_term.tags').description, '');
  assert.equal(outline.entity('node.missing'), null);
});

test('lists the fields that reference an entity', () => {
  const outline = documentOutline(savedDocument);

  assert.deepEqual(
    outline.referencedBy('media.*').map((ref) => ref.entity.id + ' ' + ref.field.name),
    ['node.article field_media'],
  );
  assert.deepEqual(outline.referencedBy('node.article'), []);
});

test('labels built-in, custom and unknown types', async (t) => {
  const outline = documentOutline({ entities: [], customTypes: [{ type: 'gadget', label: 'Gadget' }, { type: 'thing' }, null, { label: 'No type' }] });

  for (const [name, type, expected] of dataProviderTypeLabel()) {
    await t.test(name, () => {
      assert.equal(outline.typeLabel(type), expected);
    });
  }
});

function dataProviderTypeLabel() {
  return [
    ['a built-in type', 'taxonomy_term', 'Vocabulary'],
    ['a custom type', 'gadget', 'Gadget'],
    ['a custom type without a label', 'thing', 'Thing'],
    ['an unknown type', 'event_ticket', 'Event Ticket'],
  ];
}

test('reads a document with nothing in it', () => {
  const outline = documentOutline({});

  assert.equal(outline.title, 'Content model');
  assert.deepEqual(outline.groups, []);
  assert.deepEqual(outline.entities, []);
});

test('fills in the cardinality from the kind', async (t) => {
  for (const [name, field, expected] of dataProviderCardinality()) {
    await t.test(name, () => {
      const outline = documentOutline({ entities: [{ entityType: 'node', bundle: 'page', fields: [field] }] });

      assert.equal(outline.entity('node.page').fields[0].cardinality, expected);
    });
  }
});

function dataProviderCardinality() {
  return [
    ['a given cardinality', { name: 'a', kind: 'multi', cardinality: 4 }, 4],
    ['a multi field', { name: 'a', kind: 'multi' }, -1],
    ['a single field', { name: 'a', kind: 'single' }, 1],
    ['a field with no kind', { name: 'a' }, 1],
  ];
}

test('words a target the document has no entity for', async (t) => {
  const outline = documentOutline({ entities: [], customTypes: [{ type: 'gadget', label: 'Gadget' }] });

  for (const [name, id, expected] of dataProviderMissingTargetLabel()) {
    await t.test(name, () => {
      assert.equal(missingTargetLabel(outline, id), expected);
    });
  }
});

function dataProviderMissingTargetLabel() {
  return [
    ['every bundle of a built-in type', 'media.*', 'Any Media'],
    ['every bundle of a custom type', 'gadget.*', 'Any Gadget'],
    ['a missing bundle', 'node.page', 'node.page'],
    ['an id with no type', '.*', '.*'],
  ];
}

test('splits a note into paragraphs of trimmed lines', async (t) => {
  for (const [name, note, expected] of dataProviderNoteParagraphs()) {
    await t.test(name, () => {
      assert.deepEqual(noteParagraphs(note), expected);
    });
  }
});

function dataProviderNoteParagraphs() {
  return [
    ['an empty note', '', []],
    ['null', null, []],
    ['undefined', undefined, []],
    ['blank lines only', ' \n \r\n ', []],
    ['1 line', 'Line', [['Line']]],
    ['lines of 1 paragraph', '  a  \nb', [['a', 'b']]],
    ['Windows line endings', 'a\r\nb\r\n\r\nc', [['a', 'b'], ['c']]],
    ['several blank lines between paragraphs', '\na\n\n\n\nb\n', [['a'], ['b']]],
    ['a number', 42, [['42']]],
  ];
}
