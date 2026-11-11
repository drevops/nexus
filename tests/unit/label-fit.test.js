import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_OUTLINES, drawnShape, fitWidth, labelDrop, labelRange, labelX, polygonPoints, shapeSpan, wrapLabel } from '../../src/label-fit.js';

// Every character is 10 units wide.
const measure = (text) => text.length * 10;

const FIXED_END_SHAPES = ['tag', 'hexagon', 'octagon', 'rhomboid'];

// 2 lines on either side of the centre line of a box 24 high on each side.
const LINES = [
  { width: 80, top: -14, bottom: -2 },
  { width: 60, top: 2, bottom: 14 },
];

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) < tolerance, actual + ' is not ' + expected);
}

test('splits a label into the lines Cytoscape draws', async (t) => {
  for (const [name, text, maxWidth, expected] of dataProviderWrapLabel()) {
    await t.test(name, () => {
      assert.deepEqual(wrapLabel(text, maxWidth, measure), expected);
    });
  }
});

function dataProviderWrapLabel() {
  return [
    ['a label that fits', 'Article', 100, ['Article']],
    ['a label exactly as wide as the maximum', 'Blog post', 90, ['Blog post']],
    ['each line of a multi-line label', 'Blog\npost', 100, ['Blog', 'post']],
    ['a long label, filling each line greedily', 'Navigation reference card', 160, ['Navigation ', 'reference card']],
    ['a long label, keeping the space after each wrapped line', 'Navigation reference card', 120, ['Navigation ', 'reference ', 'card']],
    ['a word wider than the maximum, on a line of its own', 'Supercalifragilistic is long', 100, ['Supercalifragilistic ', 'is long']],
    ['a long label ending in a space', 'Alpha beta gamma ', 100, ['Alpha ', 'beta ', 'gamma ']],
    ['a number', 42, 100, ['42']],
    ['null', null, 100, ['']],
    ['undefined', undefined, 100, ['']],
  ];
}

test('draws only the shapes with fixed ends as polygons', async (t) => {
  for (const [shape, expected] of dataProviderDrawnShape()) {
    await t.test(shape, () => {
      assert.equal(drawnShape(shape), expected);
    });
  }
});

function dataProviderDrawnShape() {
  return [
    ['tag', 'polygon'],
    ['hexagon', 'polygon'],
    ['octagon', 'polygon'],
    ['rhomboid', 'polygon'],
    ['round-rectangle', 'round-rectangle'],
    ['rectangle', 'rectangle'],
    ['ellipse', 'ellipse'],
    ['diamond', 'diamond'],
    ['pentagon', 'pentagon'],
    ['barrel', 'barrel'],
    ['cut-rectangle', 'cut-rectangle'],
  ];
}

test('draws each fixed-end shape in a square box the way Cytoscape draws it', async (t) => {
  for (const [shape, expected] of dataProviderSquarePolygon()) {
    await t.test(shape, () => {
      assert.deepEqual(polygonPoints(shape, 20, 20), expected);
    });
  }
});

// The points of Cytoscape's own shapes, rounded to 3 places.
function dataProviderSquarePolygon() {
  return [
    ['tag', [-1, -1, 0.25, -1, 1, 0, 0.25, 1, -1, 1]],
    ['hexagon', [-1, 0, -0.5, -1, 0.5, -1, 1, 0, 0.5, 1, -0.5, 1]],
    ['octagon', [-0.414, -1, 0.414, -1, 1, -0.414, 1, 0.414, 0.414, 1, -0.414, 1, -1, 0.414, -1, -0.414]],
    ['rhomboid', [-1, -1, 0.333, -1, 1, 1, -0.333, 1]],
  ];
}

test('leaves the polygon to Cytoscape for every other shape', async (t) => {
  for (const shape of ['round-rectangle', 'rectangle', 'ellipse', 'diamond', 'pentagon', 'barrel', 'cut-rectangle', 'constructor']) {
    await t.test(shape, () => {
      assert.equal(polygonPoints(shape, 20, 20), null);
    });
  }
});

test('keeps the ends of a fixed-end shape the same size in a wider box', async (t) => {
  for (const [shape, end, expected] of dataProviderEndSize()) {
    await t.test(shape, () => {
      assertClose(end(SHAPE_OUTLINES[shape](20, 20)), expected);
      assertClose(end(SHAPE_OUTLINES[shape](200, 20)), expected);
    });
  }
});

