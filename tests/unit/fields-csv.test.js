import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CSV_COLUMNS, csvDocument, csvErrorLines, csvTemplate, csvTitle, fieldsCsv } from '../../src/fields-csv.js';
import { parseCsv } from '../../src/csv.js';
import { findEntityType } from '../../src/entity-types.js';
import { humanize } from '../../src/names.js';
import { TEMPLATES, templatePath } from '../../src/templates.js';
import { checkDiagram } from '../../scripts/lib/diagram-check.mjs';
import { savedDocument } from '../fixtures/saved-document.js';

const ROOT = join(import.meta.dirname, '..', '..');

const HEADER = 'Entity type,Bundle,Entity,Field,Machine name,Field type,Cardinality,Required,References,Help text,Default,Allowed values,Translatable';

// Builds the records the Fields table holds for a saved document, as the
// controller's records() does for a graph.
function recordsOf(doc) {
  const labels = new Map(doc.entities.map((entity) => [entity.entityType + '.' + entity.bundle, entity.label]));

  return doc.entities.flatMap((entity) =>
    entity.fields.map((field) => {
      const entityId = entity.entityType + '.' + entity.bundle;
      const bundles = field.targetBundles && field.targetBundles.length ? field.targetBundles : ['*'];
      const targets = field.targetType ? bundles.map((bundle) => field.targetType + '.' + bundle) : [];

      return {
        entityId: entityId,
        entity: entity.label,
        entityType: entity.entityType,
        field: field.label,
        name: field.name,
        type: field.fieldType,
        cardinality: field.cardinality,
        required: field.required,
        refs: targets.map((id) => ({ id: id, label: labels.get(id) || id })),
        usedIn: [],
        description: field.description || '',
        defaultValue: field.defaultValue || '',
        allowedValues: field.allowedValues || [],
        translatable: typeof field.translatable === 'boolean' ? field.translatable : null,
      };
    }),
  );
}

function typeLabel(type) {
  const builtIn = findEntityType(type);

  return builtIn ? builtIn.label : humanize(type);
}

// The parts of a document's entities the CSV carries, keyed by entity id.
function csvShape(doc) {
  const shape = {};

  for (const entity of doc.entities) {
    if (!entity.fields.length) {
      continue;
    }

    shape[entity.entityType + '.' + entity.bundle] = {
      label: entity.label,
      fields: entity.fields.map((field) => ({
        name: field.name,
        label: field.label,
        fieldType: field.fieldType,
        kind: field.kind,
        cardinality: field.cardinality,
        required: field.required,
        targetType: field.targetType || null,
        targetBundles: [...(field.targetBundles || [])].sort(),
        description: field.description || '',
        defaultValue: field.defaultValue || '',
        allowedValues: field.allowedValues || [],
        translatable: typeof field.translatable === 'boolean' ? field.translatable : null,
      })),
    };
  }

  return shape;
}

function imported(rows) {
  return csvDocument([HEADER, ...rows].join('\n'), 'Imported');
}

function onlyField(rows) {
  const result = imported(rows);

  assert.deepEqual(result.errors, []);

  return result.document.entities[0].fields[0];
}

test('exports field records with a header row and 1 row per field', () => {
  const rows = parseCsv(fieldsCsv(recordsOf(savedDocument), typeLabel));

  assert.deepEqual(
    rows[0],
    CSV_COLUMNS.map((column) => column.header),
  );
  assert.deepEqual(rows[1], [
    'Article',
    'Content type',
    'article',
    'Tags',
    'field_tags',
    'entity_reference',
    '1..3',
    'yes',
    'Tags (taxonomy_term.tags)',
    '',
    'Pick the topics this article covers.',
    '',
    '',
    'no',
  ]);
  assert.equal(rows.length, 1 + savedDocument.entities.reduce((count, entity) => count + entity.fields.length, 0));
});

test('exports formulas in document text as text and imports them back unchanged', () => {
  const record = { ...recordsOf(savedDocument)[0], entity: '=1+1', field: '-2+3', description: '@SUM(A1)', defaultValue: '-1' };
  const text = fieldsCsv([record], typeLabel);

  assert.deepEqual(parseCsv(text)[1].slice(0, 4), ["'=1+1", 'Content type', 'article', "'-2+3"]);
  assert.equal(parseCsv(text)[1][11], '-1');

  const field = csvDocument(text, 'Formulas').document.entities[0];

  assert.equal(field.label, '=1+1');
  assert.deepEqual([field.fields[0].label, field.fields[0].description, field.fields[0].defaultValue], ['-2+3', '@SUM(A1)', '-1']);
});

