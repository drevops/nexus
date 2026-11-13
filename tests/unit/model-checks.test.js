import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK_DEFAULTS, CHECK_RULES, MAX_FIELD_LIMIT, MAX_NAME_LENGTH, checkModel, readCheckSettings } from '../../src/model-checks.js';

const TEMPLATES = join(import.meta.dirname, '..', '..', 'templates');

const TAGS_FIELD = 'field:node.article:field_tags';

function field(name, label, fieldType, extra = {}) {
  return { name, label, fieldType, kind: 'single', cardinality: 1, targetType: null, targetBundles: [], ...extra };
}

// An article tagged from a vocabulary and built from a paragraph, with a base
// field on each, which breaks no rule.
const BASE = {
  entities: [
    {
      entityType: 'node',
      bundle: 'article',
      label: 'Article',
      fields: [
        field('title', 'Title', 'string', { kind: 'system' }),
        field('uid', 'Author', 'entity_reference', { kind: 'system' }),
        field('field_tags', 'Tags', 'entity_reference', { kind: 'multi', cardinality: -1, targetType: 'taxonomy_term', targetBundles: ['tags'] }),
        field('field_body', 'Body', 'entity_reference_revisions', { targetType: 'paragraph', targetBundles: ['hero'] }),
      ],
    },
    {
      entityType: 'taxonomy_term',
      bundle: 'tags',
      label: 'Tags',
      fields: [field('name', 'Name', 'string', { kind: 'system' }), field('field_colour', 'Colour', 'string')],
    },
    { entityType: 'paragraph', bundle: 'hero', label: 'Hero', fields: [field('field_heading', 'Heading', 'string')] },
  ],
};

function changed(change) {
  const doc = structuredClone(BASE);

  change(doc);

  return doc;
}

function entity(doc, bundle) {
  return doc.entities.find((item) => item.bundle === bundle);
}

function fieldOf(doc, bundle, name) {
  return entity(doc, bundle).fields.find((item) => item.name === name);
}

function problem(rule, id, message) {
  const level = CHECK_RULES.find((entry) => entry.id === rule).level;

  return { level, rule, message, id };
}

test('lists each rule once with a level and a label', () => {
  assert.deepEqual(
    CHECK_RULES.map((rule) => rule.id),
    ['reference-target', 'shared-storage', 'machine-name', 'duplicate-label', 'unreferenced-bundle', 'no-fields', 'list-values', 'field-limit'],
  );

  for (const rule of CHECK_RULES) {
    assert.ok(['error', 'warning'].includes(rule.level), rule.id);
    assert.ok(rule.label.length > 0, rule.id);
  }
});

test('finds no problem in a sound model', () => {
  assert.deepEqual(checkModel(BASE), []);
});

test('finds no problem in an empty or missing model', async (t) => {
  for (const [name, doc] of dataProviderEmptyModels()) {
    await t.test(name, () => {
      assert.deepEqual(checkModel(doc), []);
    });
  }
});

function dataProviderEmptyModels() {
  return [
    ['no entities', { entities: [] }],
    ['no entities key', {}],
    ['entities that are not a list', { entities: 'node.article' }],
    ['null', null],
    ['undefined', undefined],
  ];
}

test('reports each problem a rule finds', async (t) => {
  for (const [name, change, expected] of dataProviderProblems()) {
    await t.test(name, () => {
      assert.deepEqual(checkModel(changed(change)), expected);
    });
  }
});

