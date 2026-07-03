import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncReferenceElements } from '../../src/references.js';
import {
  ContentModel,
  Entity,
  Field,
  KIND_MULTI,
  KIND_SINGLE,
  entityNodeId,
  fieldNodeId,
  refEdgeId,
  proxyNodeId,
  proxyEdgeId,
  collapsedEdgeId,
} from '../../src/model.js';

// The vendored UMD build exports nothing to an ES module import and sets
// globalThis.cytoscape instead.
await import('../../assets/vendor/cytoscape.min.js');

const ARTICLE = entityNodeId('node', 'article');
const PAGE = entityNodeId('node', 'page');
const TAGS = entityNodeId('taxonomy_term', 'tags');
const TAGS_FIELD = fieldNodeId(ARTICLE, 'field_tags');
const KEYWORDS_FIELD = fieldNodeId(ARTICLE, 'field_keywords');
const PARENT_FIELD = fieldNodeId(PAGE, 'field_parent');

// An article whose tags and keywords fields both reference a vocabulary, and a
// page whose parent field references pages. Each entry of `names` replaces
// the machine name it is keyed by.
function model(names = {}) {
  const { tags = 'field_tags', vocabulary = 'tags', page = 'page' } = names;
  const article = new Entity('node', 'article', 'Article');
  article.addField(new Field(tags, 'Tags', 'entity_reference', KIND_MULTI, false, 'taxonomy_term', [vocabulary], -1));
  article.addField(new Field('field_keywords', 'Keywords', 'entity_reference', KIND_SINGLE, false, 'taxonomy_term', [vocabulary], 1));
  const parent = new Entity('node', page, 'Page');
  parent.addField(new Field('field_parent', 'Parent', 'entity_reference', KIND_SINGLE, false, 'node', [page], 1));

  const contentModel = new ContentModel();
  contentModel.addEntity(article);
  contentModel.addEntity(parent);
  contentModel.addEntity(new Entity('taxonomy_term', vocabulary, 'Tags'));

  return contentModel.toArray();
}

// A headless graph of the model's nodes and edges. The preset layout keeps
// the position each element is given.
function graphOf(data) {
  return globalThis.cytoscape({ headless: true, layout: { name: 'preset' }, elements: data.nodes.concat(data.edges) });
}

function syncedGraph() {
  const cy = graphOf(model());
  syncReferenceElements(cy);

  return cy;
}

function referenceIds(cy) {
  return cy
    .elements('[group="proxy"], [group="proxyedge"], [group="collapsed"]')
    .map((element) => element.id())
    .sort();
}

function dataOf(cy, ids) {
  return ids.map((id) => ({ ...cy.getElementById(id).data() }));
}

function deleteEntity(cy, id) {
  cy.nodes('[group="field"][entity="' + id + '"]').remove();
  cy.getElementById(id).remove();
}

test('draws a reference as a proxy, a proxy edge and a collapsed edge', () => {
  const cy = syncedGraph();
  const proxyId = proxyNodeId(TAGS_FIELD, TAGS);
  const proxyEdge = proxyEdgeId(TAGS_FIELD, TAGS);
  const collapsedEdge = collapsedEdgeId(ARTICLE, TAGS);
  const data = dataOf(cy, [proxyId, proxyEdge, collapsedEdge]);

  assert.deepEqual(data, [
    { id: proxyId, group: 'proxy', field: TAGS_FIELD, target: TAGS, entity: ARTICLE, entityType: 'taxonomy_term', label: 'Tags' },
    { id: proxyEdge, source: TAGS_FIELD, target: proxyId, group: 'proxyedge', cardinality: '1..n' },
    { id: collapsedEdge, source: ARTICLE, target: TAGS, group: 'collapsed' },
  ]);
});

test('draws 1 collapsed edge per entity and target', () => {
  const ids = syncedGraph()
    .edges('[group="collapsed"]')
    .map((edge) => edge.id());

  assert.deepEqual(ids.sort(), [collapsedEdgeId(ARTICLE, TAGS), collapsedEdgeId(PAGE, PAGE)]);
});

test('removes the reference elements of a reference that is gone', async (t) => {
  for (const [name, remove, expected] of dataProviderGoneReference()) {
    await t.test(name, () => {
      const cy = syncedGraph();
      remove(cy);
      syncReferenceElements(cy);

      assert.deepEqual(referenceIds(cy), [...expected].sort());
    });
  }
});

// The keywords field still references the tags vocabulary after the tags
// field is gone, so their collapsed edge stays.
function dataProviderGoneReference() {
  const keywords = [proxyNodeId(KEYWORDS_FIELD, TAGS), proxyEdgeId(KEYWORDS_FIELD, TAGS), collapsedEdgeId(ARTICLE, TAGS)];
  const parent = [proxyNodeId(PARENT_FIELD, PAGE), proxyEdgeId(PARENT_FIELD, PAGE), collapsedEdgeId(PAGE, PAGE)];

  return [
    ['a removed reference', (cy) => cy.getElementById(refEdgeId(TAGS_FIELD, TAGS)).remove(), [...keywords, ...parent]],
    ['a deleted field', (cy) => cy.getElementById(TAGS_FIELD).remove(), [...keywords, ...parent]],
    ['a deleted target', (cy) => cy.getElementById(TAGS).remove(), parent],
    ['a deleted entity with its fields', (cy) => deleteEntity(cy, ARTICLE), parent],
  ];
}