test('exports a reference to a missing entity as its id alone', () => {
  const records = [{ ...recordsOf(savedDocument)[0], refs: [{ id: 'taxonomy_term.gone', label: 'taxonomy_term.gone' }] }];

  assert.equal(parseCsv(fieldsCsv(records, typeLabel))[1][8], 'taxonomy_term.gone');
});

test('imports an exported CSV as the model it came from', () => {
  const result = csvDocument(fieldsCsv(recordsOf(savedDocument), typeLabel), 'Saved model');

  assert.deepEqual(result.errors, []);
  assert.deepEqual(csvShape(result.document), csvShape(savedDocument));
});

test('imports the CSV of every template as the template model', async (t) => {
  for (const template of TEMPLATES) {
    await t.test(template.id, () => {
      const doc = JSON.parse(readFileSync(join(ROOT, templatePath(template)), 'utf8'));
      const result = csvDocument(fieldsCsv(recordsOf(doc), typeLabel), template.label);

      assert.deepEqual(result.errors, []);
      assert.deepEqual(csvShape(result.document), csvShape(doc));
      assert.deepEqual(checkDiagram(result.document).errors, []);
    });
  }
});

test('offers a template that imports with no errors and passes the diagram checks', () => {
  const rows = parseCsv(csvTemplate());
  const result = csvDocument(csvTemplate(), 'Template');

  assert.ok(!rows[0].includes('Used in'));

  for (const row of rows.slice(1)) {
    assert.match(row[rows[0].indexOf('Cardinality')], /^(1|1\.\.n)$/);
    assert.match(row[rows[0].indexOf('Required')], /^(yes|no)$/);
  }

  assert.deepEqual(result.errors, []);
  assert.deepEqual(checkDiagram(result.document), { errors: [], warnings: [] });
  assert.deepEqual(
    result.document.entities.map((entity) => entity.entityType + '.' + entity.bundle),
    ['node.article', 'taxonomy_term.tags', 'media.image', 'paragraph.hero'],
  );
});

test('writes a saved document with no layout', () => {
  const result = imported(['node,article,Article,Body']);

  assert.deepEqual(result.document, {
    nexus: 1,
    title: 'Imported',
    colors: {},
    symbols: {},
    customTypes: [],
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'Article',
        note: '',
        fields: [
          {
            name: 'field_body',
            label: 'Body',
            fieldType: 'string',
            kind: 'single',
            cardinality: 1,
            required: false,
            note: '',
            targetType: null,
            targetBundles: [],
            hidden: false,
          },
        ],
      },
    ],
    annotations: { nodes: [], edges: [] },
    layout: {},
    ui: null,
  });
});

test('reads entities from each way of naming them', async (t) => {
  for (const [name, row, expected] of dataProviderEntities()) {
    await t.test(name, () => {
      const result = imported([row]);

      assert.deepEqual(result.errors, []);
      assert.deepEqual(
        result.document.entities.map(({ entityType, bundle, label }) => ({ entityType, bundle, label })),
        [expected],
      );
      assert.deepEqual(result.document.entities[0].fields, []);
    });
  }
});

