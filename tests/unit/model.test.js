import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContentModel, Entity, Field, KIND_SINGLE, KIND_MULTI, identifierSegments } from '../../assets/model.js';

function edgesByGroup(data, group) {
  return data.edges.filter((edge) => (edge.data.group || '') === group);
}

test('toArray builds entity and field nodes plus has/ref edges', () => {
  const model = new ContentModel('My model');
  const article = new Entity('node', 'article', 'Article');
  article.addField(new Field('field_summary', 'Summary', 'string', KIND_SINGLE));
  article.addField(new Field('field_tags', 'Tags', 'entity_reference', KIND_MULTI, false, 'taxonomy_term', ['tags'], -1));
  model.addEntity(article);
  model.addEntity(new Entity('taxonomy_term', 'tags', 'Tags'));

  const data = model.toArray();

  assert.equal(data.meta.title, 'My model');
  assert.equal(data.meta.entityCount, 2);
  assert.equal(data.nodes.length, 4);
  assert.equal(data.edges.length, 3);

  const nodeIds = data.nodes.map((n) => n.data.id);
  assert.ok(nodeIds.includes('node.article'));
  assert.ok(nodeIds.includes('field:node.article:field_tags'));

  const ref = edgesByGroup(data, 'ref')[0];
  assert.equal(ref.data.source, 'field:node.article:field_tags');
  assert.equal(ref.data.target, 'taxonomy_term.tags');
  assert.equal(ref.data.cardinality, '1..n');
});

test('single reference uses the "1" cardinality label', () => {
  const model = new ContentModel();
  const article = new Entity('node', 'article', 'Article');
  article.addField(new Field('field_image', 'Image', 'entity_reference', KIND_SINGLE, false, 'media', ['image']));
  model.addEntity(article);

  const ref = edgesByGroup(model.toArray(), 'ref')[0];
  assert.equal(ref.data.cardinality, '1');
  assert.equal(ref.data.target, 'media.image');
});

test('open-ended reference targets the Any node id', () => {
  const model = new ContentModel();
  const page = new Entity('node', 'page', 'Page');
  page.addField(new Field('field_components', 'Components', 'entity_reference_revisions', KIND_MULTI, false, 'paragraph', [], -1));
  model.addEntity(page);

  const ref = edgesByGroup(model.toArray(), 'ref')[0];
  assert.equal(ref.data.target, 'paragraph.*');
});

test('bounded cardinality uses a "1..N" reference label', () => {
  const model = new ContentModel();
  const article = new Entity('node', 'article', 'Article');
  article.addField(new Field('field_authors', 'Authors', 'entity_reference', KIND_MULTI, false, 'user', ['user'], 3));
  model.addEntity(article);

  const ref = edgesByGroup(model.toArray(), 'ref')[0];
  assert.equal(ref.data.cardinality, '1..3');
});

test('splits an identifier after each underscore run between 2 words', async (t) => {
  for (const [name, value, expected] of dataProviderIdentifierSegments()) {
    await t.test(name, () => {
      const segments = identifierSegments(value);

      assert.deepEqual(segments, expected);
      assert.equal(segments.join(''), String(value ?? ''));
    });
  }
});

function dataProviderIdentifierSegments() {
  return [
    ['a word without underscores', 'string', ['string']],
    ['1 underscore', 'entity_reference', ['entity_', 'reference']],
    ['2 underscores', 'entity_reference_revisions', ['entity_', 'reference_', 'revisions']],
    ['a machine name', 'field_media_oembed_video', ['field_', 'media_', 'oembed_', 'video']],
    ['a double underscore', 'field__body', ['field__', 'body']],
    ['a leading underscore', '_private', ['_private']],
    ['a leading underscore before more words', '_private_field', ['_private_', 'field']],
    ['a trailing underscore', 'reserved_', ['reserved_']],
    ['only underscores', '___', ['___']],
    ['an empty string', '', []],
    ['null', null, []],
    ['undefined', undefined, []],
    ['a number', 42, ['42']],
  ];
}
