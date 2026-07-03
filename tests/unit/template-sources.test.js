import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { buildDocument, documentCounts, mergeConfig, readConfigFolder, renderCounts, renderDocument } from '../../scripts/lib/template-sources.mjs';
import { parseConfig } from '../../src/parser.js';
import { documentToModel } from '../../src/document.js';
import { configMin } from '../fixtures/config-min.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'template-sources');

function origin(name) {
  return { origin: name, files: readConfigFolder(join(FIXTURES, name)) };
}

test('reads the YAML files of a config folder by name, skipping other files and subfolders', () => {
  const files = readConfigFolder(join(FIXTURES, 'install'));

  assert.deepEqual(
    files.map((file) => file.name),
    ['field.field.node.page.body.yml', 'node.type.page.yml'],
  );
  assert.match(files[1].content, /^name: Page$/m);
});

test('refuses a config folder that is missing or holds no YAML', async (t) => {
  for (const [name, folder, message] of dataProviderUnreadableFolder()) {
    await t.test(name, () => {
      assert.throws(() => readConfigFolder(join(FIXTURES, folder)), message);
    });
  }
});

function dataProviderUnreadableFolder() {
  return [
    ['a missing folder', 'missing', /^Error: Missing config folder: /],
    ['a folder without YAML', 'empty', /^Error: No YAML files in /],
  ];
}

test('merges config folders, keeping a file 2 folders ship identically once', () => {
  const { files, shadowed } = mergeConfig([origin('install'), origin('optional')]);

  assert.deepEqual([...files.keys()], ['field.field.node.page.body.yml', 'node.type.page.yml', 'views.view.content.yml']);
  assert.equal(files.get('node.type.page.yml').origin, 'install');
  assert.equal(files.get('views.view.content.yml').origin, 'optional');
  assert.deepEqual(shadowed, []);
});

test('keeps the first copy of a file that differs between folders and reports the copy it skipped', () => {
  const { files, shadowed } = mergeConfig([origin('install'), origin('conflict')]);

  assert.match(files.get('node.type.page.yml').content, /^name: Page$/m);
  assert.deepEqual(shadowed, [{ name: 'node.type.page.yml', kept: 'install', skipped: 'conflict' }]);
});

test('builds a titled saved diagram without a layout that opens as the model the config draws', () => {
  const doc = buildDocument(configMin, 'Minimal 1.0.0');
  const model = parseConfig(configMin);

  model.setTitle('Minimal 1.0.0');

  assert.equal(doc.title, 'Minimal 1.0.0');
  assert.deepEqual(doc.layout, {});
  assert.deepEqual(documentToModel(doc).modelData, model.toArray());
});

test('counts the bundles a document draws, leaving out any-bundle targets', () => {
  assert.deepEqual(documentCounts(buildDocument(configMin, 'Minimal 1.0.0')), { node: 2, taxonomy_term: 1, media: 1, paragraph: 2 });
});

test('renders a document as indented JSON ending in a newline', () => {
  assert.equal(renderDocument({ nexus: 1, entities: [] }), '{\n  "nexus": 1,\n  "entities": []\n}\n');
});

test('renders bundle counts as an object literal', async (t) => {
  for (const [name, counts, expected] of dataProviderRenderCounts()) {
    await t.test(name, () => {
      assert.equal(renderCounts(counts), expected);
    });
  }
});

function dataProviderRenderCounts() {
  return [
    ['several types', { node: 3, paragraph: 31 }, '{ node: 3, paragraph: 31 }'],
    ['1 type', { media: 5 }, '{ media: 5 }'],
    ['no types', {}, '{}'],
  ];
}