function dataProviderEntities() {
  return [
    ['a type machine name', 'taxonomy_term,tags,Tags', { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags' }],
    ['a type label', 'Vocabulary,tags,Tags', { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags' }],
    ['a type label in another case', 'content TYPE,article,Article', { entityType: 'node', bundle: 'article', label: 'Article' }],
    ['a type label as a machine name', 'content_type,article,Article', { entityType: 'node', bundle: 'article', label: 'Article' }],
    ['a bundle noun', 'Paragraph type,hero,Hero', { entityType: 'paragraph', bundle: 'hero', label: 'Hero' }],
    ['a bundle from the entity label', 'node,,Basic page', { entityType: 'node', bundle: 'basic_page', label: 'Basic page' }],
    ['a label from the bundle', 'node,landing_page,', { entityType: 'node', bundle: 'landing_page', label: 'Landing Page' }],
    ['a bundle that is not a machine name', 'node,Blog Post,', { entityType: 'node', bundle: 'blog_post', label: 'Blog Post' }],
  ];
}

test('registers an entity type that is not built in as a custom type', async (t) => {
  for (const [name, rows, expected] of dataProviderCustomTypes()) {
    await t.test(name, () => {
      const result = imported(rows);

      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.document.customTypes, expected);
    });
  }
});

function dataProviderCustomTypes() {
  return [
    ['a label', ['Commerce product,shirt,Shirt'], [{ type: 'commerce_product', label: 'Commerce product' }]],
    ['a machine name', ['commerce_product,shirt,Shirt'], [{ type: 'commerce_product', label: 'Commerce Product' }]],
    ['the first spelling of a type', ['event,talk,Talk', 'Event,party,Party'], [{ type: 'event', label: 'Event' }]],
    ['a target type', ['node,article,Article,Group,field_group,entity_reference,,,group.*'], [{ type: 'group', label: 'Group' }]],
    ['no built-in type', ['node,article,Article', 'user,user,User', 'external,crm,CRM'], []],
  ];
}

test('keeps the first label of an entity named on several rows', () => {
  const result = imported(['node,article,Article,Body', 'node,article,Story,Image', 'node,article,,Tags']);

  assert.deepEqual(result.errors, []);
  assert.equal(result.document.entities.length, 1);
  assert.equal(result.document.entities[0].label, 'Article');
  assert.deepEqual(
    result.document.entities[0].fields.map((field) => field.name),
    ['field_body', 'field_image', 'field_tags'],
  );
});

test('reads a field from each way of naming it', async (t) => {
  for (const [name, row, expected] of dataProviderFieldNames()) {
    await t.test(name, () => {
      const field = onlyField([row]);

      assert.deepEqual({ name: field.name, label: field.label }, expected);
    });
  }
});

function dataProviderFieldNames() {
  return [
    ['a label and a machine name', 'node,article,Article,Main image,field_hero', { name: 'field_hero', label: 'Main image' }],
    ['a label alone', 'node,article,Article,Main image,', { name: 'field_main_image', label: 'Main image' }],
    ['a machine name alone', 'node,article,Article,,field_main_image', { name: 'field_main_image', label: 'Main Image' }],
    ['a machine name without the prefix', 'node,article,Article,,body', { name: 'body', label: 'Body' }],
    ['a machine name to clean up', 'node,article,Article,,Field Hero', { name: 'field_hero', label: 'Hero' }],
  ];
}

test('reads each field setting column', async (t) => {
  for (const [name, cells, expected] of dataProviderFieldSettings()) {
    await t.test(name, () => {
      const field = onlyField(['node,article,Article,Field,field_x,' + cells]);

      assert.deepEqual(Object.fromEntries(Object.keys(expected).map((key) => [key, field[key]])), expected);
    });
  }
});

function dataProviderFieldSettings() {
  return [
    ['no settings', ',,,,,,,', { fieldType: 'string', cardinality: 1, kind: 'single', required: false }],
    ['a field type', 'integer,,,,,,,', { fieldType: 'integer' }],
    ['a field type to clean up', 'Entity Reference,,,,,,,', { fieldType: 'entity_reference' }],
    ['a single cardinality', ',single,,,,,,', { cardinality: 1, kind: 'single' }],
    ['a limited cardinality', ',3,,,,,,', { cardinality: 3, kind: 'multi' }],
    ['a range cardinality', ',1..3,,,,,,', { cardinality: 3, kind: 'multi' }],
    ['a cardinality above the builder limit', ',25,,,,,,', { cardinality: 25 }],
    ['an unlimited range', ',1..n,,,,,,', { cardinality: -1, kind: 'multi' }],
    ['unlimited', ',Unlimited,,,,,,', { cardinality: -1 }],
    ['-1', ',-1,,,,,,', { cardinality: -1 }],
    ['n', ',n,,,,,,', { cardinality: -1 }],
    ['*', ',*,,,,,,', { cardinality: -1 }],
    ['required yes', ',,yes,,,,,', { required: true }],
    ['required TRUE', ',,TRUE,,,,,', { required: true }],
    ['required 1', ',,1,,,,,', { required: true }],
    ['required y', ',,y,,,,,', { required: true }],
    ['required no', ',,no,,,,,', { required: false }],
    ['required 0', ',,0,,,,,', { required: false }],
    ['help text', ',,,,Pick <em>one</em>.,,,', { description: 'Pick <em>one</em>.' }],
    ['a default value', ',,,,,wide,,', { defaultValue: 'wide' }],
    ['blank help text', ',,,,  ,,,', { description: undefined }],
    [
      'allowed values as exported',
      'list_string,,,,,,Wide (wide); Narrow (narrow),',
      {
        allowedValues: [
          { value: 'wide', label: 'Wide' },
          { value: 'narrow', label: 'Narrow' },
        ],
      },
    ],
    [
      'allowed values as value|label',
      'list_string,,,,,,wide|Wide; narrow,',
      {
        allowedValues: [
          { value: 'wide', label: 'Wide' },
          { value: 'narrow', label: 'narrow' },
        ],
      },
    ],
    [
      'allowed values on lines',
      'list_string,,,,,,"a\nb",',
      {
        allowedValues: [
          { value: 'a', label: 'a' },
          { value: 'b', label: 'b' },
        ],
      },
    ],
    ['an allowed value with empty brackets', 'list_string,,,,,,Wide (),', { allowedValues: [{ value: 'Wide ()', label: 'Wide ()' }] }],
    ['translatable yes', ',,,,,,,yes', { translatable: true }],
    ['translatable false', ',,,,,,,false', { translatable: false }],
    ['translatable blank', ',,,,,,,', { translatable: undefined }],
  ];
}

test('marks the base fields of an entity type as system fields', async (t) => {
  for (const [name, row, kind] of dataProviderBaseFields()) {
    await t.test(name, () => {
      assert.equal(onlyField([row]).kind, kind);
    });
  }
});

function dataProviderBaseFields() {
  return [
    ['a node title', 'node,article,Article,Title,title,string,1,yes', 'system'],
    ['a term name', 'taxonomy_term,tags,Tags,Name,name,string', 'system'],
    ['a user mail', 'user,user,User,Email,mail,email', 'system'],
    ['a base field name on another type', 'paragraph,hero,Hero,Title,title,string', 'single'],
    ['a field of a custom type', 'event,talk,Talk,Name,name,string', 'single'],
  ];
}

test('resolves each way of writing a reference', async (t) => {
  const entities = ['taxonomy_term,tags,Tags', 'media,image,Image', 'media,video,Video', 'node,page,Basic page'];

  for (const [name, references, expected] of dataProviderReferences()) {
    await t.test(name, () => {
      const result = imported(['node,article,Article,Ref,field_ref,,,,"' + references + '"', ...entities]);

      assert.deepEqual(result.errors, []);

      const field = result.document.entities[0].fields[0];

      assert.deepEqual({ fieldType: field.fieldType, targetType: field.targetType, targetBundles: field.targetBundles }, expected);
    });
  }
});

function dataProviderReferences() {
  return [
    ['a label with an id', 'Tags (taxonomy_term.tags)', { fieldType: 'entity_reference', targetType: 'taxonomy_term', targetBundles: ['tags'] }],
    ['an id', 'taxonomy_term.tags', { fieldType: 'entity_reference', targetType: 'taxonomy_term', targetBundles: ['tags'] }],
    ['a label', 'tags', { fieldType: 'entity_reference', targetType: 'taxonomy_term', targetBundles: ['tags'] }],
    ['a label in another case', 'BASIC PAGE', { fieldType: 'entity_reference', targetType: 'node', targetBundles: ['page'] }],
    ['several labels', 'Image; Video', { fieldType: 'entity_reference', targetType: 'media', targetBundles: ['image', 'video'] }],
    ['labels on lines', 'Image\nVideo', { fieldType: 'entity_reference', targetType: 'media', targetBundles: ['image', 'video'] }],
    ['a repeated target', 'Image; media.image', { fieldType: 'entity_reference', targetType: 'media', targetBundles: ['image'] }],
    ['any bundle by id', 'Any Media (media.*)', { fieldType: 'entity_reference', targetType: 'media', targetBundles: [] }],
    ['any bundle by type', 'media', { fieldType: 'entity_reference', targetType: 'media', targetBundles: [] }],
    ['any bundle by type label', 'Any Vocabulary', { fieldType: 'entity_reference', targetType: 'taxonomy_term', targetBundles: [] }],
    ['any bundle by humanized type', 'Any Taxonomy Term', { fieldType: 'entity_reference', targetType: 'taxonomy_term', targetBundles: [] }],
    ['any bundle beside a bundle', 'media.*; Image', { fieldType: 'entity_reference', targetType: 'media', targetBundles: [] }],
  ];
}

test('keeps the field type of a reference field it is given', () => {
  const field = onlyField(['node,article,Article,Parts,field_parts,entity_reference_revisions,,,Hero', 'paragraph,hero,Hero']);

  assert.equal(field.fieldType, 'entity_reference_revisions');
  assert.equal(field.targetType, 'paragraph');
});

test('adds the entities references target that the file lacks', () => {
  const result = imported(['node,article,Article,Tags,field_tags,,,,taxonomy_term.topics; taxonomy_term.places', 'node,article,,Media,field_media,,,,media']);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.document.entities.map(({ entityType, bundle, label, fields }) => [entityType + '.' + bundle, label, fields.length]),
    [
      ['node.article', 'Article', 2],
      ['taxonomy_term.topics', 'Topics', 0],
      ['taxonomy_term.places', 'Places', 0],
      ['media.*', 'Any Media', 0],
    ],
  );
});

test('skips blank rows and ignores unknown columns', () => {
  const text = ['Notes,ENTITY_TYPE,bundle,  Machine   Name ,Used in', 'x,node,article,field_body,3', '', ',,,,', 'y,node,page,,'].join('\r\n');
  const result = csvDocument(text, 'Columns');

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.document.entities.map((entity) => [entity.bundle, entity.fields.map((field) => field.name)]),
    [
      ['article', ['field_body']],
      ['page', []],
    ],
  );
});

test('reads a CSV whose cells are separated by semicolons or tabs', async (t) => {
  for (const separator of [';', '\t']) {
    await t.test(JSON.stringify(separator), () => {
      const rows = [
        ['Entity type', 'Bundle', 'Field', 'References'],
        ['node', 'article', 'Tags', 'Tags (taxonomy_term.tags)'],
      ];
      const result = csvDocument(rows.map((row) => row.join(separator)).join('\n'), 'Separated');

      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.document.entities[0].fields[0].targetBundles, ['tags']);
    });
  }
});

