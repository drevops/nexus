import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isModelConfig, parseConfig } from '../../src/parser.js';
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

test('targets every defined bundle but the excluded ones from a negated selection', async (t) => {
  for (const [name, handlerSettings, targets] of dataProviderNegatedSelection()) {
    await t.test(name, () => {
      const config = {
        'paragraphs.paragraphs_type.text.yml': { label: 'Text' },
        'paragraphs.paragraphs_type.quote.yml': { label: 'Quote' },
        'paragraphs.paragraphs_type.gallery.yml': { label: 'Gallery' },
        'field.storage.node.field_paragraphs.yml': {
          entity_type: 'node',
          field_name: 'field_paragraphs',
          type: 'entity_reference_revisions',
          settings: { target_type: 'paragraph' },
        },
        'field.field.node.page.field_paragraphs.yml': {
          entity_type: 'node',
          bundle: 'page',
          field_name: 'field_paragraphs',
          field_type: 'entity_reference_revisions',
          settings: { handler: 'default:paragraph', handler_settings: handlerSettings },
        },
        'field.field.paragraph.video.field_caption.yml': { entity_type: 'paragraph', bundle: 'video', field_name: 'field_caption', field_type: 'string' },
      };
      const model = parseConfig(config, { includeBaseFields: false });
      const paragraphs = field(model.getEntity('node.page'), 'field_paragraphs');

      assert.deepEqual(paragraphs.targetBundles, targets);
      assert.equal(model.hasEntity('paragraph.*'), targets.length === 0);
    });
  }
});

function dataProviderNegatedSelection() {
  return [
    ['no exclusions', { target_bundles: null, negate: 1 }, ['gallery', 'quote', 'text', 'video']],
    ['1 exclusion', { target_bundles: { gallery: 'gallery' }, negate: 1 }, ['quote', 'text', 'video']],
    ['negate as true', { target_bundles: { gallery: 'gallery', quote: 'quote' }, negate: true }, ['text', 'video']],
    ['negate as text', { target_bundles: { text: 'text' }, negate: '1' }, ['gallery', 'quote', 'video']],
    ['an excluded bundle the config lacks', { target_bundles: { missing: 'missing' }, negate: 1 }, ['gallery', 'quote', 'text', 'video']],
    ['every bundle excluded', { target_bundles: { gallery: 'gallery', quote: 'quote', text: 'text', video: 'video' }, negate: 1 }, []],
    ['negate off', { target_bundles: { gallery: 'gallery' }, negate: 0 }, ['gallery']],
    ['negate off as text', { target_bundles: { gallery: 'gallery' }, negate: '0' }, ['gallery']],
  ];
}

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

test('reads bundle descriptions and leaves out a blank or missing one', async (t) => {
  for (const [name, id, description] of dataProviderBundleDescription()) {
    await t.test(name, () => {
      const model = parseConfig(configMin);
      const node = model.toArray().nodes.find((candidate) => candidate.data.id === id);

      assert.equal(model.getEntity(id).description, description);
      assert.equal(node.data.description, description || undefined);
    });
  }
});

function dataProviderBundleDescription() {
  return [
    ['a bundle with a description', 'node.article', 'Long-form news.'],
    ['a bundle with an empty description', 'taxonomy_term.tags', ''],
    ['a bundle without the key', 'node.page', ''],
  ];
}

test('reads the help text, default value, allowed values and translatability of a field', () => {
  const page = parseConfig(configMin).getEntity('node.page');
  const layout = field(page, 'field_layout');

  assert.equal(layout.description, 'Pick a <b>layout</b>.');
  assert.equal(layout.defaultValue, 'wide');
  assert.deepEqual(layout.allowedValues, [
    { value: 'wide', label: 'Wide' },
    { value: 'narrow', label: 'Narrow' },
  ]);
  assert.equal(layout.translatable, true);

  const summary = field(parseConfig(configMin).getEntity('node.article'), 'field_summary');

  assert.equal(summary.description, 'A short summary.');
  assert.equal(summary.defaultValue, 'Read on');
  assert.deepEqual(summary.allowedValues, []);
  assert.equal(summary.translatable, true);
});

