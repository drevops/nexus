/**
 * Builds the in-app manual from the Markdown pages in docs/.
 *
 * docs/README.md is the contents: each `## Section` heading starts a section
 * and each `- [Title](page.md)` item under it adds a page, in that order. The
 * title in the contents must match the page's `# Title`, and the paragraph
 * after that heading is the page's summary.
 *
 * Each page is rendered to HTML here, so the app ships no Markdown parser:
 * headings get the anchors GitHub gives them, a link to another page becomes
 * an in-app link with `data-page` and `data-anchor`, an image in assets/ is
 * loaded from docs/assets/ and an external link opens in a new tab. Raw HTML,
 * a page missing from the contents, a link to a page or anchor that doesn't
 * exist and an image outside assets/ fail the build, as does an asset no page
 * shows.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Lexer } from 'marked';
import * as prettier from 'prettier';
import { headingSlugger } from '../../src/markdown.js';

export const CONTENTS_FILE = 'README.md';
export const ASSETS_DIR = 'assets';
export const SITE_DOCS = 'docs/';

const EXTERNAL = /^(?:https?:|mailto:)/i;

export function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Returns the text of inline tokens without their formatting.
 */
export function plainText(tokens) {
  return (tokens || [])
    .map((token) => {
      if (token.tokens) {
        return plainText(token.tokens);
      }

      if (token.type === 'br') {
        return ' ';
      }

      if (token.type === 'image') {
        return token.text;
      }

      return token.text ?? '';
    })
    .join('');
}

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Splits a page link into its page id and anchor, or returns null for a
 * target that is neither a page in the same folder nor an anchor.
 */
export function pageTarget(href, currentId) {
  const [path, anchor = null] = href.split('#');

  if (path === '') {
    return anchor ? { page: currentId, anchor } : null;
  }

  if (!/^[a-z0-9][a-z0-9-]*\.md$/.test(path) || path === CONTENTS_FILE) {
    return null;
  }

  return { page: path.slice(0, -3), anchor: anchor || null };
}

/**
 * Reads the contents page into sections of `{ title, file }` pages.
 */
export function readContents(markdown) {
  const sections = [];
  const errors = [];

  new Lexer({ gfm: true }).lex(markdown).forEach((token) => {
    if (token.type === 'heading' && token.depth === 2) {
      sections.push({ title: collapse(plainText(token.tokens)), pages: [] });

      return;
    }

    if (token.type !== 'list') {
      return;
    }

    token.items.forEach((item) => {
      const link = findLink(item.tokens);

      if (!link || !sections.length) {
        errors.push(CONTENTS_FILE + ': "' + collapse(plainText(item.tokens)) + '" is not a page link under a section heading');

        return;
      }

      sections.at(-1).pages.push({ title: collapse(plainText(link.tokens)), file: link.href });
    });
  });

  return { sections, errors };
}

function findLink(tokens) {
  for (const token of tokens || []) {
    if (token.type === 'link') {
      return token;
    }

    const nested = findLink(token.tokens);

    if (nested) {
      return nested;
    }
  }

  return null;
}

/**
 * Renders 1 page. Returns the page, the links and images it uses, and the
 * problems found in it.
 */