test('copies an edited target label or reference cardinality onto the reference elements', async (t) => {
  for (const [name, edit, id, key, expected] of dataProviderEditedReference()) {
    await t.test(name, () => {
      const cy = syncedGraph();
      edit(cy);
      syncReferenceElements(cy);

      assert.equal(cy.getElementById(id).data(key), expected);
    });
  }
});

function dataProviderEditedReference() {
  const ref = refEdgeId(TAGS_FIELD, TAGS);

  return [
    ['a relabelled target', (cy) => cy.getElementById(TAGS).data('label', 'Keywords'), proxyNodeId(TAGS_FIELD, TAGS), 'label', 'Keywords'],
    ['a changed cardinality', (cy) => cy.getElementById(ref).data('cardinality', '1..3'), proxyEdgeId(TAGS_FIELD, TAGS), 'cardinality', '1..3'],
  ];
}

test('keeps the proxy of a renamed reference where it was', async (t) => {
  for (const [name, names, renames, before, after] of dataProviderRenamedReference()) {
    await t.test(name, () => {
      const cy = syncedGraph();
      cy.getElementById(before).position({ x: 120, y: -40 });

      // A rename re-ids nodes and their edges but leaves the proxies, so the
      // model is re-added under the new names around them.
      cy.elements('[group="entity"], [group="field"]').remove();
      const renamed = model(names);
      cy.add(renamed.nodes.concat(renamed.edges));
      const unplaced = syncReferenceElements(cy, renames);

      assert.equal(cy.getElementById(before).empty(), true);
      assert.deepEqual(cy.getElementById(after).position(), { x: 120, y: -40 });
      assert.equal(unplaced.length, 0);
    });
  }
});

function dataProviderRenamedReference() {
  const topicsField = fieldNodeId(ARTICLE, 'field_topics');
  const keywords = entityNodeId('taxonomy_term', 'keywords');
  const leaf = entityNodeId('node', 'leaf');
  const leafParentField = fieldNodeId(leaf, 'field_parent');
  const tagsProxy = proxyNodeId(TAGS_FIELD, TAGS);
  const parentProxy = proxyNodeId(PARENT_FIELD, PAGE);
  const leafParentProxy = proxyNodeId(leafParentField, leaf);

  return [
    ['a renamed field', { tags: 'field_topics' }, { [TAGS_FIELD]: topicsField }, tagsProxy, proxyNodeId(topicsField, TAGS)],
    ['a renamed target', { vocabulary: 'keywords' }, { [TAGS]: keywords }, tagsProxy, proxyNodeId(TAGS_FIELD, keywords)],
    ['a renamed self-referencing entity', { page: 'leaf' }, { [PAGE]: leaf, [PARENT_FIELD]: leafParentField }, parentProxy, leafParentProxy],
  ];
}

test('returns the proxies it adds without a position', () => {
  const cy = graphOf(model());
  const added = syncReferenceElements(cy).map((proxy) => proxy.id());

  assert.deepEqual(added.sort(), [proxyNodeId(KEYWORDS_FIELD, TAGS), proxyNodeId(TAGS_FIELD, TAGS), proxyNodeId(PARENT_FIELD, PAGE)]);

  cy.add({ group: 'edges', data: { id: refEdgeId(PARENT_FIELD, TAGS), source: PARENT_FIELD, target: TAGS, group: 'ref', cardinality: '1' } });
  const next = syncReferenceElements(cy).map((proxy) => proxy.id());

  assert.deepEqual(next, [proxyNodeId(PARENT_FIELD, TAGS)]);
});

test('leaves a graph whose reference elements are in sync unchanged', () => {
  const cy = syncedGraph();
  const before = cy.json().elements;
  let changes = 0;
  cy.on('add remove data', () => {
    changes += 1;
  });

  assert.equal(syncReferenceElements(cy).length, 0);
  assert.equal(changes, 0);
  assert.deepEqual(cy.json().elements, before);
});

test('labels the proxy of a target without a label with the target id', () => {
  const cy = graphOf(model());
  cy.getElementById(TAGS).removeData('label');
  syncReferenceElements(cy);

  assert.equal(cy.getElementById(proxyNodeId(TAGS_FIELD, TAGS)).data('label'), TAGS);
});

test('draws a proxy but no collapsed edge for a field whose entity is missing', () => {
  const cy = graphOf(model());
  cy.getElementById(ARTICLE).remove();
  syncReferenceElements(cy);

  assert.equal(cy.getElementById(proxyNodeId(TAGS_FIELD, TAGS)).nonempty(), true);
  assert.equal(cy.getElementById(collapsedEdgeId(ARTICLE, TAGS)).empty(), true);
});