test('uses the first of 2 columns with the same header', () => {
  const result = csvDocument('Entity type,Bundle,Bundle\nnode,article,page', 'Twice');

  assert.deepEqual(
    result.document.entities.map((entity) => entity.bundle),
    ['article'],
  );
});

test('reports the problems of the header row', async (t) => {
  for (const [name, text, messages] of dataProviderHeaderErrors()) {
    await t.test(name, () => {
      const result = csvDocument(text, 'Broken');

      assert.equal(result.document, null);
      assert.deepEqual(
        result.errors,
        messages.map((message) => ({ row: 1, message: message })),
      );
    });
  }
});

function dataProviderHeaderErrors() {
  return [
    ['an empty file', '', ['The file has no header row.']],
    ['a blank header row', ',,\nnode,article', ['The file has no header row.']],
    ['no entity type', 'Bundle,Field\narticle,Body', ['The header row has no “Entity type” column.']],
    ['no bundle or entity', 'Entity type,Field\nnode,Body', ['The header row has no “Bundle” or “Entity” column.']],
    ['neither', 'Field\nBody', ['The header row has no “Entity type” column.', 'The header row has no “Bundle” or “Entity” column.']],
  ];
}

test('reports a file with no rows below the header', () => {
  assert.deepEqual(csvDocument(HEADER + '\r\n\r\n', 'Empty').errors, [{ row: 2, message: 'The file has no rows below the header row.' }]);
});

