/**
 * The order of the Fields table's rows.
 *
 * The table lists the fields of each entity under 1 group row, with the
 * groups in the order their entities' first fields come in. Each field is
 * numbered by its place in its entity's list, and a sort reorders the fields
 * within each group. Blank cells come last in either direction, and fields
 * with equal values keep their numbered order.
 */

import { allowedValueLabels } from './field-settings.js';

export const DEFAULT_SORT = { column: 'position', direction: 'ascending' };

// System and calculated badges sort after every cardinality.
const BADGE_RANKS = { calculated: Number.MAX_SAFE_INTEGER - 1, system: Number.MAX_SAFE_INTEGER };

function textValue(text) {
  return text === '' ? null : text;
}

// The value each sortable column compares, or null for a blank cell.
const SORT_VALUES = {
  position: (r) => r.position,
  field: (r) => textValue(r.field || ''),
  type: (r) => textValue(r.type || ''),
  cardinality: (r) => BADGE_RANKS[r.kind] || (r.cardinality === -1 ? Number.MAX_SAFE_INTEGER - 2 : r.cardinality),
  required: (r) => (r.required ? 0 : null),
  references: (r) => textValue(r.refs.map((ref) => ref.label).join(', ')),
  usedIn: (r) => r.usedIn.length || null,
  description: (r) => textValue(r.description),
  defaultValue: (r) => textValue(r.defaultValue),
  allowedValues: (r) => textValue(allowedValueLabels(r.allowedValues).join(', ')),
  translatable: (r) => (r.translatable === null ? null : Number(!r.translatable)),
};

export const SORT_COLUMNS = Object.keys(SORT_VALUES);

function groupByEntity(records) {
  const groups = new Map();

  records.forEach((r) => {
    if (!groups.has(r.entityId)) {
      groups.set(r.entityId, []);
    }

    groups.get(r.entityId).push(r);
  });

  return [...groups.values()];
}

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

/**
 * Returns the records grouped by entity, each with a `position`: its 1-based
 * place among its entity's fields in the given order.
 */
export function numberFields(records) {
  return groupByEntity(records).flatMap((group) => group.map((r, i) => ({ ...r, position: i + 1 })));
}

/**
 * Returns the numbered records grouped by entity and sorted within each group
 * by `sort`: a column of SORT_COLUMNS and a direction, `ascending` or
 * `descending`. An unknown column sorts by position.
 */
export function sortFields(records, sort = DEFAULT_SORT) {
  const value = SORT_VALUES[sort.column] || SORT_VALUES.position;
  const sign = sort.direction === 'descending' ? -1 : 1;

  return groupByEntity(records).flatMap((group) =>
    [...group].sort((a, b) => {
      const va = value(a);
      const vb = value(b);

      if (va === null || vb === null) {
        return (va === null) - (vb === null) || a.position - b.position;
      }

      return sign * compareValues(va, vb) || a.position - b.position;
    }),
  );
}

/**
 * Returns whether `sort` is the diagram order.
 */
export function isDefaultSort(sort) {
  return sort.column === DEFAULT_SORT.column && sort.direction === DEFAULT_SORT.direction;
}

/**
 * Returns the sort a click on a column's header gives after `sort`: ascending
 * on a new column, then descending, then the diagram order.
 */
export function nextSort(sort, column) {
  if (sort.column !== column) {
    return { column, direction: 'ascending' };
  }

  if (sort.direction === 'ascending') {
    return { column, direction: 'descending' };
  }

  return DEFAULT_SORT;
}