export function renderPage(id, markdown) {
  const tokens = new Lexer({ gfm: true }).lex(markdown).filter((token) => token.type !== 'space');
  const errors = [];
  const links = [];
  const images = [];
  const slugger = headingSlugger();
  const headings = [];
  const anchors = [];
  const file = id + '.md';

  const fail = (message) => errors.push(file + ': ' + message);

  const first = tokens.shift();

  if (!first || first.type !== 'heading' || first.depth !== 1) {
    fail('does not start with a "# Title" heading');

    return { page: null, anchors, links, images, errors };
  }

  const title = collapse(plainText(first.tokens));
  slugger(title);

  const lead = tokens[0];

  if (!lead || lead.type !== 'paragraph') {
    fail('has no summary paragraph after its title');
  }

  const inline = (list) => list.map(renderInline).join('');

  function renderInline(token) {
    switch (token.type) {
      case 'text':
        return token.tokens ? inline(token.tokens) : escapeHtml(token.text);
      case 'escape':
        return escapeHtml(token.text);
      case 'strong':
        return '<strong>' + inline(token.tokens) + '</strong>';
      case 'em':
        return '<em>' + inline(token.tokens) + '</em>';
      case 'del':
        return '<del>' + inline(token.tokens) + '</del>';
      case 'codespan':
        return '<code>' + escapeHtml(token.text) + '</code>';
      case 'br':
        return '<br>';
      case 'link':
        return renderLink(token);
      case 'image':
        return renderImage(token);
      case 'html':
        fail('has raw HTML "' + collapse(token.raw) + '"');

        return '';
      default:
        fail('has unsupported inline Markdown "' + token.type + '"');

        return '';
    }
  }

  // Every link carries a title, as every control in the app does.
  function renderLink(token) {
    const label = inline(token.tokens);
    const text = collapse(plainText(token.tokens));

    if (EXTERNAL.test(token.href)) {
      const title = escapeHtml(token.title || 'Open ' + token.href + ' in a new tab');

      return '<a href="' + escapeHtml(token.href) + '" target="_blank" rel="noopener" title="' + title + '">' + label + '</a>';
    }

    const target = pageTarget(token.href, id);

    if (!target) {
      fail('links to "' + token.href + '", which is neither another page in docs/ nor an external URL');

      return label;
    }

    links.push({ ...target, href: token.href });

    const anchor = target.anchor ? ' data-anchor="' + escapeHtml(target.anchor) + '"' : '';
    const href = SITE_DOCS + target.page + '.md' + (target.anchor ? '#' + target.anchor : '');
    const title = escapeHtml(token.title || 'Read "' + text + '" in the manual');

    return '<a href="' + escapeHtml(href) + '" data-page="' + escapeHtml(target.page) + '"' + anchor + ' title="' + title + '">' + label + '</a>';
  }

  function renderImage(token) {
    const match = /^assets\/([a-z0-9][a-z0-9-]*\.(?:png|svg|jpg|jpeg|gif|webp))$/.exec(token.href);

    if (!match) {
      fail('shows "' + token.href + '", which is not an image in ' + ASSETS_DIR + '/');

      return '';
    }

    if (!token.text.trim()) {
      fail('shows "' + token.href + '" without alt text');
    }

    images.push(match[1]);

    return '<img src="' + escapeHtml(SITE_DOCS + token.href) + '" alt="' + escapeHtml(token.text) + '" loading="lazy">';
  }

  function renderBlock(token) {
    switch (token.type) {
      case 'heading': {
        if (token.depth === 1) {
          fail('has a second "# " heading "' + collapse(token.text) + '"');

          return '';
        }

        const text = collapse(plainText(token.tokens));
        const slug = slugger(text);
        const level = Math.min(token.depth, 4);
        anchors.push(slug);

        if (token.depth === 2) {
          headings.push({ id: slug, text });
        }

        return '<h' + level + ' id="' + escapeHtml(slug) + '">' + inline(token.tokens) + '</h' + level + '>';
      }
      case 'paragraph':
        return '<p>' + inline(token.tokens) + '</p>';
      case 'text':
        return token.tokens ? inline(token.tokens) : escapeHtml(token.text);
      case 'list': {
        const tag = token.ordered ? 'ol' : 'ul';
        const start = token.ordered && token.start !== 1 && token.start !== '' ? ' start="' + Number(token.start) + '"' : '';
        const items = token.items.map((item) => '<li>' + blocks(item.tokens) + '</li>').join('');

        return '<' + tag + start + '>' + items + '</' + tag + '>';
      }
      case 'table': {
        const align = (cell) => (cell.align ? ' style="text-align: ' + cell.align + '"' : '');
        const head = token.header
          .map((cell) => '<th' + align(cell) + ' title="' + escapeHtml(collapse(plainText(cell.tokens))) + '">' + inline(cell.tokens) + '</th>')
          .join('');
        const rows = token.rows.map(
          (row) => '<tr>' + row.map((cell, at) => '<td' + align(token.header[at]) + '>' + inline(cell.tokens) + '</td>').join('') + '</tr>',
        );

        return '<table><thead><tr>' + head + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
      }
      case 'code':
        return '<pre><code>' + escapeHtml(token.text) + '</code></pre>';
      case 'blockquote':
        return '<blockquote>' + blocks(token.tokens) + '</blockquote>';
      case 'hr':
        return '<hr>';
      case 'space':
        return '';
      case 'html':
        fail('has raw HTML "' + collapse(token.raw) + '"');

        return '';
      default:
        fail('has unsupported Markdown "' + token.type + '"');

        return '';
    }
  }

  // A loose list item holds paragraphs, a tight one bare text.
  function blocks(list) {
    return list.map(renderBlock).join('');
  }

  const html = blocks(tokens);
  const summary = lead && lead.type === 'paragraph' ? collapse(plainText(lead.tokens)) : '';
  const text = collapse(tokens.map((token) => tokenText(token)).join(' '));

  return { page: { id, title, summary, html, headings, text }, anchors, links, images, errors };
}

