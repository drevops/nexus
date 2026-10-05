import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History, applyPartial, composeChanges, describeNode, diffSnapshots, snapshotGraph } from '../../src/history.js';
import { syncReferenceElements } from '../../src/references.js';
import { applyAnnotations } from '../../src/annotations.js';
import { ContentModel, Entity, Field, KIND_MULTI, KIND_SINGLE, entityNodeId, fieldNodeId, hasEdgeId, refEdgeId, proxyNodeId } from '../../src/model.js';

// The vendored UMD build exports nothing to an ES module import and sets
// globalThis.cytoscape instead.
await import('../../assets/vendor/cytoscape.min.js');

const ARTICLE = entityNodeId('node', 'article');
const TAGS = entityNodeId('taxonomy_term', 'tags');
const TOPICS = entityNodeId('taxonomy_term', 'topics');
const PAGE = entityNodeId('node', 'page');
const TAGS_FIELD = fieldNodeId(ARTICLE, 'field_tags');
const BODY_FIELD = fieldNodeId(ARTICLE, 'body');
const TAGS_REF = refEdgeId(TAGS_FIELD, TAGS);
const TAGS_PROXY = proxyNodeId(TAGS_FIELD, TAGS);
const SYNC = 'sync';
const SYNC_EDGE = 'a0';

const POSITIONS = {
  [ARTICLE]: { x: 0, y: 0 },
  [TAGS_FIELD]: { x: 150, y: -40 },
  [BODY_FIELD]: { x: 150, y: 40 },
  [TAGS]: { x: 450, y: -40 },
  [SYNC]: { x: -200, y: 0 },
};

const PROXY_POSITION = { x: 300, y: -40 };

// A headless graph of an article whose tags field references a vocabulary,
// and a Sync API annotation attached to the article. The reference is drawn
// with its proxy, as the app draws it.
function graph() {
  const article = new Entity('node', 'article', 'Article');
  article.addField(new Field('field_tags', 'Tags', 'entity_reference', KIND_MULTI, false, 'taxonomy_term', ['tags'], -1));
  article.addField(new Field('body', 'Body', 'text_long', KIND_SINGLE));

  const model = new ContentModel('Blog');
  model.addEntity(article);
  model.addEntity(new Entity('taxonomy_term', 'tags', 'Tags'));
  applyAnnotations(model, { nodes: [{ id: SYNC, kind: 'api', label: 'Sync API', attach: ARTICLE }] });

  const data = model.toArray();
  const nodes = data.nodes.map((node) => ({ ...node, position: { ...POSITIONS[node.data.id] } }));
  const cy = globalThis.cytoscape({ headless: true, layout: { name: 'preset' }, elements: nodes.concat(data.edges) });

  syncReferenceElements(cy);
  cy.getElementById(TAGS_PROXY).position({ ...PROXY_POSITION });

  return cy;
}

