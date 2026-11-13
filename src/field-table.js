/**
 * The order of the Fields table's rows and the editors of its cells.
 *
 * The table lists the fields of each entity under 1 group row, with the
 * groups in the order their entities' first fields come in. Each field is
 * numbered by its place in its entity's list, and a sort reorders the fields
 * within each group. Blank cells come last in either direction, and fields
 * with equal values keep their numbered order.
 */

import { allowedValueLabels } from './field-settings.js';
import { KIND_CALCULATED, KIND_SYSTEM, REFERENCE_FIELD_TYPES } from './model.js';

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
  name: (r) => textValue(r.name || ''),
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

// The control each editable column edits its cell with. Required is a
// checkbox in the cell itself, so it has no editor to open.
const EDITORS = {
  field: 'text',
  name: 'text',
  type: 'select',
  cardinality: 'select',
  required: 'toggle',
  references: 'multiselect',
  description: 'multiline',
  defaultValue: 'text',
  allowedValues: 'multiline',
  translatable: 'select',
};

// Columns that edit only some fields. A system or calculated field's badge
// stands for its kind, which a new cardinality would replace.
const EDITABLE_WHEN = {
  cardinality: (r) => r.kind !== KIND_SYSTEM && r.kind !== KIND_CALCULATED,
  references: (r) => REFERENCE_FIELD_TYPES.includes(r.type),
  allowedValues: (r) => String(r.type).startsWith('list_') || r.allowedValues.length > 0,
};

export const EDITABLE_COLUMNS = Object.keys(EDITORS);

/**
 * Returns the editor a field record's cell in `column` opens: `text`,
 * `multiline`, `select`, `multiselect` or `toggle`, or null when the cell
 * can't be edited.
 */
export function cellEditor(record, column) {
  if (!Object.hasOwn(EDITORS, column)) {
    return null;
  }

  if (Object.hasOwn(EDITABLE_WHEN, column) && !EDITABLE_WHEN[column](record)) {
    return null;
  }

  return EDITORS[column];
}

/**
 * Returns the reference targets to add and to remove to turn the `current`
 * target ids into the `picked` ones, each in the order given.
 */
export function referenceChanges(current, picked) {
  return {
    added: picked.filter((id, index) => !current.includes(id) && picked.indexOf(id) === index),
    removed: current.filter((id) => !picked.includes(id)),
  };
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
