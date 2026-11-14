/**
 * Comma-separated values: the writer every CSV export uses, the reader the
 * CSV import uses, and the bundles and references exports. The fields CSV
 * lives in fields-csv.js.
 *
 * Every writer returns CSV text with CRLF line endings. A cell holding a
 * quote, a comma or a line break is quoted, with each quote doubled. A cell
 * that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a
 * leading `'`, so a spreadsheet shows it as text, unless it is a number.
 */

import { cardinalityLabel, KIND_SYSTEM } from './model.js';
import { documentOutline } from './document-outline.js';

const BUNDLE_HEADERS = ['entity_type', 'bundle', 'label', 'description', 'fields', 'referenced_by', 'note'];

const REFERENCE_HEADERS = ['source_entity_type', 'source_bundle', 'field', 'field_label', 'target_entity_type', 'target_bundle', 'cardinality', 'required'];

// A spreadsheet evaluates a cell that starts with one of these characters as
// a formula, and document text is untrusted.
const FORMULA_START = /^[=+\-@\t\r]/;

const NUMBER = /^[+-]?\d+(\.\d+)?$/;

const SEPARATORS = [',', ';', '\t'];

function csvCell(value) {
  let text = String(value == null ? '' : value);

  if (FORMULA_START.test(text) && !NUMBER.test(text)) {
    text = "'" + text;
  }

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
 * Returns the text a cell holds after the `'` csvText() puts before a formula
 * is dropped. Any other cell comes back unchanged.
 */
export function cellText(cell) {
  const text = String(cell ?? '');
  const rest = text.slice(1);

  return text.startsWith("'") && FORMULA_START.test(rest) && !NUMBER.test(rest) ? rest : text;
}

/**
 * Returns the cell separator of CSV text: the one of ',', ';' and tab that
 * occurs most often in its first line outside quotes, or ',' on a tie.
 * Spreadsheet apps in locales with a decimal comma write ';'.
 */
export function csvSeparator(text) {
  const firstLine = String(text ?? '')
    .split(/\r|\n/)[0]
    .replace(/"[^"]*"/g, '');
  const counts = SEPARATORS.map((separator) => firstLine.split(separator).length - 1);
  const most = Math.max(...counts);

  return SEPARATORS[counts.indexOf(most)];
}

/**
 * Reads CSV text into rows of string cells, split on `separator`. Rows end in
 * CRLF, LF or CR, a leading byte order mark is dropped, and a final line
 * break adds no row.
 *
 * A double quote opens a quoted cell only at the start of a cell; elsewhere
 * it is part of the text, as spreadsheets write it. A quoted cell with no
 * closing quote throws an error whose `row` is the row the cell starts on,
 * counting from 1.
 */
export function parseCsv(text, separator = ',') {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let started = false;
  let quoteRow = 0;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (source[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = false;
      }

      continue;
    }

    if (char === '"' && cell === '') {
      quoted = true;
      started = true;
      quoteRow = rows.length + 1;
    } else if (char === separator) {
      row.push(cell);
      cell = '';
      started = true;
    } else if (char === '\r' || char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      started = false;

      if (char === '\r' && source[i + 1] === '\n') {
        i++;
      }
    } else {
      cell += char;
      started = true;
    }
  }

  if (quoted) {
    const error = new Error('A quoted cell has no closing quote.');
    error.row = quoteRow;

    throw error;
  }

  if (started || cell !== '') {
    row.push(cell);
    rows.push(row);
  }

  return rows;
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
