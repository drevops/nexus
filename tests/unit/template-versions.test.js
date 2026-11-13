import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  changeSummary,
  changeTitle,
  compareVersions,
  latestTag,
  orderCounts,
  ownRef,
  rewriteTemplates,
  stableTags,
} from '../../scripts/lib/template-versions.mjs';
import { TEMPLATES } from '../../src/templates.js';

const ROOT = join(import.meta.dirname, '..', '..');
const TEMPLATES_SOURCE = readFileSync(join(ROOT, 'src', 'templates.js'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, '.github', 'workflows', 'update-templates.yml'), 'utf8');

const TEMPLATE = {
  id: 'cms',
  label: 'CMS',
  version: '2.0.0',
  sources: [
    { name: 'Core', repo: 'https://git.example.com/core.git', ref: '11.0.0', paths: ['config'] },
    { name: 'CMS', repo: 'https://git.example.com/cms.git', ref: '2.0.0', paths: ['config'] },
  ],
};

function entity(entityType, bundle, fields = 1) {
  return { entityType, bundle, label: bundle, fields: Array.from({ length: fields }, (value, index) => ({ name: 'field_' + index })) };
}

// The source lines of 1 template's entry in src/templates.js.
function entryOf(text, id) {
  const start = text.indexOf("id: '" + id + "'");
  const next = text.indexOf("\n  {\n    id: '", start);

  return text.slice(start, next === -1 ? text.indexOf('\n];', start) : next);
}

test('reads the stable release tags from ls-remote output', () => {
  const output = [
    'aaa\trefs/tags/11.4.12',
    'bbb\trefs/tags/12.0.0-beta2',
    'ccc\trefs/tags/8.x-1.0',
    'ddd\trefs/tags/7.100',
    'eee\trefs/heads/11.x',
    '',
    'fff\trefs/tags/v1.2.3',
    'ggg\trefs/tags/1.10.0',
  ].join('\n');

  assert.deepEqual(stableTags(output), ['11.4.12', '1.10.0']);
});

test('reads no tags from empty output', () => {
  assert.deepEqual(stableTags(''), []);
});

test('compares stable versions by number', async (t) => {
  for (const [name, a, b, sign] of dataProviderCompareVersions()) {
    await t.test(name, () => {
      assert.equal(Math.sign(compareVersions(a, b)), sign);
    });
  }
});

function dataProviderCompareVersions() {
  return [
    ['equal versions', '1.2.3', '1.2.3', 0],
    ['a higher patch', '1.2.10', '1.2.9', 1],
    ['a lower minor', '1.9.0', '1.10.0', -1],
    ['a higher major', '12.0.0', '11.99.99', 1],
  ];
}

test('refuses to compare a version that is not stable', () => {
  assert.throws(() => compareVersions('1.0.0-rc1', '1.0.0'), /^Error: Not a stable version: 1\.0\.0-rc1$/);
  assert.throws(() => compareVersions('1.0.0', '8.x-1.0'), /^Error: Not a stable version: 8\.x-1\.0$/);
});

test('picks the latest stable tag without moving to an older release', async (t) => {
  for (const [name, tags, current, expected] of dataProviderLatestTag()) {
    await t.test(name, () => {
      assert.equal(latestTag(tags, current), expected);
    });
  }
});

function dataProviderLatestTag() {
  return [
    ['a newer release', ['1.13.0', '1.14.0', '1.9.0'], '1.13.0', '1.14.0'],
    ['the current release is the latest', ['1.12.0', '1.13.0'], '1.13.0', '1.13.0'],
    ['the current release is newer than every tag', ['1.12.0'], '1.13.0', '1.13.0'],
    ['pre-releases only', ['2.0.0-beta1', '2.0.0-rc1'], '1.13.0', '1.13.0'],
    ['no tags', [], '1.13.0', '1.13.0'],
    ['a current pre-release', ['1.0.0', '1.1.0'], '1.1.0-rc1', '1.1.0'],
    ['a stable tag beside pre-releases', ['12.0.0-beta1', '11.4.12'], '11.4.8', '11.4.12'],
  ];
}

test('finds the tag of the source named after the template', () => {
  assert.equal(ownRef(TEMPLATE, ['11.1.0', '2.1.0']), '2.1.0');
  assert.throws(() => ownRef({ ...TEMPLATE, label: 'Other' }, ['11.1.0', '2.1.0']), /^Error: cms has no source named Other$/);
});

test('orders bundle counts by entity type, with unknown types last', () => {
  const counts = orderCounts({ external: 1, custom: 4, paragraph: 31, node: 3, media: 6 });

  assert.deepEqual(counts, { node: 3, media: 6, paragraph: 31, external: 1, custom: 4 });
  assert.deepEqual(Object.keys(counts), ['node', 'media', 'paragraph', 'external', 'custom']);
});

test('leaves src/templates.js unchanged when written with the values it holds', () => {
  for (const template of TEMPLATES) {
    const update = { version: template.version, refs: template.sources.map((source) => source.ref), counts: template.counts };

    assert.equal(rewriteTemplates(TEMPLATES_SOURCE, template.id, update), TEMPLATES_SOURCE, template.id);
  }
});

