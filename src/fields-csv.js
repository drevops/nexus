/**
 * The fields CSV: the Fields table as 1 row per field, the template a model
 * can be written in, and the import that reads either into a saved document.
 *
 * An entity is named by its entity type, its bundle and its label. A row
 * with no field label and no field machine name names an entity with no
 * fields. A reference is written as 'Label (entity id)', and an allowed value
 * as 'Label (value)', separated by ';'.
 *
 * The import matches headers in any order and case, reads '_' as a space and
 * ignores unknown columns, so an exported CSV imports as the model it came
 * from. It leaves out what the CSV doesn't carry: notes, bundle descriptions,
 * hidden fields, annotations and the layout.
 */

import { cardinalityLabel, entityNodeId, kindForCardinality, KIND_SYSTEM, REFERENCE_FIELD_TYPES, fieldSettingsData } from './model.js';
import { findEntityType, findEntityTypeByName } from './entity-types.js';
import { baseFieldsForEntityType } from './base-fields.js';
import { allowedValueLabels, parseAllowedValues, settingText } from './field-settings.js';
import { fieldLabel, fieldMachineName, humanize, machineName } from './names.js';
import { cellText, csvSeparator, csvText, parseCsv } from './csv.js';

/**
 * The columns of the fields CSV in export order, as { key, header }. The
 * template leaves out 'Used in', which the import ignores.
 */
export const CSV_COLUMNS = [
  { key: 'entity', header: 'Entity' },
  { key: 'entityType', header: 'Entity type' },
  { key: 'bundle', header: 'Bundle' },
  { key: 'field', header: 'Field' },
  { key: 'name', header: 'Machine name' },
  { key: 'fieldType', header: 'Field type' },
  { key: 'cardinality', header: 'Cardinality' },
  { key: 'required', header: 'Required' },
  { key: 'references', header: 'References' },
  { key: 'usedIn', header: 'Used in' },
  { key: 'description', header: 'Help text' },
  { key: 'defaultValue', header: 'Default' },
  { key: 'allowedValues', header: 'Allowed values' },
  { key: 'translatable', header: 'Translatable' },
];

export const TEMPLATE_FILE_NAME = 'nexus-template.csv';

const TEMPLATE_COLUMNS = CSV_COLUMNS.filter((column) => column.key !== 'usedIn');

// Every template row writes its cardinality and required flag, as an export
// does, so the template shows the values those columns take.
const TEMPLATE_DEFAULTS = { cardinality: '1', required: 'no' };

const TEMPLATE_ROWS = [
  { entity: 'Article', entityType: 'Content type', bundle: 'article', field: 'Title', name: 'title', fieldType: 'string', required: 'yes' },
  {
    entity: 'Article',
    entityType: 'Content type',
    bundle: 'article',
    field: 'Body',
    name: 'body',
    fieldType: 'text_with_summary',
    description: 'The main text of the article.',
    translatable: 'yes',
  },
  {
    entity: 'Article',
    entityType: 'Content type',
    bundle: 'article',
    field: 'Tags',
    name: 'field_tags',
    fieldType: 'entity_reference',
    cardinality: '1..n',
    references: 'Tags (taxonomy_term.tags)',
  },
  {
    entity: 'Article',
    entityType: 'Content type',
    bundle: 'article',
    field: 'Image',
    name: 'field_image',
    fieldType: 'entity_reference',
    references: 'Image (media.image)',
  },
  {
    entity: 'Article',
    entityType: 'Content type',
    bundle: 'article',
    field: 'Components',
    name: 'field_components',
    fieldType: 'entity_reference_revisions',
    cardinality: '1..n',
    references: 'Hero (paragraph.hero)',
  },
  {
    entity: 'Article',
    entityType: 'Content type',
    bundle: 'article',
    field: 'Layout',
    name: 'field_layout',
    fieldType: 'list_string',
    required: 'yes',
    defaultValue: 'wide',
    allowedValues: 'Wide (wide); Narrow (narrow)',
  },
  { entity: 'Tags', entityType: 'Vocabulary', bundle: 'tags', field: 'Name', name: 'name', fieldType: 'string', required: 'yes' },
  { entity: 'Tags', entityType: 'Vocabulary', bundle: 'tags', field: 'Summary', name: 'field_summary', fieldType: 'string_long' },
  { entity: 'Image', entityType: 'Media', bundle: 'image', field: 'Name', name: 'name', fieldType: 'string', required: 'yes' },
  { entity: 'Image', entityType: 'Media', bundle: 'image', field: 'Image', name: 'field_media_image', fieldType: 'image', required: 'yes' },
  { entity: 'Hero', entityType: 'Paragraph', bundle: 'hero', field: 'Heading', name: 'field_heading', fieldType: 'string', required: 'yes' },
  { entity: 'Hero', entityType: 'Paragraph', bundle: 'hero', field: 'Link', name: 'field_link', fieldType: 'link' },
];

