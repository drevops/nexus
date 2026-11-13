/**
 * Checks a content model for problems Drupal would reject or that break
 * common practice.
 *
 * checkModel() takes a model in the shape of a saved document's `entities`
 * and returns a list of { level, rule, message, id }: `level` is 'error' or
 * 'warning', `rule` is a CHECK_RULES id and `id` is the graph id of the
 * entity or field the problem is on. Errors come before warnings.
 *
 * A bundle named '*' stands for any bundle of its type and has no rules of
 * its own. Base (system) fields need no reference target and have no field
 * storage of their own, so the missing target, storage and field count rules
 * skip them.
 */

import { findEntityType } from './entity-types.js';
import { KIND_SYSTEM, REFERENCE_FIELD_TYPES, cardinalityLabel, entityNodeId, fieldNodeId } from './model.js';

export const LEVEL_ERROR = 'error';
export const LEVEL_WARNING = 'warning';

export const CHECK_RULES = Object.freeze([
  { id: 'reference-target', level: LEVEL_ERROR, label: 'Reference with no target, or a target the model does not have' },
  { id: 'shared-storage', level: LEVEL_ERROR, label: 'Field name with a different type or cardinality on 2 bundles of 1 entity type' },
  { id: 'machine-name', level: LEVEL_ERROR, label: "Machine name that breaks Drupal's pattern or length limit" },
  { id: 'duplicate-label', level: LEVEL_WARNING, label: '2 fields on 1 bundle with the same label' },
  { id: 'unreferenced-bundle', level: LEVEL_WARNING, label: 'Paragraph, media or block type no field references' },
  { id: 'no-fields', level: LEVEL_WARNING, label: 'Bundle with no fields of its own' },
  { id: 'list-values', level: LEVEL_WARNING, label: 'List field with no allowed values' },
  { id: 'field-limit', level: LEVEL_WARNING, label: 'Bundle with more fields than the field limit' },
]);

// Drupal's limit for entity type ids, bundle names and field names.
export const MAX_NAME_LENGTH = 32;

export const MAX_FIELD_LIMIT = 999;

export const CHECK_DEFAULTS = Object.freeze({ fieldLimit: 30 });

const NAME_PATTERN = /^[a-z0-9_]+$/;

const ANY_BUNDLE = '*';

// The entity types whose bundles exist only to be referenced.
const REFERENCED_TYPES = ['paragraph', 'media', 'block_content'];

const LIST_FIELD_TYPES = ['list_string', 'list_integer', 'list_float'];

/**
 * Returns whether a value is a field limit: a whole number from 1 to
 * MAX_FIELD_LIMIT.
 */
export function isFieldLimit(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_FIELD_LIMIT;
}

/**
 * Returns complete check settings from saved ones, with the default for a
 * missing value or one that isn't a field limit.
 */
export function readCheckSettings(saved) {
  const entry = saved && typeof saved === 'object' ? saved : {};
  const limit = Object.hasOwn(entry, 'fieldLimit') ? entry.fieldLimit : null;

  return { fieldLimit: isFieldLimit(limit) ? limit : CHECK_DEFAULTS.fieldLimit };
}

function quoted(text) {
  return '“' + text + '”';
}

function entityName(entity) {
  return quoted(entity.label || entity.bundle);
}

function fieldName(field, entity) {
  return field.name + ' on ' + entityName(entity);
}

function storageLabel(field) {
  return field.fieldType + ' (' + cardinalityLabel(field.cardinality) + ')';
}

function ownFields(entity) {
  return entity.fields.filter((field) => field.kind !== KIND_SYSTEM);
}

// The ids a reference field points to: 1 per target bundle, or the
// '<targetType>.*' entity when it lists none.
function referenceTargets(field) {
  const bundles = field.targetBundles.length > 0 ? field.targetBundles : [ANY_BUNDLE];

  return bundles.map((bundle) => entityNodeId(field.targetType, bundle));
}

function hasTarget(field) {
  return field.targetType != null && field.targetType !== '';
}

function checkReferences(entities, ids, report) {
  for (const entity of entities) {
    for (const field of entity.fields) {
      if (!hasTarget(field)) {
        if (field.kind !== KIND_SYSTEM && REFERENCE_FIELD_TYPES.includes(field.fieldType)) {
          report('reference-target', field, entity, fieldName(field, entity) + ' references no entity');
        }

        continue;
      }

      for (const target of referenceTargets(field)) {
        if (!ids.has(target)) {
          report('reference-target', field, entity, fieldName(field, entity) + ' references ' + target + ', which the model does not have');
        }
      }
    }
  }
}

function checkSharedStorage(entities, report) {
  const groups = new Map();

  for (const entity of entities) {
    for (const field of ownFields(entity)) {
      const key = entity.entityType + '\n' + field.name;

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push({ entity, field });
    }
  }

  for (const group of groups.values()) {
    const storages = new Set(group.map(({ field }) => storageLabel(field)));

    if (storages.size < 2) {
      continue;
    }

    for (const { entity, field } of group) {
      const others = group.filter((other) => storageLabel(other.field) !== storageLabel(field)).map((other) => storageLabel(other.field) + ' on ' + entityName(other.entity));

      report('shared-storage', field, entity, fieldName(field, entity) + ' is ' + storageLabel(field) + ' but ' + others.join(', ') + ', and Drupal shares 1 storage per field name');
    }
  }
}