test('reports the problems of a row with its row number', async (t) => {
  for (const [name, rows, expected] of dataProviderRowErrors()) {
    await t.test(name, () => {
      const result = imported(rows);

      assert.equal(result.document, null);
      assert.deepEqual(result.errors, expected);
    });
  }
});

function dataProviderRowErrors() {
  return [
    ['no entity type', [',article,Article'], [{ row: 2, message: 'No entity type.' }]],
    ['an entity type with no letter', ['!!,article,Article'], [{ row: 2, message: 'Entity type “!!” has no letter or digit.' }]],
    ['no bundle or label', ['node,,'], [{ row: 2, message: 'No bundle or entity label.' }]],
    ['a bundle with no letter', ['node,***,'], [{ row: 2, message: 'No bundle or entity label.' }]],
    ['a field with no machine name', ['node,article,Article,!!!'], [{ row: 2, message: 'No machine name in “!!!”.' }]],
    [
      'a repeated machine name',
      ['node,article,Article,Body,body', 'node,article,Article,Text,body'],
      [{ row: 3, message: 'node.article already has a field “body”.' }],
    ],
    ['a field type with no letter', ['node,article,Article,Body,body,???'], [{ row: 2, message: 'Field type “???” has no letter or digit.' }]],
    ['references on a field of another type', ['node,article,Article,Tags,,string,,,media'], [{ row: 2, message: 'A “string” field can’t have references.' }]],
    ...['0', 'many', '1..0', '2..5', '-2'].map((value) => [
      'cardinality ' + value,
      ['node,article,Article,Body,,,' + value],
      [{ row: 2, message: 'Cardinality “' + value + '” is not a number above 0, “1..n” or “unlimited”.' }],
    ]),
    ['required maybe', ['node,article,Article,Body,,,,maybe'], [{ row: 2, message: 'Required “maybe” is not “yes” or “no”.' }]],
    ['translatable maybe', ['node,article,Article,Body,,,,,,,,,maybe'], [{ row: 2, message: 'Translatable “maybe” is not “yes”, “no” or empty.' }]],
    [
      'several problems on 1 row',
      ['node,article,Article,Body,,,0,maybe'],
      [
        { row: 2, message: 'Cardinality “0” is not a number above 0, “1..n” or “unlimited”.' },
        { row: 2, message: 'Required “maybe” is not “yes” or “no”.' },
      ],
    ],
    [
      'an unknown reference',
      ['node,article,Article,Tags,,,,,Topics'],
      [{ row: 2, message: 'No entity “Topics” in the file. Write its entity id, such as taxonomy_term.tags.' }],
    ],
    [
      'a label 2 entities share',
      ['node,article,Article,Image,,,,,Image', 'media,image,Image', 'paragraph,image,Image'],
      [{ row: 2, message: '“Image” is the label of media.image and paragraph.image. Write the entity id instead.' }],
    ],
    [
      'references to 2 entity types',
      ['node,article,Article,Ref,field_ref,,,,media.image; taxonomy_term.tags'],
      [{ row: 2, message: 'The references of “field_ref” name more than 1 entity type: media, taxonomy_term.' }],
    ],
    [
      'problems on several rows in row order',
      ['node,article,Article,Tags,,,,,Topics', 'node,page,Page,Body,,,0'],
      [
        { row: 2, message: 'No entity “Topics” in the file. Write its entity id, such as taxonomy_term.tags.' },
        { row: 3, message: 'Cardinality “0” is not a number above 0, “1..n” or “unlimited”.' },
      ],
    ],
  ];
}

