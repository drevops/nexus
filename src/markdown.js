/**
 * Markdown documentation of a saved Nexus document, and the settings of the
 * Markdown export.
 *
 * `documentMarkdown()` writes the title, a table of contents, an optional
 * Mermaid diagram and a section per entity type and per bundle. Each bundle
 * section holds its machine name, its note, a table of its fields and the
 * fields that reference it.
 *
 * Contents links point at the heading anchors GitHub generates, so every
 * heading's anchor is worked out in document order before anything is
 * written. The settings are saved under `markdown` in the `nexusSettings`
 * entry as `{ diagram }`.
 */

import { cardinalityLabel, KIND_SYSTEM } from './model.js';
import { documentOutline, missingTargetLabel } from './document-outline.js';
import { mermaidFlowchart } from './mermaid.js';

// Mermaid's renderer slows down and GitHub's preview gives up on large
// diagrams, so 'auto' leaves the diagram out above this many entities.
export const MARKDOWN_DIAGRAM_LIMIT = 50;

// The choices of the diagram setting, in the order the Settings panel lists
// them.
export const MARKDOWN_DIAGRAM_OPTIONS = Object.freeze([
  { id: 'auto', label: 'Up to ' + MARKDOWN_DIAGRAM_LIMIT + ' entities' },
  { id: 'always', label: 'Always' },
  { id: 'never', label: 'Never' },
]);

export const MARKDOWN_DEFAULTS = Object.freeze({ diagram: 'auto' });

const FIELD_COLUMNS = ['Field', 'Machine name', 'Type', 'Cardinality', 'Required', 'References', 'Note'];

/**
 * Returns complete Markdown export settings from saved ones, with the default
 * for a missing or unknown value.
 */
export function readMarkdownSettings(saved) {
  const entry = saved && typeof saved === 'object' ? saved : {};
  const known = Object.hasOwn(entry, 'diagram') && MARKDOWN_DIAGRAM_OPTIONS.some((option) => option.id === entry.diagram);

  return { diagram: known ? entry.diagram : MARKDOWN_DEFAULTS.diagram };
}

/**
 * Returns whether an export of `entityCount` entities includes the diagram.
 */
export function includesDiagram(settings, entityCount) {
  const diagram = readMarkdownSettings(settings).diagram;

  if (entityCount === 0 || diagram === 'never') {
    return false;
  }

  return diagram === 'always' || entityCount <= MARKDOWN_DIAGRAM_LIMIT;
}

