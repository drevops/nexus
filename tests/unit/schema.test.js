import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA, checkDiagram } from '../../scripts/lib/diagram-check.mjs';
import { TEMPLATES, templatePath } from '../../src/templates.js';
import { ANNOTATION_KINDS } from '../../src/annotations.js';
import { KIND_CALCULATED, KIND_MULTI, KIND_SINGLE, KIND_SYSTEM } from '../../src/model.js';
import { SYMBOLS, isHexColor, isTypeName } from '../../src/type-styles.js';
import { savedDocument } from '../fixtures/saved-document.js';

const ROOT = join(import.meta.dirname, '..', '..');

const DEFS = SCHEMA.$defs;

function keysOf(definition) {
  return Object.keys(definition.properties).sort();
}

// The union of the keys of a list of objects, sorted.
function keysAcross(items) {
  return [...new Set(items.flatMap((item) => Object.keys(item)))].sort();
}

test('publishes the schema at the URL it names as its id', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  assert.equal(SCHEMA.$id, pkg.homepage + '/schema/nexus.schema.json');
});

test('declares exactly the keys a saved document holds', async (t) => {
  for (const [name, declared, saved] of dataProviderSavedKeys()) {
    await t.test(name, () => {
      assert.deepEqual(declared, saved);
    });
  }
});

function dataProviderSavedKeys() {
  const doc = savedDocument;
  const fields = doc.entities.flatMap((entity) => entity.fields);

  return [
    ['the document', keysOf(SCHEMA).filter((key) => key !== '$schema'), keysAcross([doc])],
    ['a custom type', keysOf(DEFS.customType), keysAcross(doc.customTypes)],
    ['an entity', keysOf(DEFS.entity), keysAcross(doc.entities)],
    ['a field', keysOf(DEFS.field), keysAcross(fields)],
    ['an allowed value', keysOf(DEFS.allowedValue), keysAcross(fields.flatMap((field) => field.allowedValues || []))],
    ['the annotations', keysOf(SCHEMA.properties.annotations), keysAcross([doc.annotations])],
    ['an annotation node', keysOf(DEFS.annotationNode), keysAcross(doc.annotations.nodes)],
    ['an annotation edge', keysOf(DEFS.annotationEdge), keysAcross(doc.annotations.edges)],
    ['a position', keysOf(DEFS.position), keysAcross(Object.values(doc.layout))],
  ];
}

test('accepts every document Nexus saves', async (t) => {
  for (const [name, doc] of dataProviderSavedDocuments()) {
    await t.test(name, () => {
      assert.deepEqual(checkDiagram(doc).errors, []);
    });
  }
});

function dataProviderSavedDocuments() {
  const empty = {
    nexus: 1,
    title: 'Content model',
    colors: {},
    symbols: {},
    customTypes: [],
    entities: [],
    annotations: { nodes: [], edges: [] },
    layout: {},
    ui: null,
  };
  const templates = TEMPLATES.map((template) => ['the ' + template.id + ' template', JSON.parse(readFileSync(join(ROOT, templatePath(template)), 'utf8'))]);

  return [['a document holding every key', savedDocument], ['an empty diagram', empty], ...templates];
}

test('accepts a document with only the required keys', () => {
  assert.deepEqual(checkDiagram({ nexus: 1, entities: [] }), { errors: [], warnings: [] });
});

test('rejects a document that breaks the schema, at the path of the break', async (t) => {
  for (const [name, change, path] of dataProviderSchemaBreaks()) {
    await t.test(name, () => {
      const doc = structuredClone(savedDocument);

      change(doc);

      const paths = checkDiagram(doc).errors.map((error) => error.path);

      assert.ok(paths.includes(path), path + ' is not among ' + paths.join(', '));
    });
  }
});

