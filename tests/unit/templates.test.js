import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { TEMPLATES, summaryCounts, templatePath, templateTitle } from '../../src/templates.js';
import { documentToModel } from '../../src/document.js';
import { ENTITY_TYPE_ORDER } from '../../src/entity-types.js';
import { hasIcon } from '../../src/icons.js';

const ROOT = join(import.meta.dirname, '..', '..');

function documentOf(template) {
  return JSON.parse(readFileSync(join(ROOT, templatePath(template)), 'utf8'));
}

test('ships a saved diagram for every template and nothing else', () => {
  const ids = TEMPLATES.map((template) => template.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(readdirSync(join(ROOT, 'templates')).sort(), TEMPLATES.map((template) => basename(templatePath(template))).sort());
});

test('describes every template completely', () => {
  for (const template of TEMPLATES) {
    assert.ok(template.label, template.id + ' has no label');
    assert.ok(template.summary, template.id + ' has no summary');
    assert.ok(hasIcon(template.icon), template.id + ' has an icon that does not exist');
    assert.match(template.color, /^#[0-9a-f]{6}$/, template.id + ' has no hex colour');

    for (const type of Object.keys(template.counts)) {
      assert.ok(ENTITY_TYPE_ORDER.includes(type), template.id + ' counts an unknown entity type ' + type);
    }
  }
});

test('versions every template by the tag of the source named after it', () => {
  for (const template of TEMPLATES) {
    const own = template.sources.find((source) => source.name === template.label);

    assert.equal(own ? own.ref : null, template.version, template.id);

    for (const source of template.sources) {
      assert.ok(source.name && source.repo && source.ref && source.paths.length > 0, template.id + ' has an incomplete source');
    }
  }
});

test('titles each template diagram by its label and version and leaves the layout and type settings to the app', () => {
  for (const template of TEMPLATES) {
    const doc = documentOf(template);

    assert.equal(doc.nexus, 1, template.id);
    assert.equal(doc.title, templateTitle(template), template.id);
    assert.deepEqual(
      { layout: doc.layout, colors: doc.colors, symbols: doc.symbols, customTypes: doc.customTypes, ui: doc.ui },
      { layout: {}, colors: {}, symbols: {}, customTypes: [], ui: null },
      template.id,
    );
  }
});

test('draws exactly the advertised bundles from each template diagram', () => {
  for (const template of TEMPLATES) {
    const drawn = {};

    for (const node of documentToModel(documentOf(template)).modelData.nodes) {
      const { group, entityType, bundle } = node.data;

      if (group === 'entity' && bundle !== '*') {
        drawn[entityType] = (drawn[entityType] || 0) + 1;
      }
    }

    assert.deepEqual(drawn, template.counts, template.id);
  }
});

test('locates a template diagram from the site root', () => {
  assert.equal(templatePath({ id: 'civictheme' }), 'templates/civictheme.nexus.json');
});

test('names a template by its label and version', () => {
  assert.equal(templateTitle({ label: 'CivicTheme', version: '1.13.0' }), 'CivicTheme 1.13.0');
});

test('summarises a template by its content types and its 2 largest other bundle types', async (t) => {
  for (const [name, counts, expected] of dataProviderSummaryCounts()) {
    await t.test(name, () => {
      assert.deepEqual(
        summaryCounts({ counts }).map(({ type, count }) => type + ':' + count),
        expected,
      );
    });
  }
});

function dataProviderSummaryCounts() {
  return [
    ['more vocabularies than media types', { node: 7, taxonomy_term: 9, media: 6, paragraph: 4, block_content: 1 }, ['node:7', 'taxonomy_term:9', 'media:6']],
    ['paragraph types ahead of vocabularies', { node: 3, taxonomy_term: 3, media: 6, paragraph: 31, block_content: 5 }, ['node:3', 'paragraph:31', 'media:6']],
    ['a tie in diagram order', { node: 1, taxonomy_term: 2, media: 2, paragraph: 2 }, ['node:1', 'taxonomy_term:2', 'media:2']],
    ['no content types', { media: 2, paragraph: 4 }, ['paragraph:4', 'media:2']],
    ['a zero count', { node: 2, media: 0 }, ['node:2']],
  ];
}
