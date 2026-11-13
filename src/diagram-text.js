/**
 * Text formats of the diagram: Mermaid and Graphviz DOT.
 *
 * textModel() reads the entities, fields and references the canvas shows from
 * graph element definitions, the { nodes, edges } shape of
 * ContentModel.toArray() and of a live graph's elements. toMermaid() and
 * toDot() write that model as text. Nothing here touches the DOM.
 */

import { cardinalityLabel } from './model.js';
import { ENTITY_TYPE_ORDER } from './entity-types.js';
import { isHexColor } from './type-styles.js';

// Mermaid's default maxTextSize; a longer diagram doesn't render.
export const MERMAID_MAX_TEXT = 50000;

// Above this many entities Mermaid lays a diagram out slowly and overlaps it.
export const MERMAID_MAX_ENTITIES = 100;

export const MERMAID_LARGE_NOTE = '%% This model is large for Mermaid. Save it as Graphviz DOT for a faster, readable layout.';

const INDENT = '  ';

function typeRank(type) {
  const index = ENTITY_TYPE_ORDER.indexOf(type);

  return index === -1 ? ENTITY_TYPE_ORDER.length : index;
}

// Code point order, so the result doesn't depend on the locale.
function compareText(a, b) {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

function compareEntities(a, b) {
  return typeRank(a.entityType) - typeRank(b.entityType) || compareText(String(a.entityType), String(b.entityType)) || compareText(a.id, b.id);
}

function text(value, fallback) {
  const line = value == null ? '' : String(value).replace(/\s+/g, ' ').trim();

  return line === '' ? fallback : line;
}

/**
 * Reads the model a text export draws from graph element definitions.
 *
 * Options:
 * - fields: whether entities carry their fields; references are kept either
 *   way. Defaults to true.
 * - hiddenTypes: entity types left out, with their fields and references.
 * - colorFor: returns the fill colour of an entity type. Only a 6- or 8-digit
 *   hex colour is kept.
 *
 * A field with `hidden: true` is left out with its references, and so is a
 * reference whose target isn't an entity of the model. Entities are sorted by
 * entity type order and id, fields keep their graph order and references
 * follow their fields, so the text changes only where the model does.
 */
export function textModel(elements, options = {}) {
  const hiddenTypes = new Set(options.hiddenTypes || []);
  const colorFor = options.colorFor || (() => null);
  const nodes = (elements.nodes || []).map((node) => node.data);
  const edges = (elements.edges || []).map((edge) => edge.data);

  const entities = nodes
    .filter((data) => data.group === 'entity' && !hiddenTypes.has(data.entityType))
    .map((data) => ({
      id: data.id,
      label: text(data.label, data.id),
      entityType: data.entityType,
      color: isHexColor(colorFor(data.entityType)) ? colorFor(data.entityType) : null,
      fields: [],
    }))
    .sort(compareEntities);
  const byId = new Map(entities.map((entity) => [entity.id, entity]));

  const fields = nodes
    .filter((data) => data.group === 'field' && data.hidden !== true && byId.has(data.entity))
    .map((data) => ({
      id: data.id,
      entity: data.entity,
      name: text(data.name, ''),
      label: text(data.label, text(data.name, data.id)),
      type: text(data.fieldType, ''),
      cardinality: cardinalityLabel(data.cardinality == null ? 1 : data.cardinality),
      required: data.required === true,
      reference: false,
    }));
  const fieldsById = new Map(fields.map((field) => [field.id, field]));

  const targets = new Map();
  edges
    .filter((data) => data.group === 'ref' && fieldsById.has(data.source) && byId.has(data.target))
    .forEach((data) => {
      fieldsById.get(data.source).reference = true;
      targets.set(data.source, [...(targets.get(data.source) || []), data.target]);
    });

  const order = new Map(entities.map((entity, index) => [entity.id, index]));
  const references = [];

  fields.forEach((field) => {
    byId.get(field.entity).fields.push(field);
  });

  entities.forEach((entity) => {
    entity.fields.forEach((field) => {
      const ids = [...new Set(targets.get(field.id) || [])].sort((a, b) => order.get(a) - order.get(b));

      ids.forEach((target) => references.push({ source: entity.id, target: target, field: field }));
    });

    if (options.fields === false) {
      entity.fields = [];
    }
  });

  return { fields: options.fields !== false, entities: entities, references: references };
}

/**
 * Turns a value into an identifier of ASCII letters, digits and underscores
 * that starts with a letter. Any other character becomes an underscore, and a
 * value that doesn't start with a letter gets `prefix` and an underscore in
 * front. An empty value gives `prefix` alone.
 */
export function identifier(value, prefix) {
  const name = String(value == null ? '' : value).replace(/[^A-Za-z0-9_]/g, '_');

  if (name === '') {
    return prefix;
  }

  return /^[A-Za-z]/.test(name) ? name : prefix + '_' + name;
}

/**
 * Maps each id to a distinct identifier. Ids that give the same identifier
 * keep their order: the first takes it and each later one takes the lowest
 * free `_2`, `_3` suffix that no other id gives on its own.
 */
export function identifiers(ids, prefix = 'e') {
  const bases = ids.map((id) => identifier(id, prefix));
  const taken = new Set(bases);
  const used = new Set();
  const result = new Map();

  ids.forEach((id, index) => {
    let name = bases[index];

    if (used.has(name)) {
      let suffix = 2;

      while (taken.has(bases[index] + '_' + suffix)) {
        suffix++;
      }

      name = bases[index] + '_' + suffix;
      taken.add(name);
    }

    used.add(name);
    result.set(id, name);
  });

  return result;
}

function fieldDetail(field) {
  return field.cardinality + (field.required ? ', required' : '');
}

function referenceLabel(reference) {
  return reference.field.label + ' (' + reference.field.cardinality + ')';
}

// Mermaid replaces '#name;' and '#123;' codes in the diagram before it parses
// it, so '#' is encoded first and every other code stays literal. A backslash
// in an erDiagram alias is a parse error.
function mermaidText(value) {
  return value
    .replace(/#/g, '#35;')
    .replace(/\\/g, '#92;')
    .replace(/"/g, '#quot;')
    .replace(/`/g, '#96;')
    .replace(/&/g, '#amp;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;');
}

// The erDiagram key markers, which the parser reads in any case and never as
// an attribute type or name.
function attributeWord(value, prefix) {
  const name = identifier(value, prefix);

  return /^(PK|FK|UK)$/i.test(name) ? prefix + '_' + name : name;
}

function mermaidRelationship(field) {
  if (field.cardinality === '1') {
    return field.required ? '||' : 'o|';
  }

  return field.required ? '|{' : 'o{';
}

function mermaidEntityLines(entity, name, withFields) {
  const head = INDENT + name + '["' + mermaidText(entity.label) + '"]';

  if (!withFields || entity.fields.length === 0) {
    return [head];
  }

  const attributes = entity.fields.map((field) => {
    const key = field.reference ? ' FK' : '';

    return INDENT.repeat(2) + attributeWord(field.type, 't') + ' ' + attributeWord(field.name, 'f') + key + ' "' + mermaidText(field.label + ' (' + fieldDetail(field) + ')') + '"';
  });

  return [head + ' {', ...attributes, INDENT + '}'];
}

/**
 * Writes a text model as a Mermaid diagram: an `erDiagram` when its entities
 * carry fields, a `flowchart` when they don't. A model Mermaid can't draw well
 * starts with MERMAID_LARGE_NOTE.
 */
export function toMermaid(model, title = '') {
  const names = identifiers(model.entities.map((entity) => entity.id));
  const name = (id) => names.get(id);
  const lines = [];

  // The front matter is YAML, which Mermaid reads before it decodes '#'
  // codes, and a JSON string is a valid YAML string.
  if (text(title, '') !== '') {
    lines.push('---', 'title: ' + JSON.stringify(text(title, '')), '---');
  }

  lines.push(model.fields ? 'erDiagram' : 'flowchart LR');
  const header = lines.length;

  model.entities.forEach((entity) => lines.push(...mermaidEntityLines(entity, name(entity.id), model.fields)));

  model.references.forEach((reference) => {
    const label = '"' + mermaidText(referenceLabel(reference)) + '"';

    if (model.fields) {
      lines.push(INDENT + name(reference.source) + ' }o--' + mermaidRelationship(reference.field) + ' ' + name(reference.target) + ' : ' + label);
    } else {
      lines.push(INDENT + name(reference.source) + ' -->|' + label + '| ' + name(reference.target));
    }
  });

  let output = lines.join('\n') + '\n';

  if (model.entities.length > MERMAID_MAX_ENTITIES || output.length > MERMAID_MAX_TEXT) {
    lines.splice(header, 0, MERMAID_LARGE_NOTE);
    output = lines.join('\n') + '\n';
  }

  return output;
}

// Graphviz decodes HTML entities in quoted labels as well as HTML-like ones.
function dotString(value) {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/&/g, '&amp;') + '"';
}

function dotHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dotPort(index) {
  return 'f' + (index + 1);
}

function dotTable(entity) {
  const fill = entity.color ? ' BGCOLOR="' + entity.color + '"' : '';
  const rows = entity.fields.map((field, index) => {
    const meta = dotHtml([[field.name, field.type].filter(Boolean).join(': '), fieldDetail(field)].filter(Boolean).join(', '));

    return '<TR><TD PORT="' + dotPort(index) + '" ALIGN="LEFT">' + dotHtml(field.label) + ' <FONT COLOR="#6b7280">' + meta + '</FONT></TD></TR>';
  });

  return (
    '<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4">' + '<TR><TD' + fill + '><B>' + dotHtml(entity.label) + '</B></TD></TR>' + rows.join('') + '</TABLE>>'
  );
}

/**
 * Writes a text model as a Graphviz DOT digraph. With fields, each entity is
 * a table with a row per field, and each reference leaves the row of its
 * field; without, each entity is a rounded box.
 */
export function toDot(model, title = '') {
  const names = identifiers(model.entities.map((entity) => entity.id));
  const name = (id) => dotString(names.get(id));
  const graphTitle = text(title, '');
  const lines = ['digraph ' + dotString(graphTitle || 'nexus') + ' {'];
  const graphLabel = graphTitle ? ', label=' + dotString(graphTitle) + ', labelloc=t' : '';

  lines.push(INDENT + 'graph [rankdir=LR, fontname="Helvetica"' + graphLabel + '];');
  lines.push(INDENT + (model.fields ? 'node [shape=plain, fontname="Helvetica", fontsize=11];' : 'node [shape=box, style="rounded,filled", fillcolor="#ffffff", fontname="Helvetica", fontsize=11];'));
  lines.push(INDENT + 'edge [fontname="Helvetica", fontsize=9, color="#8a94a3"];');

  model.entities.forEach((entity) => {
    if (model.fields) {
      lines.push(INDENT + name(entity.id) + ' [label=' + dotTable(entity) + '];');
      return;
    }

    const fill = entity.color ? ', fillcolor="' + entity.color + '"' : '';
    lines.push(INDENT + name(entity.id) + ' [label=' + dotString(entity.label) + fill + '];');
  });

  const ports = new Map(model.entities.flatMap((entity) => entity.fields.map((field, index) => [field, ':' + dotPort(index)])));

  model.references.forEach((reference) => {
    const port = ports.get(reference.field) || '';

    lines.push(INDENT + name(reference.source) + port + ' -> ' + name(reference.target) + ' [label=' + dotString(referenceLabel(reference)) + '];');
  });

  lines.push('}');

  return lines.join('\n') + '\n';
}
