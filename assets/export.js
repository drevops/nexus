/**
 * Client-side exports of the diagram canvas. Nothing is uploaded - the PNG is
 * rasterised by Cytoscape and the SVG is produced by the cytoscape-svg
 * extension entirely in the browser.
 */

if (window.cytoscape && window.cytoscapeSvg) {
  window.cytoscape.use(window.cytoscapeSvg);
}

function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'content-model';
}

function downloadUri(uri, filename) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadText(text, mime, filename) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadUri(url, filename);
  URL.revokeObjectURL(url);
}

/**
 * Export the whole graph (not just the viewport) as a PNG named after the
 * given diagram title.
 */
export function exportPng(cy, title) {
  if (!cy) {
    return;
  }
  downloadUri(cy.png({ full: true, scale: 2, bg: '#ffffff' }), slug(title) + '.png');
}

/**
 * Export the whole graph as a scalable SVG named after the diagram title.
 */
export function exportSvg(cy, title) {
  if (!cy || typeof cy.svg !== 'function') {
    return;
  }
  downloadText(cy.svg({ full: true, bg: '#ffffff' }), 'image/svg+xml', slug(title) + '.svg');
}
