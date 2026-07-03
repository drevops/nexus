/**
 * Client-side exports of the diagram canvas. Nothing is uploaded.
 */

function downloadUri(uri, filename) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export the whole graph (not just the viewport) as a PNG.
 */
export function exportPng(cy) {
  if (!cy) {
    return;
  }
  downloadUri(cy.png({ full: true, scale: 2, bg: '#ffffff' }), 'content-model.png');
}

/**
 * Export the whole graph as a single-page PDF sized to the image.
 */
export function exportPdf(cy) {
  if (!cy) {
    return;
  }

  const uri = cy.png({ full: true, scale: 2, bg: '#ffffff' });
  const image = new Image();

  image.onload = () => {
    const width = image.width;
    const height = image.height;
    const JsPdf = window.jspdf.jsPDF;
    const pdf = new JsPdf({ orientation: width >= height ? 'landscape' : 'portrait', unit: 'pt', format: [width, height] });
    pdf.addImage(uri, 'PNG', 0, 0, width, height);
    pdf.save('content-model.pdf');
  };

  image.src = uri;
}
