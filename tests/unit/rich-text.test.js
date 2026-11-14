import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { RICH_TEXT_TAGS, decodeEntities, parseRichText, richTextHtml, richTextPlain } from '../../src/rich-text.js';

function el(tag, ...children) {
  return { tag, children };
}

function link(href, ...children) {
  return { tag: 'a', children, href };
}

test('reads markup into allowed elements and plain text', async (t) => {
  for (const [name, text, expected] of dataProviderParse()) {
    await t.test(name, () => {
      assert.deepEqual(parseRichText(text), expected);
    });
  }
});

// Each case gives the text and the nodes it reads as.
function dataProviderParse() {
  return [
    ['plain text', 'A plain sentence.', ['A plain sentence.']],
    ['an empty string', '', []],
    ['a value that is not a string', null, []],
    ['emphasis', 'Use <em>articles</em> for news.', ['Use ', el('em', 'articles'), ' for news.']],
    ['nested elements', '<strong>a <em>b</em></strong>', [el('strong', 'a ', el('em', 'b'))]],
    ['an upper-case tag', '<EM>loud</EM>', [el('em', 'loud')]],
    ['a line break with and without a slash', 'a<br>b<br/>c<br />d', ['a', el('br'), 'b', el('br'), 'c', el('br'), 'd']],
    ['a list', '<ul><li>one</li><li>two</li></ul>', [el('ul', el('li', 'one'), el('li', 'two'))]],
    ['attributes on an allowed tag', '<em class="x" onclick="steal()">a</em>', [el('em', 'a')]],
    ['an unknown tag, keeping its text', 'a <span class="x">b</span> c', ['a b c']],
    ['an image with a handler', 'a<img src=x onerror="steal()">b', ['ab']],
    ['a script and its content', 'a<script>steal()</script>b', ['ab']],
    ['an upper-case script', 'a<SCRIPT>steal()</SCRIPT>b', ['ab']],
    ['a script that never closes', 'a<script>steal()', ['a']],
    ['a style and its content', 'a<style>p { color: red }</style>b', ['ab']],
    ['a comment', 'a<!-- hidden -->b', ['ab']],
    ['a comment that never closes', 'a<!-- hidden', ['a']],
    ['an element that never closes', '<em>open', [el('em', 'open')]],
    ['a close tag with nothing open', 'a</em>b', ['ab']],
    ['misnested elements', '<b><i>x</b>y</i>', [el('b', el('i', 'x')), 'y']],
    ['a less-than sign', 'a < b and c > d', ['a < b and c > d']],
    ['a tag that never ends', 'a <em class="x', ['a <em class="x']],
    ['escaped markup', '&lt;script&gt;steal()&lt;/script&gt;', ['<script>steal()</script>']],
    ['numeric references to markup', '&#60;em&#62;not an element&#x3C;/em&#x3e;', ['<em>not an element</em>']],
    ['a link with a double-quoted address', '<a href="https://drupal.org/">Drupal</a>', [link('https://drupal.org/', 'Drupal')]],
    ['a link with a single-quoted address', "<a title='x' href='/node/1'>node</a>", [link('/node/1', 'node')]],
    ['a link with an unquoted address', '<a href=https://example.com>x</a>', [link('https://example.com', 'x')]],
    ['a link with an encoded address', '<a href="/a?b=1&amp;c=2">x</a>', [link('/a?b=1&c=2', 'x')]],
    ['a link with a script address', '<a href="javascript:steal()">x</a>', [link('javascript:steal()', 'x')]],
    ['a link with no address', '<a name="top">x</a>', [link('', 'x')]],
  ];
}

test('decodes character references', async (t) => {
  for (const [name, text, expected] of dataProviderEntities()) {
    await t.test(name, () => {
      assert.equal(decodeEntities(text), expected);
    });
  }
});

function dataProviderEntities() {
  return [
    ['the named references', '&amp;&lt;&gt;&quot;&apos;&nbsp;', '&<>"\' '],
    ['an upper-case name', '&AMP;', '&'],
    ['a decimal reference', '&#233;', 'é'],
    ['a hex reference', '&#x1F600;', '😀'],
    ['an unknown name', '&copy; &bogus;', '&copy; &bogus;'],
    ['a double-encoded reference', '&amp;lt;', '&lt;'],
    ['a zero code point', '&#0;', '�'],
    ['a surrogate code point', '&#xD800;', '�'],
    ['a code point past Unicode', '&#x110000;', '�'],
    ['an ampersand on its own', 'Tom & Jerry', 'Tom & Jerry'],
  ];
}

test('writes the nodes as escaped HTML with links as titled text', async (t) => {
  for (const [name, text, expected] of dataProviderHtml()) {
    await t.test(name, () => {
      assert.equal(richTextHtml(parseRichText(text)), expected);
    });
  }
});

function dataProviderHtml() {
  return [
    ['plain text', 'A plain sentence.', 'A plain sentence.'],
    ['emphasis', 'Use <em>articles</em>.', 'Use <em>articles</em>.'],
    ['a line break', 'a<br>b', 'a<br>b'],
    ['characters HTML reserves', 'a < b & "c" \'d\'', 'a &lt; b &amp; &quot;c&quot; &#39;d&#39;'],
    ['escaped markup', '&lt;script&gt;steal()&lt;/script&gt;', '&lt;script&gt;steal()&lt;/script&gt;'],
    ['a script', 'a<script>steal()</script>b', 'ab'],
    ['an image with a handler', '<img src=x onerror="steal()">', ''],
    ['a link', '<a href="https://drupal.org/">Drupal</a>', '<span class="rich-text__link" title="https://drupal.org/">Drupal</span>'],
    [
      'a link whose address breaks out of the title',
      '<a href=\'x" onmouseover="steal()\'>x</a>',
      '<span class="rich-text__link" title="x&quot; onmouseover=&quot;steal()">x</span>',
    ],
    ['a link with no address', '<a>x</a>', '<span class="rich-text__link">x</span>'],
  ];
}

test('reads the plain text of the nodes', () => {
  assert.equal(richTextPlain(parseRichText('Use <em>articles</em><br>for <a href="/x">news</a> &amp; more.')), 'Use articles\nfor news & more.');
});

test('writes only allowed tags without attributes for any text', () => {
  const MARKUP = fc.array(
    fc.oneof(
      fc.string(),
      fc.constantFrom('<', '>', '"', "'", '&', '&lt;', '&#60;', '</', '<!--', '-->', '='),
      fc.constantFrom(...RICH_TEXT_TAGS, 'script', 'img', 'style', 'iframe', 'svg', 'SCRIPT').map((tag) => '<' + tag),
      fc.constantFrom(' onerror=steal()', ' href="javascript:x"', ' src=x', '>', '/>'),
    ),
  );
  const ALLOWED = new RegExp('^</?(?:' + RICH_TEXT_TAGS.join('|') + ')>$|^<span class="rich-text__link"(?: title="[^"<>]*")?>$|^</span>$');

  fc.assert(
    fc.property(MARKUP, (parts) => {
      const html = richTextHtml(parseRichText(parts.join('')));
      const tags = html.match(/<[^>]*>/g) || [];

      return tags.every((tag) => ALLOWED.test(tag));
    }),
  );
});