function dataProviderProblems() {
  const tags = (doc) => fieldOf(doc, 'article', 'field_tags');
  const longName = 'a'.repeat(MAX_NAME_LENGTH + 1);

  return [
    [
      'a reference field with no target type',
      (doc) => (tags(doc).targetType = null),
      [problem('reference-target', TAGS_FIELD, 'field_tags on “Article” references no entity')],
    ],
    [
      'a reference field with an empty target type',
      (doc) => (tags(doc).targetType = ''),
      [problem('reference-target', TAGS_FIELD, 'field_tags on “Article” references no entity')],
    ],
    [
      'a reference field without target keys',
      (doc) => {
        delete tags(doc).targetType;
        delete tags(doc).targetBundles;
      },
      [problem('reference-target', TAGS_FIELD, 'field_tags on “Article” references no entity')],
    ],
    [
      'a target bundle the model does not have',
      (doc) => tags(doc).targetBundles.push('topics'),
      [problem('reference-target', TAGS_FIELD, 'field_tags on “Article” references taxonomy_term.topics, which the model does not have')],
    ],
    [
      'every bundle of a type with no wildcard entity',
      (doc) => (tags(doc).targetBundles = []),
      [problem('reference-target', TAGS_FIELD, 'field_tags on “Article” references taxonomy_term.*, which the model does not have')],
    ],
    [
      'a base field target the model does not have',
      (doc) => (fieldOf(doc, 'article', 'uid').targetType = 'user'),
      [problem('reference-target', 'field:node.article:uid', 'uid on “Article” references user.*, which the model does not have')],
    ],
    [
      'a field name with a different type on 2 bundles of 1 entity type',
      (doc) =>
        doc.entities.push({
          entityType: 'node',
          bundle: 'page',
          label: 'Page',
          fields: [field('field_tags', 'Tags', 'string', { kind: 'multi', cardinality: -1 })],
        }),
      [
        problem(
          'shared-storage',
          TAGS_FIELD,
          'field_tags on “Article” is entity_reference (1..n) but string (1..n) on “Page”, and Drupal shares 1 storage per field name',
        ),
        problem(
          'shared-storage',
          'field:node.page:field_tags',
          'field_tags on “Page” is string (1..n) but entity_reference (1..n) on “Article”, and Drupal shares 1 storage per field name',
        ),
      ],
    ],
    [
      'a field name with a different cardinality on 3 bundles',
      (doc) => {
        const tagsOn = (cardinality) => field('field_tags', 'Tags', 'entity_reference', { cardinality, targetType: 'taxonomy_term', targetBundles: ['tags'] });

        doc.entities.push(
          { entityType: 'node', bundle: 'page', label: 'Page', fields: [tagsOn(1)] },
          { entityType: 'node', bundle: 'blog', label: 'Blog', fields: [tagsOn(-1)] },
        );
      },
      [
        problem(
          'shared-storage',
          TAGS_FIELD,
          'field_tags on “Article” is entity_reference (1..n) but entity_reference (1) on “Page”, and Drupal shares 1 storage per field name',
        ),
        problem(
          'shared-storage',
          'field:node.page:field_tags',
          'field_tags on “Page” is entity_reference (1) but entity_reference (1..n) on “Article”, entity_reference (1..n) on “Blog”, and Drupal shares 1 storage per field name',
        ),
        problem(
          'shared-storage',
          'field:node.blog:field_tags',
          'field_tags on “Blog” is entity_reference (1..n) but entity_reference (1) on “Page”, and Drupal shares 1 storage per field name',
        ),
      ],
    ],
    [
      'an entity type with characters Drupal rejects, once per type',
      (doc) => {
        doc.entities.push({ entityType: 'Product', bundle: 'shirt', label: 'Shirt', fields: [field('field_size', 'Size', 'string')] });
        doc.entities.push({ entityType: 'Product', bundle: 'hat', label: 'Hat', fields: [field('field_size', 'Size', 'string')] });
      },
      [problem('machine-name', 'Product.shirt', 'The entity type Product of “Shirt” uses characters other than lowercase letters, digits and underscores')],
    ],
    [
      'a bundle name longer than Drupal allows',
      (doc) => {
        entity(doc, 'tags').bundle = longName;
        tags(doc).targetBundles = [longName];
      },
      [problem('machine-name', 'taxonomy_term.' + longName, 'The bundle ' + longName + ' of “Tags” is longer than ' + MAX_NAME_LENGTH + ' characters')],
    ],
    [
      'a bundle name with a hyphen',
      (doc) => {
        entity(doc, 'tags').bundle = 'site-tags';
        tags(doc).targetBundles = ['site-tags'];
      },
      [
        problem(
          'machine-name',
          'taxonomy_term.site-tags',
          'The bundle site-tags of “Tags” uses characters other than lowercase letters, digits and underscores',
        ),
      ],
    ],
    [
      'a field name with a capital',
      (doc) => (fieldOf(doc, 'tags', 'field_colour').name = 'field_Colour'),
      [
        problem(
          'machine-name',
          'field:taxonomy_term.tags:field_Colour',
          'The field name field_Colour on “Tags” uses characters other than lowercase letters, digits and underscores',
        ),
      ],
    ],
    [
      'an empty field name',
      (doc) => (fieldOf(doc, 'tags', 'field_colour').name = ''),
      [problem('machine-name', 'field:taxonomy_term.tags:', 'The field name  on “Tags” uses characters other than lowercase letters, digits and underscores')],
    ],
    [
      '2 fields of 1 bundle with the same label',
      (doc) => entity(doc, 'tags').fields.push(field('field_shade', ' colour ', 'string')),
      [problem('duplicate-label', 'field:taxonomy_term.tags:field_shade', 'field_shade on “Tags” has the label “colour”, as field_colour does')],
    ],
    [
      'a field labelled as a base field',
      (doc) => entity(doc, 'tags').fields.push(field('field_name', 'Name', 'string')),
      [problem('duplicate-label', 'field:taxonomy_term.tags:field_name', 'field_name on “Tags” has the label “Name”, as name does')],
    ],
    [
      'a paragraph type no field references',
      (doc) => {
        fieldOf(doc, 'article', 'field_body').fieldType = 'text_long';
        fieldOf(doc, 'article', 'field_body').targetType = null;
      },
      [problem('unreferenced-bundle', 'paragraph.hero', 'No field references the paragraph type “Hero”')],
    ],
    [
      'a media type and a block type no field references',
      (doc) =>
        doc.entities.push(
          { entityType: 'media', bundle: 'image', label: 'Image', fields: [field('field_media_image', 'Image', 'image')] },
          { entityType: 'block_content', bundle: 'basic', label: 'Basic block', fields: [field('body', 'Body', 'text_long')] },
        ),
      [
        problem('unreferenced-bundle', 'media.image', 'No field references the media type “Image”'),
        problem('unreferenced-bundle', 'block_content.basic', 'No field references the block type “Basic block”'),
      ],
    ],
    [
      'a paragraph type that only references itself is still referenced',
      (doc) =>
        entity(doc, 'hero').fields.push(field('field_items', 'Items', 'entity_reference_revisions', { targetType: 'paragraph', targetBundles: ['hero'] })),
      [],
    ],
    [
      'a bundle with only base fields',
      (doc) => (entity(doc, 'tags').fields = [field('name', 'Name', 'string', { kind: 'system' })]),
      [problem('no-fields', 'taxonomy_term.tags', '“Tags” has no fields of its own')],
    ],
    [
      'a bundle with no fields key, named by its bundle when it has no label',
      (doc) => {
        delete entity(doc, 'tags').fields;
        delete entity(doc, 'tags').label;
      },
      [problem('no-fields', 'taxonomy_term.tags', '“tags” has no fields of its own')],
    ],
    [
      'a list field of each type with no allowed values',
      (doc) =>
        entity(doc, 'tags').fields.push(
          field('field_size', 'Size', 'list_string'),
          field('field_rank', 'Rank', 'list_integer', { allowedValues: [] }),
          field('field_weight', 'Weight', 'list_float'),
        ),
      [
        problem('list-values', 'field:taxonomy_term.tags:field_size', 'field_size on “Tags” is a list with no allowed values'),
        problem('list-values', 'field:taxonomy_term.tags:field_rank', 'field_rank on “Tags” is a list with no allowed values'),
        problem('list-values', 'field:taxonomy_term.tags:field_weight', 'field_weight on “Tags” is a list with no allowed values'),
      ],
    ],
    [
      'a bundle with more fields than the default limit',
      (doc) => {
        for (let i = 1; i < CHECK_DEFAULTS.fieldLimit + 1; i++) {
          entity(doc, 'tags').fields.push(field('field_' + i, 'Field ' + i, 'string'));
        }
      },
      [
        problem(
          'field-limit',
          'taxonomy_term.tags',
          '“Tags” has ' + (CHECK_DEFAULTS.fieldLimit + 1) + ' fields, more than the limit of ' + CHECK_DEFAULTS.fieldLimit,
        ),
      ],
    ],
    [
      'errors before warnings, whatever order the rules find them in',
      (doc) => {
        entity(doc, 'tags').fields.push(field('field_size', 'Size', 'list_string'));
        fieldOf(doc, 'hero', 'field_heading').name = 'field_Heading';
      },
      [
        problem(
          'machine-name',
          'field:paragraph.hero:field_Heading',
          'The field name field_Heading on “Hero” uses characters other than lowercase letters, digits and underscores',
        ),
        problem('list-values', 'field:taxonomy_term.tags:field_size', 'field_size on “Tags” is a list with no allowed values'),
      ],
    ],
  ];
}

