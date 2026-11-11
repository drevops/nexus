import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_EDGES, fitWidth, labelCentre, labelRoom, wrapLabel } from '../../src/label-fit.js';

// Every character is 10 units wide.
const measure = (text) => text.length * 10;

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' is not ' + expected);
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

test('finds the left and right edges of each shape at a height', async (t) => {
  for (const [name, shape, y, left, right] of dataProviderShapeEdges()) {
    await t.test(name, () => {
      const edges = SHAPE_EDGES[shape](y);

      assertClose(edges.left, left);
      assertClose(edges.right, right);
    });
  }
});

function dataProviderShapeEdges() {
  return [
    ['an ellipse at its middle', 'ellipse', 0, -1, 1],
    ['an ellipse near its top', 'ellipse', -0.6, -0.8, 0.8],
    ['an ellipse near its bottom', 'ellipse', 0.6, -0.8, 0.8],
    ['a diamond at its middle', 'diamond', 0, -1, 1],
    ['a diamond halfway to its top', 'diamond', -0.5, -0.5, 0.5],
    ['a diamond halfway to its bottom', 'diamond', 0.5, -0.5, 0.5],
    ['a hexagon at its middle', 'hexagon', 0, -1, 1],
    ['a hexagon halfway to its top', 'hexagon', -0.5, -0.75, 0.75],
    ['a hexagon at its bottom edge', 'hexagon', 1, -0.5, 0.5],
    ['an octagon at its middle', 'octagon', 0, -1, 1],
    ['an octagon at the end of its side', 'octagon', Math.SQRT2 - 1, -1, 1],
    ['an octagon at its top edge', 'octagon', -1, 1 - Math.SQRT2, Math.SQRT2 - 1],
    ['a tag at its point', 'tag', 0, -1, 1],
    ['a tag halfway to its top', 'tag', -0.5, -1, 0.625],
    ['a tag at its bottom edge', 'tag', 1, -1, 0.25],
    ['a pentagon at its apex', 'pentagon', -1, 0, 0],
    ['a pentagon at its shoulders', 'pentagon', 2 - Math.sqrt(5), -1, 1],
    ['a pentagon at its base', 'pentagon', 1, (1 - Math.sqrt(5)) / 2, (Math.sqrt(5) - 1) / 2],
    ['a rhomboid at its top edge', 'rhomboid', -1, -1, 0.333],
    ['a rhomboid at its middle', 'rhomboid', 0, -(1 + 0.333) / 2, (1 + 0.333) / 2],
    ['a rhomboid at its bottom edge', 'rhomboid', 1, -0.333, 1],
  ];
}

test('centres the label of each shape on the centroid of the shape', async (t) => {
  for (const [shape, expected] of dataProviderLabelCentre()) {
    await t.test(shape, () => {
      const centre = labelCentre(shape);

      assertClose(centre.x, expected.x);
      assertClose(centre.y, expected.y);
    });
  }
});

function dataProviderLabelCentre() {
  const shoulder = 2 - Math.sqrt(5);
  const foot = (Math.sqrt(5) - 1) / 2;

  return [
    ['round-rectangle', { x: 0, y: 0 }],
    ['rectangle', { x: 0, y: 0 }],
    ['ellipse', { x: 0, y: 0 }],
    ['diamond', { x: 0, y: 0 }],
    ['hexagon', { x: 0, y: 0 }],
    [
      'tag',
      centroid([
        [-1, -1],
        [0.25, -1],
        [1, 0],
        [0.25, 1],
        [-1, 1],
      ]),
    ],
    ['barrel', { x: 0, y: 0 }],
    ['cut-rectangle', { x: 0, y: 0 }],
    [
      'rhomboid',
      centroid([
        [-1, -1],
        [0.333, -1],
        [1, 1],
        [-0.333, 1],
      ]),
    ],
    [
      'pentagon',
      centroid([
        [0, -1],
        [1, shoulder],
        [foot, 1],
        [-foot, 1],
        [-1, shoulder],
      ]),
    ],
    ['octagon', { x: 0, y: 0 }],
    ['an unknown shape', { x: 0, y: 0 }],
    ['constructor', { x: 0, y: 0 }],
  ];
}

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

test('leaves each shape its room for text on its label centre at a height', async (t) => {
  for (const [name, shape, y, expected] of dataProviderLabelRoom()) {
    await t.test(name, () => {
      assertClose(labelRoom(shape, y), expected);
    });
  }
});

function dataProviderLabelRoom() {
  const tagCentre = -9 / 52;

  return [
    ['a rectangle at its middle', 'rectangle', 0, 1],
    ['a rectangle at its top edge', 'rectangle', -1, 1],
    ['an ellipse near its top', 'ellipse', -0.6, 0.8],
    ['a diamond halfway to its bottom', 'diamond', 0.5, 0.5],
    ['a tag at its point, up to its left edge', 'tag', 0, 1 + tagCentre],
    ['a tag halfway to its top, up to its slanted edge', 'tag', -0.5, 0.625 - tagCentre],
    ['a tag at its bottom edge, up to its body', 'tag', 1, 0.25 - tagCentre],
    ['a pentagon at its shoulders', 'pentagon', 2 - Math.sqrt(5), 1],
    ['a rhomboid at its middle', 'rhomboid', 0, (1 + 0.333) / 2],
    ['an unknown shape', 'blob', 0.5, 1],
  ];
}

test('sizes a box with no slanted or curved edges to its widest line', async (t) => {
  for (const shape of ['rectangle', 'round-rectangle', 'barrel', 'cut-rectangle']) {
    await t.test(shape, () => {
      const lines = [
        { width: 80, top: -14, bottom: -2 },
        { width: 60, top: 2, bottom: 14 },
      ];

      assert.equal(fitWidth(lines, shape, 24, 10, 3), 80);
    });
  }
});

test('sizes a box with no lines to nothing', () => {
  assert.equal(fitWidth([], 'tag', 24, 10, 3), 0);
});

test('widens a box until every line on the label centre clears its shape by the inset and its box by the padding', async (t) => {
  const lines = [
    { width: 80, top: -14, bottom: -2 },
    { width: 60, top: 2, bottom: 14 },
  ];

  for (const shape of Object.keys(SHAPE_EDGES)) {
    await t.test(shape, () => {
      const half = fitWidth(lines, shape, 24, 10, 3) / 2 + 10;
      const centre = labelCentre(shape);
      const spare = lines.flatMap((line) => {
        const left = centre.x * half - line.width / 2;
        const right = centre.x * half + line.width / 2;

        return [line.top, line.bottom].flatMap((y) => {
          const edges = SHAPE_EDGES[shape]((y + centre.y * 24) / 24);

          return [left - half * edges.left - 3, half * edges.right - right - 3, left + half - 10, half - right - 10];
        });
      });

      assert.ok(Math.min(...spare) > -1e-9, shape + ' leaves a line outside its edge');
      assertClose(Math.min(...spare), 0);
    });
  }
});

test('narrows a tag around a label moved into its body', () => {
  const lines = [
    { width: 80, top: -14, bottom: -2 },
    { width: 60, top: 2, bottom: 14 },
  ];
  // A centred label meets the slanted edges at the top of its first line.
  const centred = 2 * ((40 + 3) / (1 - (3 * 14) / 4 / 24) - 10);

  assert.ok(fitWidth(lines, 'tag', 24, 10, 3) < centred);
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

  assertClose(width, 2 * ((10 + 2) / 0.2 - 5));
});