// Each end's horizontal size, measured from the outline of a box 20 high on
// each side.
function dataProviderEndSize() {
  return [
    ['tag', (points) => points[2][0] - points[1][0], 15],
    ['hexagon', (points) => points[1][0] - points[0][0], 10],
    ['octagon', (points) => points[2][0] - points[1][0], (2 - Math.SQRT2) * 20],
    ['rhomboid', (points) => points[2][0] - points[1][0], 0.667 * 20],
  ];
}

test('keeps the ends of a fixed-end shape inside a narrow box', async (t) => {
  for (const shape of FIXED_END_SHAPES) {
    await t.test(shape, () => {
      for (const [x] of SHAPE_OUTLINES[shape](4, 20)) {
        assert.ok(x >= -4 && x <= 4, shape + ' has a corner at ' + x);
      }
    });
  }
});

test('moves only the label of a pentagon down, to its centroid', async (t) => {
  const pentagon = centroid(SHAPE_OUTLINES.pentagon(1, 1));

  for (const [shape, expected] of [
    ['pentagon', pentagon.y],
    ...['round-rectangle', 'ellipse', 'diamond', 'tag', 'hexagon', 'octagon', 'rhomboid', 'constructor'].map((shape) => [shape, 0]),
  ]) {
    await t.test(shape, () => {
      assertClose(labelDrop(shape), expected);
    });
  }
});

// Returns the centroid of a polygon given as [x, y] points in order.
function centroid(points) {
  let area = 0;
  let x = 0;
  let y = 0;

  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross / 2;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  });

  return { x: x / (6 * area), y: y / (6 * area) };
}

test('finds the left and right edges of each shape at a height', async (t) => {
  for (const [name, shape, y, expected] of dataProviderShapeSpan()) {
    await t.test(name, () => {
      const span = shapeSpan(shape, y, 100, 20);

      if (expected === null) {
        assert.equal(span, null);
        return;
      }

      assertClose(span.left, expected[0]);
      assertClose(span.right, expected[1]);
    });
  }
});

// Spans in a box 100 wide and 20 high on each side.
function dataProviderShapeSpan() {
  const shoulder = (2 - Math.sqrt(5)) * 20;
  const foot = ((Math.sqrt(5) - 1) / 2) * 100;

  return [
    ['a rectangle at its middle', 'rectangle', 0, [-100, 100]],
    ['a rounded rectangle at its top edge', 'round-rectangle', -20, [-100, 100]],
    ['an ellipse at its middle', 'ellipse', 0, [-100, 100]],
    ['an ellipse near its top', 'ellipse', -12, [-80, 80]],
    ['an ellipse above its top', 'ellipse', -24, null],
    ['a diamond halfway to its bottom', 'diamond', 10, [-50, 50]],
    ['a pentagon at its apex', 'pentagon', -20, [0, 0]],
    ['a pentagon at its shoulders', 'pentagon', shoulder, [-100, 100]],
    ['a pentagon at its base', 'pentagon', 20, [-foot, foot]],
    ['a tag at its point', 'tag', 0, [-100, 100]],
    ['a tag halfway to its top', 'tag', -10, [-100, 92.5]],
    ['a tag at its bottom edge', 'tag', 20, [-100, 85]],
    ['a hexagon halfway to its top', 'hexagon', -10, [-95, 95]],
    ['a hexagon at its bottom edge', 'hexagon', 20, [-90, 90]],
    ['an octagon at the end of its side', 'octagon', 20 - (2 - Math.SQRT2) * 20, [-100, 100]],
    ['an octagon at its top edge', 'octagon', -20, [-100 + (2 - Math.SQRT2) * 20, 100 - (2 - Math.SQRT2) * 20]],
    ['a rhomboid at its top edge', 'rhomboid', -20, [-100, 100 - 0.667 * 20]],
    ['a rhomboid at its bottom edge', 'rhomboid', 20, [-100 + 0.667 * 20, 100]],
    ['a tag below its bottom edge', 'tag', 21, null],
  ];
}

