import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildManual, escapeHtml, manualModule, manualSource, pageTarget, readContents, renderPage } from '../../scripts/lib/manual.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

const CONTENTS = ['# Manual', '', '## Basics', '', '- [Start](start.md)', '- [Panels](panels.md)', '', '## Reference', '', '- [Keys](keys.md)', ''].join('\n');

function docs(pages = {}) {
  return new Map(
    Object.entries({
      'README.md': CONTENTS,
      'start.md': '# Start\n\nOpen a diagram.\n\n## First steps\n\nSee [the keys](keys.md#saving) and ![The landing](assets/landing.png).\n',
      'panels.md': '# Panels\n\nEvery panel.\n\n## Docking\n\nDrag a panel.\n',
      'keys.md': '# Keys\n\nShortcuts.\n\n## Saving\n\nPress `Ctrl`+`S`.\n\n### Saving twice\n\nAgain.\n',
      ...pages,
    }).filter(([, text]) => text !== null),
  );
}

function render(body) {
  return renderPage('page', '# Page\n\nSummary.\n\n' + body);
}

test('escapes every character that is special in HTML', () => {
  assert.equal(escapeHtml('<a href="x">\'&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('reads a link target as a page and anchor', async (t) => {
  for (const [href, expected] of dataProviderPageTargets()) {
    await t.test(href, () => {
      assert.deepEqual(pageTarget(href, 'current'), expected);
    });
  }
});

function dataProviderPageTargets() {
  return [
    ['keys.md', { page: 'keys', anchor: null }],
    ['keys.md#saving', { page: 'keys', anchor: 'saving' }],
    ['keys.md#', { page: 'keys', anchor: null }],
    ['#saving', { page: 'current', anchor: 'saving' }],
    ['#', null],
    ['README.md', null],
    ['../README.md', null],
    ['sub/keys.md', null],
    ['Keys.md', null],
    ['keys.txt', null],
    ['keys', null],
  ];
}

test('reads the sections and pages of the contents in order', () => {
  const { sections, errors } = readContents(CONTENTS);

  assert.deepEqual(errors, []);
  assert.deepEqual(sections, [
    {
      title: 'Basics',
      pages: [
        { title: 'Start', file: 'start.md' },
        { title: 'Panels', file: 'panels.md' },
      ],
    },
    { title: 'Reference', pages: [{ title: 'Keys', file: 'keys.md' }] },
  ]);
});

test('reports contents items that are not page links under a section', () => {
  const { errors } = readContents('- [Early](early.md)\n\n## Basics\n\n- Plain text\n');

  assert.deepEqual(errors, [
    'README.md: "Early" is not a page link under a section heading',
    'README.md: "Plain text" is not a page link under a section heading',
  ]);
});

test('reads the title, summary, sections and text of a page', () => {
  const { page, anchors, errors } = renderPage('keys', readFileSync(join(ROOT, 'tests', 'fixtures', 'manual', 'page.md'), 'utf8'));

  assert.deepEqual(errors, []);
  assert.equal(page.id, 'keys');
  assert.equal(page.title, 'Keyboard shortcuts');
  assert.equal(page.summary, 'Every key the app answers to, on each platform.');
  assert.deepEqual(page.headings, [
    { id: 'saving-and-opening', text: 'Saving and opening' },
    { id: 'saving-and-opening-1', text: 'Saving and opening' },
    { id: 'the-canvas', text: 'The canvas' },
  ]);
  assert.deepEqual(anchors, ['keyboard-shortcuts', 'saving-and-opening', 'saving-and-opening-1', 'the-canvas', 'zooming']);
  assert.match(page.text, /^Every key the app answers to, on each platform\. Press Ctrl\+S/);
  assert.equal(page.html, readFileSync(join(ROOT, 'tests', 'fixtures', 'manual', 'page.html'), 'utf8').trim());
});

test('renders each kind of Markdown', async (t) => {
  for (const [name, markdown, expected] of dataProviderMarkdown()) {
    await t.test(name, () => {
      const { page, errors } = render(markdown);

      assert.deepEqual(errors, []);
      assert.equal(page.html, '<p>Summary.</p>' + expected);
    });
  }
});

function dataProviderMarkdown() {
  return [
    ['paragraph', 'A *b* **c** ~~d~~ `e`.', '<p>A <em>b</em> <strong>c</strong> <del>d</del> <code>e</code>.</p>'],
    ['escaped text', 'Use \\<code\\> & "quotes" with \\*stars\\*.', null],
    ['line break', 'One  \nTwo', '<p>One<br>Two</p>'],
    ['bullet list', '- One\n- Two', '<ul><li>One</li><li>Two</li></ul>'],
    ['numbered list from 3', '3. Three\n4. Four', '<ol start="3"><li>Three</li><li>Four</li></ol>'],
    ['nested list', '1. One\n   - Inner', '<ol><li>One<ul><li>Inner</li></ul></li></ol>'],
    ['loose list', '- One\n\n- Two', '<ul><li><p>One</p></li><li><p>Two</p></li></ul>'],
    [
      'table',
      '| Key | Does |\n|:---|---:|\n| `F1` | Shows **badges** |',
      '<table><thead><tr><th style="text-align: left" title="Key">Key</th><th style="text-align: right" title="Does">Does</th></tr></thead><tbody><tr><td style="text-align: left"><code>F1</code></td><td style="text-align: right">Shows <strong>badges</strong></td></tr></tbody></table>',
    ],
    ['code block', '```bash\necho "<hi>"\n```', '<pre><code>echo &quot;&lt;hi&gt;&quot;</code></pre>'],
    ['blockquote', '> Note this.', '<blockquote><p>Note this.</p></blockquote>'],
    ['rule', '---', '<hr>'],
    ['heading with code', '## The `?` button', '<h2 id="the--button">The <code>?</code> button</h2>'],
    ['deep heading', '#### Deep\n\n##### Deeper', '<h4 id="deep">Deep</h4><h4 id="deeper">Deeper</h4>'],
    [
      'external link',
      '[Drupal](https://www.drupal.org)',
      '<p><a href="https://www.drupal.org" target="_blank" rel="noopener" title="Open https://www.drupal.org in a new tab">Drupal</a></p>',
    ],
    [
      'external link with a title',
      '[Drupal](https://www.drupal.org "The Drupal site")',
      '<p><a href="https://www.drupal.org" target="_blank" rel="noopener" title="The Drupal site">Drupal</a></p>',
    ],
    [
      'page link',
      '[the **keys**](keys.md)',
      '<p><a href="docs/keys.md" data-page="keys" title="Read &quot;the keys&quot; in the manual">the <strong>keys</strong></a></p>',
    ],
    [
      'page link with an anchor',
      '[Saving](keys.md#saving)',
      '<p><a href="docs/keys.md#saving" data-page="keys" data-anchor="saving" title="Read &quot;Saving&quot; in the manual">Saving</a></p>',
    ],
    [
      'anchor on the same page',
      '[Below](#below)',
      '<p><a href="docs/page.md#below" data-page="page" data-anchor="below" title="Read &quot;Below&quot; in the manual">Below</a></p>',
    ],
    ['image', '![The <landing> screen](assets/landing.png)', '<p><img src="docs/assets/landing.png" alt="The &lt;landing&gt; screen" loading="lazy"></p>'],
  ].map(([name, markdown, expected]) => [name, markdown, expected ?? '<p>Use &lt;code&gt; &amp; &quot;quotes&quot; with *stars*.</p>']);
}

test('reports each Markdown problem in a page', async (t) => {
  for (const [name, markdown, expected] of dataProviderPageErrors()) {
    await t.test(name, () => {
      assert.deepEqual(renderPage('page', markdown).errors, expected);
    });
  }
});

function dataProviderPageErrors() {
  return [
    ['no title', 'Summary.\n', ['page.md: does not start with a "# Title" heading']],
    ['a second-level title', '## Page\n\nSummary.\n', ['page.md: does not start with a "# Title" heading']],
    ['no summary', '# Page\n\n## Section\n', ['page.md: has no summary paragraph after its title']],
    ['a second title', '# Page\n\nSummary.\n\n# Again\n', ['page.md: has a second "# " heading "Again"']],
    ['block HTML', '# Page\n\nSummary.\n\n<div>Hi</div>\n', ['page.md: has raw HTML "<div>Hi</div>"']],
    ['inline HTML', '# Page\n\nPress <kbd>F1</kbd>.\n', ['page.md: has raw HTML "<kbd>"', 'page.md: has raw HTML "</kbd>"']],
    ['a comment', '# Page\n\nSummary.\n\n<!-- todo -->\n', ['page.md: has raw HTML "<!-- todo -->"']],
    [
      'a link outside docs',
      '# Page\n\nSee [the code](../src/app.js).\n',
      ['page.md: links to "../src/app.js", which is neither another page in docs/ nor an external URL'],
    ],
    [
      'a link to the contents',
      '# Page\n\nSee [all](README.md).\n',
      ['page.md: links to "README.md", which is neither another page in docs/ nor an external URL'],
    ],
    [
      'an external image',
      '# Page\n\n![Logo](https://example.com/logo.png)\n',
      ['page.md: shows "https://example.com/logo.png", which is not an image in assets/'],
    ],
    ['an image outside assets', '# Page\n\n![Logo](../logo.svg)\n', ['page.md: shows "../logo.svg", which is not an image in assets/']],
    ['an image without alt text', '# Page\n\n![](assets/logo.png)\n', ['page.md: shows "assets/logo.png" without alt text']],
    ['HTML in the title', '# Page <i>draft</i>\n\nSummary.\n', ['page.md: has raw HTML "<i>"', 'page.md: has raw HTML "</i>"']],
    [
      'a link outside docs in the title',
      '# Page of [code](../src/app.js)\n\nSummary.\n',
      ['page.md: links to "../src/app.js", which is neither another page in docs/ nor an external URL'],
    ],
  ];
}

test('builds the manual in contents order', () => {
  const manual = buildManual(docs(), new Set(['landing.png']));

  assert.deepEqual(manual.sections, ['Basics', 'Reference']);
  assert.deepEqual(
    manual.pages.map((page) => [page.id, page.section, page.title, page.summary]),
    [
      ['start', 'Basics', 'Start', 'Open a diagram.'],
      ['panels', 'Basics', 'Panels', 'Every panel.'],
      ['keys', 'Reference', 'Keys', 'Shortcuts.'],
    ],
  );
});

test('accepts a link to a heading below a section', () => {
  assert.doesNotThrow(() => buildManual(docs({ 'panels.md': '# Panels\n\nEvery panel.\n\nSee [twice](keys.md#saving-twice).\n' }), new Set(['landing.png'])));
});

test("accepts a link to a page's title", () => {
  assert.doesNotThrow(() => buildManual(docs({ 'panels.md': '# Panels\n\nEvery panel.\n\nSee [the keys](keys.md#keys).\n' }), new Set(['landing.png'])));
});

test('lists every problem of the manual in 1 error', async (t) => {
  for (const [name, pages, assets, expected] of dataProviderManualErrors()) {
    await t.test(name, () => {
      assert.throws(
        () => buildManual(docs(pages), new Set(assets)),
        (error) => {
          assert.deepEqual(error.message.split('\n').slice(1), expected);

          return true;
        },
      );
    });
  }
});

function dataProviderManualErrors() {
  const landing = ['landing.png'];

  return [
    ['a page missing from the contents', { 'extra.md': '# Extra\n\nMore.\n' }, landing, ['- extra.md: is missing from the contents in README.md']],
    ['a listed page that does not exist', { 'panels.md': null }, landing, ['- README.md: lists panels.md, which does not exist']],
    ['a page listed twice', { 'README.md': CONTENTS + '- [Start](start.md)\n' }, landing, ['- README.md: lists start.md twice']],
    ['a contents item that is not a page', { 'README.md': CONTENTS + '- [Out](../out.md)\n' }, landing, ['- README.md: "../out.md" is not a page in docs/']],
    [
      'a contents item with an anchor',
      { 'README.md': CONTENTS + '- [Keys](keys.md#saving)\n' },
      landing,
      ['- README.md: "keys.md#saving" is not a page in docs/'],
    ],
    ['an empty section', { 'README.md': CONTENTS + '\n## Empty\n' }, landing, ['- README.md: section "Empty" lists no pages']],
    [
      'a title that differs',
      { 'panels.md': '# The panels\n\nEvery panel.\n' },
      landing,
      ['- panels.md: its title "The panels" differs from "Panels" in the contents'],
    ],
    [
      'a link to a missing page',
      { 'panels.md': '# Panels\n\nSee [gone](gone.md).\n' },
      landing,
      ['- panels.md: links to "gone.md", a page that does not exist'],
    ],
    [
      'a link to a missing anchor',
      { 'panels.md': '# Panels\n\nSee [keys](keys.md#loading).\n' },
      landing,
      ['- panels.md: links to "keys.md#loading", an anchor that does not exist'],
    ],
    ['a missing image', {}, [], ['- docs/assets/landing.png does not exist']],
    ['an unused image', {}, ['landing.png', 'old.png'], ['- docs/assets/old.png is shown on no page']],
    [
      'several problems',
      { 'panels.md': '# Panels\n\n<b>Every</b> panel.\n', 'extra.md': '# Extra\n\nMore.\n' },
      landing,
      ['- panels.md: has raw HTML "<b>"', '- panels.md: has raw HTML "</b>"', '- extra.md: is missing from the contents in README.md'],
    ],
  ];
}

test('names the count of problems', () => {
  assert.throws(() => buildManual(docs({ 'extra.md': '# Extra\n\nMore.\n' }), new Set(['landing.png'])), /^Error: The manual has 1 problem:\n/);
  assert.throws(() => buildManual(docs({ 'panels.md': null }), new Set()), /^Error: The manual has 2 problems:\n/);
});

test('fails without a contents page', () => {
  assert.throws(() => buildManual(new Map([['start.md', '# Start\n\nHi.\n']]), new Set()), /docs\/README\.md is missing/);
});

test('writes the manual as a module', async () => {
  const manual = buildManual(docs(), new Set(['landing.png']));
  const source = manualSource(manual);
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

  assert.deepEqual(module.MANUAL_SECTIONS, manual.sections);
  assert.deepEqual(module.MANUAL_PAGES, manual.pages);
});

test('src/manual.js is built from the current docs', async () => {
  const built = await manualModule(join(ROOT, 'docs'), ROOT);

  assert.ok(built === readFileSync(join(ROOT, 'src', 'manual.js'), 'utf8'), 'src/manual.js is out of date: run npm run build-manual');
});
