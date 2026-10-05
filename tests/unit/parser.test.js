import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleCounts, isModelConfig, parseConfig } from '../../src/parser.js';
import { ENTITY_TYPE_ORDER } from '../../src/entity-types.js';
import { configMin } from '../fixtures/config-min.js';

function field(entity, name) {
  const found = entity.fields.find((f) => f.name === name);
  assert.ok(found, `field "${name}" on "${entity.id()}"`);
  return found;
}

test('parses bundles including the open-ended placeholder', () => {
  const model = parseConfig(configMin);

  assert.equal(model.getEntities().length, 7);
  for (const id of ['node.article', 'node.page', 'taxonomy_term.tags', 'media.image', 'paragraph.text', 'paragraph.gallery', 'paragraph.*']) {
    assert.ok(model.hasEntity(id), id);
  }
  assert.equal(model.getEntity('node.article').label, 'Article');
  assert.equal(model.getEntity('paragraph.*').label, 'Any Paragraph');
});

test('derives field cardinality and references', () => {
  const article = parseConfig(configMin).getEntity('node.article');

  const tags = field(article, 'field_tags');
  assert.equal(tags.kind, 'multi');
  assert.ok(tags.isReference());
  assert.equal(tags.targetType, 'taxonomy_term');
  assert.deepEqual(tags.targetBundles, ['tags']);

  const summary = field(article, 'field_summary');
  assert.equal(summary.kind, 'single');
  assert.equal(summary.isReference(), false);
  assert.equal(summary.required, true);

  const image = field(article, 'field_image');
  assert.equal(image.kind, 'single');
  assert.equal(image.targetType, 'media');
  assert.deepEqual(image.targetBundles, ['image']);

  const sections = field(article, 'field_sections');
  assert.equal(sections.kind, 'multi');
  assert.equal(sections.fieldType, 'entity_reference_revisions');
  assert.equal(sections.targetType, 'paragraph');
  assert.deepEqual(sections.targetBundles, ['text', 'gallery']);
});

test('open-ended reference targets an Any placeholder without base fields', () => {
  const model = parseConfig(configMin);
  const components = field(model.getEntity('node.page'), 'field_components');

  assert.ok(components.isReference());
  assert.equal(components.targetType, 'paragraph');
  assert.deepEqual(components.targetBundles, []);
  assert.ok(model.hasEntity('paragraph.*'));
  assert.deepEqual(model.getEntity('paragraph.*').fields, []);
});

test('injects curated base fields first', () => {
  const article = parseConfig(configMin).getEntity('node.article');

  const title = field(article, 'title');
  assert.equal(title.kind, 'system');
  assert.equal(title.required, true);

  const names = article.fields.map((f) => f.name);
  assert.deepEqual(names.slice(0, 4), ['title', 'uid', 'status', 'created']);
});

test('base fields can be disabled', () => {
  const article = parseConfig(configMin, { includeBaseFields: false }).getEntity('node.article');
  const names = article.fields.map((f) => f.name);

  assert.deepEqual(names, ['field_image', 'field_sections', 'field_summary', 'field_tags']);
});

test('keeps fields on every built-in entity type and skips fields on any other type', async (t) => {
  for (const [name, entityType, kept] of dataProviderFieldEntityType()) {
    await t.test(name, () => {
      const filename = 'field.field.' + entityType + '.thing.field_note.yml';
      const config = { [filename]: { entity_type: entityType, bundle: 'thing', field_name: 'field_note', field_type: 'string' } };
      const entity = parseConfig(config, { includeBaseFields: false }).getEntity(entityType + '.thing');

      assert.deepEqual(entity ? entity.fields.map((f) => f.name) : null, kept ? ['field_note'] : null);
    });
  }
});

function dataProviderFieldEntityType() {
  return [
    ...ENTITY_TYPE_ORDER.map((entityType) => ['a field on ' + entityType, entityType, true]),
    ['a field on a comment', 'comment', false],
    ['a field on an inherited object property', 'constructor', false],
  ];
}

test('produces deterministic output', () => {
  assert.deepEqual(parseConfig(configMin).toArray(), parseConfig(configMin).toArray());
});

test('throws on invalid input', () => {
  assert.throws(() => parseConfig(null));
});

test('tells the config files the parser reads from the rest', async (t) => {
  for (const [name, filename, expected] of dataProviderModelConfig()) {
    await t.test(name, () => {
      assert.equal(isModelConfig(filename), expected);
    });
  }
});

function dataProviderModelConfig() {
  return [
    ['a content type', 'node.type.article.yml', true],
    ['a vocabulary', 'taxonomy.vocabulary.tags.yml', true],
    ['a media type', 'media.type.image.yml', true],
    ['a paragraph type', 'paragraphs.paragraphs_type.text.yml', true],
    ['a block type', 'block_content.type.basic.yml', true],
    ['a field storage', 'field.storage.node.field_tags.yml', true],
    ['a field', 'field.field.node.article.field_tags.yml', true],
    ['a view', 'views.view.content.yml', false],
    ['a form display', 'core.entity_form_display.node.article.default.yml', false],
    ['the field module settings', 'field.settings.yml', false],
    ['an annotation overlay', 'annotations.yml', false],
  ];
}

test('counts the bundles that config file names define, by entity type', () => {
  const names = [
    'node.type.article.yml',
    'node.type.page.yml',
    'taxonomy.vocabulary.tags.yml',
    'media.type.image.yml',
    'paragraphs.paragraphs_type.text.yml',
    'block_content.type.basic.yml',
    'field.field.node.article.field_tags.yml',
    'views.view.content.yml',
  ];

  assert.deepEqual(bundleCounts(names), { node: 2, taxonomy_term: 1, media: 1, paragraph: 1, block_content: 1 });
});

test('counts no bundle the parser skips', () => {
  assert.deepEqual(bundleCounts(['node.type.a.b.yml', 'field.storage.node.field_tags.yml']), {});
});

test('counts the same bundles parseConfig() builds from bundle files', () => {
  const built = {};

  for (const entity of parseConfig(configMin).getEntities()) {
    if (entity.bundle !== '*') {
      built[entity.entityType] = (built[entity.entityType] || 0) + 1;
    }
  }

  assert.deepEqual(bundleCounts(Object.keys(configMin)), built);
});
