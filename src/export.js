/**
 * Client-side downloads: the diagram canvas as PNG or SVG, the fields,
 * bundles and references as CSV, the model as Markdown or HTML and the
 * diagram as a Nexus document. Nothing is uploaded - the PNG is rasterised by
 * Cytoscape and the SVG is produced by the cytoscape-svg extension entirely
 * in the browser.
 */

import { DEFAULT_TITLE } from './model.js';
import { fileSlug } from './names.js';

if (window.cytoscape && window.cytoscapeSvg && !window.cytoscape('core', 'svg')) {
  window.cytoscape.use(window.cytoscapeSvg);
}

function fileName(title, suffix) {
  return (fileSlug(title) || fileSlug(DEFAULT_TITLE)) + suffix;
}

function downloadUri(uri, filename) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadText(text, filename, type) {
  const blob = new Blob([text], { type: type });
  const url = URL.createObjectURL(blob);
  downloadUri(url, filename);
  URL.revokeObjectURL(url);
}

// A note draws its Markdown in an HTML layer that Cytoscape doesn't export,
// so its plain-text label shows while `draw` runs.
function withNoteLabels(cy, draw) {
  const notes = cy.nodes('[group="annotation"][kind="note"]');

  notes.style('text-opacity', 1);

  try {
    return draw();
  } finally {
    notes.removeStyle('text-opacity');
  }
}

/**
 * Export the whole graph (not just the viewport) as a PNG named after the
 * given diagram title.
 */
export function exportPng(cy, title) {
  if (!cy) {
    return;
  }
  downloadUri(
    withNoteLabels(cy, () => cy.png({ full: true, scale: 2, bg: '#ffffff' })),
    fileName(title, '.png'),
  );
}

/**
 * Export the whole graph as a scalable SVG named after the diagram title.
 */
export function exportSvg(cy, title) {
  if (!cy || typeof cy.svg !== 'function') {
    return;
  }
  downloadText(
    withNoteLabels(cy, () => cy.svg({ full: true, bg: '#ffffff' })),
    fileName(title, '.svg'),
    'image/svg+xml',
  );
}

/**
 * Download CSV text as a '<title>-<name>.csv' file, the title as a file
 * slug.
 */
export function exportCsv(text, title, name) {
  downloadText(text, fileName(title, '-' + name + '.csv'), 'text/csv');
}

/**
 * Download Markdown text as a .md file named after the diagram title.
 */
export function exportMarkdown(text, title) {
  downloadText(text, fileName(title, '.md'), 'text/markdown');
}

/**
 * Download an HTML page as a .html file named after the diagram title.
 */
export function exportHtml(text, title) {
  downloadText(text, fileName(title, '.html'), 'text/html');
}

/**
 * Download a Nexus document as a .nexus.json file named after the diagram
 * title.
 */
export function exportDocument(doc, title) {
  downloadText(JSON.stringify(doc, null, 2), fileName(title, '.nexus.json'), 'application/json');
}
