/**
 * Reference elements: the render-only elements drawn for each ref edge.
 *
 * A ref edge joins a field to the entity it references. Its proxy is a
 * semi-opaque copy of that entity placed beside the field and joined to it by
 * a proxy edge, so a distant reference gets a short edge. The entity-only
 * overview draws a collapsed edge from the field's entity to the target
 * instead, 1 per entity and target.
 *
 * syncReferenceElements() reconciles these elements with the ref edges of a
 * Cytoscape graph and touches nothing outside that graph.
 */

import { proxyNodeId, proxyEdgeId, collapsedEdgeId } from './model.js';

export const REFERENCE_ELEMENTS = '[group="proxy"], [group="proxyedge"], [group="collapsed"]';

// Each element id is built from these keys, so they can't differ from the
// wanted data.
const ID_KEYS = ['id', 'field', 'source', 'target'];

// Definitions of the reference elements for the ref edges of `cy`, keyed by
// id.
function wantedElements(cy) {
  const wanted = new Map();

  cy.edges('[group="ref"]').forEach((ref) => {
    const field = ref.source();
    const target = ref.target();
    const proxyId = proxyNodeId(field.id(), target.id());
    const edgeId = proxyEdgeId(field.id(), target.id());
    const owner = cy.getElementById(field.data('entity'));

    wanted.set(proxyId, {
      group: 'nodes',
      data: {
        id: proxyId,
        group: 'proxy',
        field: field.id(),
        target: target.id(),
        entity: field.data('entity'),
        entityType: target.data('entityType'),
        label: target.data('label') ?? target.id(),
      },
    });
    wanted.set(edgeId, { group: 'edges', data: { id: edgeId, source: field.id(), target: proxyId, group: 'proxyedge', cardinality: ref.data('cardinality') } });

    if (owner.nonempty()) {
      const collapsedId = collapsedEdgeId(owner.id(), target.id());
      wanted.set(collapsedId, { group: 'edges', data: { id: collapsedId, source: owner.id(), target: target.id(), group: 'collapsed' } });
    }
  });

  return wanted;
}

function updateData(element, data) {
  Object.keys(data).forEach((key) => {
    if (!ID_KEYS.includes(key) && element.data(key) !== data[key]) {
      element.data(key, data[key]);
    }
  });
}

/**
 * Brings the reference elements of `cy` in line with its ref edges: removes
 * those whose reference is gone, adds the missing ones and copies a changed
 * target label or cardinality onto the rest.
 *
 * `renames` maps the id of each node a rename replaced to the id of its
 * replacement. The proxy of a renamed reference is added where the proxy it
 * replaces was.
 *
 * Returns the proxies it adds with no position, for the caller to place.
 */
export function syncReferenceElements(cy, renames = {}) {
  const wanted = wantedElements(cy);
  const renamed = (id) => renames[id] ?? id;
  const positions = new Map();

  cy.elements(REFERENCE_ELEMENTS).forEach((element) => {
    const definition = wanted.get(element.id());

    if (definition) {
      updateData(element, definition.data);
      wanted.delete(element.id());
      return;
    }

    if (element.isNode()) {
      positions.set(proxyNodeId(renamed(element.data('field')), renamed(element.data('target'))), { ...element.position() });
    }

    element.remove();
  });

  const missing = [...wanted.values()];
  const proxies = missing.filter((definition) => definition.group === 'nodes');
  const moved = proxies.filter((definition) => positions.has(definition.data.id));

  // A proxy edge can't be added before its proxy, so proxies are added first.
  cy.add(moved.map((definition) => ({ ...definition, position: positions.get(definition.data.id) })));
  const unplaced = cy.add(proxies.filter((definition) => !positions.has(definition.data.id)));
  cy.add(missing.filter((definition) => definition.group === 'edges'));

  return unplaced;
}