test('writes the version, refs and counts of 1 template into src/templates.js and leaves the others alone', () => {
  for (const template of TEMPLATES) {
    const refs = template.sources.map((source, index) => '99.0.' + index);
    const text = rewriteTemplates(TEMPLATES_SOURCE, template.id, { version: '99.9.9', refs, counts: { paragraph: 2, node: 1 } });
    const entry = entryOf(text, template.id);
    const written = [...entry.matchAll(/^ {8}ref: '([^']+)',$/gm)].map((match) => match[1]);

    assert.match(entry, /^ {4}version: '99\.9\.9',$/m, template.id);
    assert.match(entry, /^ {4}counts: \{ node: 1, paragraph: 2 \},$/m, template.id);
    assert.deepEqual(written, refs, template.id);

    for (const other of TEMPLATES.filter((candidate) => candidate.id !== template.id)) {
      assert.equal(entryOf(text, other.id), entryOf(TEMPLATES_SOURCE, other.id), template.id + ' changed ' + other.id);
    }
  }
});

test('refuses to rewrite an entry that does not have the expected shape', async (t) => {
  for (const [name, text, id, refs, message] of dataProviderRewriteErrors()) {
    await t.test(name, () => {
      assert.throws(() => rewriteTemplates(text, id, { version: '1.0.0', refs, counts: {} }), message);
    });
  }
});

function dataProviderRewriteErrors() {
  const entry = (lines) => ['export const TEMPLATES = [', '  {', "    id: 'cms',", ...lines, '  },', '];', ''].join('\n');
  const version = "    version: '1.0.0',";
  const counts = '    counts: { node: 1 },';
  const ref = "        ref: '1.0.0',";

  return [
    ['an unknown template', entry([version, counts, ref]), 'other', ['1.0.0'], /^Error: No template other in src\/templates\.js$/],
    ['a missing version', entry([counts, ref]), 'cms', ['1.0.0'], /^Error: cms in src\/templates\.js: Expected 1 version line, found 0$/],
    ['2 counts lines', entry([version, counts, counts, ref]), 'cms', ['1.0.0'], /^Error: cms in src\/templates\.js: Expected 1 counts line, found 2$/],
    [
      'a counts object over several lines',
      entry([version, '    counts: {', '      node: 1,', '    },', ref]),
      'cms',
      ['1.0.0'],
      /Expected 1 counts line, found 0$/,
    ],
    ['fewer refs than sources', entry([version, counts, ref]), 'cms', ['1.0.0', '2.0.0'], /^Error: cms in src\/templates\.js: Expected 2 ref lines, found 1$/],
  ];
}

test('titles an update by the own release of the template, or by the other sources that moved', async (t) => {
  for (const [name, refs, expected] of dataProviderChangeTitle()) {
    await t.test(name, () => {
      assert.equal(changeTitle(TEMPLATE, refs), expected);
    });
  }
});

function dataProviderChangeTitle() {
  return [
    ['its own release moved', ['11.0.0', '2.1.0'], 'Updated the CMS template to 2.1.0.'],
    ['its own release and another source moved', ['11.1.0', '2.1.0'], 'Updated the CMS template to 2.1.0.'],
    ['another source moved', ['11.1.0', '2.0.0'], 'Updated the CMS template sources to Core 11.1.0.'],
    ['nothing moved', ['11.0.0', '2.0.0'], 'Rebuilt the CMS template.'],
  ];
}

test('describes the sources and the bundles an update adds, removes and changes', () => {
  const before = { entities: [entity('node', 'page', 2), entity('node', 'article', 3), entity('media', 'image', 1)] };
  const after = { entities: [entity('node', 'page', 2), entity('node', 'article', 4), entity('paragraph', 'text', 1)] };
  const body = changeSummary(TEMPLATE, ['11.0.0', '2.1.0'], before, after);

  assert.equal(
    body,
    [
      'Rebuilds `templates/cms.nexus.json` from the upstream tags below.',
      '',
      '## Sources',
      '',
      '| Source | Before | After |',
      '| --- | --- | --- |',
      '| [Core](https://git.example.com/core) | `11.0.0` | `11.0.0` |',
      '| [CMS](https://git.example.com/cms) | `2.0.0` | **`2.1.0`** |',
      '',
      '## Diagram',
      '',
      '- Bundles: 3 → 3',
      '- Fields: 6 → 7',
      '- Added: `paragraph.text`',
      '- Removed: `media.image`',
      '- Changed: `node.article`',
      '',
    ].join('\n'),
  );
});

test('describes a diagram with no earlier copy and leaves out empty lists', () => {
  const body = changeSummary(TEMPLATE, ['11.0.0', '2.0.0'], null, { entities: [entity('node', 'page', 2)] });

  assert.match(body, /^- Bundles: 0 → 1$/m);
  assert.match(body, /^- Fields: 0 → 2$/m);
  assert.match(body, /^- Added: `node\.page`$/m);
  assert.doesNotMatch(body, /^- (Removed|Changed):/m);
});

test('describes an unchanged diagram with counts only', () => {
  const doc = { entities: [entity('node', 'page', 2)] };
  const body = changeSummary(TEMPLATE, ['11.0.0', '2.0.0'], doc, doc);

  assert.doesNotMatch(body, /^- (Added|Removed|Changed):/m);
});

test('runs the update workflow for every template', () => {
  const match = WORKFLOW.match(/^ {8}template: \[([a-z0-9_, -]+)\]$/m);
  const ids = match ? match[1].split(',').map((id) => id.trim()) : [];

  assert.deepEqual(ids.sort(), TEMPLATES.map((template) => template.id).sort());
  assert.match(WORKFLOW, /npm run update-templates -- --latest --pr \.artifacts\/tmp\/pr "\$TEMPLATE"/);
});