test('leaves the parts of a model each rule allows alone', async (t) => {
  for (const [name, change] of dataProviderAllowed()) {
    await t.test(name, () => {
      assert.deepEqual(checkModel(changed(change)), []);
    });
  }
});

function dataProviderAllowed() {
  return [
    [
      'a reference to every bundle of a type with a wildcard entity',
      (doc) => {
        fieldOf(doc, 'article', 'field_tags').targetBundles = [];
        doc.entities.push({ entityType: 'taxonomy_term', bundle: '*', label: 'Any Vocabulary' });
      },
    ],
    [
      'a paragraph type referenced through a wildcard',
      (doc) => {
        fieldOf(doc, 'article', 'field_body').targetBundles = [];
        doc.entities.push({ entityType: 'paragraph', bundle: '*', label: 'Any Paragraph' });
      },
    ],
    ['a base reference field with no target', (doc) => (fieldOf(doc, 'article', 'uid').targetType = null)],
    ['a field that is not a reference with no target', (doc) => (fieldOf(doc, 'tags', 'field_colour').targetType = undefined)],
    [
      'the same field name with the same storage on 2 bundles',
      (doc) =>
        doc.entities.push({
          entityType: 'node',
          bundle: 'page',
          label: 'Page',
          fields: [field('field_tags', 'Topics', 'entity_reference', { kind: 'multi', cardinality: -1, targetType: 'taxonomy_term', targetBundles: ['tags'] })],
        }),
    ],
    ['the same field name with another storage on another entity type', (doc) => entity(doc, 'tags').fields.push(field('field_body', 'Body', 'text_long'))],
    ['a base field name with another type on 2 bundles', (doc) => (fieldOf(doc, 'tags', 'name').fieldType = 'string_long')],
    ['a machine name of exactly the length limit', (doc) => (fieldOf(doc, 'tags', 'field_colour').name = 'f'.repeat(MAX_NAME_LENGTH))],
    ['a wildcard bundle', (doc) => doc.entities.push({ entityType: 'taxonomy_term', bundle: '*', label: 'Any Vocabulary' })],
    ['labels that differ', (doc) => entity(doc, 'tags').fields.push(field('field_shade', 'Shade', 'string'))],
    ['fields with no label', (doc) => entity(doc, 'tags').fields.push(field('field_a', '', 'string'), field('field_b', null, 'string'))],
    [
      'a list field with allowed values',
      (doc) => entity(doc, 'tags').fields.push(field('field_size', 'Size', 'list_string', { allowedValues: [{ value: 's', label: 'Small' }] })),
    ],
    [
      'a bundle with exactly the default limit of fields',
      (doc) => {
        for (let i = 1; i < CHECK_DEFAULTS.fieldLimit; i++) {
          entity(doc, 'tags').fields.push(field('field_' + i, 'Field ' + i, 'string'));
        }
      },
    ],
    [
      'an entity type no field needs to reference',
      (doc) => doc.entities.push({ entityType: 'user', bundle: 'user', label: 'User', fields: [field('field_bio', 'Bio', 'text_long')] }),
    ],
  ];
}

