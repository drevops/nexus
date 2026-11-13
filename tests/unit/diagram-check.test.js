import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { checkDiagram } from '../../scripts/lib/diagram-check.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'check-diagram');

// An article tagged from a vocabulary, with an event tied to the article.
const BASE = {
  nexus: 1,
  entities: [
    {
      entityType: 'node',
      bundle: 'article',
      label: 'Article',
      fields: [
        { name: 'title', label: 'Title', fieldType: 'string', kind: 'system' },
        { name: 'field_tags', label: 'Tags', fieldType: 'entity_reference', kind: 'multi', targetType: 'taxonomy_term', targetBundles: ['tags'] },
      ],
    },
    { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', fields: [{ name: 'field_colour', label: 'Colour', fieldType: 'string', kind: 'single' }] },
  ],
  annotations: { nodes: [{ id: 'published', kind: 'event', label: 'Published' }], edges: [{ from: 'node.article', to: 'published' }] },
};

function changed(change) {
  const doc = structuredClone(BASE);

  change(doc);

  return doc;
}

// An entity of the custom 'product' type, with 1 field so it has fields of
// its own.
function product(bundle, label) {
  return { entityType: 'product', bundle, label, fields: [{ name: 'field_size', label: 'Size', fieldType: 'string', kind: 'single' }] };
}

function runCheck(...files) {
  return spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-diagram.mjs'), ...files], { cwd: ROOT, encoding: 'utf8' });
}

test('reports nothing for a document that draws everything it says', () => {
  assert.deepEqual(checkDiagram(BASE), { errors: [], warnings: [] });
});

test('reports an error for each part of a document that would be lost', async (t) => {
  for (const [name, change, errors] of dataProviderErrors()) {
    await t.test(name, () => {
      assert.deepEqual(checkDiagram(changed(change)), { errors: errors, warnings: [] });
    });
  }
});

function dataProviderErrors() {
  return [
    [
      'a repeated entity',
      (doc) => doc.entities.push({ entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags again' }),
      [{ path: '/entities/2', message: 'repeats the entity taxonomy_term.tags from /entities/1' }],
    ],
    [
      'a repeated field',
      (doc) => doc.entities[0].fields.push({ name: 'title', label: 'Headline', fieldType: 'string', kind: 'single' }),
      [{ path: '/entities/0/fields/2', message: 'repeats the field title from /entities/0/fields/0' }],
    ],
    [
      'an annotation id that is an entity id',
      (doc) => doc.annotations.nodes.push({ id: 'taxonomy_term.tags', kind: 'api', label: 'Tags API' }),
      [{ path: '/annotations/nodes/1', message: 'reuses the id taxonomy_term.tags from /entities/1' }],
    ],
    [
      'an annotation id that is a field id',
      (doc) => doc.annotations.nodes.push({ id: 'field:node.article:title', kind: 'api', label: 'Title API' }),
      [{ path: '/annotations/nodes/1', message: 'reuses the id field:node.article:title from /entities/0/fields/0' }],
    ],
    [
      'a repeated annotation id',
      (doc) => doc.annotations.nodes.push({ id: 'published', kind: 'callback', label: 'Publish' }),
      [{ path: '/annotations/nodes/1', message: 'reuses the id published from /annotations/nodes/0' }],
    ],
  ];
}

test('reports a warning for each part of a document that would not be drawn', async (t) => {
  for (const [name, change, warnings] of dataProviderWarnings()) {
    await t.test(name, () => {
      assert.deepEqual(checkDiagram(changed(change)), { errors: [], warnings: warnings });
    });
  }
});

function dataProviderWarnings() {
  const tags = (doc) => doc.entities[0].fields[1];

  return [
    [
      'target bundles without a target type on a field that is not a reference',
      (doc) => {
        tags(doc).targetType = null;
        tags(doc).fieldType = 'string';
      },
      [{ path: '/entities/0/fields/1', message: 'lists targetBundles without a targetType, so it references nothing' }],
    ],
    [
      'an edge from an unknown id',
      (doc) => (doc.annotations.edges[0].from = 'node.page'),
      [{ path: '/annotations/edges/0/from', message: 'names node.page, which is not in the diagram, so the edge is not drawn' }],
    ],
    [
      'an edge to an unknown id',
      (doc) => (doc.annotations.edges[0].to = 'unpublished'),
      [{ path: '/annotations/edges/0/to', message: 'names unpublished, which is not in the diagram, so the edge is not drawn' }],
    ],
    [
      'an entity type that is not built in, once per type',
      (doc) => doc.entities.push(product('shirt', 'Shirt'), product('hat', 'Hat')),
      [
        {
          path: '/entities/2/entityType',
          message: 'product is neither a built-in entity type nor in customTypes, so it draws in the fallback colour and symbol',
        },
      ],
    ],
  ];
}

test('accepts the parts of a document that draw what they say', async (t) => {
  for (const [name, change] of dataProviderAccepted()) {
    await t.test(name, () => {
      assert.deepEqual(checkDiagram(changed(change)), { errors: [], warnings: [] });
    });
  }
});

function dataProviderAccepted() {
  return [
    [
      'a reference to every bundle of a type with a wildcard entity',
      (doc) => {
        doc.entities[0].fields[1].targetBundles = [];
        doc.entities.push({ entityType: 'taxonomy_term', bundle: '*', label: 'Any Vocabulary' });
      },
    ],
    [
      'a base reference field without a target',
      (doc) => doc.entities[0].fields.push({ name: 'uid', label: 'Author', fieldType: 'entity_reference', kind: 'system', targetType: null, targetBundles: [] }),
    ],
    [
      'an entity type listed in customTypes',
      (doc) => {
        doc.customTypes = [{ type: 'product', label: 'Product' }];
        doc.entities.push(product('shirt', 'Shirt'));
      },
    ],
    ['an edge between 2 fields', (doc) => doc.annotations.edges.push({ from: 'field:node.article:title', to: 'field:node.article:field_tags' })],
    ['the same field name on 2 entities', (doc) => doc.entities[1].fields.push({ name: 'title', label: 'Title', fieldType: 'string', kind: 'system' })],
    ['a document without annotations', (doc) => delete doc.annotations],
  ];
}

test('reports the model rules at the path of the entity or field each is on', async (t) => {
  for (const [name, change, expected] of dataProviderModelRules()) {
    await t.test(name, () => {
      assert.deepEqual(checkDiagram(changed(change)), expected);
    });
  }
});

function dataProviderModelRules() {
  const tags = (doc) => doc.entities[0].fields[1];

  return [
    [
      'a reference to a bundle the document does not define',
      (doc) => tags(doc).targetBundles.push('topics'),
      { errors: [{ path: '/entities/0/fields/1', message: 'field_tags on “Article” references taxonomy_term.topics, which the model does not have' }], warnings: [] },
    ],
    [
      'a reference to every bundle without a wildcard entity',
      (doc) => (tags(doc).targetBundles = []),
      { errors: [{ path: '/entities/0/fields/1', message: 'field_tags on “Article” references taxonomy_term.*, which the model does not have' }], warnings: [] },
    ],
    [
      'a reference field with target bundles but no target type',
      (doc) => (tags(doc).targetType = null),
      {
        errors: [{ path: '/entities/0/fields/1', message: 'field_tags on “Article” references no entity' }],
        warnings: [{ path: '/entities/0/fields/1', message: 'lists targetBundles without a targetType, so it references nothing' }],
      },
    ],
    [
      'a field name longer than Drupal allows',
      (doc) => (tags(doc).name = 'field_tags_from_the_site_vocabulary'),
      {
        errors: [{ path: '/entities/0/fields/1', message: 'The field name field_tags_from_the_site_vocabulary on “Article” is longer than 32 characters' }],
        warnings: [],
      },
    ],
    [
      'an entity without fields',
      (doc) => doc.entities.push({ entityType: 'node', bundle: 'page', label: 'Page' }),
      { errors: [], warnings: [{ path: '/entities/2', message: '“Page” has no fields of its own' }] },
    ],
  ];
}

test('leaves the model rules out while an entity or field repeats', () => {
  const { errors, warnings } = checkDiagram(changed((doc) => doc.entities.push({ entityType: 'node', bundle: 'article', label: 'Article again' })));

  assert.deepEqual(errors, [{ path: '/entities/2', message: 'repeats the entity node.article from /entities/0' }]);
  assert.deepEqual(warnings, []);
});

test('leaves the rules out until the document matches the schema', () => {
  const { errors, warnings } = checkDiagram(changed((doc) => doc.entities.push({ entityType: 'taxonomy_term', bundle: 'tags' })));

  assert.deepEqual(errors, [{ path: '/entities/2', message: "must have required property 'label'" }]);
  assert.deepEqual(warnings, []);
});

test('prints the problems of each file and exits by the worst of them', async (t) => {
  for (const [name, files, status, lines] of dataProviderCommand()) {
    await t.test(name, () => {
      const result = runCheck(...files.map((file) => join(FIXTURES, file)));

      assert.equal(result.status, status);
      assert.deepEqual(
        result.stdout.trim().split('\n'),
        lines.map((line) => join(FIXTURES, line)),
      );
    });
  }
});

function dataProviderCommand() {
  return [
    ['a clean document', ['clean.nexus.json'], 0, ['clean.nexus.json: OK']],
    ['a document with a warning', ['warning.nexus.json'], 0, ['warning.nexus.json: warning: /entities/1 “Tags” has no fields of its own']],
    ['a document with an error', ['error.nexus.json'], 1, ['error.nexus.json: error: /entities/1 repeats the entity node.page from /entities/0']],
    [
      'a document that breaks a model rule',
      ['missing-target.nexus.json'],
      1,
      ['missing-target.nexus.json: error: /entities/0/fields/0 field_tags on “Page” references taxonomy_term.tags, which the model does not have'],
    ],
    ['a document that is not JSON', ['broken.nexus.json'], 1, ['broken.nexus.json: error: ' + jsonError()]],
    ['a missing file', ['missing.nexus.json'], 1, ['missing.nexus.json: error: ' + missingError()]],
    [
      'a clean document and a broken one',
      ['clean.nexus.json', 'error.nexus.json'],
      1,
      ['clean.nexus.json: OK', 'error.nexus.json: error: /entities/1 repeats the entity node.page from /entities/0'],
    ],
  ];
}

// The messages vary with the Node version, so they're taken from Node itself.
function jsonError() {
  try {
    JSON.parse('{ "nexus": 1, "entities": [\n');
  } catch (e) {
    return e.message;
  }
}

function missingError() {
  return "ENOENT: no such file or directory, open '" + join(FIXTURES, 'missing.nexus.json') + "'";
}

test('prints its usage and exits with 2 without a file', () => {
  const result = runCheck();

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'Usage: npm run check-diagram -- <file.nexus.json> ...');
});
