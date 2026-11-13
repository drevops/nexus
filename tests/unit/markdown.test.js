import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MARKDOWN_DEFAULTS,
  MARKDOWN_DIAGRAM_LIMIT,
  MARKDOWN_DIAGRAM_OPTIONS,
  documentMarkdown,
  headingSlug,
  headingSlugger,
  includesDiagram,
  markdownCode,
  markdownText,
  readMarkdownSettings,
} from '../../src/markdown.js';
import { markdownDocument } from '../fixtures/markdown/document.js';
import { savedDocument } from '../fixtures/saved-document.js';

const expected = (name) => readFileSync(new URL('../fixtures/markdown/' + name, import.meta.url), 'utf8');

function entity(entityType, bundle, label, fields = [], note = '') {
  return { entityType, bundle, label, note, fields };
}

function field(name, label, extra = {}) {
  return { name, label, fieldType: 'string', kind: 'single', cardinality: 1, required: false, note: '', targetType: null, targetBundles: [], ...extra };
}

function doc(entities, extra = {}) {
  return { nexus: 1, title: 'Model', customTypes: [], entities, ...extra };
}

// Returns the lines of the markdown that start with any of the prefixes.
function linesStarting(markdown, ...prefixes) {
  return markdown.split('\n').filter((line) => prefixes.some((prefix) => line.startsWith(prefix)));
}

test('writes the fixture document as the expected file', () => {
  assert.equal(documentMarkdown(markdownDocument), expected('document.md'));
});

test('writes the fixture document with its diagram as the expected file', () => {
  assert.equal(documentMarkdown(markdownDocument, { diagram: true }), expected('document-diagram.md'));
});

test('leaves the diagram out unless it is asked for', () => {
  assert.doesNotMatch(documentMarkdown(markdownDocument), /```mermaid/);
  assert.doesNotMatch(documentMarkdown(markdownDocument, { diagram: false }), /```mermaid/);
});

test('writes a model with no entities as a title and a line', () => {
  assert.equal(documentMarkdown(doc([], { title: 'Empty' }), { diagram: true }), '# Empty\n\nThe model has no entities.\n');
});

