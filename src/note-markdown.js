/**
 * The Markdown a note node draws.
 *
 * parseNoteMarkdown() reads a small Markdown subset into the tree shape of
 * src/rich-text.js, so richTextHtml() and richTextPlain() write it out:
 *
 * - `#` to `######` at the start of a line make a heading. Levels past 3 draw
 *   as level 3.
 * - Other lines make paragraphs, split by blank lines. A line break inside a
 *   paragraph is kept.
 * - `**bold**`, `*italic*` or `_italic_`, `__underline__`, `~~strikethrough~~`,
 *   `` `code` `` and `[label](address)` format text inline.
 *
 * A backslash before punctuation keeps the punctuation as written. `_` and
 * `__` don't open or close inside a word, so machine names stay as written. A
 * delimiter with no match and any HTML stay as written too.
 */

import { richTextHtml, richTextPlain } from './rich-text.js';

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

const MAX_HEADING_LEVEL = 3;

// Longest first, so `**` is read before `*`.
const DELIMITERS = ['**', '__', '~~', '*', '_'];

const DELIMITER_CHARS = ['*', '_', '~'];

const DELIMITER_TAGS = { '**': 'strong', __: 'u', '~~': 's', '*': 'em', _: 'em' };

const ESCAPABLE = /[!-/:-@[-`{-~]/;

const WORD = /[\p{L}\p{N}]/u;

const LINK_TARGET = /^\(\s*([^\s()]*)(?:\s+"[^"]*")?\s*\)/;

// Past these limits a delimiter or a `[` stays as written, so long runs of
// openers neither overflow the stack nor rescan the text for each opener.
const MAX_NESTING = 16;
const MAX_LINK_LABEL = 1000;

function isSpace(char) {
  return char === undefined || /\s/.test(char);
}

function intraword(delimiter, char) {
  return delimiter[0] === '_' && char !== undefined && WORD.test(char);
}

// Returns the inline nodes of `source`. `links` is false inside a link's
// label, so a link never holds another.
function parseInline(source, links = true) {
  // Delimiters known to have no closer from where they were tried to the end.
  const unclosed = new Set();

  function canOpen(index, delimiter) {
    return !unclosed.has(delimiter) && !isSpace(source[index + delimiter.length]) && !intraword(delimiter, source[index - 1]);
  }

  function canClose(index, delimiter) {
    return !isSpace(source[index - 1]) && !intraword(delimiter, source[index + delimiter.length]);
  }

  function runLength(index, char) {
    let end = index;

    while (source[end] === char) {
      end++;
    }

    return end - index;
  }

  // A code span: a run of backticks up to the next run of the same length.
  function readCode(index) {
    const length = runLength(index, '`');
    let search = index + length;

    while (search < source.length) {
      const next = source.indexOf('`', search);

      if (next === -1) {
        return null;
      }

      const closing = runLength(next, '`');

      if (closing === length) {
        let code = source.slice(index + length, next).replace(/\n/g, ' ');

        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') {
          code = code.slice(1, -1);
        }

        return { node: { tag: 'code', children: code ? [code] : [] }, end: next + closing };
      }

      search = next + closing;
    }

    return null;
  }

  function readLink(index) {
    let depth = 0;

    const limit = Math.min(source.length, index + MAX_LINK_LABEL + 2);

    for (let end = index; end < limit; end++) {
      const char = source[end];

      if (char === '\\') {
        end++;
        continue;
      }

      if (char === '[') {
        depth++;
      } else if (char === ']' && --depth === 0) {
        const target = LINK_TARGET.exec(source.slice(end + 1));
        const label = source.slice(index + 1, end);

        if (!target || label.trim() === '') {
          return null;
        }

        return { node: { tag: 'a', href: target[1], children: parseInline(label, false) }, end: end + 1 + target[0].length };
      }
    }

    return null;
  }

  function openingDelimiter(index, depth) {
    if (depth >= MAX_NESTING) {
      return null;
    }

    return DELIMITERS.find((delimiter) => source.startsWith(delimiter, index) && canOpen(index, delimiter)) || null;
  }

  // Reads from `start` up to `closer`, or to the end of the text when
  // `closer` is null. The innermost open delimiter closes first. `depth`
  // counts the delimiters open around the text.
  function read(start, closer, depth) {
    const nodes = [];
    let text = '';
    let index = start;

    function flush() {
      if (text !== '') {
        nodes.push(text);
        text = '';
      }
    }

    function push(node) {
      flush();
      nodes.push(node);
    }

    while (index < source.length) {
      const char = source[index];

      if (char === '\\' && ESCAPABLE.test(source[index + 1] ?? '')) {
        text += source[index + 1];
        index += 2;
        continue;
      }

      if (closer && source.startsWith(closer, index) && canClose(index, closer)) {
        flush();

        return { nodes, end: index + closer.length, closed: true };
      }

      if (char === '`') {
        const code = readCode(index);

        if (code) {
          push(code.node);
          index = code.end;
        } else {
          const length = runLength(index, '`');

          text += source.slice(index, index + length);
          index += length;
        }

        continue;
      }

      if (char === '[' && links) {
        const link = readLink(index);

        if (link) {
          push(link.node);
          index = link.end;
          continue;
        }
      }

      const delimiter = openingDelimiter(index, depth);

      if (delimiter) {
        const inner = read(index + delimiter.length, delimiter, depth + 1);

        if (inner.closed && inner.nodes.length) {
          push({ tag: DELIMITER_TAGS[delimiter], children: inner.nodes });
          index = inner.end;
          continue;
        }

        if (!inner.closed) {
          unclosed.add(delimiter);
        }

        text += delimiter;
        index += delimiter.length;
        continue;
      }

      // A run that can't open stays whole, so its last character can't open
      // a span on its own, as in `a__b__c`.
      const length = DELIMITER_CHARS.includes(char) ? runLength(index, char) : 1;

      text += source.slice(index, index + length);
      index += length;
    }

    flush();

    return { nodes, end: index, closed: false };
  }

  return read(0, null, 0).nodes;
}

