import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { noteMarkdownHtml, noteMarkdownPlain, parseNoteMarkdown } from '../../src/note-markdown.js';

test('writes note Markdown as HTML', async (t) => {
  for (const [name, markdown, expected] of dataProviderHtml()) {
    await t.test(name, () => {
      assert.equal(noteMarkdownHtml(markdown), expected);
    });
  }
});

function dataProviderHtml() {
  return [
    ['empty text', '', ''],
    ['blank lines only', '\n  \n\t\n', ''],
    ['text that is not a string', 42, ''],
    ['a missing text', undefined, ''],
    ['a plain paragraph', 'Plain text.', '<p>Plain text.</p>'],
    ['a paragraph with surrounding spaces', '   Spaced out.   ', '<p>Spaced out.</p>'],
    ['2 paragraphs', 'First.\n\nSecond.', '<p>First.</p><p>Second.</p>'],
    ['a line break inside a paragraph', 'Line 1\nLine 2', '<p>Line 1<br>Line 2</p>'],
    ['Windows and old Mac line endings', 'A\r\nB\rC', '<p>A<br>B<br>C</p>'],
    ['a level 1 heading', '# Title', '<h1>Title</h1>'],
    ['a level 2 heading', '## Title', '<h2>Title</h2>'],
    ['a level 3 heading', '### Title', '<h3>Title</h3>'],
    ['a level 4 heading', '#### Title', '<h3>Title</h3>'],
    ['a level 6 heading', '###### Title', '<h3>Title</h3>'],
    ['7 hashes', '####### Title', '<p>####### Title</p>'],
    ['a heading with closing hashes', '## Title ##', '<h2>Title</h2>'],
    ['a heading ending in a hash inside a word', '# C#', '<h1>C#</h1>'],
    ['a heading indented by 3 spaces', '   # Title', '<h1>Title</h1>'],
    ['a heading indented by 4 spaces', '    # Title', '<p># Title</p>'],
    ['a hash with no space after it', '#tag', '<p>#tag</p>'],
    ['a hash with nothing after it', '# ', '<p>#</p>'],
    ['a heading with inline formatting', '# **Bold** title', '<h1><strong>Bold</strong> title</h1>'],
    ['a heading between paragraphs', 'Before\n# Title\nAfter', '<p>Before</p><h1>Title</h1><p>After</p>'],
    ['bold', '**bold**', '<p><strong>bold</strong></p>'],
    ['italics with stars', '*italic*', '<p><em>italic</em></p>'],
    ['italics with underscores', '_italic_', '<p><em>italic</em></p>'],
    ['underline', '__underline__', '<p><u>underline</u></p>'],
    ['strikethrough', '~~gone~~', '<p><s>gone</s></p>'],
    ['bold and italics together', '***both***', '<p><strong><em>both</em></strong></p>'],
    ['bold inside italics', '*a **b** c*', '<p><em>a <strong>b</strong> c</em></p>'],
    ['italics inside strikethrough', '~~a *b* c~~', '<p><s>a <em>b</em> c</s></p>'],
    ['formatting across a line break', '**a\nb**', '<p><strong>a<br>b</strong></p>'],
    ['an unclosed delimiter', '**unclosed', '<p>**unclosed</p>'],
    ['an unclosed delimiter before a closed one', '*a **b** c', '<p>*a <strong>b</strong> c</p>'],
    ['an empty span', '****', '<p>****</p>'],
    ['a delimiter followed by a space', '2 * 3 * 4', '<p>2 * 3 * 4</p>'],
    ['a closer after a space', '*a *', '<p>*a *</p>'],
    ['underscores inside a word', 'field_tags_more', '<p>field_tags_more</p>'],
    ['double underscores inside a word', 'a__b__c', '<p>a__b__c</p>'],
    ['stars inside a word', 'un*frigging*believable', '<p>un<em>frigging</em>believable</p>'],
    ['escaped delimiters', '\\*not italic\\*', '<p>*not italic*</p>'],
    ['an escaped backslash', 'a\\\\b', '<p>a\\b</p>'],
    ['a backslash before a letter', 'C:\\temp', '<p>C:\\temp</p>'],
    ['an escaped hash', '\\# not a heading', '<p># not a heading</p>'],
    ['a code span', 'Run `npm test`.', '<p>Run <code>npm test</code>.</p>'],
    ['delimiters inside a code span', '`**a** _b_`', '<p><code>**a** _b_</code></p>'],
    ['a code span with a double backtick fence', '``a ` b``', '<p><code>a ` b</code></p>'],
    ['a code span padded with spaces', '`` `x` ``', '<p><code>`x`</code></p>'],
    ['a code span of spaces only', '`   `', '<p><code>   </code></p>'],
    ['an unclosed backtick', 'a `b', '<p>a `b</p>'],
    ['a code span across a line break', '`a\nb`', '<p><code>a b</code></p>'],
    ['a link', '[Docs](https://example.com)', '<p><span class="rich-text__link" title="https://example.com">Docs</span></p>'],
    ['a link with a title', '[Docs](https://example.com "Read")', '<p><span class="rich-text__link" title="https://example.com">Docs</span></p>'],
    ['a link with an empty address', '[Docs]()', '<p><span class="rich-text__link">Docs</span></p>'],
    ['a link with formatting in its label', '[**Docs** here](/x)', '<p><span class="rich-text__link" title="/x"><strong>Docs</strong> here</span></p>'],
    ['a link inside a link label', '[a [b](c)](d)', '<p><span class="rich-text__link" title="d">a [b](c)</span></p>'],
    ['a link inside bold', '**see [docs](/x)**', '<p><strong>see <span class="rich-text__link" title="/x">docs</span></strong></p>'],
    ['a link with an escaped bracket in its label', '[a\\]b](/x)', '<p><span class="rich-text__link" title="/x">a]b</span></p>'],
    ['brackets with no address', '[Docs]', '<p>[Docs]</p>'],
    ['brackets with an empty label', '[](/x)', '<p>[](/x)</p>'],
    ['an address with a space', '[Docs](a b)', '<p>[Docs](a b)</p>'],
    ['an unclosed bracket', '[Docs', '<p>[Docs</p>'],
    ['a script address', '[x](javascript:alert(1))', '<p>[x](javascript:alert(1))</p>'],
    ['an address with markup', '[x]("><b>)', '<p><span class="rich-text__link" title="&quot;&gt;&lt;b&gt;">x</span></p>'],
    ['HTML', '<b>bold</b> <script>alert(1)</script>', '<p>&lt;b&gt;bold&lt;/b&gt; &lt;script&gt;alert(1)&lt;/script&gt;</p>'],
    ['an ampersand and quotes', 'Tom & "Jerry"', '<p>Tom &amp; &quot;Jerry&quot;</p>'],
  ];
}

