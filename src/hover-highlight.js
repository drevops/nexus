/**
 * The hover highlight: the elements that stay lit while the pointer rests on
 * a node, and its settings.
 *
 * hoverNeighbourhood() reads a Cytoscape graph and touches nothing outside it.
 * The settings are saved under `hover` in the `nexusSettings` entry as
 * `{ enabled }`.
 */

import { collapsedEdgeId, hasEdgeId, proxyEdgeId, proxyNodeId } from './model.js';

// The pause between the pointer reaching a node and the highlight, so a
// pointer crossing the canvas highlights nothing.
export const HOVER_DELAY = 250;

export const HOVER_DEFAULTS = Object.freeze({ enabled: true });

/**
 * Returns complete hover settings from saved ones, with the default for a
 * missing or invalid value.
 */
export function readHoverSettings(saved) {
  const entry = saved && typeof saved === 'object' ? saved : {};
  const enabled = Object.hasOwn(entry, 'enabled') && typeof entry.enabled === 'boolean' ? entry.enabled : HOVER_DEFAULTS.enabled;

  return { enabled };
}

// A field with its entity and the has edge between them.
function withEntity(field) {
  const cy = field.cy();

  return field.union(cy.getElementById(field.data('entity'))).union(cy.getElementById(hasEdgeId(field.id())));
}

// Every element that draws the reference of a ref edge: the edge, the field
// with its entity, the target, the proxy with its edge and the collapsed
// edge.
function referenceParts(ref) {
  const cy = ref.cy();
  const field = ref.source();
  const target = ref.target();

  return withEntity(field)
    .union(ref)
    .union(target)
    .union(cy.getElementById(proxyNodeId(field.id(), target.id())))
    .union(cy.getElementById(proxyEdgeId(field.id(), target.id())))
    .union(cy.getElementById(collapsedEdgeId(field.data('entity'), target.id())));
}

function referencesOf(cy, refs) {
  return refs.reduce((parts, ref) => parts.union(referenceParts(ref)), cy.collection());
}

/**
 * Returns the elements a hover on the node highlights.
 *
 * An entity lights its fields and every reference from its fields or to it.
 * A field lights its entity and its own references, and a proxy the 1
 * reference it draws. Any other node lights nothing.
 */
export function hoverNeighbourhood(node) {
  const cy = node.cy();
  const group = node.data('group');

  if (group === 'entity') {
    const fields = cy.nodes('[group="field"][entity="' + node.id() + '"]');
    const lit = fields.reduce((parts, field) => parts.union(withEntity(field)), node);

    return lit.union(referencesOf(cy, fields.outgoers('edge[group="ref"]'))).union(referencesOf(cy, node.incomers('edge[group="ref"]')));
  }

  if (group === 'field') {
    return withEntity(node).union(referencesOf(cy, node.outgoers('edge[group="ref"]')));
  }

  if (group === 'proxy') {
    return node.union(referencesOf(cy, cy.getElementById(node.data('field')).edgesTo(cy.getElementById(node.data('target'))).filter('[group="ref"]')));
  }

  return cy.collection();
}
