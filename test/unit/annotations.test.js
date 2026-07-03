import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContentModel, Entity, KIND_CALCULATED } from '../../assets/model.js';
import { applyAnnotations } from '../../assets/annotations.js';

const OVERLAY = {
  title: 'Annotated model',
  nodes: [
    { id: 'create_program', kind: 'callback', label: 'Create program', method: 'POST', attach: 'node.article' },
    { id: 'omny_api', kind: 'api', label: 'Omny Studio API' },
    { id: 'clip_created', kind: 'event', label: 'ClipCreated' },
  ],
  edges: [{ from: 'omny_api', to: 'clip_created', label: 'emits' }],
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
  assert.equal(nodes.create_program.kind, 'callback');
  assert.equal(nodes.create_program.method, 'POST');
  assert.equal(nodes.omny_api.kind, 'api');
  assert.equal(nodes.clip_created.kind, 'event');

  const attach = data.edges.filter((e) => e.data.source === 'node.article' && e.data.target === 'create_program');
  assert.equal(attach.length, 1);

  const emits = data.edges.filter((e) => e.data.source === 'omny_api' && e.data.target === 'clip_created');
  assert.equal(emits.length, 1);
});

test('adds calculated fields to existing entities', () => {
  const m = model();
  applyAnnotations(m, OVERLAY);

  const computed = m.getEntity('node.article').fields.filter((f) => f.kind === KIND_CALCULATED);
  assert.equal(computed.length, 1);
  assert.equal(computed[0].name, 'computed_url');
});

test('ignores non-object overlays', () => {
  const m = model();
  applyAnnotations(m, null);
  assert.equal(m.getTitle(), 'Original title');
});