// The reason a machine name breaks Drupal's rules, or null.
function nameProblem(name) {
  if (!NAME_PATTERN.test(name)) {
    return 'uses characters other than lowercase letters, digits and underscores';
  }

  if (name.length > MAX_NAME_LENGTH) {
    return 'is longer than ' + MAX_NAME_LENGTH + ' characters';
  }

  return null;
}

function checkMachineNames(entities, report) {
  const types = new Set();

  for (const entity of entities) {
    const typeProblem = types.has(entity.entityType) ? null : nameProblem(entity.entityType);

    types.add(entity.entityType);

    if (typeProblem) {
      report('machine-name', null, entity, 'The entity type ' + entity.entityType + ' of ' + entityName(entity) + ' ' + typeProblem);
    }

    const bundleProblem = entity.bundle === ANY_BUNDLE ? null : nameProblem(entity.bundle);

    if (bundleProblem) {
      report('machine-name', null, entity, 'The bundle ' + entity.bundle + ' of ' + entityName(entity) + ' ' + bundleProblem);
    }

    for (const field of entity.fields) {
      const problem = nameProblem(field.name);

      if (problem) {
        report('machine-name', field, entity, 'The field name ' + fieldName(field, entity) + ' ' + problem);
      }
    }
  }
}

function checkDuplicateLabels(entities, report) {
  for (const entity of entities) {
    const seen = new Map();

    for (const field of entity.fields) {
      const key = String(field.label ?? '')
        .trim()
        .toLowerCase();

      if (key === '') {
        continue;
      }

      if (seen.has(key)) {
        report('duplicate-label', field, entity, fieldName(field, entity) + ' has the label ' + quoted(String(field.label).trim()) + ', as ' + seen.get(key) + ' does');
        continue;
      }

      seen.set(key, field.name);
    }
  }
}

function checkUnreferenced(entities, report) {
  const referenced = new Set();

  for (const entity of entities) {
    for (const field of entity.fields) {
      if (hasTarget(field)) {
        referenceTargets(field).forEach((target) => referenced.add(target));
      }
    }
  }

  for (const entity of entities) {
    if (!REFERENCED_TYPES.includes(entity.entityType)) {
      continue;
    }

    const id = entityNodeId(entity.entityType, entity.bundle);

    if (referenced.has(id) || referenced.has(entityNodeId(entity.entityType, ANY_BUNDLE))) {
      continue;
    }

    report('unreferenced-bundle', null, entity, 'No field references the ' + findEntityType(entity.entityType).label.toLowerCase() + ' type ' + entityName(entity));
  }
}

function checkFieldCounts(entities, fieldLimit, report) {
  for (const entity of entities) {
    const count = ownFields(entity).length;

    if (count === 0) {
      report('no-fields', null, entity, entityName(entity) + ' has no fields of its own');
    }

    if (count > fieldLimit) {
      report('field-limit', null, entity, entityName(entity) + ' has ' + count + ' fields, more than the limit of ' + fieldLimit);
    }
  }
}

function checkListValues(entities, report) {
  for (const entity of entities) {
    for (const field of entity.fields) {
      if (LIST_FIELD_TYPES.includes(field.fieldType) && field.allowedValues.length === 0) {
        report('list-values', field, entity, fieldName(field, entity) + ' is a list with no allowed values');
      }
    }
  }
}

// Fills the keys a document may leave out, so each rule reads a complete
// entity.
function normalizeEntity(entity) {
  const fields = Array.isArray(entity.fields) ? entity.fields : [];

  return {
    entityType: String(entity.entityType),
    bundle: String(entity.bundle),
    label: entity.label,
    fields: fields.map((field) => ({
      name: String(field.name),
      label: field.label,
      fieldType: field.fieldType,
      kind: field.kind,
      cardinality: field.cardinality != null ? field.cardinality : 1,
      targetType: field.targetType,
      targetBundles: Array.isArray(field.targetBundles) ? field.targetBundles : [],
      allowedValues: Array.isArray(field.allowedValues) ? field.allowedValues : [],
    })),
  };
}

export function checkModel(doc, settings = {}) {
  const { fieldLimit } = readCheckSettings(settings);
  const entities = (doc && Array.isArray(doc.entities) ? doc.entities : []).map(normalizeEntity);
  const ids = new Set(entities.map((entity) => entityNodeId(entity.entityType, entity.bundle)));
  const bundles = entities.filter((entity) => entity.bundle !== ANY_BUNDLE);
  const levels = new Map(CHECK_RULES.map((rule) => [rule.id, rule.level]));
  const problems = [];

  function report(rule, field, entity, message) {
    const entityId = entityNodeId(entity.entityType, entity.bundle);

    problems.push({ level: levels.get(rule), rule, message, id: field ? fieldNodeId(entityId, field.name) : entityId });
  }

  checkReferences(entities, ids, report);
  checkSharedStorage(bundles, report);
  checkMachineNames(entities, report);
  checkDuplicateLabels(bundles, report);
  checkUnreferenced(bundles, report);
  checkFieldCounts(bundles, fieldLimit, report);
  checkListValues(bundles, report);

  return [...problems.filter((problem) => problem.level === LEVEL_ERROR), ...problems.filter((problem) => problem.level === LEVEL_WARNING)];
}
