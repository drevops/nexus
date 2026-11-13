/**
 * Markup in text read from config, such as help text and bundle descriptions,
 * which Drupal renders as HTML.
 *
 * parseRichText() reads the text into a tree of strings and elements. Only the
 * tags in RICH_TEXT_TAGS become elements, without any attribute but a link's
 * `href`. Every other tag is dropped and keeps its text, except the tags in
 * DROPPED_CONTENT, which lose their content too. Entities are decoded, so the
 * strings hold plain text that each renderer escapes or sets as text.
 *
 * A link draws as styled text with its address as the title, so markup from a
 * document never navigates the page.
 */

export const RICH_TEXT_TAGS = ['a', 'b', 'br', 'code', 'em', 'i', 'li', 'ol', 'p', 's', 'small', 'strong', 'sub', 'sup', 'u', 'ul'];

const VOID_TAGS = ['br'];

// Their content is code or a document of its own, never text to show.
const DROPPED_CONTENT = ['iframe', 'noscript', 'object', 'script', 'style', 'template', 'textarea', 'title'];

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

const HREF = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

function codePointText(code) {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
    return '�';
  }

  return String.fromCodePoint(code);
}

/**
 * Returns the text with its character references decoded: the named ones in
 * NAMED_ENTITIES and every decimal and hex one. An unknown name stays as
 * written, and an invalid code point becomes U+FFFD.
 */
export function decodeEntities(text) {
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, (match, decimal, hex, name) => {
    if (decimal !== undefined) {
      return codePointText(Number(decimal));
    }

    if (hex !== undefined) {
      return codePointText(parseInt(hex, 16));
    }

    return Object.hasOwn(NAMED_ENTITIES, name.toLowerCase()) ? NAMED_ENTITIES[name.toLowerCase()] : match;
  });
}

function linkHref(attributes) {
  const match = HREF.exec(attributes);

  if (!match) {
    return '';
  }

  return decodeEntities(match[1] ?? match[2] ?? match[3]).trim();
}

/**
 * Returns the text as a list of nodes. A node is a string, or an element
 * `{ tag, children }` with a tag from RICH_TEXT_TAGS; a link also has `href`.
 * A close tag ends the innermost open element of its name and any opened
 * inside it, a close tag with no open element is dropped, and the text closes
 * whatever is still open.
 */
export function parseRichText(text) {
  const source = typeof text === 'string' ? text : '';
  const root = { tag: null, children: [] };
  const stack = [root];
  let index = 0;

  function append(node) {
    const children = stack[stack.length - 1].children;

    if (typeof node === 'string' && typeof children[children.length - 1] === 'string') {
      children[children.length - 1] += node;
    } else {
      children.push(node);
    }
  }

  function appendText(raw) {
    if (raw !== '') {
      append(decodeEntities(raw));
    }
  }

  TOKEN.lastIndex = 0;

  for (let match = TOKEN.exec(source); match; match = TOKEN.exec(source)) {
    appendText(source.slice(index, match.index));
    index = TOKEN.lastIndex;

    const [, closing, rawName, attributes] = match;

    // A comment matches with no tag name.
    if (!rawName) {
      continue;
    }

    const tag = rawName.toLowerCase();

    if (!closing && DROPPED_CONTENT.includes(tag)) {
      const end = source.toLowerCase().indexOf('</' + tag, index);
      const close = end === -1 ? -1 : source.indexOf('>', end);

      index = close === -1 ? source.length : close + 1;
      TOKEN.lastIndex = index;
      continue;
    }

    if (!RICH_TEXT_TAGS.includes(tag)) {
      continue;
    }

    if (closing) {
      const open = stack.map((node) => node.tag).lastIndexOf(tag);

      if (open > 0) {
        stack.length = open;
      }

      continue;
    }

    const element = { tag, children: [] };

    if (tag === 'a') {
      element.href = linkHref(attributes);
    }

    append(element);

    if (!VOID_TAGS.includes(tag)) {
      stack.push(element);
    }
  }

  appendText(source.slice(index));

  return root.children;
}

/**
 * Returns the plain text of the nodes, as a screen shows it without styles.
 */
export function richTextPlain(nodes) {
  return nodes.map((node) => (typeof node === 'string' ? node : node.tag === 'br' ? '\n' : richTextPlain(node.children))).join('');
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Returns the nodes as HTML: every string escaped, and a link as a
 * `span.rich-text__link` titled with its address.
 */
export function richTextHtml(nodes) {
  return nodes
    .map((node) => {
      if (typeof node === 'string') {
        return escapeHtml(node);
      }

      if (node.tag === 'br') {
        return '<br>';
      }

      const inner = richTextHtml(node.children);

      if (node.tag === 'a') {
        return '<span class="rich-text__link"' + (node.href ? ' title="' + escapeHtml(node.href) + '"' : '') + '>' + inner + '</span>';
      }

      return '<' + node.tag + '>' + inner + '</' + node.tag + '>';
    })
    .join('');
}