function dataProviderSchemaBreaks() {
  const field = (doc) => doc.entities[0].fields[0];
  const layout = (doc) => doc.entities[0].fields[1];

  return [
    ['no format version', (doc) => delete doc.nexus, '/'],
    ['another format version', (doc) => (doc.nexus = 2), '/nexus'],
    ['no entities', (doc) => delete doc.entities, '/'],
    ['an unknown top-level key', (doc) => (doc.entites = []), '/'],
    ['a title that is not text', (doc) => (doc.title = 42), '/title'],
    ['a colour that is not hex', (doc) => (doc.colors.node = 'red'), '/colors/node'],
    ['a colour keyed by a name that is not a machine name', (doc) => (doc.colors['Blog post'] = '#112233'), '/colors'],
    ['an unknown symbol', (doc) => (doc.symbols.node = 'star'), '/symbols/node'],
    ['a custom type without a label', (doc) => delete doc.customTypes[0].label, '/customTypes/0'],
    ['an entity without a bundle', (doc) => delete doc.entities[0].bundle, '/entities/0'],
    ['a bundle that is not a machine name', (doc) => (doc.entities[0].bundle = 'Blog post'), '/entities/0/bundle'],
    ['an entity type that is not a machine name', (doc) => (doc.entities[0].entityType = 'Node'), '/entities/0/entityType'],
    ['an entity with an empty label', (doc) => (doc.entities[0].label = ''), '/entities/0/label'],
    ['a field without a kind', (doc) => delete field(doc).kind, '/entities/0/fields/0'],
    ['a misspelt field key', (doc) => (field(doc).fieldtype = 'string'), '/entities/0/fields/0'],
    ['an unknown field kind', (doc) => (field(doc).kind = 'many'), '/entities/0/fields/0/kind'],
    ['a cardinality of 0', (doc) => (field(doc).cardinality = 0), '/entities/0/fields/0/cardinality'],
    ['a fractional cardinality', (doc) => (field(doc).cardinality = 2.5), '/entities/0/fields/0/cardinality'],
    ['a multi-value field with a cardinality of 1', (doc) => (field(doc).cardinality = 1), '/entities/0/fields/0/cardinality'],
    ['a single-value field with a cardinality above 1', (doc) => (doc.entities[0].fields[1].cardinality = 3), '/entities/0/fields/1/cardinality'],
    ['a required flag that is not a boolean', (doc) => (field(doc).required = 'yes'), '/entities/0/fields/0/required'],
    ['a target bundle that is not a machine name', (doc) => (field(doc).targetBundles = ['Tags']), '/entities/0/fields/0/targetBundles/0'],
    ['an entity description that is not text', (doc) => (doc.entities[0].description = 7), '/entities/0/description'],
    ['help text that is not text', (doc) => (field(doc).description = ['Pick']), '/entities/0/fields/0/description'],
    ['a default value that is not text', (doc) => (field(doc).defaultValue = 1), '/entities/0/fields/0/defaultValue'],
    ['allowed values that are not a list', (doc) => (field(doc).allowedValues = { wide: 'Wide' }), '/entities/0/fields/0/allowedValues'],
    ['an allowed value without a value', (doc) => (layout(doc).allowedValues = [{ label: 'Wide' }]), '/entities/0/fields/1/allowedValues/0'],
    ['an allowed value with an empty value', (doc) => (layout(doc).allowedValues = [{ value: '' }]), '/entities/0/fields/1/allowedValues/0/value'],
    ['an allowed value with an unknown key', (doc) => (layout(doc).allowedValues = [{ value: 'wide', key: 'wide' }]), '/entities/0/fields/1/allowedValues/0'],
    ['a translatable flag that is not a boolean', (doc) => (field(doc).translatable = 'yes'), '/entities/0/fields/0/translatable'],
    ['an annotation without an id', (doc) => delete doc.annotations.nodes[0].id, '/annotations/nodes/0'],
    ['an unknown annotation kind', (doc) => (doc.annotations.nodes[0].kind = 'webhook'), '/annotations/nodes/0/kind'],
    ['an edge without an end', (doc) => delete doc.annotations.edges[0].to, '/annotations/edges/0'],
    ['a position without a y', (doc) => delete doc.layout['node.article'].y, '/layout/node.article'],
    ['a panel arrangement that is not an object', (doc) => (doc.ui = 'docked'), '/ui'],
  ];
}

test('names each break in words an agent can act on', async (t) => {
  for (const [name, change, message] of dataProviderSchemaMessages()) {
    await t.test(name, () => {
      const doc = structuredClone(savedDocument);

      change(doc);

      const messages = checkDiagram(doc).errors.map((error) => error.message);

      assert.ok(messages.includes(message), message + ' is not among ' + messages.join(', '));
    });
  }
});

function dataProviderSchemaMessages() {
  return [
    ['an unknown key', (doc) => (doc.entities[0].fields[0].fieldtype = 'string'), 'has the unknown key "fieldtype"'],
    ['an unknown value', (doc) => (doc.annotations.nodes[0].kind = 'webhook'), 'must be equal to one of the allowed values: event, api, callback'],
    ['a missing key', (doc) => delete doc.nexus, "must have required property 'nexus'"],
  ];
}

test('lists the field kinds the model defines', () => {
  assert.deepEqual(DEFS.field.properties.kind.enum, [KIND_SINGLE, KIND_MULTI, KIND_SYSTEM, KIND_CALCULATED]);
});

test('lists the annotation kinds the overlay draws', () => {
  assert.deepEqual(
    DEFS.annotationNode.properties.kind.enum,
    ANNOTATION_KINDS.map((entry) => entry.kind),
  );
});

test('lists the symbols the renderer draws', () => {
  assert.deepEqual(DEFS.symbol.enum, Object.keys(SYMBOLS));
});

test('describes colours and type names as the app accepts them', async (t) => {
  for (const [name, value] of dataProviderStyleValues()) {
    await t.test(name, () => {
      assert.equal(new RegExp(DEFS.color.pattern).test(value), isHexColor(value), 'colour');
      assert.equal(new RegExp(DEFS.machineName.pattern).test(value), isTypeName(value), 'type name');
    });
  }
});

function dataProviderStyleValues() {
  return [
    ['a 6-digit hex colour', '#a1B2c3'],
    ['an 8-digit hex colour', '#a1b2c3d4'],
    ['a 3-digit hex colour', '#abc'],
    ['a colour carrying markup', '#a1b2c3"/><img>'],
    ['a machine name', 'taxonomy_term'],
    ['a name with a capital', 'Node'],
    ['a name with a quote', 'node"'],
    ['an empty string', ''],
  ];
}
