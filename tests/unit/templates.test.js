import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES, summaryCounts, templatePath, templateTitle } from '../../src/templates.js';
import { bundleCounts, isModelConfig, parseConfig } from '../../src/parser.js';
import { ENTITY_TYPE_ORDER } from '../../src/entity-types.js';
import { hasIcon } from '../../src/icons.js';

// The vendored UMD build exports nothing to an ES module import and sets
// globalThis.jsyaml instead.
await import('../../assets/vendor/js-yaml.min.js');

const ROOT = join(import.meta.dirname, '..', '..');
const UPSTREAM = TEMPLATES.filter((template) => template.sources.length > 0);

function templateFile(template, file) {
  return join(ROOT, templatePath(template, file));
}

function manifestOf(template) {
  return JSON.parse(readFileSync(templateFile(template, 'manifest.json'), 'utf8'));
}

test('gives every template a unique id that names its folder', () => {
  const ids = TEMPLATES.map((template) => template.id);

  assert.equal(new Set(ids).size, ids.length);

  for (const template of TEMPLATES) {
    assert.ok(existsSync(templateFile(template, 'config')), template.id + ' has no config folder');
  }
});

test('describes every template completely', () => {
  for (const template of TEMPLATES) {
    assert.ok(template.label, template.id + ' has no label');
    assert.ok(template.summary, template.id + ' has no summary');
    assert.ok(hasIcon(template.icon), template.id + ' has an icon that does not exist');
    assert.match(template.color, /^#[0-9a-f]{6}$/, template.id + ' has no hex colour');
    assert.equal(typeof template.annotations, 'boolean', template.id + ' does not say whether it has annotations');

    for (const type of Object.keys(template.counts)) {
      assert.ok(ENTITY_TYPE_ORDER.includes(type), template.id + ' counts an unknown entity type ' + type);
    }
  }
});

test('versions every upstream template by the tag of the source named after it', () => {
  for (const template of UPSTREAM) {
    const own = template.sources.find((source) => source.name === template.label);

    assert.equal(own ? own.ref : null, template.version, template.id);
    assert.match(template.project, /^https:\/\//, template.id + ' has no project page');
    assert.ok(template.licence, template.id + ' has no licence');

    for (const source of template.sources) {
      assert.ok(source.name && source.repo && source.ref && source.paths.length > 0, template.id + ' has an incomplete source');
    }
  }
});

test('lists exactly the YAML files of each template config folder in its manifest', () => {
  for (const template of TEMPLATES) {
    const files = readdirSync(templateFile(template, 'config')).filter((name) => name.endsWith('.yml'));

    assert.deepEqual(manifestOf(template), files.sort(), template.id);
  }
});

test('ships an annotation overlay exactly when a template declares one', () => {
  for (const template of TEMPLATES) {
    const file = templateFile(template, 'annotations.yml');

    assert.equal(existsSync(file), template.annotations, template.id);

    if (template.annotations) {
      assert.equal(typeof globalThis.jsyaml.load(readFileSync(file, 'utf8')), 'object', template.id);
    }
  }
});

test('advertises the bundles each template config defines', () => {
  for (const template of TEMPLATES) {
    assert.deepEqual(bundleCounts(manifestOf(template)), template.counts, template.id);
  }
});

test('draws exactly the advertised bundles from each template config', () => {
  for (const template of TEMPLATES) {
    const files = {};

    for (const name of manifestOf(template).filter(isModelConfig)) {
      files[name] = globalThis.jsyaml.load(readFileSync(templateFile(template, 'config/' + name), 'utf8'));
    }

    const drawn = {};

    for (const entity of parseConfig(files).getEntities()) {
      if (entity.bundle !== '*' && Object.hasOwn(template.counts, entity.entityType)) {
        drawn[entity.entityType] = (drawn[entity.entityType] || 0) + 1;
      }
    }

    assert.deepEqual(drawn, template.counts, template.id);
  }
});

test('records the upstream sources each template was built from', () => {
  for (const template of UPSTREAM) {
    const recorded = JSON.parse(readFileSync(templateFile(template, 'source.json'), 'utf8'));

    assert.equal(recorded.version, template.version, template.id);
    assert.deepEqual(
      recorded.sources.map(({ name, repo, ref, paths }) => ({ name, repo, ref, paths })),
      template.sources,
      template.id,
    );

    for (const source of recorded.sources) {
      assert.match(source.commit, /^[0-9a-f]{40}$/, template.id + ' records no commit for ' + source.name);
    }
  }
});

test('locates a file in a template folder from the site root', () => {
  assert.equal(templatePath({ id: 'civictheme' }, 'manifest.json'), 'templates/civictheme/manifest.json');
  assert.equal(templatePath({ id: 'civictheme' }), 'templates/civictheme/');
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