// The data of the proxies, proxy edges and collapsed edges, sorted by id.
function referenceData(cy) {
  return cy
    .elements('[group="proxy"], [group="proxyedge"], [group="collapsed"]')
    .map((element) => ({ ...element.data() }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Edits made the way the builder and the inspector make them.

function relabelArticle(cy) {
  cy.getElementById(ARTICLE).data('label', 'Post');
}

function moveBody(cy) {
  cy.getElementById(BODY_FIELD).position({ x: 180, y: 90 });
}

function moveProxy(cy) {
  cy.getElementById(TAGS_PROXY).position({ x: 320, y: -80 });
}

function addPage(cy) {
  cy.add({ group: 'nodes', data: { id: PAGE, group: 'entity', entityType: 'node', bundle: 'page', label: 'Page', note: '' }, position: { x: 0, y: 200 } });
}

function addBodyReference(cy) {
  cy.add({ group: 'edges', data: { id: refEdgeId(BODY_FIELD, TAGS), source: BODY_FIELD, target: TAGS, group: 'ref', cardinality: '1' } });
  syncReferenceElements(cy).position({ x: 300, y: 40 });
}

function removeTagsReference(cy) {
  cy.getElementById(TAGS_REF).remove();
  syncReferenceElements(cy);
}

function deleteArticle(cy) {
  cy.nodes('[group="field"][entity="' + ARTICLE + '"]').remove();
  cy.getElementById(ARTICLE).remove();
  syncReferenceElements(cy);
}

// Re-ids the vocabulary with the ref edges that target it and re-points its
// annotation edges, as a machine-name rename does.
function renameTags(cy) {
  const tags = cy.getElementById(TAGS);
  cy.add({ group: 'nodes', data: { ...tags.data(), id: TOPICS, bundle: 'topics' }, position: { ...tags.position() } });

  tags.connectedEdges('[group="annotation"]').forEach((edge) => {
    const data = { ...edge.data() };
    edge.remove();
    cy.add({ group: 'edges', data: { ...data, source: data.source === TAGS ? TOPICS : data.source, target: data.target === TAGS ? TOPICS : data.target } });
  });

  tags.incomers('edge[group="ref"]').forEach((edge) => {
    cy.add({ group: 'edges', data: { ...edge.data(), id: refEdgeId(edge.source().id(), TOPICS), target: TOPICS } });
  });

  tags.remove();
  syncReferenceElements(cy, { [TAGS]: TOPICS });
}

function changeCardinality(cy) {
  cy.getElementById(TAGS_FIELD).data({ cardinality: 3, kind: KIND_MULTI });
  cy.getElementById(TAGS_REF).data('cardinality', '1..3');
  syncReferenceElements(cy);
}

function addMethod(cy) {
  cy.getElementById(SYNC).data('method', 'POST');
}

function addNote(cy) {
  cy.getElementById(TAGS_FIELD).data('note', 'Up to 3 tags.');
}

// Re-points the annotation edge under its own id, as a rename of its end
// does.
function repointAnnotationEdge(cy) {
  const data = { ...cy.getElementById(SYNC_EDGE).data() };
  cy.getElementById(SYNC_EDGE).remove();
  cy.add({ group: 'edges', data: { ...data, source: TAGS } });
}

// Each edit also applies to the graph the edits before it leave, so the list
// doubles as 1 editing session.
function dataProviderEdits() {
  return [
    ['a relabelled entity', relabelArticle],
    ['a moved field', moveBody],
    ['a moved proxy', moveProxy],
    ['an added entity', addPage],
    ['an added reference and its proxy', addBodyReference],
    ['a changed cardinality', changeCardinality],
    ['an added annotation method', addMethod],
    ['an added field note', addNote],
    ['a removed reference and its proxy', removeTagsReference],
    ['a re-pointed annotation edge', repointAnnotationEdge],
    ['a renamed reference target', renameTags],
    ['a deleted entity with its fields, references and annotation edge', deleteArticle],
  ];
}

// A history over a headless graph and a title. The clock ticks once per
// reading, and `applies` counts the partials applied.
function historyOf(cy, options = {}) {
  const state = { title: 'Blog', applies: 0, clock: 0 };
  const history = new History(
    {
      snapshot: () => snapshotGraph(cy, state.title),
      apply: (partial) => {
        state.applies += 1;
        applyPartial(cy, partial, syncReferenceElements);

        if ('title' in partial) {
          state.title = partial.title;
        }
      },
    },
    { now: () => ++state.clock, ...options },
  );

  return { history, state };
}

function labels(history) {
  return history.versions().map((version) => version.label);
}

test('names a node by its group and its label', async (t) => {
  for (const [name, prepare, expected] of dataProviderDescribeNode()) {
    await t.test(name, () => {
      const cy = graph();

      assert.equal(describeNode(prepare(cy)), expected);
    });
  }
});

function dataProviderDescribeNode() {
  return [
    ['an entity', (cy) => cy.getElementById(ARTICLE), 'entity “Article”'],
    ['a field', (cy) => cy.getElementById(TAGS_FIELD), 'field “Tags”'],
    ['an annotation', (cy) => cy.getElementById(SYNC), 'annotation “Sync API”'],
    ['a proxy', (cy) => cy.getElementById(TAGS_PROXY), 'proxy “Tags”'],
    ['a node without a label', (cy) => cy.getElementById(TAGS).removeData('label'), 'entity “' + TAGS + '”'],
    ['a node of another group', (cy) => cy.add({ group: 'nodes', data: { id: '__ghost__' } }), 'node “__ghost__”'],
  ];
}

test('snapshots the model elements and the positions of model nodes and proxies', () => {
  const cy = graph();
  // The ghost elements a connect drag draws.
  cy.add([
    { group: 'nodes', data: { id: '__ghost__' }, position: { x: 5, y: 5 } },
    { group: 'edges', data: { id: '__ghostedge__', source: TAGS_FIELD, target: '__ghost__' } },
  ]);

  const snapshot = snapshotGraph(cy, 'Blog');

  assert.equal(snapshot.title, 'Blog');
  assert.deepEqual(
    Object.keys(snapshot.elements).sort(),
    [ARTICLE, TAGS_FIELD, BODY_FIELD, TAGS, SYNC, hasEdgeId(TAGS_FIELD), hasEdgeId(BODY_FIELD), TAGS_REF, SYNC_EDGE].sort(),
  );
  assert.deepEqual(snapshot.elements[ARTICLE], {
    group: 'nodes',
    data: { id: ARTICLE, group: 'entity', entityType: 'node', bundle: 'article', label: 'Article', note: '' },
  });
  assert.deepEqual(snapshot.elements[TAGS_REF], {
    group: 'edges',
    data: { id: TAGS_REF, source: TAGS_FIELD, target: TAGS, group: 'ref', cardinality: '1..n' },
  });
  assert.deepEqual(snapshot.positions, { ...POSITIONS, [TAGS_PROXY]: PROXY_POSITION });
});

test('keeps a snapshot as it was while the graph is edited', () => {
  const cy = graph();
  const snapshot = snapshotGraph(cy, 'Blog');
  const copy = structuredClone(snapshot);

  relabelArticle(cy);
  cy.getElementById(ARTICLE).position().x = 999;

  assert.deepEqual(snapshot, copy);
});

test('leaves data keys holding undefined out of a snapshot', () => {
  const cy = graph();
  cy.add({ group: 'nodes', data: { id: PAGE, group: 'entity', label: 'Page', note: undefined } });

  assert.deepEqual(snapshotGraph(cy, 'Blog').elements[PAGE].data, { id: PAGE, group: 'entity', label: 'Page' });
});

test('finds no change between snapshots of the same state', () => {
  const cy = graph();

  assert.equal(diffSnapshots(snapshotGraph(cy, 'Blog'), snapshotGraph(cy, 'Blog')), null);
});

test('holds only what an edit changed, on both sides of the change', async (t) => {
  for (const [name, edit, title, expected] of dataProviderChangedIds()) {
    await t.test(name, () => {
      const cy = graph();
      const before = snapshotGraph(cy, 'Blog');
      edit(cy);
      const change = diffSnapshots(before, snapshotGraph(cy, title));

      for (const side of [change.before, change.after]) {
        assert.deepEqual({ elements: Object.keys(side.elements).sort(), positions: Object.keys(side.positions).sort(), title: 'title' in side }, expected);
      }
    });
  }
});

// Each case edits the graph, then snapshots it under the given title.
function dataProviderChangedIds() {
  return [
    ['a relabelled entity', relabelArticle, 'Blog', { elements: [ARTICLE], positions: [], title: false }],
    ['a moved field', moveBody, 'Blog', { elements: [], positions: [BODY_FIELD], title: false }],
    ['a moved proxy', moveProxy, 'Blog', { elements: [], positions: [TAGS_PROXY], title: false }],
    ['an added entity', addPage, 'Blog', { elements: [PAGE], positions: [PAGE], title: false }],
    ['a removed reference and its proxy', removeTagsReference, 'Blog', { elements: [TAGS_REF], positions: [TAGS_PROXY], title: false }],
    ['a renamed diagram', () => {}, 'Notes', { elements: [], positions: [], title: true }],
  ];
}

test('puts null on the side of a change where an element is missing', () => {
  const cy = graph();
  const before = snapshotGraph(cy, 'Blog');
  addPage(cy);
  const after = snapshotGraph(cy, 'Blog');
  const change = diffSnapshots(before, after);

  assert.equal(change.before.elements[PAGE], null);
  assert.equal(change.before.positions[PAGE], null);
  assert.deepEqual(change.after.elements[PAGE], after.elements[PAGE]);
  assert.deepEqual(change.after.positions[PAGE], { x: 0, y: 200 });
});

test('joins 2 changes in a row into the change they make together', () => {
  const cy = graph();
  const first = snapshotGraph(cy, 'Blog');
  cy.getElementById(ARTICLE).data('label', 'P');
  const second = snapshotGraph(cy, 'Notes');
  relabelArticle(cy);
  moveBody(cy);
  const third = snapshotGraph(cy, 'Notes');

  assert.deepEqual(composeChanges(diffSnapshots(first, second), diffSnapshots(second, third)), diffSnapshots(first, third));
});

test('finds no change in 2 changes when the second reverts the first', async (t) => {
  for (const [name, edit, revert, titles] of dataProviderRevertedChanges()) {
    await t.test(name, () => {
      const cy = graph();
      const first = snapshotGraph(cy, titles[0]);
      edit(cy);
      const second = snapshotGraph(cy, titles[1]);
      revert(cy);
      const third = snapshotGraph(cy, titles[2]);

      assert.equal(composeChanges(diffSnapshots(first, second), diffSnapshots(second, third)), null);
    });
  }
});

// Each case edits the graph and reverts the edit, snapshotting it under the
// given titles before, between and after.
function dataProviderRevertedChanges() {
  return [
    [
      'a relabel and its reverse',
      relabelArticle,
      (cy) => {
        cy.getElementById(ARTICLE).data('label', 'Article');
      },
      ['Blog', 'Blog', 'Blog'],
    ],
    [
      'a move and its reverse',
      moveBody,
      (cy) => {
        cy.getElementById(BODY_FIELD).position({ ...POSITIONS[BODY_FIELD] });
      },
      ['Blog', 'Blog', 'Blog'],
    ],
    ['a renamed diagram and its reverse', () => {}, () => {}, ['Blog', 'Notes', 'Blog']],
  ];
}

test('brings a graph to either side of a change', async (t) => {
  for (const [name, edit] of dataProviderEdits()) {
    await t.test(name, () => {
      const cy = graph();
      const before = snapshotGraph(cy, 'Blog');
      const referencesBefore = referenceData(cy);
      edit(cy);
      const after = snapshotGraph(cy, 'Blog');
      const referencesAfter = referenceData(cy);
      const change = diffSnapshots(before, after);

      applyPartial(cy, change.before, syncReferenceElements);
      assert.deepEqual(snapshotGraph(cy, 'Blog'), before);
      assert.deepEqual(referenceData(cy), referencesBefore);

      applyPartial(cy, change.after, syncReferenceElements);
      assert.deepEqual(snapshotGraph(cy, 'Blog'), after);
      assert.deepEqual(referenceData(cy), referencesAfter);
    });
  }
});

test('leaves out a restored edge whose end is missing', () => {
  const cy = graph();
  const edge = { group: 'edges', data: { id: 'ref:missing', source: 'field:node.missing:field_x', target: TAGS, group: 'ref', cardinality: '1' } };

  applyPartial(cy, { elements: { 'ref:missing': edge }, positions: {} }, syncReferenceElements);

  assert.equal(cy.getElementById('ref:missing').empty(), true);
});

test('records an edit as a step that undoes and redoes', () => {
  const cy = graph();
  const { history } = historyOf(cy);
  history.reset('Opened');
  const opened = snapshotGraph(cy, 'Blog');
  relabelArticle(cy);
  const relabelled = snapshotGraph(cy, 'Blog');

  assert.equal(history.record('Relabelled'), true);
  assert.equal(history.undo(), true);
  assert.deepEqual(snapshotGraph(cy, 'Blog'), opened);
  assert.equal(history.undo(), false);
  assert.equal(history.redo(), true);
  assert.deepEqual(snapshotGraph(cy, 'Blog'), relabelled);
  assert.equal(history.redo(), false);
});

test('lists each version with its label and the time it was made', () => {
  const cy = graph();
  const { history } = historyOf(cy);
  history.reset('Opened');
  relabelArticle(cy);
  history.record('Relabelled');
  moveBody(cy);
  history.record('Moved');

  assert.deepEqual(history.versions(), [
    { label: 'Opened', time: 1 },
    { label: 'Relabelled', time: 2 },
    { label: 'Moved', time: 3 },
  ]);
  assert.equal(history.index, 2);
});

test('stamps each version with the current time by default', () => {
  const history = new History({ snapshot: () => snapshotGraph(graph(), 'Blog'), apply: () => {} });
  const start = Date.now();
  history.reset('Opened');
  const { time } = history.versions()[0];

  assert.ok(time >= start && time <= Date.now());
});

test('records nothing for an unchanged graph or before it is reset', () => {
  const cy = graph();
  const { history } = historyOf(cy);

  relabelArticle(cy);
  assert.equal(history.record('Relabelled'), false);
  history.rebase();
  assert.equal(history.goTo(0), false);
  assert.deepEqual(history.versions(), []);

  history.reset('Opened');
  assert.equal(history.record('Nothing'), false);
  assert.deepEqual(labels(history), ['Opened']);
});

test('drops the undone steps when an edit follows them', () => {
  const cy = graph();
  const { history } = historyOf(cy);
  history.reset('Opened');
  relabelArticle(cy);
  history.record('Relabelled');
  moveBody(cy);
  history.record('Moved');
  history.undo();
  addPage(cy);
  history.record('Added');

  assert.deepEqual(labels(history), ['Opened', 'Relabelled', 'Added']);
  assert.equal(history.redo(), false);
  assert.deepEqual(cy.getElementById(BODY_FIELD).position(), POSITIONS[BODY_FIELD]);
});

test('joins records with the same coalesce key into 1 step', () => {
  const cy = graph();
  const { history } = historyOf(cy);
  history.reset('Opened');

  for (const label of ['P', 'Po', 'Post']) {
    cy.getElementById(ARTICLE).data('label', label);
    history.record('Relabelled “' + label + '”', 'label');
  }

  assert.deepEqual(history.versions(), [
    { label: 'Opened', time: 1 },
    { label: 'Relabelled “Post”', time: 4 },
  ]);

  history.undo();
  assert.equal(cy.getElementById(ARTICLE).data('label'), 'Article');
});

test('starts a new step for the same key after another record, a jump or a rebase', async (t) => {
  for (const [name, between, expected] of dataProviderCoalescingEnds()) {
    await t.test(name, () => {
      const cy = graph();
      const { history } = historyOf(cy);
      history.reset('Opened');
      cy.getElementById(ARTICLE).data('label', 'P');
      history.record('Relabelled', 'label');
      between(history, cy);
      cy.getElementById(ARTICLE).data('label', 'Post');
      history.record('Relabelled', 'label');

      assert.deepEqual(labels(history), expected);
    });
  }
});

function dataProviderCoalescingEnds() {
  const moved = ['Opened', 'Relabelled', 'Moved', 'Relabelled'];

  return [
    [
      'a record with another key',
      (history, cy) => {
        moveBody(cy);
        history.record('Moved', 'move');
      },
      moved,
    ],
    [
      'a record without a key',
      (history, cy) => {
        moveBody(cy);
        history.record('Moved');
      },
      moved,
    ],
    [
      'an undo and a redo',
      (history) => {
        history.undo();
        history.redo();
      },
      ['Opened', 'Relabelled', 'Relabelled'],
    ],
    [
      'a rebase',
      (history, cy) => {
        moveBody(cy);
        history.rebase();
      },
      ['Opened', 'Relabelled', 'Relabelled'],
    ],
  ];
}

test('removes a joined step whose edits cancel out', () => {
  const cy = graph();
  const { history } = historyOf(cy);
  history.reset('Opened');
  cy.getElementById(ARTICLE).data('label', 'P');
  history.record('Relabelled', 'label');
  cy.getElementById(ARTICLE).data('label', 'Article');

  assert.equal(history.record('Relabelled', 'label'), true);
  assert.deepEqual(labels(history), ['Opened']);
  assert.equal(history.undo(), false);

  cy.getElementById(ARTICLE).data('label', 'Post');
  history.record('Relabelled', 'label');
  assert.deepEqual(labels(history), ['Opened', 'Relabelled']);
});

test('leaves the changes made before a rebase out of the next step', () => {
  const cy = graph();
  const { history } = historyOf(cy);
  history.reset('Opened');
  moveBody(cy);
  history.rebase();
  relabelArticle(cy);
  history.record('Relabelled');
  history.undo();

  assert.equal(cy.getElementById(ARTICLE).data('label'), 'Article');
  assert.deepEqual(cy.getElementById(BODY_FIELD).position(), { x: 180, y: 90 });
});

test('keeps the latest steps up to its limit, the oldest kept one as version 0', () => {
  const cy = graph();
  const { history } = historyOf(cy, { limit: 2 });
  history.reset('Opened');

  for (const label of ['One', 'Two', 'Three']) {
    cy.getElementById(ARTICLE).data('label', label);
    history.record(label);
  }

  assert.deepEqual(labels(history), ['One', 'Two', 'Three']);
  assert.equal(history.undo(), true);
  assert.equal(history.undo(), true);
  assert.equal(cy.getElementById(ARTICLE).data('label'), 'One');
  assert.equal(history.undo(), false);
});

test('jumps between any 2 versions of an editing session in 1 apply each', () => {
  const cy = graph();
  const { history, state } = historyOf(cy);
  history.reset('Opened');
  const snapshots = [snapshotGraph(cy, 'Blog')];
  const references = [referenceData(cy)];

  for (const [name, edit] of dataProviderEdits()) {
    edit(cy);
    assert.equal(history.record(name), true, name);
    snapshots.push(snapshotGraph(cy, 'Blog'));
    references.push(referenceData(cy));
  }

  state.title = 'Notes';
  history.record('Renamed the diagram');
  snapshots.push(snapshotGraph(cy, 'Notes'));
  references.push(referenceData(cy));
  state.applies = 0;
  const route = [0, snapshots.length - 1, 4, 3, 9, 1, 12, 6, 0, 7];

  for (const index of route) {
    assert.equal(history.goTo(index), true, 'jump to ' + index);
    assert.deepEqual(snapshotGraph(cy, state.title), snapshots[index], 'version ' + index);
    assert.deepEqual(referenceData(cy), references[index], 'references of version ' + index);
  }

  assert.equal(state.applies, route.length);
  assert.equal(history.goTo(7), false);
  assert.equal(history.goTo(-1), false);
  assert.equal(history.goTo(snapshots.length), false);
});

test('keeps its stored versions as they were while a restored graph is edited', () => {
  const cy = graph();
  const { history } = historyOf(cy);
  history.reset('Opened');
  const opened = snapshotGraph(cy, 'Blog');
  deleteArticle(cy);
  history.record('Deleted');
  history.undo();

  // Edits the data and position objects Cytoscape holds for the restored
  // nodes, bypassing the history.
  cy.getElementById(ARTICLE).data().label = 'Changed';
  cy.getElementById(TAGS_REF).data().cardinality = '1..9';
  cy.getElementById(ARTICLE).position().x = 999;
  cy.getElementById(TAGS_PROXY).position().y = 999;
  history.redo();
  history.undo();

  assert.deepEqual(snapshotGraph(cy, 'Blog'), opened);
});
