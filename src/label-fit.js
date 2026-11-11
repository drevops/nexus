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
const TAG_BODY = 0.25;
const MIN_ROOM = 0.05;
const FULL_WIDTH = () => ({ left: -1, right: 1 });
const BOX_CENTRE = { x: 0, y: 0 };

/**
 * The x of the left and right edges of each Cytoscape node shape at height y.
 * Both are fractions of the shape's half-size, and y runs from -1 at the top
 * edge to 1 at the bottom edge. Shapes not listed span their full width at
 * every height.
 */
export const SHAPE_EDGES = {
  ellipse: symmetric((y) => Math.sqrt(1 - y * y)),
  diamond: symmetric((y) => 1 - Math.abs(y)),
  hexagon: symmetric((y) => 1 - Math.abs(y) / 2),
  octagon: symmetric((y) => Math.min(1, Math.SQRT2 - Math.abs(y))),
  pentagon: symmetric(pentagonHalfWidth),
  tag: tagEdges,
  rhomboid: rhomboidEdges,
};

/**
 * The point each Cytoscape node shape centres its label on, as fractions of
 * the shape's half-size from the box centre. Each point is the centroid of
 * the shape. Shapes not listed are symmetric about the box centre, so their
 * centroid is the box centre.
 */
export const LABEL_CENTRES = {
  // The body of the tag outweighs its point.
  tag: { x: -9 / 52, y: 0 },
  // The pentagon has its apex at the top and its widest part above its base.
  pentagon: { x: 0, y: 1 - 2 / Math.sqrt(5) },
};

function symmetric(halfWidth) {
  return (y) => {
    const half = halfWidth(y);

    return { left: -half, right: half };
  };
}

// Cytoscape's pentagon has its apex at the top, its full width at height
// PENTAGON_SHOULDER and PENTAGON_FOOT of that width at its base.
function pentagonHalfWidth(y) {
  if (y < PENTAGON_SHOULDER) {
    return (y + 1) / (PENTAGON_SHOULDER + 1);
  }

  return 1 - ((1 - PENTAGON_FOOT) * (y - PENTAGON_SHOULDER)) / (1 - PENTAGON_SHOULDER);
}

// Cytoscape's tag is a rectangle from -1 to TAG_BODY with a point at the
// middle of its right edge.
function tagEdges(y) {
  return { left: -1, right: TAG_BODY + (1 - TAG_BODY) * (1 - Math.abs(y)) };
}

// Cytoscape's rhomboid leans right: its top edge runs from -1 to
// RHOMBOID_OFFSET and its bottom edge from -RHOMBOID_OFFSET to 1.
function rhomboidEdges(y) {
  const shift = ((1 - RHOMBOID_OFFSET) * (y + 1)) / 2;

  return { left: shift - 1, right: RHOMBOID_OFFSET + shift };
}

/**
 * Returns the point a shape centres its label on, as LABEL_CENTRES describes.
 */
export function labelCentre(shape) {
  return Object.hasOwn(LABEL_CENTRES, shape) ? LABEL_CENTRES[shape] : BOX_CENTRE;
}

/**
 * Returns the half-width a shape leaves for text centred on its label centre
 * at height y, as a fraction of the shape's half-width.
 */
export function labelRoom(shape, y) {
  const edges = Object.hasOwn(SHAPE_EDGES, shape) ? SHAPE_EDGES[shape](y) : FULL_WIDTH();
  const centre = labelCentre(shape).x;

  return Math.min(centre - edges.left, edges.right - centre);
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
 * label centre, which lie within halfHeight, half the height of the shape.
 * The label sits on the shape's labelCentre().
 */
export function fitWidth(lines, shape, halfHeight, padding, inset) {
  const centre = labelCentre(shape);
  const shift = centre.y * halfHeight;
  // An off-centre label is nearer 1 side of the box's rectangle.
  const boxRoom = 1 - Math.abs(centre.x);
  let half = padding;

  for (const line of lines) {
    const fraction = Math.min(labelRoom(shape, (line.top + shift) / halfHeight), labelRoom(shape, (line.bottom + shift) / halfHeight));
    // A line at a shape's tip or outside the shape has no room, so the floor
    // keeps the width finite.
    const usable = fraction > MIN_ROOM ? fraction : MIN_ROOM;
    half = Math.max(half, (line.width / 2 + padding) / boxRoom, (line.width / 2 + inset) / usable);
  }

  return 2 * (half - padding);
}