test('counts rows from 1 at the header across quoted line breaks', () => {
  const result = imported(['node,article,Article,Body,,,,,,"Line 1\nLine 2"', 'node,article,Article,Text,,,0']);

  assert.deepEqual(result.errors, [{ row: 3, message: 'Cardinality “0” is not a number above 0, “1..n” or “unlimited”.' }]);
});

test('words import errors as lines', async (t) => {
  for (const [name, count, expected] of dataProviderErrorLines()) {
    await t.test(name, () => {
      const errors = Array.from({ length: count }, (_, index) => ({ row: index + 2, message: 'Problem ' + (index + 1) + '.' }));

      assert.deepEqual(csvErrorLines(errors), expected);
    });
  }
});

function dataProviderErrorLines() {
  const lines = (count) => Array.from({ length: count }, (_, index) => 'Row ' + (index + 2) + ': Problem ' + (index + 1) + '.');

  return [
    ['no errors', 0, []],
    ['1 error', 1, lines(1)],
    ['5 errors', 5, lines(5)],
    ['6 errors', 6, [...lines(5), '…and 1 more problem.']],
    ['8 errors', 8, [...lines(5), '…and 3 more problems.']],
  ];
}

test('titles a diagram after its CSV file name', async (t) => {
  for (const [name, fileName, expected] of dataProviderTitles()) {
    await t.test(name, () => {
      assert.equal(csvTitle(fileName), expected);
    });
  }
});

function dataProviderTitles() {
  return [
    ['an exported file', 'content-model-fields.csv', 'Content model'],
    ['an underscored name', 'my_site_fields.CSV', 'My site'],
    ['spaces', 'Shop model.csv', 'Shop model'],
    ['the template', 'nexus-template.csv', 'Nexus template'],
    ['a name that is only the suffix', '-fields.csv', ''],
    ['no letter or digit', '--.csv', ''],
    ['null', null, ''],
  ];
}
