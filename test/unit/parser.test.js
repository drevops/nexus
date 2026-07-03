import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../../assets/parser.js';
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

test('produces deterministic output', () => {
  assert.deepEqual(parseConfig(configMin).toArray(), parseConfig(configMin).toArray());
});

test('throws on invalid input', () => {
  assert.throws(() => parseConfig(null));
});