const MAX_SHOWN_ERRORS = 5;

// Greedy, so a label holding parentheses keeps them: 'Size (cm) (field_size)'.
const LABELLED = /^(.*)\(([^()]*)\)$/;
const ENTITY_ID = /^([a-z0-9_]+)\.([a-z0-9_]+|\*)$/;
const LIST_SEPARATOR = /;|\r\n|\r|\n/;
const UNLIMITED = ['n', '*', '-1', 'unlimited', '1..n', '1..*'];
const YES = ['yes', 'y', 'true', '1'];
const NO = ['no', 'n', 'false', '0'];

/**
 * Writes field records as the fields CSV. `typeLabel` turns an entity type
 * into the label the CSV shows.
 */
export function fieldsCsv(records, typeLabel) {
  const rows = records.map((record) => {
    const cells = {
      entity: record.entity,
      entityType: typeLabel(record.entityType),
      bundle: record.entityType ? record.entityId.slice(record.entityType.length + 1) : record.entityId,
      field: record.field,
      name: record.name,
      fieldType: record.type,
      cardinality: cardinalityLabel(record.cardinality),
      required: record.required ? 'yes' : 'no',
      references: record.refs.map(referenceCell).join('; '),
      usedIn: record.usedIn.length || '',
      description: record.description,
      defaultValue: record.defaultValue,
      allowedValues: allowedValueLabels(record.allowedValues).join('; '),
      translatable: record.translatable === null ? '' : record.translatable ? 'yes' : 'no',
    };

    return CSV_COLUMNS.map((column) => cells[column.key]);
  });

  return csvText(
    CSV_COLUMNS.map((column) => column.header),
    rows,
  );
}

/**
 * Returns the CSV template: the import's columns with example rows.
 */
export function csvTemplate() {
  const rows = TEMPLATE_ROWS.map((row) => ({ ...TEMPLATE_DEFAULTS, ...row })).map((row) => TEMPLATE_COLUMNS.map((column) => row[column.key]));

  return csvText(
    TEMPLATE_COLUMNS.map((column) => column.header),
    rows,
  );
}

/**
 * Returns the diagram title for a CSV file name: 'my-model-fields.csv' gives
 * 'My model'. A name with no letter or digit gives an empty string.
 */
