/**
 * An HTML report of a saved Nexus document.
 *
 * `documentHtml()` writes a standalone page with the sections of the Markdown
 * export: the title, a table of contents and a section per entity type and per
 * bundle, each with its machine name, note, fields table and the fields that
 * reference it. Headings take the anchors the Markdown export gives them.
 *
 * The page holds its own stylesheet and a Content Security Policy that allows
 * nothing else, so it loads no resource and runs no script.
 */

import { cardinalityLabel, KIND_SYSTEM } from './model.js';
import { documentOutline, missingTargetLabel, noteParagraphs } from './document-outline.js';
import { outlineAnchors } from './markdown.js';

const FIELD_COLUMNS = ['Field', 'Machine name', 'Type', 'Cardinality', 'Required', 'References', 'Note'];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// headingSlug() never produces '.', so the fallback can't match another id.
const EMPTY_ANCHOR = 'section.';

const STYLES = `:root {
  color-scheme: light dark;
  --text: #1f2328;
  --muted: #59636e;
  --page: #ffffff;
  --border: #d1d9e0;
  --stripe: #f6f8fa;
  --code: #eff2f5;
  --accent: #0969da;
}
@media (prefers-color-scheme: dark) {
  :root {
    --text: #e6edf3;
    --muted: #9198a1;
    --page: #0d1117;
    --border: #3d444d;
    --stripe: #151b23;
    --code: #262c36;
    --accent: #4493f8;
  }
}
body {
  margin: 0;
  background: var(--page);
  color: var(--text);
  font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
main {
  max-width: 72rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}
h1 {
  margin: 0 0 1.5rem;
  font-size: 2rem;
}
h2 {
  margin: 2.5rem 0 1rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--border);
  font-size: 1.5rem;
}
h3 {
  margin: 2rem 0 0.5rem;
  font-size: 1.15rem;
}
a {
  color: var(--accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
code {
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--code);
  font: 0.875em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-wrap: anywhere;
}
blockquote {
  margin: 0.75rem 0;
  padding: 0 1rem;
  border-left: 4px solid var(--border);
  color: var(--muted);
}
.table {
  overflow-x: auto;
}
table {
  width: 100%;
  margin: 0.75rem 0;
  border-collapse: collapse;
  font-size: 0.9rem;
}
th,
td {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
th {
  background: var(--stripe);
  font-weight: 600;
}
tbody tr:nth-child(even) {
  background: var(--stripe);
}
.muted {
  color: var(--muted);
}
@media print {
  a {
    color: inherit;
  }
  h2,
  h3 {
    break-after: avoid;
  }
  tr {
    break-inside: avoid;
  }
}`;

/**
 * Escapes text for an HTML element or a quoted attribute value.
 */
export function htmlText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Returns the id of a heading from its Markdown anchor. An empty anchor is no
 * valid id, so it takes a fallback.
 */
export function anchorId(slug) {
  return slug === '' ? EMPTY_ANCHOR : slug;
}

function code(value) {
  const text = String(value ?? '');

  return text === '' ? '' : '<code>' + htmlText(text) + '</code>';
}

function link(label, slug) {
  return '<a href="#' + htmlText(anchorId(slug)) + '">' + htmlText(label) + '</a>';
}

function heading(level, text, slug) {
  return '<h' + level + ' id="' + htmlText(anchorId(slug)) + '">' + htmlText(text) + '</h' + level + '>';
}

function noteQuote(note) {
  const paragraphs = noteParagraphs(note);

  if (paragraphs.length === 0) {
    return [];
  }

  return ['<blockquote>', ...paragraphs.map((lines) => '<p>' + lines.map(htmlText).join('<br>') + '</p>'), '</blockquote>'];
}

function noteCell(note) {
  return noteParagraphs(note).flat().map(htmlText).join('<br>');
}

function tableRow(tag, cells) {
  return '<tr>' + cells.map((cell) => '<' + tag + '>' + cell + '</' + tag + '>').join('') + '</tr>';
}

function page(title, body) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + htmlText(title) + '</title>',
    '<style>',
    STYLES,
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<h1>' + htmlText(title) + '</h1>',
    ...body,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * Returns the HTML page of a saved document.
 */
export function documentHtml(doc) {
  const outline = documentOutline(doc);

  if (outline.entities.length === 0) {
    return page(outline.title, ['<p>The model has no entities.</p>']);
  }

  const { groupSlugs, entitySlugs } = outlineAnchors(outline);

  const target = (id) => {
    const entity = outline.entity(id);

    if (entity) {
      return link(entity.label, entitySlugs.get(id));
    }

    const label = missingTargetLabel(outline, id);

    return label === id ? code(id) : htmlText(label);
  };

  const fieldRow = (field) =>
    tableRow('td', [
      htmlText(field.label) + (field.kind === KIND_SYSTEM ? ' <span class="muted">(base field)</span>' : ''),
      code(field.name),
      code(field.fieldType),
      cardinalityLabel(field.cardinality),
      field.required ? 'Yes' : 'No',
      field.targets.map(target).join(', '),
      noteCell(field.note),
    ]);

  const entitySection = (entity) => {
    const lines = ['<section>', heading(3, entity.label, entitySlugs.get(entity.id)), '<p>Machine name: ' + code(entity.bundle) + '</p>', ...noteQuote(entity.note)];

    if (entity.fields.length > 0) {
      lines.push(
        '<div class="table">',
        '<table>',
        '<thead>',
        tableRow('th', FIELD_COLUMNS),
        '</thead>',
        '<tbody>',
        ...entity.fields.map(fieldRow),
        '</tbody>',
        '</table>',
        '</div>',
      );
    } else {
      lines.push('<p>No fields.</p>');
    }

    const referrers = outline.referencedBy(entity.id);

    if (referrers.length > 0) {
      const refs = referrers.map((ref) => htmlText(ref.field.label) + ' on ' + link(ref.entity.label, entitySlugs.get(ref.entity.id)));

      lines.push('<p>Referenced by: ' + refs.join(', ') + '.</p>');
    }

    lines.push('</section>');

    return lines;
  };

  const contents = ['<nav aria-label="Contents">', '<h2>Contents</h2>', '<ul>'];

  outline.groups.forEach((group) => {
    contents.push('<li>' + link(group.heading, groupSlugs.get(group.type)), '<ul>');
    group.entities.forEach((entity) => contents.push('<li>' + link(entity.label, entitySlugs.get(entity.id)) + '</li>'));
    contents.push('</ul>', '</li>');
  });

  contents.push('</ul>', '</nav>');

  const sections = outline.groups.flatMap((group) => [
    '<section>',
    heading(2, group.heading, groupSlugs.get(group.type)),
    ...group.entities.flatMap(entitySection),
    '</section>',
  ]);

  return page(outline.title, [...contents, ...sections]);
}
