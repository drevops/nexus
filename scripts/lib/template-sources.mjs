/**
 * Reads and merges the config folders of a content-model template and builds
 * the saved-diagram document the template ships as.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../src/parser.js';
import { documentFromGraph } from '../../src/document.js';

// The vendored UMD build exports nothing to an ES module import and sets
// globalThis.cytoscape instead.
await import('../../assets/vendor/cytoscape.min.js');

/**
 * Reads the YAML files of a config folder, without its subfolders, as
 * { name, content } records sorted by name.
 */
export function readConfigFolder(dir) {
  if (!existsSync(dir)) {
    throw new Error('Missing config folder: ' + dir);
  }

  const names = readdirSync(dir).filter((name) => name.endsWith('.yml'));

  if (names.length === 0) {
    throw new Error('No YAML files in ' + dir);
  }

  return names.sort().map((name) => ({ name, content: readFileSync(join(dir, name), 'utf8') }));
}

/**
 * Merges the config files of several origins, in order, into 'files': a map
 * of file name to { origin, content }.
 *
 * The first origin to ship a file keeps it, as Drupal keeps config that
 * exists when a later recipe ships it again. 'shadowed' lists each later copy
 * that differs as { name, kept, skipped }, naming both origins.
 */
export function mergeConfig(origins) {
  const files = new Map();
  const shadowed = [];

  for (const { origin, files: originFiles } of origins) {
    for (const { name, content } of originFiles) {
      const existing = files.get(name);

      if (!existing) {
        files.set(name, { origin, content });
        continue;
      }

      if (existing.content !== content) {
        shadowed.push({ name, kept: existing.origin, skipped: origin });
      }
    }
  }

  return { files, shadowed };
}

/**
 * Builds the saved-diagram document of a template from its parsed config,
 * keyed by file name.
 *
 * documentFromGraph() serializes the model on a headless graph, so the
 * document has the shape of a saved diagram. The headless graph places every
 * node at the origin, so the layout is left empty.
 */
export function buildDocument(files, title) {
  const data = parseConfig(files).toArray();
  const cy = globalThis.cytoscape({ headless: true, elements: [...data.nodes, ...data.edges] });

  try {
    return { ...documentFromGraph(cy, { title }), layout: {} };
  } finally {
    cy.destroy();
  }
}

/**
 * Renders a document as the JSON a template ships.
 */
export function renderDocument(doc) {
  return JSON.stringify(doc, null, 2) + '\n';
}

/**
 * Renders bundle counts as a JavaScript object literal, such as
 * '{ node: 3, paragraph: 31 }'.
 */
export function renderCounts(counts) {
  const entries = Object.entries(counts).map(([type, count]) => type + ': ' + count);

  return entries.length > 0 ? '{ ' + entries.join(', ') + ' }' : '{}';
}
