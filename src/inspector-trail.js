/**
 * The Inspector's breadcrumb: the screens above the open one, ending with it.
 *
 * A screen that belongs to an entity - a field, a new field or bulk fields
 * opened from that entity - has the entity's form as its parent. Every other
 * screen has none.
 */

export const NEW_FIELD_LABEL = 'New field';
export const BULK_FIELDS_LABEL = 'Add fields';

/**
 * Returns the trail of `selected` as crumbs, from the top screen down to
 * `selected`, each { label, id }. A crumb with an `id` names the entity whose
 * form it opens; the last crumb is the open screen and has no `id`.
 *
 * `lookup(id)` returns { label, entity } for a node on the canvas, or
 * null. A screen whose entity isn't on the canvas gives an empty trail.
 */
export function inspectorTrail(selected, lookup) {
  if (!selected) {
    return [];
  }

  if (selected.kind === 'field') {
    const field = lookup(selected.id);

    return field ? withEntity(field.entity, field.label || selected.id, lookup) : [];
  }

  if (selected.kind === 'new-field' && selected.entityId) {
    return withEntity(selected.entityId, NEW_FIELD_LABEL, lookup);
  }

  if (selected.kind === 'bulk-fields') {
    return withEntity(selected.entityId, BULK_FIELDS_LABEL, lookup);
  }

  return [];
}

function withEntity(entityId, label, lookup) {
  const entity = entityId ? lookup(entityId) : null;

  if (!entity) {
    return [];
  }

  return [
    { label: entity.label || entityId, id: entityId },
    { label: label, id: null },
  ];
}
