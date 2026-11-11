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
const TAG_POINT = 0.75;
const HEXAGON_END = 0.5;
const OCTAGON_CORNER = 2 - Math.SQRT2;
const RHOMBOID_SLANT = 0.667;
const MIN_ROOM = 0.05;
const BISECTIONS = 64;

/**
 * The outline of each Cytoscape node shape that has corners off its bounding
 * box, as the corners of a convex polygon. Each takes the half-width and
 * half-height of the box and returns [x, y] points in pixels from the box
 * centre, in drawing order.
 *
 * The diamond and the pentagon scale every corner with the box. The tag,
 * hexagon, octagon and rhomboid keep the ends they have in a square box at
 * the same size in a wider box, so their ends scale with the height alone.
 * An end never grows past the middle of a narrow box.
 */
export const SHAPE_OUTLINES = {
  diamond: (w, h) => [
    [0, -h],
    [w, 0],
    [0, h],
    [-w, 0],
  ],
  pentagon: (w, h) => [
    [0, -h],
    [w, PENTAGON_SHOULDER * h],
    [PENTAGON_FOOT * w, h],
    [-PENTAGON_FOOT * w, h],
    [-w, PENTAGON_SHOULDER * h],
  ],
  tag: (w, h) => {
    const point = Math.min(TAG_POINT * h, 2 * w);

    return [
      [-w, -h],
      [w - point, -h],
      [w, 0],
      [w - point, h],
      [-w, h],
    ];
  },
  hexagon: (w, h) => {
    const end = Math.min(HEXAGON_END * h, w);

    return [
      [-w, 0],
      [end - w, -h],
      [w - end, -h],
      [w, 0],
      [w - end, h],
      [end - w, h],
    ];
  },
  octagon: (w, h) => {
    const corner = Math.min(OCTAGON_CORNER * h, w);

    return [
      [corner - w, -h],
      [w - corner, -h],
      [w, corner - h],
      [w, h - corner],
      [w - corner, h],
      [corner - w, h],
      [-w, h - corner],
      [-w, corner - h],
    ];
  },
  rhomboid: (w, h) => {
    const slant = Math.min(RHOMBOID_SLANT * h, 2 * w);

    return [
      [-w, -h],
      [w - slant, -h],
      [w, h],
      [slant - w, h],
    ];
  },
};

// Cytoscape stretches its own outline of these shapes with the box, so they
// are drawn as polygons from SHAPE_OUTLINES instead.
const FIXED_END_SHAPES = ['tag', 'hexagon', 'octagon', 'rhomboid'];

/**
 * How far each shape moves its label down from the box centre, as a fraction
 * of the half-height. The pentagon has its apex at the top, so its label sits
 * on the pentagon's centroid. Every other shape keeps its label at the height
 * of the box centre.
 */
export const LABEL_DROPS = {
  pentagon: 1 - 2 / Math.sqrt(5),
};

/**
 * Returns the Cytoscape shape that draws a shape: 'polygon' for a shape with
 * fixed ends, or the shape itself.
 */
export function drawnShape(shape) {
  return FIXED_END_SHAPES.includes(shape) ? 'polygon' : shape;
}

/**
 * Returns the shape-polygon-points value that draws a fixed-end shape in a
 * box of the given half-size: the corners of its outline as fractions of the
 * half-size, rounded so that boxes of nearly the same size share 1 polygon.
 * Returns null for a shape Cytoscape draws on its own.
 */
export function polygonPoints(shape, halfWidth, halfHeight) {
  if (!FIXED_END_SHAPES.includes(shape)) {
    return null;
  }

  return SHAPE_OUTLINES[shape](halfWidth, halfHeight).flatMap(([x, y]) => [round(x / halfWidth), round(y / halfHeight)]);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Returns how far a shape moves its label down from the box centre, as
 * LABEL_DROPS describes.
 */
export function labelDrop(shape) {
  return Object.hasOwn(LABEL_DROPS, shape) ? LABEL_DROPS[shape] : 0;
}

/**
 * Returns the x of a shape's left and right edges at height y, in pixels from
 * the centre of a box of the given half-size, or null where y misses the
 * shape. A rectangle spans its full width at every height.
 */
export function shapeSpan(shape, y, halfWidth, halfHeight) {
  if (shape === 'ellipse') {
    const fraction = 1 - (y * y) / (halfHeight * halfHeight);

    return fraction < 0 ? null : { left: -halfWidth * Math.sqrt(fraction), right: halfWidth * Math.sqrt(fraction) };
  }

  if (!Object.hasOwn(SHAPE_OUTLINES, shape)) {
    return { left: -halfWidth, right: halfWidth };
  }

  const points = SHAPE_OUTLINES[shape](halfWidth, halfHeight);
  const crossings = [];

  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];

    if (y < Math.min(y0, y1) || y > Math.max(y0, y1)) {
      return;
    }

    crossings.push(y0 === y1 ? x0 : x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
  });

  return crossings.length ? { left: Math.min(...crossings), right: Math.max(...crossings) } : null;
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
 * Returns the range the centre of a label can take in a box of the given
 * half-size, in pixels from the box centre, so each text line stays padding
 * inside the box's rectangle and inset inside its shape. The range is empty
 * when low is above high.
 *
 * Each line holds its width and the offsets of its top and bottom from the
 * label's centre line, which labelDrop() moves down from the box centre.
 */
export function labelRange(lines, shape, halfWidth, halfHeight, padding, inset) {
  const drop = labelDrop(shape) * halfHeight;
  // A line at a shape's tip or outside the shape has no room, so the floor
  // keeps the box finite.
  const floor = MIN_ROOM * halfWidth;
  let low = -Infinity;
  let high = Infinity;

  for (const line of lines) {
    const half = line.width / 2;

    for (const y of [line.top + drop, line.bottom + drop]) {
      const span = shapeSpan(shape, y, halfWidth, halfHeight);
      const left = span ? Math.min(span.left, -floor) : -floor;
      const right = span ? Math.max(span.right, floor) : floor;

      low = Math.max(low, left + inset + half, padding - halfWidth + half);
      high = Math.min(high, right - inset - half, halfWidth - padding - half);
    }
  }

  return { low: low, high: high };
}

/**
 * Returns the content width a box needs, without its padding, so each text
 * line fits as labelRange() describes. Lines are measured from a label
 * centre line halfHeight above the bottom of the shape.
 */
export function fitWidth(lines, shape, halfHeight, padding, inset) {
  const fits = (halfWidth) => {
    const range = labelRange(lines, shape, halfWidth, halfHeight, padding, inset);

    return range.low <= range.high;
  };

  if (fits(padding)) {
    return 0;
  }

  let low = padding;
  let high = 2 * padding + halfHeight;

  while (!fits(high)) {
    low = high;
    high *= 2;
  }

  for (let i = 0; i < BISECTIONS; i++) {
    const middle = (low + high) / 2;

    if (fits(middle)) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return 2 * (high - padding);
}

/**
 * Returns the x of the centre of a label in a box of the given half-size, in
 * pixels from the box centre: the middle of the range labelRange() leaves,
 * so the text sits as far from 1 side as from the other.
 */
export function labelX(lines, shape, halfWidth, halfHeight, padding, inset) {
  const range = labelRange(lines, shape, halfWidth, halfHeight, padding, inset);
  const middle = (range.low + range.high) / 2;

  return Number.isFinite(middle) ? middle : 0;
}