test('leaves out every field setting the config has no value for', () => {
  const nodes = parseConfig(configMin).toArray().nodes;
  const data = (id) => nodes.find((node) => node.data.id === id).data;
  const keys = ['description', 'defaultValue', 'allowedValues', 'translatable'];
  const present = (id) => keys.filter((key) => Object.hasOwn(data(id), key));

  assert.deepEqual(present('field:node.article:field_tags'), ['translatable']);
  assert.equal(data('field:node.article:field_tags').translatable, false);
  assert.deepEqual(present('field:node.article:field_image'), []);
  assert.deepEqual(present('field:node.article:title'), []);
  assert.deepEqual(present('field:node.page:field_layout'), keys);
});

test('writes a default value as text', async (t) => {
  for (const [name, defaultValue, expected] of dataProviderDefaultValue()) {
    await t.test(name, () => {
      const config = {
        'field.field.node.page.field_thing.yml': {
          entity_type: 'node',
          bundle: 'page',
          field_name: 'field_thing',
          field_type: 'string',
          default_value: defaultValue,
        },
      };
      const thing = field(parseConfig(config, { includeBaseFields: false }).getEntity('node.page'), 'field_thing');

      assert.equal(thing.defaultValue, expected);
    });
  }
});

function dataProviderDefaultValue() {
  return [
    ['a text value', [{ value: 'Draft' }], 'Draft'],
    ['a number', [{ value: 3 }], '3'],
    ['a boolean stored as 1', [{ value: 1 }], '1'],
    ['a value of false', [{ value: false }], 'false'],
    ['several values', [{ value: 'a' }, { value: 'b' }], 'a; b'],
    ['an item without a value', [{ uri: 'https://example.com', title: 'Example', options: {} }], 'uri: https://example.com, title: Example'],
    ['a relative date', [{ default_date_type: 'relative', default_date: '+1 day' }], 'default_date_type: relative, default_date: +1 day'],
    ['an item with only empty properties', [{ value: '' }, { uri: '' }], ''],
    ['scalar items', ['a', 2], 'a; 2'],
    ['items that are not values', [null, ['a']], ''],
    ['markup', [{ value: '<b>Bold</b>' }], '<b>Bold</b>'],
    ['no items', [], ''],
    ['a value that is not a list', 'Draft', ''],
    ['no key', undefined, ''],
  ];
}

test('reads translatability only from a boolean', async (t) => {
  for (const [name, translatable, expected] of dataProviderTranslatable()) {
    await t.test(name, () => {
      const config = {
        'field.field.node.page.field_thing.yml': {
          entity_type: 'node',
          bundle: 'page',
          field_name: 'field_thing',
          field_type: 'string',
          translatable: translatable,
        },
      };
      const thing = field(parseConfig(config, { includeBaseFields: false }).getEntity('node.page'), 'field_thing');

      assert.equal(thing.translatable, expected);
    });
  }
});

function dataProviderTranslatable() {
  return [
    ['true', true, true],
    ['false', false, false],
    ['text', 'true', null],
    ['a number', 1, null],
    ['no key', undefined, null],
  ];
}

test('reads allowed values from the field storage in either config shape', async (t) => {
  for (const [name, allowedValues, expected] of dataProviderStorageAllowedValues()) {
    await t.test(name, () => {
      const config = {
        'field.storage.node.field_size.yml': {
          entity_type: 'node',
          field_name: 'field_size',
          type: 'list_integer',
          settings: { allowed_values: allowedValues },
        },
        'field.field.node.page.field_size.yml': { entity_type: 'node', bundle: 'page', field_name: 'field_size', field_type: 'list_integer' },
      };
      const size = field(parseConfig(config, { includeBaseFields: false }).getEntity('node.page'), 'field_size');

      assert.deepEqual(size.allowedValues, expected);
    });
  }
});

function dataProviderStorageAllowedValues() {
  return [
    [
      'a list of values and labels',
      [
        { value: 1, label: 'Small' },
        { value: 2, label: 'Large' },
      ],
      [
        { value: '1', label: 'Small' },
        { value: '2', label: 'Large' },
      ],
    ],
    [
      'a map of values to labels',
      { 1: 'Small', 2: 'Large' },
      [
        { value: '1', label: 'Small' },
        { value: '2', label: 'Large' },
      ],
    ],
    ['an empty list', [], []],
    ['no key', undefined, []],
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
