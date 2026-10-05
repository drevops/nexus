import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_ROOM, fitWidth, wrapLabel } from '../../src/label-fit.js';

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

test('leaves each shape its room for centred text at a height', async (t) => {
  for (const [name, shape, y, expected] of dataProviderShapeRoom()) {
    await t.test(name, () => {
      assertClose(SHAPE_ROOM[shape](y), expected);
    });
  }
});

function dataProviderShapeRoom() {
  return [
    ['an ellipse at its middle', 'ellipse', 0, 1],
    ['an ellipse near its top', 'ellipse', -0.6, 0.8],
    ['an ellipse near its bottom', 'ellipse', 0.6, 0.8],
    ['a diamond at its middle', 'diamond', 0, 1],
    ['a diamond halfway to its top', 'diamond', -0.5, 0.5],
    ['a diamond halfway to its bottom', 'diamond', 0.5, 0.5],
    ['a hexagon at its middle', 'hexagon', 0, 1],
    ['a hexagon halfway to its top', 'hexagon', -0.5, 0.75],
    ['a hexagon at its bottom edge', 'hexagon', 1, 0.5],
    ['an octagon at its middle', 'octagon', 0, 1],
    ['an octagon at the end of its side', 'octagon', Math.SQRT2 - 1, 1],
    ['an octagon at its top edge', 'octagon', -1, Math.SQRT2 - 1],
    ['a tag at its point', 'tag', 0, 1],
    ['a tag halfway to its top', 'tag', -0.5, 0.625],
    ['a tag at its bottom edge', 'tag', 1, 0.25],
    ['a pentagon at its apex', 'pentagon', -1, 0],
    ['a pentagon at its shoulders', 'pentagon', 2 - Math.sqrt(5), 1],
    ['a pentagon at its base', 'pentagon', 1, (Math.sqrt(5) - 1) / 2],
    ['a rhomboid at its top edge', 'rhomboid', -1, 0.333],
    ['a rhomboid at its middle', 'rhomboid', 0, (1 + 0.333) / 2],
    ['a rhomboid at its bottom edge', 'rhomboid', 1, 0.333],
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

test('widens a box until every line clears its shape by the inset', async (t) => {
  const lines = [
    { width: 80, top: -14, bottom: -2 },
    { width: 60, top: 2, bottom: 14 },
  ];

  for (const shape of Object.keys(SHAPE_ROOM)) {
    await t.test(shape, () => {
      const half = fitWidth(lines, shape, 24, 10, 3) / 2 + 10;
      const spare = lines.flatMap((line) => [line.top, line.bottom].map((y) => half * SHAPE_ROOM[shape](y / 24) - (line.width / 2 + 3)));

      assert.ok(Math.min(...spare) > -1e-9, shape + ' leaves a line outside its edge');
      assertClose(Math.min(...spare), 0);
    });
  }
});

test('fits a line to the narrower of its top and bottom', () => {
  // The line spans -0.8 to 0.2 of a diamond's half-height, where the diamond
  // leaves 0.2 and 0.8 of its half-width.
  const width = fitWidth([{ width: 20, top: -8, bottom: 2 }], 'diamond', 10, 5, 2);

  assertClose(width, 2 * ((10 + 2) / 0.2 - 5));
});
