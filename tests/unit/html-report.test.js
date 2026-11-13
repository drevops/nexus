import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anchorId, documentHtml, htmlText } from '../../src/html-report.js';
import { documentMarkdown } from '../../src/markdown.js';
import { markdownDocument } from '../fixtures/markdown/document.js';
import { savedDocument } from '../fixtures/saved-document.js';

const expected = (name) => readFileSync(new URL('../fixtures/html-report/' + name, import.meta.url), 'utf8');

function entity(entityType, bundle, label, fields = [], note = '') {
  return { entityType, bundle, label, note, fields };
}

function field(name, label, extra = {}) {
  return { name, label, fieldType: 'string', kind: 'single', cardinality: 1, required: false, note: '', targetType: null, targetBundles: [], ...extra };
}

function doc(entities, extra = {}) {
  return { nexus: 1, title: 'Model', customTypes: [], entities, ...extra };
}

// Returns every match of the pattern's first group in the HTML.
function captures(html, pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

// Returns the HTML between the opening and closing tags of the page's body.
function body(html) {
  return html.slice(html.indexOf('<body>'), html.indexOf('</body>'));
}

test('writes the fixture document as the expected page', () => {
  assert.equal(documentHtml(markdownDocument), expected('document.html'));
});

test('writes a standalone page that loads nothing and runs nothing', () => {
  for (const html of [documentHtml(markdownDocument), documentHtml(savedDocument), documentHtml(doc([]))]) {
    assert.match(html, /^<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n/);
    assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`));
    assert.ok(html.endsWith('</html>\n'));
    assert.doesNotMatch(html, /<script|<link|<img|<iframe|src=|https?:\/\//i);
  }
});

test('writes a model with no entities as a title and a line', () => {
  const html = documentHtml(doc([], { title: 'Empty' }));

  assert.ok(html.includes('<title>Empty</title>'));
  assert.ok(body(html).includes('<main>\n<h1>Empty</h1>\n<p>The model has no entities.</p>\n</main>'));
});

test('takes the default title for a missing or blank title', async (t) => {
  for (const [name, title] of dataProviderDefaultTitle()) {
    await t.test(name, () => {
      const html = documentHtml(doc([entity('node', 'page', 'Page')], { title }));

      assert.ok(html.includes('<title>Content model</title>'));
      assert.ok(html.includes('<h1>Content model</h1>'));
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
  const html = documentHtml(
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

  assert.deepEqual(captures(html, /<h2[^>]*>([^<]*)<\/h2>/g), ['Contents', 'Content types', 'Media types', 'User types', 'Gizmo', 'Apple', 'Zebra']);
});

test('lists the bundles of a type by label, then by machine name', () => {
  const html = documentHtml(
    doc([entity('node', 'b_page', 'Page'), entity('node', 'news', 'Article news'), entity('node', 'a_page', 'Page'), entity('node', 'event', 'article')]),
  );

  assert.deepEqual(captures(html, /<h3[^>]*>([^<]*)<\/h3>/g), ['article', 'Article news', 'Page', 'Page']);
  assert.deepEqual(captures(html, /<p>Machine name: <code>([^<]*)<\/code><\/p>/g), ['event', 'news', 'a_page', 'b_page']);
});

test('gives each heading the anchor of the Markdown export and links the contents to it', () => {
  const model = doc([
    entity('node', 'a_page', 'Page'),
    entity('node', 'b_page', 'Page'),
    entity('node', 'model', 'Model'),
    entity('media', 'image', 'Content types'),
  ]);
  const html = documentHtml(model);
  const markdownAnchors = captures(documentMarkdown(model), /\]\(#([^)]+)\)/g);

  assert.deepEqual(captures(html.slice(html.indexOf('<nav'), html.indexOf('</nav>')), /<a href="#([^"]+)">/g), markdownAnchors);
  assert.deepEqual(captures(html, /<h[23] id="([^"]+)">/g), ['content-types', 'model-1', 'page', 'page-1', 'media-types', 'content-types-1']);
});

test('gives a heading with an empty anchor an id no other heading can take', () => {
  const html = documentHtml(
    doc([
      entity('node', '*', ''),
      entity('node', 'star', '⭐'),
      entity('node', 'section', 'Section'),
      entity('paragraph', 'card', 'Card', [field('field_any', 'Any', { targetType: 'node', targetBundles: ['*'] })]),
    ]),
  );

  assert.deepEqual(captures(html, /<h3 id="([^"]*)">/g), ['section.', '-1', 'section', 'card']);
  assert.ok(html.includes('<td><a href="#section.">*</a></td>'));
  assert.ok(html.includes('<li><a href="#section.">*</a></li>'));
});

test('keeps the last copy of an entity listed twice', () => {
  const html = documentHtml(doc([entity('node', 'page', 'First'), entity('node', 'page', 'Second')]));

  assert.deepEqual(captures(html, /<h3[^>]*>([^<]*)<\/h3>/g), ['Second']);
});

test('writes the note of an entity as a quote and the note of a field in its cell', () => {
  const html = documentHtml(
    doc([entity('node', 'page', 'Page', [field('body', 'Body', { note: 'Line 1\n\n  Line 2  ' })], '\n  First\r\nSecond\n\n\nThird\n')]),
  );

  assert.ok(html.includes('\n<blockquote>\n<p>First<br>Second</p>\n<p>Third</p>\n</blockquote>\n'));
  assert.ok(html.includes('<td>Line 1<br>Line 2</td></tr>'));
});

test('leaves out the quote of an entity with a blank note', () => {
  const html = documentHtml(doc([entity('node', 'page', 'Page', [], ' \n ')]));

  assert.doesNotMatch(body(html), /<blockquote>/);
});

test('fills in what a document leaves out of a field', () => {
  const html = documentHtml(
    doc([
      entity('node', 'page', '', [
        { name: 'body', kind: 'multi' },
        { name: 'tags', label: 'Tags', kind: 'single' },
      ]),
    ]),
  );

  assert.ok(html.includes('<h3 id="page">page</h3>'));
  assert.ok(html.includes('<tr><td>body</td><td><code>body</code></td><td></td><td>1..n</td><td>No</td><td></td><td></td></tr>'));
  assert.ok(html.includes('<tr><td>Tags</td><td><code>tags</code></td><td></td><td>1</td><td>No</td><td></td><td></td></tr>'));
});

test('marks base fields and writes the cardinality and required columns', () => {
  const html = documentHtml(
    doc([
      entity('node', 'page', 'Page', [
        field('title', 'Title', { kind: 'system', required: true }),
        field('field_links', 'Links', { kind: 'multi', cardinality: 5 }),
        field('field_score', 'Score', { kind: 'calculated', fieldType: 'computed' }),
      ]),
    ]),
  );

  assert.deepEqual(captures(html, /(<tr><td>[\s\S]*?<\/tr>)/g), [
    '<tr><td>Title <span class="muted">(base field)</span></td><td><code>title</code></td><td><code>string</code></td><td>1</td><td>Yes</td><td></td><td></td></tr>',
    '<tr><td>Links</td><td><code>field_links</code></td><td><code>string</code></td><td>1..5</td><td>No</td><td></td><td></td></tr>',
    '<tr><td>Score</td><td><code>field_score</code></td><td><code>computed</code></td><td>1</td><td>No</td><td></td><td></td></tr>',
  ]);
});

test('writes each reference target as a link, a wildcard label or a machine name', () => {
  const html = documentHtml(
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

  assert.ok(html.includes('<td><a href="#tags">Tags</a>, <code>taxonomy_term.gone</code></td>'));
  assert.ok(html.includes('<td>Any Media</td>'));
  assert.ok(html.includes('<td><a href="#every-block">Every block</a></td>'));
});

test('lists the fields that reference an entity in outline order', () => {
  const html = documentHtml(
    doc([
      entity('paragraph', 'card', 'Card', [field('field_tag', 'Tag', { targetType: 'taxonomy_term', targetBundles: ['tags'] })]),
      entity('node', 'page', 'Page', [
        field('field_tags', 'Tags', { targetType: 'taxonomy_term', targetBundles: ['tags'] }),
        field('field_topics', 'Topics', { targetType: 'taxonomy_term', targetBundles: ['tags'] }),
      ]),
      entity('taxonomy_term', 'tags', 'Tags'),
    ]),
  );

  assert.deepEqual(captures(html, /<p>(Referenced by: .*)<\/p>/g), [
    'Referenced by: Tags on <a href="#page">Page</a>, Topics on <a href="#page">Page</a>, Tag on <a href="#card">Card</a>.',
  ]);
});

test('escapes markup in the title, headings, links, machine names and cells', () => {
  const label = `<script>alert("x")</script> & 'y'`;
  const escaped = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;';
  const html = documentHtml(doc([entity('node', 'page', label, [field('field_<b>', label, { note: label, fieldType: '"type"' })], label)], { title: label }));

  assert.doesNotMatch(html, /<script|<b>/i);
  assert.ok(html.includes('<title>' + escaped + '</title>'));
  assert.ok(html.includes('<h1>' + escaped + '</h1>'));
  assert.ok(html.includes('<h3 id="scriptalertxscript--y-1">' + escaped + '</h3>'));
  assert.ok(html.includes('<li><a href="#scriptalertxscript--y-1">' + escaped + '</a></li>'));
  assert.ok(html.includes('<blockquote>\n<p>' + escaped + '</p>\n</blockquote>'));
  assert.ok(
    html.includes(
      '<tr><td>' +
        escaped +
        '</td><td><code>field_&lt;b&gt;</code></td><td><code>&quot;type&quot;</code></td><td>1</td><td>No</td><td></td><td>' +
        escaped +
        '</td></tr>',
    ),
  );
});

test('writes every table row with the same number of cells as its header', () => {
  for (const html of [documentHtml(markdownDocument), documentHtml(savedDocument)]) {
    const rows = captures(html, /(<tr>[\s\S]*?<\/tr>)/g);

    assert.ok(rows.length > 0);

    for (const row of rows) {
      assert.equal((row.match(/<t[hd]>/g) || []).length, 7, row);
    }
  }
});

test('escapes text for an element or an attribute', async (t) => {
  for (const [name, value, expectedText] of dataProviderHtmlText()) {
    await t.test(name, () => {
      assert.equal(htmlText(value), expectedText);
    });
  }
});

function dataProviderHtmlText() {
  return [
    ['plain text', 'Article', 'Article'],
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['a number', 42, '42'],
    ['an ampersand', 'Q&A', 'Q&amp;A'],
    ['an entity', '&amp;', '&amp;amp;'],
    ['a tag', '<b>', '&lt;b&gt;'],
    ['double quotes', '"a"', '&quot;a&quot;'],
    ['single quotes', "'a'", '&#39;a&#39;'],
    ['Markdown', '*a* | `b`', '*a* | `b`'],
  ];
}

test('takes the anchor as the id unless it is empty', async (t) => {
  for (const [name, slug, expectedId] of dataProviderAnchorId()) {
    await t.test(name, () => {
      assert.equal(anchorId(slug), expectedId);
    });
  }
});

function dataProviderAnchorId() {
  return [
    ['an anchor', 'page', 'page'],
    ['a numbered anchor', 'page-1', 'page-1'],
    ['a hyphen', '-1', '-1'],
    ['an empty anchor', '', 'section.'],
  ];
}
