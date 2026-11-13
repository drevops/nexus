/**
 * Parses exported Drupal configuration into a ContentModel.
 *
 * Input is a map of `{ filename: parsedObject }` (YAML already parsed by the
 * caller), keeping this module pure and dependency-free.
 */

import { ContentModel, Entity, Field, REFERENCE_FIELD_TYPES, kindForCardinality, entityNodeId } from './model.js';
import { baseFieldsForEntityType } from './base-fields.js';
import { ENTITY_TYPE_ORDER } from './entity-types.js';
import { humanize } from './names.js';
import { allowedValueList, settingText } from './field-settings.js';

const BUNDLE_PREFIXES = {
  'node.type.': 'node',
  'taxonomy.vocabulary.': 'taxonomy_term',
  'media.type.': 'media',
  'paragraphs.paragraphs_type.': 'paragraph',
  'block_content.type.': 'block_content',
};

const STORAGE_PREFIX = 'field.storage.';
const FIELD_PREFIX = 'field.field.';
const MODEL_PREFIXES = [...Object.keys(BUNDLE_PREFIXES), STORAGE_PREFIX, FIELD_PREFIX];

/**
 * Returns whether parseConfig() reads the config file with the given name.
 */
export function isModelConfig(filename) {
  const name = String(filename);

  return MODEL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function parseConfig(files, options = {}) {
  if (!files || typeof files !== 'object') {
    throw new Error('No configuration provided.');
  }

  const includeBaseFields = options.includeBaseFields !== false;
  const filenames = Object.keys(files).sort();
  const model = new ContentModel();

  for (const filename of filenames) {
    const entity = matchBundle(filename, files[filename]);

    if (entity) {
      model.addEntity(entity);
    }
  }

  const storages = collectStorages(files, filenames);
  const negated = new Map();

  for (const filename of filenames) {
    if (filename.startsWith(FIELD_PREFIX)) {
      addFieldInstance(model, files[filename], storages, negated);
    }
  }

  resolveNegatedTargets(model, negated);
  resolveTargets(model);

  if (includeBaseFields) {
    injectBaseFields(model);
  }

  sortModel(model);

  return model;
}

function matchBundle(filename, data) {
  for (const [prefix, entityType] of Object.entries(BUNDLE_PREFIXES)) {
    if (!filename.startsWith(prefix)) {
      continue;
    }

    const bundle = filename.slice(prefix.length, filename.length - '.yml'.length);

    if (bundle.includes('.')) {
      return null;
    }

    const label = data?.name ?? data?.label ?? humanize(bundle);
    const entity = new Entity(entityType, bundle, String(label));

    entity.description = settingText(data?.description);

    return entity;
  }

  return null;
}

function collectStorages(files, filenames) {
  const storages = {};

  for (const filename of filenames) {
    if (!filename.startsWith(STORAGE_PREFIX)) {
      continue;
    }

    const data = files[filename] || {};
    const entityType = data.entity_type != null ? String(data.entity_type) : '';
    const fieldName = data.field_name != null ? String(data.field_name) : '';

    if (!entityType || !fieldName) {
      continue;
    }

    const settings = isObject(data.settings) ? data.settings : {};

    storages[entityType + '.' + fieldName] = {
      type: data.type != null ? String(data.type) : 'string',
      cardinality: data.cardinality != null ? parseInt(data.cardinality, 10) : 1,
      targetType: settings.target_type != null ? String(settings.target_type) : null,
      allowedValues: allowedValueList(settings.allowed_values),
    };
  }

  return storages;
}

function addFieldInstance(model, data, storages, negated) {
  const entityType = data?.entity_type != null ? String(data.entity_type) : '';
  const bundle = data?.bundle != null ? String(data.bundle) : '';
  const fieldName = data?.field_name != null ? String(data.field_name) : '';

  if (!entityType || !bundle || !fieldName || !ENTITY_TYPE_ORDER.includes(entityType)) {
    return;
  }

  const entityId = entityNodeId(entityType, bundle);
  let entity = model.getEntity(entityId);

  if (!entity) {
    entity = new Entity(entityType, bundle, humanize(bundle));
    model.addEntity(entity);
  }

  const storage = storages[entityType + '.' + fieldName] || {
    type: data.field_type != null ? String(data.field_type) : 'string',
    cardinality: 1,
    targetType: null,
    allowedValues: [],
  };

  const fieldType = data.field_type != null ? String(data.field_type) : storage.type;
  const isReference = REFERENCE_FIELD_TYPES.includes(fieldType);
  const kind = kindForCardinality(storage.cardinality);
  const label = data.label != null ? String(data.label) : fieldName;
  const required = Boolean(data.required);
  const targetType = isReference ? storage.targetType : null;
  const selection = isReference ? extractTargetBundles(data) : { bundles: [], negate: false };
  const targetBundles = selection.negate ? [] : selection.bundles;

  const field = new Field(fieldName, label, fieldType, kind, required, targetType, targetBundles, storage.cardinality);

  if (selection.negate) {
    negated.set(field, selection.bundles);
  }

  field.description = settingText(data.description);
  field.defaultValue = defaultValueText(data.default_value);
  field.allowedValues = storage.allowedValues;
  field.translatable = typeof data.translatable === 'boolean' ? data.translatable : null;

  entity.addField(field);
}

/**
 * Returns a field's default value items as text: each item's value, or its
 * scalar properties as key: value pairs when it has no value, with items
 * split by semicolons. No items give an empty string.
 */
function defaultValueText(items) {
  if (!Array.isArray(items)) {
    return '';
  }

  return items.map(defaultItemText).filter(Boolean).join('; ');
}

function defaultItemText(item) {
  if (!isObject(item)) {
    return isScalar(item) ? String(item) : '';
  }

  if (isScalar(item.value)) {
    return String(item.value);
  }

  return Object.keys(item)
    .filter((key) => isScalar(item[key]) && String(item[key]) !== '')
    .map((key) => key + ': ' + item[key])
    .join(', ');
}

/**
 * Returns the bundles a reference field's selection lists, and whether the
 * selection negates them, as the Paragraphs selection handler can.
 */
function extractTargetBundles(data) {
  const settings = isObject(data.settings) ? data.settings : {};
  const handlerSettings = isObject(settings.handler_settings) ? settings.handler_settings : {};
  const targetBundles = handlerSettings.target_bundles;
  const negate = [true, 1, '1'].includes(handlerSettings.negate);

  return { bundles: isObject(targetBundles) ? Object.keys(targetBundles).map(String) : [], negate };
}

/**
 * Sets the target bundles of each negated selection to every bundle of its
 * target type the config defines, except the excluded ones.
 *
 * A selection that excludes every known bundle keeps no target bundles, so it
 * points at the open-ended placeholder.
 */
function resolveNegatedTargets(model, negated) {
  for (const [fieldItem, excluded] of negated) {
    fieldItem.targetBundles = model
      .getEntities()
      .filter((entity) => entity.entityType === fieldItem.targetType && entity.bundle !== '*' && !excluded.includes(entity.bundle))
      .map((entity) => entity.bundle)
      .sort(compare);
  }
}

function resolveTargets(model) {
  for (const entity of model.getEntities()) {
    for (const fieldItem of entity.fields) {
      if (!fieldItem.isReference()) {
        continue;
      }

      const targetType = String(fieldItem.targetType);
      const bundles = fieldItem.targetBundles.length === 0 ? ['*'] : fieldItem.targetBundles;

      for (const bundle of bundles) {
        const id = entityNodeId(targetType, bundle);

        if (model.hasEntity(id)) {
          continue;
        }

        const label = bundle === '*' ? 'Any ' + humanize(targetType) : humanize(bundle);
        model.addEntity(new Entity(targetType, bundle, label));
      }
    }
  }
}

function injectBaseFields(model) {
  for (const entity of model.getEntities()) {
    // Open-ended "Any <type>" placeholders are abstract, not real bundles.
    if (entity.bundle === '*') {
      continue;
    }

    const base = baseFieldsForEntityType(entity.entityType);

    if (base.length) {
      entity.setFields([...base, ...entity.fields]);
    }
  }
}

function sortModel(model) {
  const entities = model.getEntities();

  entities.sort((a, b) => {
    const rank = typeRank(a.entityType) - typeRank(b.entityType);

    return rank !== 0 ? rank : compare(a.bundle, b.bundle);
  });

  model.setEntities(entities);

  for (const entity of model.getEntities()) {
    const system = entity.fields.filter((f) => f.kind === 'system');
    const others = entity.fields.filter((f) => f.kind !== 'system');

    others.sort((a, b) => compare(a.name, b.name));

    entity.setFields([...system, ...others]);
  }
}

function typeRank(entityType) {
  const index = ENTITY_TYPE_ORDER.indexOf(entityType);

  return index === -1 ? ENTITY_TYPE_ORDER.length : index;
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