function tokenText(token) {
  if (token.type === 'list') {
    return token.items.map((item) => item.tokens.map(tokenText).join(' ')).join(' ');
  }

  if (token.type === 'table') {
    return [...token.header, ...token.rows.flat()].map((cell) => plainText(cell.tokens)).join(' ');
  }

  if (token.type === 'code') {
    return token.text;
  }

  return token.tokens ? plainText(token.tokens) : '';
}

/**
 * Builds the manual from the Markdown files of docs/, given as a map of file
 * name to text, and the file names in docs/assets/. Throws 1 error that lists
 * every problem.
 */
export function buildManual(files, assets) {
  const errors = [];

  if (!files.has(CONTENTS_FILE)) {
    throw new Error('docs/' + CONTENTS_FILE + ' is missing');
  }

  const contents = readContents(files.get(CONTENTS_FILE));
  errors.push(...contents.errors);

  const pages = [];
  const anchors = new Map();
  const listed = new Set();
  const used = new Set();
  const links = [];

  contents.sections.forEach((section) => {
    if (!section.pages.length) {
      errors.push(CONTENTS_FILE + ': section "' + section.title + '" lists no pages');
    }

    section.pages.forEach((entry) => {
      const target = pageTarget(entry.file, null);

      if (!target || target.anchor) {
        errors.push(CONTENTS_FILE + ': "' + entry.file + '" is not a page in docs/');

        return;
      }

      if (listed.has(entry.file)) {
        errors.push(CONTENTS_FILE + ': lists ' + entry.file + ' twice');

        return;
      }

      listed.add(entry.file);

      if (!files.has(entry.file)) {
        errors.push(CONTENTS_FILE + ': lists ' + entry.file + ', which does not exist');

        return;
      }

      const result = renderPage(target.page, files.get(entry.file));
      errors.push(...result.errors);

      if (!result.page) {
        return;
      }

      if (result.page.title !== entry.title) {
        errors.push(entry.file + ': its title "' + result.page.title + '" differs from "' + entry.title + '" in the contents');
      }

      anchors.set(target.page, new Set(result.anchors));
      result.images.forEach((image) => used.add(image));
      links.push(...result.links.map((link) => ({ ...link, from: entry.file })));
      pages.push({ ...result.page, section: section.title });
    });
  });

  [...files.keys()]
    .filter((file) => file !== CONTENTS_FILE && !listed.has(file))
    .forEach((file) => errors.push(file + ': is missing from the contents in ' + CONTENTS_FILE));

  links.forEach((link) => {
    if (!anchors.has(link.page)) {
      errors.push(link.from + ': links to "' + link.href + '", a page that does not exist');
    } else if (link.anchor && !anchors.get(link.page).has(link.anchor)) {
      errors.push(link.from + ': links to "' + link.href + '", an anchor that does not exist');
    }
  });

  [...used].filter((image) => !assets.has(image)).forEach((image) => errors.push('docs/' + ASSETS_DIR + '/' + image + ' does not exist'));
  [...assets].filter((asset) => !used.has(asset)).forEach((asset) => errors.push('docs/' + ASSETS_DIR + '/' + asset + ' is shown on no page'));

  if (errors.length) {
    throw new Error(
      'The manual has ' + errors.length + (errors.length === 1 ? ' problem' : ' problems') + ':\n' + errors.map((error) => '- ' + error).join('\n'),
    );
  }

  return { sections: contents.sections.map((section) => section.title), pages };
}

/**
 * Returns the source of src/manual.js for a built manual, before formatting.
 */
export function manualSource(manual) {
  return [
    '// Generated by `npm run build-manual` from the Markdown in docs/. Edit the',
    '// pages there and run it again; tests/unit/manual.test.js fails while this',
    '// file is out of date.',
    '',
    'export const MANUAL_SECTIONS = ' + JSON.stringify(manual.sections) + ';',
    '',
    'export const MANUAL_PAGES = ' + JSON.stringify(manual.pages) + ';',
    '',
  ].join('\n');
}

/**
 * Reads the Markdown files of a docs folder and the file names in its
 * assets folder.
 */
export function readDocs(dir) {
  const files = new Map(
    readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => [name, readFileSync(join(dir, name), 'utf8')]),
  );
  const assetsDir = join(dir, ASSETS_DIR);
  const assets = new Set(existsSync(assetsDir) ? readdirSync(assetsDir).filter((name) => !name.startsWith('.')) : []);

  return { files, assets };
}

/**
 * Builds the manual of a docs folder and returns the source of src/manual.js,
 * formatted with the repository's Prettier settings.
 */
export async function manualModule(dir, root) {
  const { files, assets } = readDocs(dir);
  const options = await prettier.resolveConfig(join(root, 'src', 'manual.js'));

  return prettier.format(manualSource(buildManual(files, assets)), { ...options, parser: 'babel' });
}
