import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mergeConfig, readConfigFolder, renderCounts, renderManifest, renderReadme, renderSource } from '../../scripts/lib/template-sources.mjs';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'template-sources');

const TEMPLATE = {
  id: 'civictheme',
  label: 'CivicTheme',
  version: '1.13.0',
  project: 'https://www.drupal.org/project/civictheme',
  licence: 'GPL-2.0-or-later',
  sources: [{ name: 'CivicTheme', repo: 'https://git.drupalcode.org/project/civictheme.git', ref: '1.13.0', paths: ['config/install', 'config/optional'] }],
};

const COMMITS = ['e079dbb0a036cf1ccf61331de166e5f7f7397994'];

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

test('renders a manifest of sorted config file names', () => {
  assert.equal(renderManifest(['node.type.page.yml', 'field.field.node.page.body.yml']), '[\n  "field.field.node.page.body.yml",\n  "node.type.page.yml"\n]\n');
});

test('renders the source record with the commit each tag resolved to', () => {
  assert.deepEqual(JSON.parse(renderSource(TEMPLATE, COMMITS)), {
    template: 'civictheme',
    version: '1.13.0',
    sources: [{ ...TEMPLATE.sources[0], commit: COMMITS[0] }],
  });
  assert.ok(renderSource(TEMPLATE, COMMITS).endsWith('}\n'));
});

test('renders a README naming the version, each source and the licence', () => {
  const readme = renderReadme(TEMPLATE, COMMITS);

  assert.ok(readme.startsWith('# CivicTheme 1.13.0\n'));
  assert.ok(readme.includes('[CivicTheme](https://www.drupal.org/project/civictheme) 1.13.0'));
  assert.ok(readme.includes('`npm run update-templates -- civictheme`'));
  assert.ok(readme.includes('| CivicTheme | `1.13.0` | `e079dbb0a036` | `config/install`, `config/optional` |'));
  assert.ok(readme.includes('the first copy wins'));
  assert.ok(readme.includes('released under GPL-2.0-or-later'));
  assert.ok(readme.endsWith('.\n'));
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
