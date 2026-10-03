import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentFromGraph, documentToModel } from '../../src/document.js';
import { DEFAULT_TITLE } from '../../src/model.js';

// The vendored UMD build exports nothing to an ES module import and sets
// globalThis.cytoscape instead.
await import('../../assets/vendor/cytoscape.min.js');

const DOC = {
  nexus: 1,
  title: 'My model',
  colors: { paragraph: '#112233' },
  entities: [
    {
      entityType: 'node',
      bundle: 'article',
      label: 'Article',
      fields: [
        {
          name: 'field_tags',
          label: 'Tags',
          fieldType: 'entity_reference',
          kind: 'multi',
          required: false,
          targetType: 'taxonomy_term',
          targetBundles: ['tags'],
        },
      ],
    },
    { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', fields: [] },
  ],
  annotations: { nodes: [{ id: 'api1', kind: 'api', label: 'API' }], edges: [{ from: 'api1', to: 'node.article', label: 'calls' }] },
  layout: { 'node.article': { x: 10, y: 20 } },
};

// Holds every key documentFromGraph() writes, in the form it writes them.
const SAVED_DOC = {
  nexus: 1,
  title: 'Saved model',
  colors: { node: '#112233' },
  symbols: { node: 'diamond' },
  customTypes: [{ type: 'gadget', label: 'Gadget' }],
  entities: [
    {
      entityType: 'node',
      bundle: 'article',
      label: 'Article',
      note: 'Long-form content.',
      fields: [
        {
          name: 'field_tags',
          label: 'Tags',
          fieldType: 'entity_reference',
          kind: 'multi',
          cardinality: 3,
          required: true,
          note: 'Up to 3 tags.',
          targetType: 'taxonomy_term',
          targetBundles: ['tags'],
        },
        {
          name: 'field_media',
          label: 'Media',
          fieldType: 'entity_reference',
          kind: 'single',
          cardinality: 1,
          required: false,
          note: '',
          targetType: 'media',
          targetBundles: [],
        },
      ],
    },
    { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', note: '', fields: [] },
    { entityType: 'media', bundle: '*', label: 'Any Media', note: '', fields: [] },
  ],
  annotations: {
    nodes: [
      { id: 'sync', kind: 'api', label: 'Sync API', note: 'Runs nightly.' },
      { id: 'publish', kind: 'callback', label: 'Publish', method: 'POST' },
    ],
    edges: [{ from: 'sync', to: 'node.article', label: 'fills' }],
  },
  layout: {
    'node.article': { x: 0, y: 0 },
    'field:node.article:field_tags': { x: 200, y: -40 },
    'field:node.article:field_media': { x: 200, y: 40 },
    'taxonomy_term.tags': { x: 400, y: -40 },
    'media.*': { x: 400, y: 40 },
    sync: { x: -200, y: 0 },
    publish: { x: -200, y: 100 },
  },
  ui: { panels: { legend: { open: true, dock: null, pos: { right: 16, bottom: 16 }, height: 260 } }, dockWidth: { left: 320, right: 340 } },
};

// Saves a headless graph of the elements. The preset layout keeps their
// positions, and styleEnabled lets visible() see the .hidden class.
function saveGraph(elements, meta) {
  const cy = globalThis.cytoscape({
    headless: true,
    styleEnabled: true,
    layout: { name: 'preset' },
    style: [{ selector: '.hidden', style: { display: 'none' } }],
    elements: elements,
  });

  // A styled instance that is never destroyed keeps the process from exiting.
  try {
    return documentFromGraph(cy, meta);
  } finally {
    cy.destroy();
  }
}

test('rebuilds a model from a Nexus document', () => {
  const { modelData, layout, colors } = documentToModel(DOC);

  assert.equal(modelData.meta.title, 'My model');
  assert.equal(modelData.meta.entityCount, 2);

  const ids = modelData.nodes.map((n) => n.data.id);
  assert.ok(ids.includes('node.article'));
  assert.ok(ids.includes('field:node.article:field_tags'));
  assert.ok(ids.includes('api1'));

  const ref = modelData.edges.find((e) => e.data.group === 'ref');
  assert.equal(ref.data.target, 'taxonomy_term.tags');
  assert.equal(ref.data.cardinality, '1..n');

  assert.deepEqual(layout, { 'node.article': { x: 10, y: 20 } });
  assert.equal(colors.paragraph, '#112233');
});

test('opens a document without a text title under the default title', async (t) => {
  for (const [name, title] of dataProviderUntitledDocument()) {
    await t.test(name, () => {
      assert.equal(documentToModel({ ...DOC, title: title }).modelData.meta.title, DEFAULT_TITLE);
    });
  }
});

function dataProviderUntitledDocument() {
  return [
    ['a missing title', undefined],
    ['a null title', null],
    ['a numeric title', 42],
  ];
}

test('opens a document without valid settings under the default settings', async (t) => {
  for (const [name, doc] of dataProviderDocumentSettings()) {
    await t.test(name, () => {
      const { layout, colors, symbols, customTypes, ui } = documentToModel(doc);

      assert.deepEqual({ layout, colors, symbols, customTypes, ui }, { layout: {}, colors: {}, symbols: {}, customTypes: [], ui: null });
    });
  }
});

function dataProviderDocumentSettings() {
  return [
    ['missing settings', { entities: [] }],
    ['null settings', { entities: [], layout: null, colors: null, symbols: null, customTypes: null, ui: null }],
    ['settings of the wrong type', { entities: [], layout: 'grid', colors: 7, symbols: 'diamond', customTypes: {}, ui: 'docked' }],
  ];
}

test('reads a field cardinality or derives a missing one from its kind', async (t) => {
  for (const [name, field, cardinality] of dataProviderFieldCardinality()) {
    await t.test(name, () => {
      const { modelData } = documentToModel({ entities: [{ entityType: 'node', bundle: 'page', fields: [{ name: 'field_items', ...field }] }] });
      const node = modelData.nodes.find((candidate) => candidate.data.id === 'field:node.page:field_items');

      assert.equal(node.data.cardinality, cardinality);
    });
  }
});

function dataProviderFieldCardinality() {
  return [
    ['a multi-value field without a cardinality', { kind: 'multi' }, -1],
    ['a single-value field without a cardinality', { kind: 'single' }, 1],
    ['a system field without a cardinality', { kind: 'system' }, 1],
    ['a field with a cardinality', { kind: 'multi', cardinality: 3 }, 3],
  ];
}

test('rejects input that is not a Nexus document', () => {
  assert.throws(() => documentToModel({}));
  assert.throws(() => documentToModel(null));
});

test('saves every key of a Nexus document and opens it back unchanged', () => {
  const opened = documentToModel(SAVED_DOC);
  const nodes = opened.modelData.nodes.map((node) => ({ ...node, position: { ...opened.layout[node.data.id] } }));
  const meta = { title: opened.modelData.meta.title, colors: opened.colors, symbols: opened.symbols, customTypes: opened.customTypes, ui: opened.ui };

  assert.deepEqual(saveGraph(nodes.concat(opened.modelData.edges), meta), SAVED_DOC);
});

test('rounds saved positions and leaves hidden proxies out of the layout', () => {
  const saved = saveGraph([
    { data: { id: 'node.article', group: 'entity', entityType: 'node', bundle: 'article', label: 'Article' }, position: { x: 10.4, y: -20.6 } },
    { data: { id: 'proxy:shown', group: 'proxy' }, position: { x: 30.5, y: 40 } },
    { data: { id: 'proxy:hidden', group: 'proxy' }, classes: 'hidden', position: { x: 50, y: 60 } },
  ]);

  assert.deepEqual(saved.layout, { 'node.article': { x: 10, y: -21 }, 'proxy:shown': { x: 31, y: 40 } });
});

test('saves an empty graph under the default title and settings', () => {
  const expected = {
    nexus: 1,
    title: DEFAULT_TITLE,
    colors: {},
    symbols: {},
    customTypes: [],
    entities: [],
    annotations: { nodes: [], edges: [] },
    layout: {},
    ui: null,
  };

  assert.deepEqual(saveGraph([]), expected);
});
