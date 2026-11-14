/**
 * Settings of the connection lines, the edges between entities, fields and
 * proxies.
 *
 * The settings are saved under `lines` in the `nexusSettings` entry as
 * `{ style }`, where `style` is the id of 1 of LINE_OPTIONS.
 */

// The distance from the source node's edge at which a merged line turns.
// Cytoscape draws an L-shaped line instead when the gap to the target is too
// short for the turn, so the turn stays well below the gap between ranks.
export const MERGED_TURN = 24;

// The line styles, in the order the toolbar menu lists them, each with the
// Cytoscape edge style that draws it. A taxi edge with a turn in percent
// turns halfway across the gap to its own target, so lines from 1 node to
// targets of different widths turn at different points. A turn in pixels is
// measured from the source node, so every line from it shares 1 trunk.
// Cytoscape's bezier draws a lone edge between 2 nodes straight and bows
// apart edges that share both ends, where its straight style would draw them
// on top of each other.
export const LINE_OPTIONS = Object.freeze([
  {
    id: 'right-angled',
    label: 'Right-angled',
    title: 'Draw lines at right angles, each turning halfway to its target',
    icon: 'lines-right-angled',
    style: Object.freeze({ 'curve-style': 'taxi', 'taxi-turn': '50%' }),
  },
  {
    id: 'merged',
    label: 'Merged',
    title: 'Draw lines at right angles, merging the lines from each node into 1 line',
    icon: 'lines-merged',
    style: Object.freeze({ 'curve-style': 'taxi', 'taxi-turn': MERGED_TURN + 'px' }),
  },
  {
    id: 'straight',
    label: 'Straight',
    title: 'Draw each line straight from its source to its target',
    icon: 'lines-straight',
    style: Object.freeze({ 'curve-style': 'bezier' }),
  },
]);

export const LINE_DEFAULTS = Object.freeze({ style: 'right-angled' });

/**
 * Returns the line option with the id, or undefined.
 */
export function lineOption(id) {
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
 * Returns the Cytoscape edge style properties that draw the lines of the
 * settings.
 */
export function lineStyle(settings) {
  return { ...lineOption(readLineSettings(settings).style).style };
}
