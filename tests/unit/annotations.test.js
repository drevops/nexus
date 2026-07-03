import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContentModel, Entity, KIND_CALCULATED } from '../../src/model.js';
import { ANNOTATION_KINDS, applyAnnotations } from '../../src/annotations.js';

const OVERLAY = {
  title: 'Annotated model',
  nodes: [
    { id: 'create_invoice', kind: 'callback', label: 'Create invoice', method: 'POST', attach: 'node.article' },
    { id: 'payments_api', kind: 'api', label: 'Payments API' },
    { id: 'invoice_paid', kind: 'event', label: 'InvoicePaid' },
  ],
  edges: [{ from: 'payments_api', to: 'invoice_paid', label: 'emits' }],
  computed_fields: { 'node.article': [{ name: 'computed_url', label: 'Computed URL' }] },
};

function model() {
  const m = new ContentModel('Original title');
  m.addEntity(new Entity('node', 'article', 'Article'));
  return m;
}

function nodesById(data) {
  const result = {};
  for (const node of data.nodes) {
    result[node.data.id] = node.data;
  }
  return result;
}

test('applies overlay nodes, edges and title', () => {
  const m = model();
  applyAnnotations(m, OVERLAY);

  assert.equal(m.getTitle(), 'Annotated model');

  const data = m.toArray();
  const nodes = nodesById(data);
  assert.equal(nodes.create_invoice.kind, 'callback');
  assert.equal(nodes.create_invoice.method, 'POST');
  assert.equal(nodes.payments_api.kind, 'api');
  assert.equal(nodes.invoice_paid.kind, 'event');

  const attach = data.edges.filter((e) => e.data.source === 'node.article' && e.data.target === 'create_invoice');
  assert.equal(attach.length, 1);

  const emits = data.edges.filter((e) => e.data.source === 'payments_api' && e.data.target === 'invoice_paid');
  assert.equal(emits.length, 1);
});

test('adds calculated fields to existing entities', () => {
  const m = model();
  applyAnnotations(m, OVERLAY);

  const computed = m.getEntity('node.article').fields.filter((f) => f.kind === KIND_CALCULATED);
  assert.equal(computed.length, 1);
  assert.equal(computed[0].name, 'computed_url');
});

test('labels the event, API and callback annotation kinds', () => {
  assert.deepEqual(ANNOTATION_KINDS, [
    { kind: 'event', label: 'Event' },
    { kind: 'api', label: 'API' },
    { kind: 'callback', label: 'Callback' },
  ]);
});

test('keeps every annotation kind and turns any other kind into an event', async (t) => {
  for (const [name, kind, expected] of dataProviderAnnotationKind()) {
    await t.test(name, () => {
      const m = model();
      applyAnnotations(m, { nodes: [{ id: 'note', kind: kind }] });

      assert.equal(nodesById(m.toArray()).note.kind, expected);
    });
  }
});

function dataProviderAnnotationKind() {
  return [
    ...ANNOTATION_KINDS.map((entry) => ['the ' + entry.label + ' kind', entry.kind, entry.kind]),
    ['an unknown kind', 'webhook', 'event'],
    ['a missing kind', undefined, 'event'],
    ['an inherited object property', 'constructor', 'event'],
  ];
}

test('ignores non-object overlays', () => {
  const m = model();
  applyAnnotations(m, null);
  assert.equal(m.getTitle(), 'Original title');
});