// Puts a value on 1 line without the spaces a heading or cell would drop.
function plain(value) {
  return String(value ?? '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim();
}

/**
 * Escapes text so Markdown shows it as written. '|' is escaped too, so the
 * text can sit in a table cell, and '$' so GitHub draws no maths.
 */
export function markdownText(value) {
  return plain(value)
    .replace(/[\\`*_[\]<>|#~$]/g, '\\$&')
    .replace(/&(?=#?[a-z0-9]+;)/gi, '\\&');
}

/**
 * Wraps a value in a code span whose backtick fence is longer than any run of
 * backticks inside it. Inside a table, '|' is escaped as GFM requires even in
 * a code span.
 */
export function markdownCode(value, inTable = false) {
  const text = plain(value);

  if (text === '') {
    return '';
  }

  const longest = Math.max(0, ...(text.match(/`+/g) || []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  const span = fence + pad + text + pad + fence;

  return inTable ? span.replace(/\|/g, '\\|') : span;
}

/**
 * Returns the anchor GitHub gives a heading: the text lowercased, without any
 * character but letters, marks, digits, '_', '-' and spaces, and with each
 * space as '-'.
 */
export function headingSlug(text) {
  return plain(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/**
 * Returns a function that gives each heading its anchor in document order,
 * adding '-1', '-2' and so on to an anchor already taken, as GitHub does.
 */
export function headingSlugger() {
  const occurrences = new Map();

  return (text) => {
    const original = headingSlug(text);
    let slug = original;

    while (occurrences.has(slug)) {
      occurrences.set(original, occurrences.get(original) + 1);
      slug = original + '-' + occurrences.get(original);
    }

    occurrences.set(slug, 0);

    return slug;
  };
}

// The line-start characters that would open a list, a quote or a heading
// underline are escaped as well as the inline ones.
function noteLine(line) {
  return markdownText(line)
    .replace(/^([-+=])/, '\\$1')
    .replace(/^(\d+)([.)])/, '$1\\$2');
}

function noteLines(note) {
  return String(note ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim());
}

function noteQuote(note) {
  const paragraphs = [];
  let current = [];

  noteLines(note).forEach((line) => {
    if (line !== '') {
      current.push('> ' + noteLine(line));
    } else if (current.length > 0) {
      paragraphs.push(current.join('<br>\n'));
      current = [];
    }
  });

  if (current.length > 0) {
    paragraphs.push(current.join('<br>\n'));
  }

  return paragraphs.join('\n>\n');
}

function noteCell(note) {
  return noteLines(note)
    .filter((line) => line !== '')
    .map(markdownText)
    .join('<br>');
}

function link(label, slug) {
  return '[' + markdownText(label) + '](#' + slug + ')';
}

function tableRow(cells) {
  return '| ' + cells.join(' | ') + ' |';
}

/**
 * Returns the Markdown of a saved document. `options.diagram` adds a Mermaid
 * flowchart after the contents.
 */
export function documentMarkdown(doc, options = {}) {
  const outline = documentOutline(doc);

  if (outline.entities.length === 0) {
    return '# ' + markdownText(outline.title) + '\n\nThe model has no entities.\n';
  }

  const diagram = !!options.diagram;
  const slugger = headingSlugger();

  // The title and contents headings come first, so they take their anchors
  // before any bundle with the same label.
  slugger(outline.title);
  slugger('Contents');

  const diagramSlug = diagram ? slugger('Diagram') : null;
  const groupSlugs = new Map();
  const entitySlugs = new Map();

  outline.groups.forEach((group) => {
    groupSlugs.set(group.type, slugger(group.heading));
    group.entities.forEach((entity) => entitySlugs.set(entity.id, slugger(entity.label)));
  });

  const target = (id) => {
    const entity = outline.entity(id);

    if (entity) {
      return link(entity.label, entitySlugs.get(id));
    }

    const label = missingTargetLabel(outline, id);

    return label === id ? markdownCode(id, true) : markdownText(label);
  };

  const fieldRow = (field) =>
    tableRow([
      markdownText(field.label) + (field.kind === KIND_SYSTEM ? ' (base field)' : ''),
      markdownCode(field.name, true),
      markdownCode(field.fieldType, true),
      cardinalityLabel(field.cardinality),
      field.required ? 'Yes' : 'No',
      field.targets.map(target).join(', '),
      noteCell(field.note),
    ]);

  const entityBlocks = (entity) => {
    const blocks = ['### ' + markdownText(entity.label), 'Machine name: ' + markdownCode(entity.bundle)];
    const note = noteQuote(entity.note);

    if (note !== '') {
      blocks.push(note);
    }

    if (entity.fields.length > 0) {
      blocks.push([tableRow(FIELD_COLUMNS), tableRow(FIELD_COLUMNS.map(() => '---')), ...entity.fields.map(fieldRow)].join('\n'));
    } else {
      blocks.push('No fields.');
    }

    const referrers = outline.referencedBy(entity.id);

    if (referrers.length > 0) {
      blocks.push(
        'Referenced by: ' +
          referrers.map((ref) => markdownText(ref.field.label) + ' on ' + link(ref.entity.label, entitySlugs.get(ref.entity.id))).join(', ') +
          '.',
      );
    }

    return blocks;
  };

  const contents = [];

  if (diagram) {
    contents.push('- ' + link('Diagram', diagramSlug));
  }

  outline.groups.forEach((group) => {
    contents.push('- ' + link(group.heading, groupSlugs.get(group.type)));
    group.entities.forEach((entity) => contents.push('  - ' + link(entity.label, entitySlugs.get(entity.id))));
  });

  const blocks = ['# ' + markdownText(outline.title), '## Contents', contents.join('\n')];

  if (diagram) {
    blocks.push('## Diagram', '```mermaid\n' + mermaidFlowchart(outline) + '\n```');
  }

  outline.groups.forEach((group) => {
    blocks.push('## ' + markdownText(group.heading));
    group.entities.forEach((entity) => blocks.push(...entityBlocks(entity)));
  });

  return blocks.join('\n\n') + '\n';
}
