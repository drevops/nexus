/**
 * The differences between 2 content models.
 *
 * Each side is model data in the shape `ContentModel.toArray()` returns:
 * `{ nodes, edges }` of Cytoscape element definitions. Entities and fields are
 * matched by node id and references by ref edge id, so a renamed bundle or
 * field is a removal plus an addition.
 *
 * A change is `{ change, element, id, entityId, label, properties }`:
 *
 * - `change` is CHANGE_ADDED (only the after side has it), CHANGE_REMOVED
 *   (only the before side has it) or CHANGE_CHANGED.
 * - `element` is `entity`, `field` or `reference`.
 * - `entityId` is the bundle the change is listed under: the entity itself,
 *   or the entity of the field.
 * - `properties` lists each compared property of a changed entity or field
 *   as `{ key, label, before, after }`, and is empty otherwise.
 *
 * Fields also carry `name`, and references carry `fieldId` and `targetId`.
 * Every element is listed on its own, so an added bundle lists its fields
 * and their references as added too.
 */

import { cardinalityLabel, hasEdgeId } from './model.js';
import { allowedValueLabels, allowedValueList, settingText } from './field-settings.js';
import { parseRichText, richTextPlain } from './rich-text.js';

export const CHANGE_ADDED = 'added';
export const CHANGE_REMOVED = 'removed';
export const CHANGE_CHANGED = 'changed';

// The kinds of change in the order the Changes panel and the Legend list them,
// each with the colour that marks it.
export const CHANGE_KINDS = [
  { change: CHANGE_ADDED, label: 'Added', title: 'Only the compared model has it', color: '#1e9e5a' },
  { change: CHANGE_REMOVED, label: 'Removed', title: 'Only the open diagram has it', color: '#d64545' },
  { change: CHANGE_CHANGED, label: 'Changed', title: 'Both models have it with different settings', color: '#d98a00' },
];

/**
 * Returns the entry of CHANGE_KINDS for a kind of change.
 */
export function changeKind(change) {
  return CHANGE_KINDS.find((kind) => kind.change === change);
}

const ENTITY_PROPERTIES = [
  ['label', 'Label'],
  ['description', 'Description'],
];

const FIELD_PROPERTIES = [
  ['label', 'Label'],
  ['fieldType', 'Type'],
  ['cardinality', 'Cardinality'],
  ['required', 'Required'],
  ['description', 'Help text'],
  ['defaultValue', 'Default value'],
  ['allowedValues', 'Allowed values'],
  ['translatable', 'Translatable'],
];

const NONE = 'None';

// Brings a property value to the form both sides compare in, so a missing
// key matches its default.
const NORMALIZE = {
  label: (value) => (value == null ? '' : String(value)),
  description: settingText,
  defaultValue: settingText,
  fieldType: (value) => (value == null ? '' : String(value)),
  cardinality: (value) => (value == null ? 1 : value),
  required: (value) => !!value,
  allowedValues: allowedValueList,
  translatable: (value) => (typeof value === 'boolean' ? value : null),
};

const TEXT = {
  cardinality: cardinalityLabel,
  required: (value) => (value ? 'Yes' : 'No'),
  translatable: (value) => (value === null ? 'Not set' : value ? 'Yes' : 'No'),
  allowedValues: (list) => (list.length ? allowedValueLabels(list).join(', ') : NONE),
  description: (value) => richTextPlain(parseRichText(value)) || NONE,
};

// The entities, fields and references of 1 side, keyed by id in model order.
function index(data) {
  const entities = new Map();
  const fields = new Map();
  const references = new Map();

  ((data && data.nodes) || []).forEach((node) => {
    const group = node.data.group;

    if (group === 'entity') {
      entities.set(node.data.id, node.data);
    } else if (group === 'field') {
      fields.set(node.data.id, node.data);
    }
  });

  // The canvas draws no edge with a missing end, so neither side counts one.
  ((data && data.edges) || []).forEach((edge) => {
    if (edge.data.group === 'ref' && fields.has(edge.data.source) && entities.has(edge.data.target)) {
      references.set(edge.data.id, edge.data);
    }
  });

  return { entities, fields, references };
}

// The ids both sides hold, the before side's first, each in its side's order.
function unionIds(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])];
}

// The ids of the union of 2 maps, grouped by the key `keyOf(data)` gives.
function groupIds(before, after, keyOf) {
  const groups = new Map();

  unionIds(before, after).forEach((id) => {
    const key = keyOf(after.get(id) || before.get(id));

    groups.set(key, (groups.get(key) || []).concat([id]));
  });

  return groups;
}