test('takes the default title for a missing or blank title', async (t) => {
  for (const [name, title] of dataProviderDefaultTitle()) {
    await t.test(name, () => {
      assert.match(documentMarkdown(doc([entity('node', 'page', 'Page')], { title })), /^# Content model\n/);
    });
  }
});

function dataProviderDefaultTitle() {
  return [
    ['missing', undefined],
    ['blank', '  '],
    ['not a string', 42],
  ];
}

test('lists entity types in diagram order, then custom types, then other types by name', () => {
  const markdown = documentMarkdown(
    doc(
      [
        entity('zebra', 'z', 'Z'),
        entity('user', 'user', 'User'),
        entity('gizmo', 'g', 'G'),
        entity('apple', 'a', 'A'),
        entity('media', 'image', 'Image'),
        entity('node', 'page', 'Page'),
      ],
      { customTypes: [{ type: 'gizmo', label: 'Gizmo' }] },
    ),
  );

  assert.deepEqual(linesStarting(markdown, '## '), ['## Contents', '## Content types', '## Media types', '## User types', '## Gizmo', '## Apple', '## Zebra']);
});

test('lists the bundles of a type by label, then by machine name', () => {
  const markdown = documentMarkdown(
    doc([entity('node', 'b_page', 'Page'), entity('node', 'news', 'Article news'), entity('node', 'a_page', 'Page'), entity('node', 'event', 'article')]),
  );

  assert.deepEqual(linesStarting(markdown, '### ', 'Machine name: '), [
    '### article',
    'Machine name: `event`',
    '### Article news',
    'Machine name: `news`',
    '### Page',
    'Machine name: `a_page`',
    '### Page',
    'Machine name: `b_page`',
  ]);
});

test('links each contents entry to the anchor GitHub gives its heading', () => {
  const markdown = documentMarkdown(doc([entity('node', 'a_page', 'Page'), entity('node', 'b_page', 'Page'), entity('node', 'model', 'Model')]), {
    diagram: true,
  });

  assert.deepEqual(linesStarting(markdown, '- ', '  - '), [
    '- [Diagram](#diagram)',
    '- [Content types](#content-types)',
    '  - [Model](#model-1)',
    '  - [Page](#page)',
    '  - [Page](#page-1)',
  ]);
});

test('keeps the last copy of an entity listed twice', () => {
  const markdown = documentMarkdown(doc([entity('node', 'page', 'First'), entity('node', 'page', 'Second')]));

  assert.deepEqual(linesStarting(markdown, '### '), ['### Second']);
});

test('writes the note of an entity as a quote and the note of a field in its cell', () => {
  const markdown = documentMarkdown(
    doc([entity('node', 'page', 'Page', [field('body', 'Body', { note: 'Line 1\n\n  Line 2  ' })], '\n  First\r\nSecond\n\n\nThird\n')]),
  );

  assert.match(markdown, /\n> First<br>\n> Second\n>\n> Third\n/);
  assert.match(markdown, /\| Line 1<br>Line 2 \|\n/);
});

test('leaves out the quote of an entity with a blank note', () => {
  const markdown = documentMarkdown(doc([entity('node', 'page', 'Page', [], ' \n ')]));

  assert.doesNotMatch(markdown, /^>/m);
});

test('fills in what a document leaves out of a field', () => {
  const markdown = documentMarkdown(
    doc([
      entity('node', 'page', '', [
        { name: 'body', kind: 'multi' },
        { name: 'tags', label: 'Tags', kind: 'single' },
      ]),
    ]),
  );

  assert.match(markdown, /### page\n/);
  assert.ok(markdown.includes('\n| body | `body` |  | 1..n | No |  |  |\n'));
  assert.ok(markdown.includes('\n| Tags | `tags` |  | 1 | No |  |  |\n'));
});

test('marks base fields and writes the cardinality and required columns', () => {
  const markdown = documentMarkdown(
    doc([
      entity('node', 'page', 'Page', [
        field('title', 'Title', { kind: 'system', required: true }),
        field('field_links', 'Links', { kind: 'multi', cardinality: 5 }),
        field('field_score', 'Score', { kind: 'calculated', fieldType: 'computed' }),
      ]),
    ]),
  );

  assert.deepEqual(linesStarting(markdown, '| T', '| L', '| S'), [
    '| Title (base field) | `title` | `string` | 1 | Yes |  |  |',
    '| Links | `field_links` | `string` | 1..5 | No |  |  |',
    '| Score | `field_score` | `computed` | 1 | No |  |  |',
  ]);
});

test('writes each reference target as a link, a wildcard label or a machine name', () => {
  const markdown = documentMarkdown(
    doc([
      entity('node', 'page', 'Page', [
        field('field_tags', 'Tags', { targetType: 'taxonomy_term', targetBundles: ['tags', 'gone'] }),
        field('field_any', 'Any', { targetType: 'media', targetBundles: [] }),
        field('field_every', 'Every', { targetType: 'block_content' }),
      ]),
      entity('taxonomy_term', 'tags', 'Tags'),
      entity('block_content', '*', 'Every block'),
    ]),
  );

  assert.match(markdown, /\| \[Tags\]\(#tags\), `taxonomy_term\.gone` \|/);
  assert.match(markdown, /\| Any Media \|/);
  assert.match(markdown, /\| \[Every block\]\(#every-block\) \|/);
});

test('lists the fields that reference an entity in outline order', () => {
  const markdown = documentMarkdown(
    doc([
      entity('paragraph', 'card', 'Card', [field('field_tag', 'Tag', { targetType: 'taxonomy_term', targetBundles: ['tags'] })]),
      entity('node', 'page', 'Page', [
        field('field_tags', 'Tags', { targetType: 'taxonomy_term', targetBundles: ['tags'] }),
        field('field_topics', 'Topics', { targetType: 'taxonomy_term', targetBundles: ['tags'] }),
      ]),
      entity('taxonomy_term', 'tags', 'Tags'),
    ]),
  );

  assert.deepEqual(linesStarting(markdown, 'Referenced by: '), ['Referenced by: Tags on [Page](#page), Topics on [Page](#page), Tag on [Card](#card).']);
});

test('escapes Markdown in labels, headings, links and cells', () => {
  const label = 'A|B `c` *d* _e_ [f](g) <h> #i ~j~ $k$ \\l &amp; m';
  const markdown = documentMarkdown(doc([entity('node', 'page', label, [field('body', label, { note: label })])]));
  const escaped = 'A\\|B \\`c\\` \\*d\\* \\_e\\_ \\[f\\](g) \\<h\\> \\#i \\~j\\~ \\$k\\$ \\\\l \\&amp; m';

  assert.ok(markdown.includes('### ' + escaped + '\n'));
  assert.ok(markdown.includes('  - [' + escaped + '](#ab-c-d-_e_-fg-h-i-j-k-l-amp-m)\n'));
  assert.ok(markdown.includes('| ' + escaped + ' | `body` | `string` | 1 | No |  | ' + escaped + ' |\n'));
});

test('writes every table row with the same number of cells as its header', () => {
  for (const markdown of [documentMarkdown(markdownDocument), documentMarkdown(savedDocument)]) {
    const rows = markdown.split('\n').filter((line) => line.startsWith('|'));

    assert.ok(rows.length > 0);

    for (const row of rows) {
      // An escaped pipe sits inside a cell, so only the bare ones split it.
      assert.equal(row.split(/(?<!\\)\|/).length - 2, 7, row);
    }
  }
});

test('escapes the text of a label', async (t) => {
  for (const [name, value, expectedText] of dataProviderMarkdownText()) {
    await t.test(name, () => {
      assert.equal(markdownText(value), expectedText);
    });
  }
});

function dataProviderMarkdownText() {
  return [
    ['plain text', 'Article', 'Article'],
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['a number', 42, '42'],
    ['a pipe', 'a | b', 'a \\| b'],
    ['backticks', '`code`', '\\`code\\`'],
    ['emphasis', '*a* _b_', '\\*a\\* \\_b\\_'],
    ['a link', '[a](b)', '\\[a\\](b)'],
    ['HTML', '<b>', '\\<b\\>'],
    ['a heading mark', '# a', '\\# a'],
    ['strikethrough', '~~a~~', '\\~\\~a\\~\\~'],
    ['maths', '$a$', '\\$a\\$'],
    ['a backslash', 'a\\b', 'a\\\\b'],
    ['a named entity', '&amp;', '\\&amp;'],
    ['a numeric entity', '&#35;', '&\\#35;'],
    ['a 1-letter named entity', '&x;', '\\&x;'],
    ['an ampersand', 'Q&A', 'Q&A'],
    ['line breaks', '  a\n  b\r\nc  ', 'a b c'],
  ];
}

test('wraps a value in a code span', async (t) => {
  for (const [name, value, inTable, expectedCode] of dataProviderMarkdownCode()) {
    await t.test(name, () => {
      assert.equal(markdownCode(value, inTable), expectedCode);
    });
  }
});

function dataProviderMarkdownCode() {
  return [
    ['a machine name', 'field_tags', false, '`field_tags`'],
    ['an empty value', '', false, ''],
    ['null', null, false, ''],
    ['a backtick inside', 'a`b', false, '``a`b``'],
    ['a run of backticks inside', 'a``b`c', false, '```a``b`c```'],
    ['a backtick at the start', '`a', false, '`` `a ``'],
    ['a backtick at the end', 'a`', false, '`` a` ``'],
    ['a pipe outside a table', 'a|b', false, '`a|b`'],
    ['a pipe inside a table', 'a|b', true, '`a\\|b`'],
    ['a line break', 'a\nb', false, '`a b`'],
  ];
}

test('works out the anchor GitHub gives a heading', async (t) => {
  for (const [name, text, expectedSlug] of dataProviderHeadingSlug()) {
    await t.test(name, () => {
      assert.equal(headingSlug(text), expectedSlug);
    });
  }
});

function dataProviderHeadingSlug() {
  return [
    ['a word', 'Article', 'article'],
    ['words', 'Landing page', 'landing-page'],
    ['punctuation', 'Q&A: the (best) one!', 'qa-the-best-one'],
    ['a pipe between spaces', 'Session | Talk', 'session--talk'],
    ['underscores and hyphens', 'a_b-c', 'a_b-c'],
    ['digits', 'Top 10', 'top-10'],
    ['accented letters', 'Événement', 'événement'],
    ['non-Latin letters', 'Новини', 'новини'],
    ['an emoji', 'Star ⭐', 'star-'],
    ['surrounding spaces', '  Page  ', 'page'],
  ];
}

test('adds a number to an anchor already taken, as GitHub does', () => {
  const slugger = headingSlugger();

  assert.deepEqual(['Page', 'Page', 'Page-1', 'Page', 'page 1'].map(slugger), ['page', 'page-1', 'page-1-1', 'page-2', 'page-1-2']);
});

test('reads the Markdown export settings', async (t) => {
  for (const [name, saved, expectedSettings] of dataProviderReadMarkdownSettings()) {
    await t.test(name, () => {
      assert.deepEqual(readMarkdownSettings(saved), expectedSettings);
    });
  }
});

function dataProviderReadMarkdownSettings() {
  return [
    ['nothing saved', undefined, { diagram: 'auto' }],
    ['null', null, { diagram: 'auto' }],
    ['a string', 'always', { diagram: 'auto' }],
    ['an empty object', {}, { diagram: 'auto' }],
    ['always', { diagram: 'always' }, { diagram: 'always' }],
    ['never', { diagram: 'never' }, { diagram: 'never' }],
    ['auto', { diagram: 'auto' }, { diagram: 'auto' }],
    ['an unknown choice', { diagram: 'sometimes' }, { diagram: 'auto' }],
    ['a boolean', { diagram: true }, { diagram: 'auto' }],
    ['an inherited value', Object.create({ diagram: 'always' }), { diagram: 'auto' }],
    ['an extra key', { diagram: 'never', extra: 1 }, { diagram: 'never' }],
  ];
}

test('decides whether an export includes the diagram', async (t) => {
  for (const [name, settings, count, expectedResult] of dataProviderIncludesDiagram()) {
    await t.test(name, () => {
      assert.equal(includesDiagram(settings, count), expectedResult);
    });
  }
});

function dataProviderIncludesDiagram() {
  return [
    ['auto at the limit', { diagram: 'auto' }, MARKDOWN_DIAGRAM_LIMIT, true],
    ['auto above the limit', { diagram: 'auto' }, MARKDOWN_DIAGRAM_LIMIT + 1, false],
    ['auto with 1 entity', { diagram: 'auto' }, 1, true],
    ['nothing saved above the limit', undefined, MARKDOWN_DIAGRAM_LIMIT + 1, false],
    ['always above the limit', { diagram: 'always' }, 500, true],
    ['never with 1 entity', { diagram: 'never' }, 1, false],
    ['always with no entities', { diagram: 'always' }, 0, false],
  ];
}

test('describes each diagram choice and defaults to the first', () => {
  assert.deepEqual(
    MARKDOWN_DIAGRAM_OPTIONS.map((option) => option.id),
    ['auto', 'always', 'never'],
  );
  assert.equal(MARKDOWN_DIAGRAM_OPTIONS[0].label, 'Up to ' + MARKDOWN_DIAGRAM_LIMIT + ' entities');
  assert.equal(MARKDOWN_DEFAULTS.diagram, MARKDOWN_DIAGRAM_OPTIONS[0].id);
});
