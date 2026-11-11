/**
 * The entity a selection belongs to, and the Inspector's breadcrumb: the
 * screens above the open one, ending with it.
 *
 * A field, a proxy, a new field or bulk fields opened from an entity belongs
 * to that entity, and an entity belongs to itself. A screen that belongs to
 * an entity other than its own has the entity's form as its parent. Every
 * other screen has none.
 */

export const NEW_FIELD_LABEL = 'New field';
export const BULK_FIELDS_LABEL = 'Add fields';

/**
 * Returns a lookup of the nodes of the Cytoscape graph `cy`, as
 * selectionEntity() and inspectorTrail() read them.
 */
export function nodeLookup(cy) {
  return (id) => {
    const node = cy.getElementById(id);

    if (node.empty()) {
      return null;
    }

    return { label: node.data('label') || node.data('name') || node.data('bundle'), entity: node.data('entity') };
  };
}

/**
 * Returns the id of the entity `selected` belongs to, or null when it belongs
 * to none or the entity isn't on the canvas.
 *
 * `selected` is an Inspector screen or a tapped node as { kind, id } or, for
 * the forms that add fields, { kind, entityId }. `lookup(id)` returns
 * { label, entity } for a node on the canvas, or null.
 */
export function selectionEntity(selected, lookup) {
  if (!selected) {
    return null;
  }

  let entityId = null;

  if (selected.kind === 'entity') {
    entityId = selected.id;
  } else if (selected.kind === 'field' || selected.kind === 'proxy') {
    const node = lookup(selected.id);
    entityId = node ? node.entity : null;
  } else if (selected.kind === 'new-field' || selected.kind === 'bulk-fields') {
    entityId = selected.entityId;
  }

  return entityId && lookup(entityId) ? entityId : null;
}

/**
 * Returns the trail of `selected` as crumbs, from the top screen down to
 * `selected`, each { label, id }. A crumb with an `id` names the entity whose
 * form it opens; the last crumb is the open screen and has no `id`.
 *
 * `lookup(id)` returns { label, entity } for a node on the canvas, or
 * null. A screen whose entity isn't on the canvas gives an empty trail.
 */
export function inspectorTrail(selected, lookup) {
  const label = screenLabel(selected, lookup);
  const entityId = label === null ? null : selectionEntity(selected, lookup);

  if (!entityId) {
    return [];
  }

  return [
    { label: lookup(entityId).label || entityId, id: entityId },
    { label: label, id: null },
  ];
}

// The crumb of a screen that sits under an entity's form, or null for any
// other screen.
function screenLabel(selected, lookup) {
  if (!selected) {
    return null;
  }

  if (selected.kind === 'field') {
    const field = lookup(selected.id);

    return field ? field.label || selected.id : null;
  }

  if (selected.kind === 'new-field') {
    return NEW_FIELD_LABEL;
  }

  if (selected.kind === 'bulk-fields') {
    return BULK_FIELDS_LABEL;
  }

  return null;
}