test('sizes a box with no slanted or curved edges to its widest line', async (t) => {
  for (const shape of ['rectangle', 'round-rectangle', 'barrel', 'cut-rectangle']) {
    await t.test(shape, () => {
      assertClose(fitWidth(LINES, shape, 24, 10, 3), 80, 1e-6);
    });
  }
});

test('sizes a box with no lines to nothing', () => {
  assert.equal(fitWidth([], 'tag', 24, 10, 3), 0);
});

test('widens a box until every line clears its shape by the inset and its box by the padding', async (t) => {
  for (const shape of ['ellipse', ...Object.keys(SHAPE_OUTLINES)]) {
    await t.test(shape, () => {
      const half = fitWidth(LINES, shape, 24, 10, 3) / 2 + 10;
      const centre = labelX(LINES, shape, half, 24, 10, 3);
      const drop = labelDrop(shape) * 24;
      const spare = LINES.flatMap((line) => {
        const left = centre - line.width / 2;
        const right = centre + line.width / 2;

        return [line.top, line.bottom].flatMap((y) => {
          const span = shapeSpan(shape, y + drop, half, 24);

          return [left - span.left - 3, span.right - right - 3, left + half - 10, half - right - 10];
        });
      });

      assert.ok(Math.min(...spare) > -1e-6, shape + ' leaves a line outside its edge');
      assertClose(Math.min(...spare), 0, 1e-6);
    });
  }
});

test('grows a fixed-end box by exactly the width its text gains', async (t) => {
  for (const shape of FIXED_END_SHAPES) {
    await t.test(shape, () => {
      const narrow = fitWidth([{ width: 100, top: -6, bottom: 6 }], shape, 24, 10, 3);
      const wide = fitWidth([{ width: 300, top: -6, bottom: 6 }], shape, 24, 10, 3);

      assertClose(wide - narrow, 200, 1e-6);
    });
  }
});

test('lets a line in the middle of a tag run into its point', () => {
  // At 12 from the middle, the slant of the point is nearer the line than the
  // padding is.
  const line = { width: 300, top: -12, bottom: 12 };
  const half = fitWidth([line], 'tag', 24, 10, 3) / 2 + 10;
  const centre = labelX([line], 'tag', half, 24, 10, 3);
  const pointStart = half - 0.75 * 24;

  assert.ok(centre + line.width / 2 > pointStart, 'the line ends before the point');
  assert.ok(centre < 0, 'the label is not moved towards the body');
});

test('centres the label of a symmetric shape on its box', async (t) => {
  for (const shape of ['rectangle', 'ellipse', 'diamond', 'pentagon', 'hexagon', 'octagon']) {
    await t.test(shape, () => {
      const half = fitWidth(LINES, shape, 24, 10, 3) / 2 + 10 + 5;

      assertClose(labelX(LINES, shape, half, 24, 10, 3), 0, 1e-6);
    });
  }
});

test('centres a label with no lines on its box', () => {
  assert.equal(labelX([], 'tag', 50, 24, 10, 3), 0);
});

test('leaves no room for the label in a box that is too narrow', () => {
  const range = labelRange(LINES, 'tag', 30, 24, 10, 3);

  assert.ok(range.low > range.high);
});

test('keeps the width finite for a line with no room in its shape', async (t) => {
  for (const [name, shape, line] of dataProviderNoRoom()) {
    await t.test(name, () => {
      const width = fitWidth([line], shape, 10, 5, 2);

      assert.ok(Number.isFinite(width), name + ' gives ' + width);
      assert.ok(width > 20);
    });
  }
});

function dataProviderNoRoom() {
  return [
    ['a line at the apex of a pentagon', 'pentagon', { width: 20, top: -10, bottom: -8 }],
    ['a line at the tip of a diamond', 'diamond', { width: 20, top: 8, bottom: 10 }],
    ['a line outside an ellipse', 'ellipse', { width: 20, top: -12, bottom: -2 }],
  ];
}

test('fits a line to the narrower of its top and bottom', () => {
  // The line spans -0.8 to 0.2 of a diamond's half-height, where the diamond
  // leaves 0.2 and 0.8 of its half-width.
  const width = fitWidth([{ width: 20, top: -8, bottom: 2 }], 'diamond', 10, 5, 2);

  assertClose(width, 2 * ((10 + 2) / 0.2 - 5), 1e-6);
});
