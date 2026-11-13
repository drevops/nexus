/**
 * The CSV exports: the fields table, 1 row per bundle and 1 row per
 * reference target.
 *
 * Every writer returns CSV text with CRLF line endings. A cell holding a
 * quote, a comma or a line break is quoted, with each quote doubled.
 */

import { cardinalityLabel, KIND_SYSTEM } from './model.js';
import { allowedValueLabels } from './field-settings.js';
import { documentOutline } from './document-outline.js';

const FIELD_HEADERS = [
  'Entity',
  'Entity type',
  'Field',
  'Machine name',
  'Field type',
  'Cardinality',
  'Required',
  'References',
  'Used in',
  'Help text',
  'Default',
  'Allowed values',
  'Translatable',
];

const BUNDLE_HEADERS = ['entity_type', 'bundle', 'label', 'description', 'fields', 'referenced_by', 'note'];

const REFERENCE_HEADERS = ['source_entity_type', 'source_bundle', 'field', 'field_label', 'target_entity_type', 'target_bundle', 'cardinality', 'required'];

function csvCell(value) {
  const text = String(value == null ? '' : value);

  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

/**
 * Returns CSV text of a header row followed by the given rows, each a list of
 * cell values. A null or undefined value writes an empty cell.
 */
export function csvText(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/**
 * Returns the fields table as CSV, 1 row per field record. `typeLabel` turns
 * an entity type into the label the CSV shows.
 */
export function fieldsCsv(records, typeLabel) {
  const rows = records.map((r) => [
    r.entity,
    typeLabel(r.entityType),
    r.field,
    r.name,
    r.type,
    cardinalityLabel(r.cardinality),
    yesNo(r.required),
    r.refs.map((x) => x.label).join('; '),
    r.usedIn.length || '',
    r.description,
    r.defaultValue,
    allowedValueLabels(r.allowedValues).join('; '),
    r.translatable === null ? '' : yesNo(r.translatable),
  ]);

  return csvText(FIELD_HEADERS, rows);
}

/**
 * Returns 1 row per bundle of a saved document, in outline order.
 *
 * `fields` counts the bundle's configurable fields, leaving base fields out,
 * and `referenced_by` counts the fields that reference the bundle by name.
 * An "Any <type>" placeholder is not a bundle and writes no row.
 */
export function bundlesCsv(doc) {
  const outline = documentOutline(doc);

  const rows = outline.entities
    .filter((entity) => entity.bundle !== '*')
    .map((entity) => [
      entity.entityType,
      entity.bundle,
      entity.label,
      entity.description,
      entity.fields.filter((field) => field.kind !== KIND_SYSTEM).length,
      outline.referencedBy(entity.id).length,
      entity.note,
    ]);

  return csvText(BUNDLE_HEADERS, rows);
}

/**
 * Returns 1 row per reference target of a saved document, in outline order.
 *
 * A field that targets every bundle of a type writes 1 row with '*' as its
 * target bundle.
 */
export function referencesCsv(doc) {
  const outline = documentOutline(doc);

  const rows = outline.entities.flatMap((entity) =>
    entity.fields.flatMap((field) =>
      field.targets.map((target) => {
        const index = target.indexOf('.');

        return [
          entity.entityType,
          entity.bundle,
          field.name,
          field.label,
          target.slice(0, index),
          target.slice(index + 1),
          cardinalityLabel(field.cardinality),
          yesNo(field.required),
        ];
      }),
    ),
  );

  return csvText(REFERENCE_HEADERS, rows);
}
