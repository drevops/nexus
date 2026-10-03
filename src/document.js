/**
 * The Nexus diagram document (".nexus.json") - the save/load "diagram language".
 *
 * Schema (version 1):
 * {
 *   "nexus": 1,
 *   "title": "…",
 *   "colors": { "<entityType>": "#hex" },        // colour overrides
 *   "entities": [ { entityType, bundle, label, fields: [
 *       { name, label, fieldType, kind, required, targetType, targetBundles } ] } ],
 *   "annotations": { nodes: [ { id, kind, label, method? } ], edges: [ { from, to, label } ] },
 *   "layout": { "<nodeId>": { x, y } }            // exact canvas positions
 * }
 *
 * `documentFromGraph` reads a live Cytoscape instance; `documentToModel` is a
 * pure transform back to renderable model data (so it can be unit-tested).
 */

import { ContentModel, Entity, Field } from './model.js';
import { applyAnnotations } from './annotations.js';

function splitId(id) {
  const index = id.indexOf('.');
  return { entityType: id.slice(0, index), bundle: id.slice(index + 1) };
}

function serializeField(field) {
  let targetType = null;
  const targetBundles = [];

  field.connectedEdges('[group="ref"]').forEach((edge) => {
    if (edge.source().id() !== field.id()) {
      return;
    }
    const target = splitId(edge.target().id());
    targetType = targetType || target.entityType;
    if (target.bundle !== '*') {
      targetBundles.push(target.bundle);
    }
  });

  return {
    name: field.data('name'),
    label: field.data('label'),
    fieldType: field.data('fieldType'),
    kind: field.data('kind'),
    cardinality: field.data('cardinality') != null ? field.data('cardinality') : 1,
    required: !!field.data('required'),
    note: field.data('note') || '',
    targetType: targetType,
    targetBundles: targetBundles,
  };
}

export function documentFromGraph(cy, meta = {}) {
  const layout = {};
  cy.nodes().forEach((node) => {
    // Layout runs skip hidden proxies, so their positions are stale. Unlike
    // other nodes, a proxy without a saved position is placed beside its field
    // on open.
    if (node.data('group') === 'proxy' && !node.visible()) {
      return;
    }
    const position = node.position();
    layout[node.id()] = { x: Math.round(position.x), y: Math.round(position.y) };
  });

  const fieldsByEntity = {};
  cy.nodes('[group="field"]').forEach((field) => {
    const owner = field.data('entity');
    (fieldsByEntity[owner] = fieldsByEntity[owner] || []).push(field);
  });

  const entities = cy.nodes('[group="entity"]').map((node) => {
    const fields = (fieldsByEntity[node.id()] || []).map(serializeField);

    return { entityType: node.data('entityType'), bundle: node.data('bundle'), label: node.data('label'), note: node.data('note') || '', fields: fields };
  });

  const nodes = cy.nodes('[group="annotation"]').map((node) => {
    const payload = { id: node.id(), kind: node.data('kind'), label: node.data('label') };
    if (node.data('method')) {
      payload.method = node.data('method');
    }
    if (node.data('note')) {
      payload.note = node.data('note');
    }
    return payload;
  });

  const edges = cy.edges('[group="annotation"]').map((edge) => ({
    from: edge.source().id(),
    to: edge.target().id(),
    label: edge.data('label') || '',
  }));

  return {
    nexus: 1,
    title: meta.title || 'Content model',
    colors: meta.colors || {},
    symbols: meta.symbols || {},
    customTypes: meta.customTypes || [],
    entities: entities,
    annotations: { nodes: nodes, edges: edges },
    layout: layout,
    ui: meta.ui || null,
  };
}

export function documentToModel(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.entities)) {
    throw new Error('Not a valid Nexus document.');
  }

  const model = new ContentModel(typeof doc.title === 'string' ? doc.title : 'Content model');

  doc.entities.forEach((entity) => {
    const built = new Entity(entity.entityType, entity.bundle, entity.label != null ? entity.label : entity.bundle);
    built.note = entity.note || '';
    (entity.fields || []).forEach((field) => {
      const builtField = new Field(
        field.name,
        field.label,
        field.fieldType,
        field.kind,
        !!field.required,
        field.targetType || null,
        Array.isArray(field.targetBundles) ? field.targetBundles : [],
        field.cardinality != null ? field.cardinality : field.kind === 'multi' ? -1 : 1,
      );
      builtField.note = field.note || '';
      built.addField(builtField);
    });
    model.addEntity(built);
  });

  const annotations = doc.annotations || {};
  applyAnnotations(model, { nodes: annotations.nodes || [], edges: annotations.edges || [] });

  return {
    modelData: model.toArray(),
    layout: doc.layout && typeof doc.layout === 'object' ? doc.layout : {},
    colors: doc.colors && typeof doc.colors === 'object' ? doc.colors : {},
    symbols: doc.symbols && typeof doc.symbols === 'object' ? doc.symbols : {},
    customTypes: Array.isArray(doc.customTypes) ? doc.customTypes : [],
    ui: doc.ui && typeof doc.ui === 'object' ? doc.ui : null,
  };
}