// Replaces each newline in the nodes' strings with a `br` element.
function lineBreaks(nodes) {
  return nodes.flatMap((node) => {
    if (typeof node !== 'string') {
      return [{ ...node, children: lineBreaks(node.children) }];
    }

    return node.split('\n').flatMap((part, index) => [...(index ? [{ tag: 'br', children: [] }] : []), ...(part ? [part] : [])]);
  });
}

/**
 * Returns the note's text as a list of block elements: `h1`, `h2`, `h3` and
 * `p`, each holding the inline nodes of src/rich-text.js. Text that isn't a
 * string reads as empty.
 */
export function parseNoteMarkdown(text) {
  const source = typeof text === 'string' ? text : '';
  const blocks = [];
  let paragraph = [];

  function endParagraph() {
    if (paragraph.length) {
      blocks.push({ tag: 'p', children: lineBreaks(parseInline(paragraph.join('\n'))) });
      paragraph = [];
    }
  }

  for (const line of source.split(/\r\n?|\n/)) {
    const heading = HEADING.exec(line);

    if (heading && heading[2] !== '') {
      endParagraph();
      blocks.push({ tag: 'h' + Math.min(heading[1].length, MAX_HEADING_LEVEL), children: parseInline(heading[2]) });
    } else if (line.trim() === '') {
      endParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }

  endParagraph();

  return blocks;
}

/**
 * Returns the note's text as HTML, with every string escaped.
 */
export function noteMarkdownHtml(text) {
  return richTextHtml(parseNoteMarkdown(text));
}

/**
 * Returns the note's text without its Markdown, 1 line per block.
 */
export function noteMarkdownPlain(text) {
  return parseNoteMarkdown(text)
    .map((block) => richTextPlain(block.children))
    .join('\n');
}