function changedProperties(properties, before, after) {
  return properties
    .map(([key, label]) => ({ key, label, before: NORMALIZE[key](before[key]), after: NORMALIZE[key](after[key]) }))
    .filter((property) => JSON.stringify(property.before) !== JSON.stringify(property.after));
}

// The change between 2 versions of 1 element, or null when they match.
function compare(before, after, properties) {
  if (!after) {
    return { change: CHANGE_REMOVED, data: before, properties: [] };
  }

  if (!before) {
    return { change: CHANGE_ADDED, data: after, properties: [] };
  }

  const changed = changedProperties(properties, before, after);

  return changed.length ? { change: CHANGE_CHANGED, data: after, properties: changed } : null;
}

// A field without a label is named by its machine name, anything else by its
// id.
function labelOf(data) {
  if (data.label != null && data.label !== '') {
    return String(data.label);
  }

  return data.group === 'field' && data.name ? data.name : data.id;
}

/**
 * Returns the changes from the `before` model to the `after` model, grouped
 * by entity in model order: each entity's own change first, then its fields,
 * then their references. A model compared with itself has no changes.
 */
export function diffModels(before, after) {
  const from = index(before);
  const to = index(after);
  const targetLabel = (id) => {
    const entity = to.entities.get(id) || from.entities.get(id);

    return entity ? labelOf(entity) : id;
  };
  const changes = [];
  const fieldsByEntity = groupIds(from.fields, to.fields, (data) => data.entity);
  const referencesByField = groupIds(from.references, to.references, (data) => data.source);

  unionIds(from.entities, to.entities).forEach((entityId) => {
    const entity = compare(from.entities.get(entityId), to.entities.get(entityId), ENTITY_PROPERTIES);
    const fieldIds = fieldsByEntity.get(entityId) || [];

    if (entity) {
      changes.push({ change: entity.change, element: 'entity', id: entityId, entityId, label: labelOf(entity.data), properties: entity.properties });
    }

    fieldIds.forEach((fieldId) => {
      const field = compare(from.fields.get(fieldId), to.fields.get(fieldId), FIELD_PROPERTIES);

      if (field) {
        changes.push({
          change: field.change,
          element: 'field',
          id: fieldId,
          entityId,
          name: field.data.name || '',
          label: labelOf(field.data),
          properties: field.properties,
        });
      }
    });

    fieldIds.forEach((fieldId) => {
      const fieldLabel = labelOf(to.fields.get(fieldId) || from.fields.get(fieldId));

      (referencesByField.get(fieldId) || []).forEach((referenceId) => {
        const reference = compare(from.references.get(referenceId), to.references.get(referenceId), []);

        if (!reference) {
          return;
        }

        const targetId = reference.data.target;

        changes.push({
          change: reference.change,
          element: 'reference',
          id: referenceId,
          entityId,
          fieldId,
          targetId,
          label: fieldLabel + ' → ' + targetLabel(targetId),
          properties: [],
        });
      });
    });
  });

  return changes;
}

/**
 * Groups changes by the entity they are listed under, keeping their order.
 * Each group is `{ entityId, changes }`.
 */
export function groupChanges(changes) {
  const groups = new Map();

  changes.forEach((change) => {
    if (!groups.has(change.entityId)) {
      groups.set(change.entityId, { entityId: change.entityId, changes: [] });
    }

    groups.get(change.entityId).changes.push(change);
  });

  return [...groups.values()];
}

/**
 * Counts the changes of each kind, as `{ added, removed, changed }`.
 */
export function changeCounts(changes) {
  const counts = { [CHANGE_ADDED]: 0, [CHANGE_REMOVED]: 0, [CHANGE_CHANGED]: 0 };

  changes.forEach((change) => {
    counts[change.change]++;
  });

  return counts;
}

/**
 * Returns the kind of change of every element id the changes name. A field
 * added or removed also names the edge that joins it to its entity.
 */
export function changeMarks(changes) {
  const marks = new Map();

  changes.forEach((change) => {
    marks.set(change.id, change.change);

    if (change.element === 'field' && change.change !== CHANGE_CHANGED) {
      marks.set(hasEdgeId(change.id), change.change);
    }
  });

  return marks;
}

/**
 * Returns the kind of change every id in `ids` shares in `marks`, or null when
 * they differ, one has none or `ids` is empty.
 */
export function sharedMark(marks, ids) {
  const kinds = new Set(ids.map((id) => marks.get(id) || null));

  return kinds.size === 1 ? [...kinds][0] : null;
}

/**
 * Words a compared property value for the Changes panel.
 */
export function propertyText(key, value) {
  if (Object.hasOwn(TEXT, key)) {
    return TEXT[key](value);
  }

  return value === '' || value == null ? NONE : String(value);
}
