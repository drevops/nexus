import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ContentModel,
  Entity,
  Field,
  KIND_SINGLE,
  KIND_MULTI,
  DEFAULT_TITLE,
  kindForCardinality,
  entityNodeId,
  fieldNodeId,
  hasEdgeId,
  refEdgeId,
  identifierSegments,
  fitFontSize,
} from '../../src/model.js';

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

test('names a content model "Content model" by default', () => {
  assert.equal(DEFAULT_TITLE, 'Content model');
  assert.equal(new ContentModel().getTitle(), DEFAULT_TITLE);
  assert.equal(new ContentModel().toArray().meta.title, DEFAULT_TITLE);
});

test('derives a field kind from its cardinality', async (t) => {
  for (const [name, cardinality, expected] of dataProviderKindForCardinality()) {
    await t.test(name, () => {
      assert.equal(kindForCardinality(cardinality), expected);
    });
  }
});

function dataProviderKindForCardinality() {
  return [
    ['a single value', 1, KIND_SINGLE],
    ['unlimited values', -1, KIND_MULTI],
    ['a limit of 2', 2, KIND_MULTI],
    ['a limit of 10', 10, KIND_MULTI],
  ];
}

test('builds graph ids from entity types, bundles and field names', () => {
  assert.equal(entityNodeId('node', 'article'), 'node.article');
  assert.equal(entityNodeId('paragraph', '*'), 'paragraph.*');
  assert.equal(fieldNodeId('node.article', 'field_tags'), 'field:node.article:field_tags');
  assert.equal(hasEdgeId('field:node.article:field_tags'), 'has:field:node.article:field_tags');
  assert.equal(refEdgeId('field:node.article:field_tags', 'taxonomy_term.tags'), 'ref:field:node.article:field_tags>taxonomy_term.tags');
});

test('toArray names its nodes and edges with the graph id helpers', () => {
  const model = new ContentModel();
  const article = new Entity('node', 'article', 'Article');
  article.addField(new Field('field_tags', 'Tags', 'entity_reference', KIND_MULTI, false, 'taxonomy_term', ['tags', 'topics'], -1));
  article.addField(new Field('field_sections', 'Sections', 'entity_reference_revisions', KIND_MULTI, false, 'paragraph', [], -1));
  model.addEntity(article);

  const data = model.toArray();
  const articleId = entityNodeId('node', 'article');
  const tagsId = fieldNodeId(articleId, 'field_tags');
  const sectionsId = fieldNodeId(articleId, 'field_sections');
  const edgeIds = [
    hasEdgeId(tagsId),
    refEdgeId(tagsId, entityNodeId('taxonomy_term', 'tags')),
    refEdgeId(tagsId, entityNodeId('taxonomy_term', 'topics')),
    hasEdgeId(sectionsId),
    refEdgeId(sectionsId, entityNodeId('paragraph', '*')),
  ];

  assert.deepEqual(data.nodes.map((n) => n.data.id), [articleId, tagsId, sectionsId]);
  assert.deepEqual(data.edges.map((e) => e.data.id), edgeIds);
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

test('shrinks a font size until the text fits, down to a minimum', async (t) => {
  for (const [name, measure, availableWidth, expected] of dataProviderFitFontSize()) {
    await t.test(name, () => {
      assert.equal(fitFontSize(measure, availableWidth, 16, 10), expected);
    });
  }
});

function dataProviderFitFontSize() {
  // 8px of width per pixel of font size, so 128px at 16px.
  const linear = (size) => size * 8;
  // A fixed 16px of extra spacing that does not shrink with the font.
  const tracked = (size) => size * 8 + 16;

  return [
    ['text narrower than the space', linear, 140, null],
    ['text exactly as wide as the space', linear, 128, null],
    ['text a little too wide', linear, 100, 12.5],
    ['a size rounded down to 0.01px', linear, 99, 12.37],
    ['text that shrinks to exactly the minimum', linear, 80, 10],
    ['text that would need less than the minimum', linear, 79, null],
    ['spacing that does not scale, fitted over passes', tracked, 120, 13],
    ['spacing that does not scale, near the minimum', tracked, 97, 10.12],
    ['a width that never shrinks', () => 100, 90, null],
    ['no space at all', linear, 0, null],
    ['empty text', () => 0, 90, null],
    ['an unmeasured width', () => NaN, 90, null],
  ];
}
