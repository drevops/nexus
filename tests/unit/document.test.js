import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentToModel } from '../../assets/document.js';

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
        { name: 'field_tags', label: 'Tags', fieldType: 'entity_reference', kind: 'multi', required: false, targetType: 'taxonomy_term', targetBundles: ['tags'] },
      ],
    },
    { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', fields: [] },
  ],
  annotations: { nodes: [{ id: 'api1', kind: 'api', label: 'API' }], edges: [{ from: 'api1', to: 'node.article', label: 'calls' }] },
  layout: { 'node.article': { x: 10, y: 20 } },
};

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

test('rejects input that is not a Nexus document', () => {
  assert.throws(() => documentToModel({}));
  assert.throws(() => documentToModel(null));
});