test('reads the blocks of a note', () => {
  assert.deepEqual(parseNoteMarkdown('# Title\nSee [docs](/x).\nThanks'), [
    { tag: 'h1', children: ['Title'] },
    { tag: 'p', children: ['See ', { tag: 'a', href: '/x', children: ['docs'] }, '.', { tag: 'br', children: [] }, 'Thanks'] },
  ]);
});

test('writes the plain text of a note, 1 line per block', async (t) => {
  for (const [name, markdown, expected] of dataProviderPlain()) {
    await t.test(name, () => {
      assert.equal(noteMarkdownPlain(markdown), expected);
    });
  }
});

function dataProviderPlain() {
  return [
    ['empty text', '', ''],
    ['formatting', '**bold** and *italic* and `code`', 'bold and italic and code'],
    ['a link', 'See [docs](https://example.com).', 'See docs.'],
    ['a heading and paragraphs', '# Title\n\nFirst\nline\n\nSecond', 'Title\nFirst\nline\nSecond'],
    ['HTML', '<b>x</b>', '<b>x</b>'],
  ];
}

test('keeps long runs of openers as written without overflowing the stack', async (t) => {
  for (const [name, unit] of dataProviderOpeners()) {
    await t.test(name, () => {
      const text = unit.repeat(5000);
      const started = Date.now();

      assert.ok(noteMarkdownPlain(text).length > 0);
      assert.ok(Date.now() - started < 2000, 'parsing took ' + (Date.now() - started) + 'ms');
    });
  }
});

function dataProviderOpeners() {
  return [
    ['mixed delimiters', '*a_b~~c__d**e[f'],
    ['open brackets', '[[[['],
    ['backticks and delimiters', '`*_'],
    ['nested openers', '*a **b '],
  ];
}

test('writes only note tags without attributes for any text', () => {
  const TAGS = ['h1', 'h2', 'h3', 'p', 'br', 'strong', 'em', 'u', 's', 'code'];
  const MARKDOWN = fc.array(
    fc.oneof(
      fc.string(),
      fc.constantFrom('*', '**', '_', '__', '~~', '`', '``', '[', ']', '(', ')', '\\', '#', '# ', '\n', '\n\n', ' '),
      fc.constantFrom('<script>', '<img src=x onerror=steal()>', '"', "'", '&', '<b>', '</p>', 'javascript:x'),
    ),
  );
  const ALLOWED = new RegExp('^</?(?:' + TAGS.join('|') + ')>$|^<span class="rich-text__link"(?: title="[^"<>]*")?>$|^</span>$');

  fc.assert(
    fc.property(MARKDOWN, (parts) => {
      const tags = noteMarkdownHtml(parts.join('')).match(/<[^>]*>/g) || [];

      return tags.every((tag) => ALLOWED.test(tag));
    }),
  );
});
