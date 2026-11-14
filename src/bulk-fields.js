/**
 * Bulk field entry: parses text holding 1 field per line into field
 * definitions, and writes a definition back as a line.
 *
 * A line is a list of columns split on commas or tabs. The first column
 * names the field as 'Label (machine_name)', as a bare machine name or as a
 * label, which gets the machine name 'field_' + its machine name. Each other
 * column is a field type, a cardinality (1 to MAX_CARDINALITY, 'unlimited'
 * or -1), 'required' or the id of a target entity, such as
 * 'taxonomy_term.tags'. Blank lines, empty columns and lines starting with
 * '#' are skipped.
 *
 * A definition is { name, label, fieldType, cardinality, required, targets },
 * with `targets` holding entity ids.
 */

import { FIELD_TYPES, MAX_CARDINALITY, REFERENCE_FIELD_TYPES } from './model.js';
import { fieldLabel, fieldMachineName, machineName } from './names.js';

const MACHINE_NAME = /^[a-z][a-z0-9_]*$/;
// Greedy, so a label holding parentheses keeps them: 'Size (cm) (field_size)'.
const LABELLED = /^(.*)\(([^()]*)\)$/;
const SEPARATOR = /[,\t]/;

/**
 * Parses each line of `text` that names a field. Returns 1 entry per such
 * line, as { line, text, field } or { line, text, error }, where `line`
 * counts from 1 and `text` is the trimmed line.
 *
 * The context holds:
 * - `taken`: the machine names the entity already has.
 * - `existing`: definitions of fields elsewhere. A line naming the same
 *   machine name defaults to that field's label, type and cardinality.
 * - `entityIds`: the entity ids a target can name.
 * - `fieldTypes`: the field types a column can name, FIELD_TYPES by default.
 */
export function parseFieldLines(text, context = {}) {
  const taken = new Set(context.taken || []);
  const existing = new Map((context.existing || []).map((field) => [field.name, field]));
  const entityIds = new Set(context.entityIds || []);
  const fieldTypes = new Set(context.fieldTypes || FIELD_TYPES);
  const listed = new Set();
  const entries = [];

  String(text ?? '')
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const source = raw.trim();

      if (!source || source.startsWith('#')) {
        return;
      }

      const result = parseLine(source, existing, entityIds, fieldTypes);
      const error = result.error || nameError(result.field.name, taken, listed);

      if (error) {
        entries.push({ line: index + 1, text: source, error: error });

        return;
      }

      listed.add(result.field.name);
      entries.push({ line: index + 1, text: source, field: result.field });
    });

  return entries;
}

/**
 * Writes a definition as a line that parseFieldLines() reads back as the same
 * definition. Commas and tabs in the label become spaces, since both split
 * columns.
 *
 * The type and cardinality are always written, so a line naming an existing
 * field doesn't take that field's.
 */
export function formatFieldLine(field) {
  const label = String(field.label ?? '')
    .replace(/[,\t]+/g, ' ')
    .trim();
  const columns = [label ? label + ' (' + field.name + ')' : field.name, field.fieldType, field.cardinality === -1 ? 'unlimited' : String(field.cardinality)];

  if (field.required) {
    columns.push('required');
  }

  return [...columns, ...(field.targets || [])].join(', ');
}

// Returns { field } or { error } for 1 trimmed, non-empty line.
function parseLine(source, existing, entityIds, fieldTypes) {
  const [first, ...rest] = source.split(SEPARATOR).map((column) => column.trim());
  const named = parseName(first);

  if (!named.name) {
    return { error: 'No machine name in “' + first + '”' };
  }

  const options = { fieldType: null, cardinality: null, required: false, targets: [] };

  for (const column of rest.filter(Boolean)) {
    const error = applyColumn(options, column, fieldTypes);

    if (error) {
      return { error: error };
    }
  }

  const reused = existing.get(named.name);
  const fieldType = options.fieldType || (reused && reused.fieldType) || 'string';

  for (const target of options.targets) {
    if (!entityIds.has(target)) {
      return { error: 'No entity “' + target + '” on the canvas' };
    }

    if (!REFERENCE_FIELD_TYPES.includes(fieldType)) {
      return { error: 'Only a reference field can target “' + target + '”' };
    }
  }

  return {
    field: {
      name: named.name,
      label: named.label || (reused && reused.label) || fieldLabel(named.name),
      fieldType: fieldType,
      cardinality: options.cardinality ?? (reused && reused.cardinality != null ? reused.cardinality : 1),
      required: options.required,
      targets: options.targets,
    },
  };
}

// Splits the first column into a machine name and a label, either of which
// can be empty.
function parseName(column) {
  const labelled = column.match(LABELLED);

  if (labelled) {
    return { name: machineName(labelled[2]), label: labelled[1].trim() };
  }

  if (MACHINE_NAME.test(column)) {
    return { name: column, label: '' };
  }

  return { name: fieldMachineName(column), label: column };
}

// Records 1 option column on `options`, or returns why it can't be used.
function applyColumn(options, column, fieldTypes) {
  const value = column.toLowerCase();

  if (fieldTypes.has(value)) {
    if (options.fieldType) {
      return 'More than 1 field type: “' + options.fieldType + '” and “' + value + '”';
    }

    options.fieldType = value;

    return null;
  }

  if (value === 'required') {
    options.required = true;

    return null;
  }

  if (value === 'unlimited' || /^-?\d+$/.test(value)) {
    const cardinality = value === 'unlimited' ? -1 : parseInt(value, 10);

    if (cardinality !== -1 && (cardinality < 1 || cardinality > MAX_CARDINALITY)) {
      return 'Cardinality “' + column + '” is not 1 to ' + MAX_CARDINALITY + ' or unlimited';
    }

    if (options.cardinality !== null) {
      return 'More than 1 cardinality';
    }

    options.cardinality = cardinality;

    return null;
  }

  if (column.includes('.')) {
    if (!options.targets.includes(column)) {
      options.targets.push(column);
    }

    return null;
  }

  return '“' + column + '” is not a field type, a cardinality, “required” or an entity id';
}

function nameError(name, taken, listed) {
  if (taken.has(name)) {
    return 'The entity already has “' + name + '”';
  }

  if (listed.has(name)) {
    return '“' + name + '” is on an earlier line';
  }

  return null;
}
