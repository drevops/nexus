/**
 * The bundles that share each field's storage.
 *
 * Drupal keeps 1 field storage per entity type and machine name, so the
 * fields of 1 entity type that have the same machine name share it. Base and
 * calculated fields belong to the entity type rather than to a storage, so
 * they share nothing.
 */

import { KIND_CALCULATED, KIND_SYSTEM } from './model.js';

// The storage a field record uses, or null for a field without one.
function storageKey(record) {
  if (record.kind === KIND_SYSTEM || record.kind === KIND_CALCULATED || !record.name || !record.entityType) {
    return null;
  }

  return JSON.stringify([record.entityType, record.name]);
}

// Bundles with the same label keep a fixed order by entity id.
function compareBundles(a, b) {
  return String(a.entity).localeCompare(String(b.entity), 'en', { numeric: true, sensitivity: 'base' }) || a.entityId.localeCompare(b.entityId);
}

/**
 * Returns a map from each field record's id to the bundles that use its
 * storage, itself included, sorted by entity label.
 *
 * Each record needs `id`, `entityId`, `entity` (the entity label),
 * `entityType`, `name`, `kind` and `field` (the field label). Each bundle is
 * `{ entityId, entity, fieldId, field }`, from the first field of that bundle
 * with the machine name. A record without a storage maps to an empty list.
 */
export function fieldSharing(records) {
  const storages = new Map();

  records.forEach((r) => {
    const key = storageKey(r);

    if (key === null) {
      return;
    }

    if (!storages.has(key)) {
      storages.set(key, new Map());
    }

    const bundles = storages.get(key);

    if (!bundles.has(r.entityId)) {
      bundles.set(r.entityId, { entityId: r.entityId, entity: r.entity, fieldId: r.id, field: r.field });
    }
  });

  const sorted = new Map();

  storages.forEach((bundles, key) => {
    sorted.set(key, [...bundles.values()].sort(compareBundles));
  });

  return new Map(records.map((r) => [r.id, sorted.get(storageKey(r)) || []]));
}

/**
 * Returns the hover text of a field's bundle count, such as
 * `Used in 2 bundles: Article, Page`, or an empty string for no bundles.
 */
export function usedInTitle(bundles) {
  if (!bundles.length) {
    return '';
  }

  return 'Used in ' + bundles.length + (bundles.length === 1 ? ' bundle: ' : ' bundles: ') + bundles.map((b) => b.entity).join(', ');
}
