/**
 * Client-side downloads: the diagram canvas as PNG or SVG, the fields table
 * as CSV and the diagram as a Nexus document. Nothing is uploaded - the PNG is
 * rasterised by Cytoscape and the SVG is produced by the cytoscape-svg
 * extension entirely in the browser.
 */

import { cardinalityLabel, DEFAULT_TITLE } from './model.js';
import { fileSlug } from './names.js';

if (window.cytoscape && window.cytoscapeSvg) {
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

function recordsToCsv(records, typeLabel) {
  const esc = (value) => {
    const s = String(value == null ? '' : value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const headers = ['Entity', 'Entity type', 'Field', 'Machine name', 'Field type', 'Cardinality', 'Required', 'References'];
  const rows = records.map((r) =>
    [
      r.entity,
      typeLabel(r.entityType),
      r.field,
      r.name,
      r.type,
      cardinalityLabel(r.cardinality),
      r.required ? 'yes' : 'no',
      r.refs.map((x) => x.label).join('; '),
    ]
      .map(esc)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Export the whole graph (not just the viewport) as a PNG named after the
 * given diagram title.
 */
export function exportPng(cy, title) {
  if (!cy) {
    return;
  }
  downloadUri(cy.png({ full: true, scale: 2, bg: '#ffffff' }), fileName(title, '.png'));
}

/**
 * Export the whole graph as a scalable SVG named after the diagram title.
 */
export function exportSvg(cy, title) {
  if (!cy || typeof cy.svg !== 'function') {
    return;
  }
  downloadText(cy.svg({ full: true, bg: '#ffffff' }), fileName(title, '.svg'), 'image/svg+xml');
}

/**
 * Export the field records as a CSV named after the diagram title.
 * `typeLabel` turns an entity type into the label the CSV shows.
 */
export function exportCsv(records, typeLabel, title) {
  downloadText(recordsToCsv(records, typeLabel), fileName(title, '-fields.csv'), 'text/csv');
}

/**
 * Download a Nexus document as a .nexus.json file named after the diagram
 * title.
 */
export function exportDocument(doc, title) {
  downloadText(JSON.stringify(doc, null, 2), fileName(title, '.nexus.json'), 'application/json');
}
