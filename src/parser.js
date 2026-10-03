/**
 * Parses exported Drupal configuration into a ContentModel.
 *
 * Input is a map of `{ filename: parsedObject }` (YAML already parsed by the
 * caller), keeping this module pure and dependency-free.
 */

import { ContentModel, Entity, Field, KIND_SINGLE, KIND_MULTI } from './model.js';
import { baseFieldsForEntityType } from './base-fields.js';

const BUNDLE_PREFIXES = {
  'node.type.': 'node',
  'taxonomy.vocabulary.': 'taxonomy_term',
  'media.type.': 'media',
  'paragraphs.paragraphs_type.': 'paragraph',
  'block_content.type.': 'block_content',
};

const REFERENCE_TYPES = ['entity_reference', 'entity_reference_revisions'];

const ENTITY_TYPE_ORDER = ['node', 'taxonomy_term', 'media', 'paragraph', 'block_content', 'user', 'external'];

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

  for (const filename of filenames) {
    if (filename.startsWith('field.field.')) {
      addFieldInstance(model, files[filename], storages);
    }
  }

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

    return new Entity(entityType, bundle, String(label));
  }

  return null;
}

function collectStorages(files, filenames) {
  const storages = {};

  for (const filename of filenames) {
    if (!filename.startsWith('field.storage.')) {
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
    };
  }

  return storages;
}

function addFieldInstance(model, data, storages) {
  const entityType = data?.entity_type != null ? String(data.entity_type) : '';
  const bundle = data?.bundle != null ? String(data.bundle) : '';
  const fieldName = data?.field_name != null ? String(data.field_name) : '';

  if (!entityType || !bundle || !fieldName || !ENTITY_TYPE_ORDER.includes(entityType)) {
    return;
  }

  const entityId = entityType + '.' + bundle;
  let entity = model.getEntity(entityId);

  if (!entity) {
    entity = new Entity(entityType, bundle, humanize(bundle));
    model.addEntity(entity);
  }

  const storage = storages[entityType + '.' + fieldName] || {
    type: data.field_type != null ? String(data.field_type) : 'string',
    cardinality: 1,
    targetType: null,
  };

  const fieldType = data.field_type != null ? String(data.field_type) : storage.type;
  const isReference = REFERENCE_TYPES.includes(fieldType);
  const kind = storage.cardinality === 1 ? KIND_SINGLE : KIND_MULTI;
  const label = data.label != null ? String(data.label) : fieldName;
  const required = Boolean(data.required);
  const targetType = isReference ? storage.targetType : null;
  const targetBundles = isReference ? extractTargetBundles(data) : [];

  entity.addField(new Field(fieldName, label, fieldType, kind, required, targetType, targetBundles, storage.cardinality));
}

function extractTargetBundles(data) {
  const settings = isObject(data.settings) ? data.settings : {};
  const handlerSettings = isObject(settings.handler_settings) ? settings.handler_settings : {};
  const targetBundles = handlerSettings.target_bundles;

  if (!isObject(targetBundles)) {
    return [];
  }

  return Object.keys(targetBundles).map(String);
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
        const id = targetType + '.' + bundle;

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

function humanize(machineName) {
  return String(machineName)
    .replace(/[_.]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
