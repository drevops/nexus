/**
 * Box widths that keep a node's text inside the node's shape.
 *
 * Cytoscape sizes a node to the rectangle around its label, so a line near
 * the top or bottom of a shape that narrows there crosses the shape's edge.
 * These helpers wrap a label the way Cytoscape does and widen the box until
 * every text line clears the shape. Text is measured by a function the caller
 * passes in, so the module needs no DOM.
 */

const PENTAGON_SHOULDER = 2 - Math.sqrt(5);
const PENTAGON_FOOT = (Math.sqrt(5) - 1) / 2;
const RHOMBOID_OFFSET = 0.333;
const MIN_ROOM = 0.05;

/**
 * The half-width each Cytoscape node shape leaves for centred text at height
 * y. Both are fractions of the shape's half-size, and y runs from -1 at the
 * top edge to 1 at the bottom edge. Shapes not listed have their full width
 * wherever text sits.
 */
export const SHAPE_ROOM = {
  ellipse: (y) => Math.sqrt(1 - y * y),
  diamond: (y) => 1 - Math.abs(y),
  hexagon: (y) => 1 - Math.abs(y) / 2,
  octagon: (y) => Math.min(1, Math.SQRT2 - Math.abs(y)),
  tag: (y) => 1 - (3 * Math.abs(y)) / 4,
  pentagon: pentagonRoom,
  rhomboid: rhomboidRoom,
};

// Cytoscape's pentagon has its apex at the top, its full width at height
// PENTAGON_SHOULDER and PENTAGON_FOOT of that width at its base.
function pentagonRoom(y) {
  if (y < PENTAGON_SHOULDER) {
    return (y + 1) / (PENTAGON_SHOULDER + 1);
  }

  return 1 - ((1 - PENTAGON_FOOT) * (y - PENTAGON_SHOULDER)) / (1 - PENTAGON_SHOULDER);
}

// Cytoscape's rhomboid leans right: its top edge runs from -1 to
// RHOMBOID_OFFSET and its bottom edge from -RHOMBOID_OFFSET to 1.
function rhomboidRoom(y) {
  const shift = ((1 - RHOMBOID_OFFSET) * (y + 1)) / 2;

  return Math.min(1 - shift, RHOMBOID_OFFSET + shift);
}

/**
 * Splits a label into the lines Cytoscape draws for it.
 *
 * Each line of the text that is wider than maxWidth wraps at whitespace, and
 * every wrapped line is filled greedily. A wrapped line keeps the whitespace
 * after its last word, and a word wider than maxWidth gets a line of its own.
 */
export function wrapLabel(text, maxWidth, measure) {
  const lines = [];

  for (const line of String(text ?? '').split('\n')) {
    if (measure(line) <= maxWidth) {
      lines.push(line);
      continue;
    }

    let current = '';
    let start = 0;

    for (const match of line.matchAll(/[\s\u200b]+|$/g)) {
      const word = line.substring(start, match.index);
      const separator = match[0];
      start = match.index + separator.length;

      if (measure(current.length === 0 ? word : current + word + separator) <= maxWidth) {
        current += word + separator;
        continue;
      }

      if (current) {
        lines.push(current);
      }
      current = word + separator;
    }

    if (!/^[\s\u200b]+$/.test(current)) {
      lines.push(current);
    }
  }

  return lines;
}

/**
 * Returns the content width a box needs, without its padding, so each text
 * line stays padding inside the box's rectangle and inset inside its shape.
 *
 * Each line holds its width and the offsets of its top and bottom from the
 * box centre, which lie within halfHeight, half the height of the shape.
 */
export function fitWidth(lines, shape, halfHeight, padding, inset) {
  const room = SHAPE_ROOM[shape] || (() => 1);
  let half = padding;

  for (const line of lines) {
    const fraction = Math.min(room(line.top / halfHeight), room(line.bottom / halfHeight));
    // A line at a shape's tip or outside the shape has no room, so the floor
    // keeps the width finite.
    const usable = fraction > MIN_ROOM ? fraction : MIN_ROOM;
    half = Math.max(half, line.width / 2 + padding, (line.width / 2 + inset) / usable);
  }

  return 2 * (half - padding);
}
