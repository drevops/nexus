/**
 * Settings of the connection lines, the edges between entities, fields and
 * proxies.
 *
 * The settings are saved under `lines` in the `nexusSettings` entry as
 * `{ style }`, where `style` is the id of 1 of LINE_OPTIONS.
 */

// The choices of the line style, in the order the Settings panel lists them,
// each with the Cytoscape curve style that draws it. Cytoscape's bezier draws
// a lone edge between 2 nodes straight and bows apart edges that share both
// ends, where its straight style would draw them on top of each other.
export const LINE_OPTIONS = Object.freeze([
  { id: 'right-angled', label: 'Right-angled', curve: 'taxi' },
  { id: 'straight', label: 'Straight', curve: 'bezier' },
]);

export const LINE_DEFAULTS = Object.freeze({ style: 'right-angled' });

function lineOption(id) {
  return LINE_OPTIONS.find((option) => option.id === id);
}

/**
 * Returns complete connection line settings from saved ones, with the
 * default for a missing or unknown value.
 */
export function readLineSettings(saved) {
  const entry = saved && typeof saved === 'object' ? saved : {};
  const known = Object.hasOwn(entry, 'style') && lineOption(entry.style) !== undefined;

  return { style: known ? entry.style : LINE_DEFAULTS.style };
}

/**
 * Returns the Cytoscape curve style that draws the lines of the settings.
 */
export function curveStyle(settings) {
  return lineOption(readLineSettings(settings).style).curve;
}