test('counts own fields against the limit it is given', async (t) => {
  for (const [name, settings, expected] of dataProviderFieldLimits()) {
    await t.test(name, () => {
      const problems = checkModel(BASE, settings).filter((item) => item.rule === 'field-limit');

      assert.deepEqual(
        problems.map((item) => item.message),
        expected,
      );
    });
  }
});

function dataProviderFieldLimits() {
  return [
    ['a limit below the count', { fieldLimit: 1 }, ['“Article” has 2 fields, more than the limit of 1']],
    ['a limit at the count', { fieldLimit: 2 }, []],
    ['an invalid limit, which falls back to the default', { fieldLimit: 0 }, []],
    ['no settings', undefined, []],
  ];
}

test('reads stored check settings', async (t) => {
  for (const [name, saved, expected] of dataProviderSettings()) {
    await t.test(name, () => {
      assert.deepEqual(readCheckSettings(saved), expected);
    });
  }
});

function dataProviderSettings() {
  const fallback = { fieldLimit: CHECK_DEFAULTS.fieldLimit };

  return [
    ['a valid limit', { fieldLimit: 12 }, { fieldLimit: 12 }],
    ['the lowest limit', { fieldLimit: 1 }, { fieldLimit: 1 }],
    ['the highest limit', { fieldLimit: MAX_FIELD_LIMIT }, { fieldLimit: MAX_FIELD_LIMIT }],
    ['a limit of 0', { fieldLimit: 0 }, fallback],
    ['a negative limit', { fieldLimit: -5 }, fallback],
    ['a limit above the highest', { fieldLimit: MAX_FIELD_LIMIT + 1 }, fallback],
    ['a fractional limit', { fieldLimit: 2.5 }, fallback],
    ['a limit given as text', { fieldLimit: '12' }, fallback],
    ['an infinite limit', { fieldLimit: Infinity }, fallback],
    ['an inherited limit', Object.create({ fieldLimit: 12 }), fallback],
    ['no limit', {}, fallback],
    ['null', null, fallback],
    ['a string', 'checks', fallback],
  ];
}

test('opens every template with no errors', async (t) => {
  for (const file of readdirSync(TEMPLATES)) {
    await t.test(file, () => {
      const errors = checkModel(JSON.parse(readFileSync(join(TEMPLATES, file), 'utf8'))).filter((item) => item.level === 'error');

      assert.deepEqual(errors, []);
    });
  }
});