export function csvTitle(fileName) {
  const words = String(fileName ?? '')
    .replace(/\.csv$/i, '')
    .replace(/[-_]fields$/i, '')
    .replace(/[-_\s]+/g, ' ')
    .trim();

  return /[a-z0-9]/i.test(words) ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/**
 * Reads fields CSV text into a saved document titled `title`.
 *
 * Returns { document, errors }. `errors` holds { row, message } per problem,
 * with `row` counting from 1 at the header row, and `document` is null when
 * there is any.
 */
export function csvDocument(text, title) {
  const rows = parseCsv(text, csvSeparator(text));
  const header = rows[0] || [];
  const columns = columnIndexes(header);
  const headerErrors = headerProblems(header, columns).map((message) => ({ row: 1, message: message }));

  if (headerErrors.length) {
    return { document: null, errors: headerErrors };
  }

  const state = { entities: new Map(), types: new Map(), references: [], errors: [] };

  rows.slice(1).forEach((cells, index) => readRow(state, cells, columns, index + 2));

  if (!state.entities.size && !state.errors.length) {
    state.errors.push({ row: 2, message: 'The file has no rows below the header row.' });
  }

  for (const entity of state.entities.values()) {
    entity.label = entity.label || humanize(entity.bundle);
  }

  const labels = labelIndex(state.entities);

  for (const reference of state.references) {
    resolveReferences(state, reference, labels);
  }

  if (state.errors.length) {
    return { document: null, errors: state.errors.sort((a, b) => a.row - b.row) };
  }

  return {
    document: {
      nexus: 1,
      title: title,
      colors: {},
      symbols: {},
      customTypes: [...state.types].map(([type, label]) => ({ type: type, label: label })),
      entities: [...state.entities.values()].map(({ entityType, bundle, label, fields }) => ({ entityType, bundle, label, note: '', fields })),
      annotations: { nodes: [], edges: [] },
      layout: {},
      ui: null,
    },
    errors: [],
  };
}

/**
 * Words import errors as 1 line per error, at most MAX_SHOWN_ERRORS, and a
 * line counting the rest.
 */
export function csvErrorLines(errors) {
  const lines = errors.slice(0, MAX_SHOWN_ERRORS).map((error) => 'Row ' + error.row + ': ' + error.message);
  const rest = errors.length - MAX_SHOWN_ERRORS;

  if (rest > 0) {
    lines.push('…and ' + rest + ' more ' + (rest === 1 ? 'problem' : 'problems') + '.');
  }

  return lines;
}

function referenceCell(reference) {
  return reference.label && reference.label !== reference.id ? reference.label + ' (' + reference.id + ')' : reference.id;
}

// 'Entity_type ' and 'entity  TYPE' both read as 'entity type'.
function normalHeader(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ');
}

// Maps each column key to the index of its first header cell.
function columnIndexes(header) {
  const keys = new Map(CSV_COLUMNS.map((column) => [normalHeader(column.header), column.key]));
  const indexes = {};

  header.forEach((cell, index) => {
    const key = keys.get(normalHeader(cell));

    if (key && !(key in indexes)) {
      indexes[key] = index;
    }
  });

  return indexes;
}

function headerProblems(header, columns) {
  if (header.every((cell) => cell.trim() === '')) {
    return ['The file has no header row.'];
  }

  const problems = [];

  if (!('entityType' in columns)) {
    problems.push('The header row has no “Entity type” column.');
  }

  if (!('bundle' in columns) && !('entity' in columns)) {
    problems.push('The header row has no “Bundle” or “Entity” column.');
  }

  return problems;
}

function readRow(state, cells, columns, row) {
  const cell = (key) => (key in columns ? cellText(cells[columns[key]]).trim() : '');
  const fail = (message) => state.errors.push({ row: row, message: message });

  if (cells.every((value) => value.trim() === '')) {
    return;
  }

  const typeText = cell('entityType');

  if (!typeText) {
    fail('No entity type.');

    return;
  }

  const entityType = entityTypeOf(state, typeText);
  const bundle = machineName(cell('bundle') || cell('entity'));

  if (!entityType) {
    fail('Entity type “' + typeText + '” has no letter or digit.');

    return;
  }

  if (!bundle) {
    fail('No bundle or entity label.');

    return;
  }

  const id = entityNodeId(entityType, bundle);
  const entity = state.entities.get(id) || { entityType: entityType, bundle: bundle, label: '', fields: [] };

  state.entities.set(id, entity);
  entity.label = entity.label || cell('entity');

  if (!cell('field') && !cell('name')) {
    return;
  }

  const field = readField(cell, fail, entity);

  if (field) {
    entity.fields.push(field.data);

    if (field.references.length) {
      state.references.push({ field: field.data, texts: field.references, row: row });
    }
  }
}

// Returns { data, references } for a row's field, or null after reporting
// why the row can't be read.
function readField(cell, fail, entity) {
  const name = cell('name') ? machineName(cell('name')) : fieldMachineName(cell('field'));
  const references = listItems(cell('references'));
  const fieldType = cell('fieldType') ? machineName(cell('fieldType')) : references.length ? REFERENCE_FIELD_TYPES[0] : 'string';
  const cardinality = cardinalityOf(cell('cardinality'));
  const required = flagOf(cell('required'), false);
  const translatable = flagOf(cell('translatable'), null);
  const problems = [];

  if (!name) {
    problems.push('No machine name in “' + (cell('name') || cell('field')) + '”.');
  } else if (entity.fields.some((field) => field.name === name)) {
    problems.push(entityNodeId(entity.entityType, entity.bundle) + ' already has a field “' + name + '”.');
  }

  if (!fieldType) {
    problems.push('Field type “' + cell('fieldType') + '” has no letter or digit.');
  } else if (references.length && !REFERENCE_FIELD_TYPES.includes(fieldType)) {
    problems.push('A “' + fieldType + '” field can’t have references.');
  }

  if (cardinality === undefined) {
    problems.push('Cardinality “' + cell('cardinality') + '” is not a number above 0, “1..n” or “unlimited”.');
  }

  if (required === undefined) {
    problems.push('Required “' + cell('required') + '” is not “yes” or “no”.');
  }

  if (translatable === undefined) {
    problems.push('Translatable “' + cell('translatable') + '” is not “yes”, “no” or empty.');
  }

  if (problems.length) {
    problems.forEach(fail);

    return null;
  }

  const isBase = baseFieldsForEntityType(entity.entityType).some((base) => base.name === name);
  const settings = {
    description: settingText(cell('description')),
    defaultValue: settingText(cell('defaultValue')),
    allowedValues: allowedValuesOf(cell('allowedValues')),
    translatable: translatable,
  };

  return {
    data: {
      name: name,
      label: cell('field') || fieldLabel(name),
      fieldType: fieldType,
      kind: isBase ? KIND_SYSTEM : kindForCardinality(cardinality),
      cardinality: cardinality,
      required: required,
      note: '',
      targetType: null,
      targetBundles: [],
      hidden: false,
      ...fieldSettingsData(settings),
    },
    references: references,
  };
}

// Returns the machine name of an entity type cell, registering a type that
// isn't built in, or an empty string.
function entityTypeOf(state, text) {
  const builtIn = findEntityTypeByName(text);

  if (builtIn) {
    return builtIn.type;
  }

  const type = machineName(text);

  if (type) {
    registerType(state, type, text === type ? humanize(type) : text);
  }

  return type;
}

function registerType(state, type, label) {
  if (!findEntityType(type) && !state.types.has(type)) {
    state.types.set(type, label);
  }
}

// Returns the cardinality a cell names, or undefined.
function cardinalityOf(text) {
  const value = text.toLowerCase().replace(/\s+/g, '');

  if (value === '' || value === 'single') {
    return 1;
  }

  if (UNLIMITED.includes(value)) {
    return -1;
  }

  const match = value.match(/^(?:1\.\.)?(\d+)$/);
  const count = match ? parseInt(match[1], 10) : 0;

  return count > 0 ? count : undefined;
}

// Returns true or false for a yes or no cell, `blank` for an empty one, or
// undefined.
function flagOf(text, blank) {
  const value = text.toLowerCase();

  if (value === '') {
    return blank;
  }

  if (YES.includes(value)) {
    return true;
  }

  return NO.includes(value) ? false : undefined;
}

function listItems(text) {
  return text
    .split(LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

// Reads 'Label (value)' and 'value|label' items into allowed values.
function allowedValuesOf(text) {
  const lines = listItems(text).map((item) => {
    const labelled = item.includes('|') ? null : item.match(LABELLED);

    return labelled && labelled[2].trim() ? labelled[2].trim() + '|' + (labelled[1].trim() || labelled[2].trim()) : item;
  });

  return parseAllowedValues(lines.join('\n'));
}

// Maps each lowercased entity label to the ids of the entities that have it.
function labelIndex(entities) {
  const index = new Map();

  for (const [id, entity] of entities) {
    const key = entity.label.toLowerCase();
    index.set(key, [...(index.get(key) || []), id]);
  }

  return index;
}

function resolveReferences(state, reference, labels) {
  const targets = [];

  for (const text of reference.texts) {
    const target = targetOf(text, labels);

    if (target.error) {
      state.errors.push({ row: reference.row, message: target.error });
    } else {
      targets.push(target);
    }
  }

  if (targets.length < reference.texts.length) {
    return;
  }

  const types = [...new Set(targets.map((target) => target.entityType))];

  if (types.length > 1) {
    state.errors.push({
      row: reference.row,
      message: 'The references of “' + reference.field.name + '” name more than 1 entity type: ' + types.join(', ') + '.',
    });

    return;
  }

  const bundles = [...new Set(targets.map((target) => target.bundle))];
  const anyBundle = bundles.includes('*');

  reference.field.targetType = types[0];
  reference.field.targetBundles = anyBundle ? [] : bundles;

  for (const bundle of anyBundle ? ['*'] : bundles) {
    addPlaceholder(state, types[0], bundle);
  }
}

// Returns { entityType, bundle } for a reference cell item, or { error }.
function targetOf(text, labels) {
  const labelled = text.match(LABELLED);
  const id = labelled && ENTITY_ID.test(labelled[2].trim()) ? labelled[2].trim() : text;
  const parts = id.match(ENTITY_ID);

  if (parts) {
    return { entityType: parts[1], bundle: parts[2] };
  }

  const matches = labels.get(text.toLowerCase()) || [];

  if (matches.length > 1) {
    return { error: '“' + text + '” is the label of ' + matches.join(' and ') + '. Write the entity id instead.' };
  }

  if (matches.length === 1) {
    const [entityType, bundle] = matches[0].split('.');

    return { entityType: entityType, bundle: bundle };
  }

  const type = findEntityTypeByName(text.replace(/^any\s+/i, ''));

  if (type) {
    return { entityType: type.type, bundle: '*' };
  }

  return { error: 'No entity “' + text + '” in the file. Write its entity id, such as taxonomy_term.tags.' };
}

// Adds the entity a reference targets when the file doesn't have it, labelled
// as a config import labels it.
function addPlaceholder(state, entityType, bundle) {
  const id = entityNodeId(entityType, bundle);

  if (state.entities.has(id)) {
    return;
  }

  registerType(state, entityType, humanize(entityType));
  state.entities.set(id, { entityType: entityType, bundle: bundle, label: bundle === '*' ? 'Any ' + humanize(entityType) : humanize(bundle), fields: [] });
}
