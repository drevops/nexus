import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOVER_DEFAULTS, HOVER_DELAY, hoverNeighbourhood, readHoverSettings } from '../../src/hover-highlight.js';
import { syncReferenceElements } from '../../src/references.js';
import {
  ContentModel,
  Entity,
  Field,
  KIND_MULTI,
  KIND_SINGLE,
  collapsedEdgeId,
  entityNodeId,
  fieldNodeId,
  hasEdgeId,
  proxyEdgeId,
  proxyNodeId,
  refEdgeId,
} from '../../src/model.js';

// The vendored UMD build exports nothing to an ES module import and sets
// globalThis.cytoscape instead.
await import('../../assets/vendor/cytoscape.min.js');

const ARTICLE = entityNodeId('node', 'article');
const PAGE = entityNodeId('node', 'page');
const TAGS = entityNodeId('taxonomy_term', 'tags');
const TAGS_FIELD = fieldNodeId(ARTICLE, 'field_tags');
const BODY_FIELD = fieldNodeId(ARTICLE, 'field_body');
const RELATED_FIELD = fieldNodeId(ARTICLE, 'field_related');
const PARENT_FIELD = fieldNodeId(PAGE, 'field_parent');
const NAME_FIELD = fieldNodeId(TAGS, 'field_name');
const NOTE = 'annotation:note';

// The elements that draw a reference from a field to a target.
function reference(field, entity, target) {
  return [
    field,
    entity,
    hasEdgeId(field),
    refEdgeId(field, target),
    target,
    proxyNodeId(field, target),
    proxyEdgeId(field, target),
    collapsedEdgeId(entity, target),
  ];
}

// An article that references a vocabulary and pages, a page that references
// pages, a vocabulary with a plain field and a note on the article.
function graph() {
  const article = new Entity('node', 'article', 'Article');
  article.addField(new Field('field_tags', 'Tags', 'entity_reference', KIND_MULTI, false, 'taxonomy_term', ['tags'], -1));
  article.addField(new Field('field_body', 'Body', 'text_long', KIND_SINGLE, false, null, [], 1));
  article.addField(new Field('field_related', 'Related', 'entity_reference', KIND_SINGLE, false, 'node', ['page'], 1));
  const page = new Entity('node', 'page', 'Page');
  page.addField(new Field('field_parent', 'Parent', 'entity_reference', KIND_SINGLE, false, 'node', ['page'], 1));
  const tags = new Entity('taxonomy_term', 'tags', 'Tags');
  tags.addField(new Field('field_name', 'Name', 'string', KIND_SINGLE, false, null, [], 1));

  const contentModel = new ContentModel();
  contentModel.addEntity(article);
  contentModel.addEntity(page);
  contentModel.addEntity(tags);

  const data = contentModel.toArray();
  const note = { data: { id: NOTE, group: 'annotation', kind: 'note', label: 'Note' } };
  const noteEdge = { data: { id: 'annotation-edge:note', source: NOTE, target: ARTICLE, group: 'annotation' } };
  const cy = globalThis.cytoscape({ headless: true, layout: { name: 'preset' }, elements: data.nodes.concat(data.edges, [note, noteEdge]) });

  syncReferenceElements(cy);

  return cy;
}

function litIds(id) {
  const cy = graph();

  return hoverNeighbourhood(cy.getElementById(id))
    .map((element) => element.id())
    .sort();
}

function sorted(ids) {
  return [...new Set(ids)].sort();
}

test('waits a moment before the highlight', () => {
  assert.ok(HOVER_DELAY > 0 && HOVER_DELAY <= 500);
});

test('lights an entity, its fields and the references from them', () => {
  const expected = [ARTICLE, BODY_FIELD, hasEdgeId(BODY_FIELD), ...reference(TAGS_FIELD, ARTICLE, TAGS), ...reference(RELATED_FIELD, ARTICLE, PAGE)];

  assert.deepEqual(litIds(ARTICLE), sorted(expected));
});

test('lights the references to an entity with the fields and entities they start from', () => {
  const expected = [TAGS, NAME_FIELD, hasEdgeId(NAME_FIELD), ...reference(TAGS_FIELD, ARTICLE, TAGS)];

  assert.deepEqual(litIds(TAGS), sorted(expected));
});

test('lights a reference an entity makes to itself once', () => {
  const expected = [PAGE, ...reference(PARENT_FIELD, PAGE, PAGE), ...reference(RELATED_FIELD, ARTICLE, PAGE)];

  assert.deepEqual(litIds(PAGE), sorted(expected));
});

test('lights a field, its entity and its own references', () => {
  assert.deepEqual(litIds(TAGS_FIELD), sorted(reference(TAGS_FIELD, ARTICLE, TAGS)));
});

test('lights a field without references with its entity', () => {
  assert.deepEqual(litIds(BODY_FIELD), sorted([BODY_FIELD, ARTICLE, hasEdgeId(BODY_FIELD)]));
});

test('lights the 1 reference a proxy draws', () => {
  assert.deepEqual(litIds(proxyNodeId(RELATED_FIELD, PAGE)), sorted(reference(RELATED_FIELD, ARTICLE, PAGE)));
});

test('lights nothing for an annotation', () => {
  assert.deepEqual(litIds(NOTE), []);
});

test('lights a reference without its proxy before the reference elements exist', () => {
  const cy = graph();
  cy.elements('[group="proxy"], [group="proxyedge"], [group="collapsed"]').remove();

  const lit = hoverNeighbourhood(cy.getElementById(TAGS_FIELD))
    .map((element) => element.id())
    .sort();

  assert.deepEqual(lit, sorted([TAGS_FIELD, ARTICLE, hasEdgeId(TAGS_FIELD), refEdgeId(TAGS_FIELD, TAGS), TAGS]));
});

test('reads hover settings', async (t) => {
  for (const [name, saved, expected] of dataProviderHoverSettings()) {
    await t.test(name, () => {
      assert.deepEqual(readHoverSettings(saved), expected);
    });
  }
});

function dataProviderHoverSettings() {
  return [
    ['missing settings', undefined, { enabled: true }],
    ['null', null, { enabled: true }],
    ['a string', 'off', { enabled: true }],
    ['an empty object', {}, { enabled: true }],
    ['enabled', { enabled: true }, { enabled: true }],
    ['disabled', { enabled: false }, { enabled: false }],
    ['a string flag', { enabled: 'false' }, { enabled: true }],
    ['a number flag', { enabled: 0 }, { enabled: true }],
    ['an inherited flag', Object.create({ enabled: false }), { enabled: true }],
    ['an unknown key', { enabled: false, delay: 10 }, { enabled: false }],
  ];
}

test('keeps the defaults frozen', () => {
  assert.deepEqual(HOVER_DEFAULTS, { enabled: true });
  assert.ok(Object.isFrozen(HOVER_DEFAULTS));
});
