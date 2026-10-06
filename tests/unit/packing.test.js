import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packColumns, tidyColumns } from '../../src/packing.js';

const NO_GAP = { x: 0, y: 0 };

const square = (size) => ({ w: size, h: size });

test('packs no boxes into an empty arrangement', () => {
  assert.deepEqual(packColumns([], { w: 100, h: 100 }, NO_GAP), { positions: [], w: 0, h: 0 });
});

test('takes the shape of the frame', async (t) => {
  for (const [name, frame, expected] of dataProviderFrames()) {
    await t.test(name, () => {
      assert.deepEqual(packColumns([square(10), square(10), square(10), square(10)], frame, NO_GAP), expected);
    });
  }
});

function dataProviderFrames() {
  const grid = {
    positions: [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
    w: 20,
    h: 20,
  };

  return [
    ['a square frame', { w: 20, h: 20 }, grid],
    [
      'a wide frame',
      { w: 40, h: 10 },
      {
        positions: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 20, y: 0 },
          { x: 30, y: 0 },
        ],
        w: 40,
        h: 10,
      },
    ],
    [
      'a tall frame',
      { w: 10, h: 40 },
      {
        positions: [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
          { x: 0, y: 20 },
          { x: 0, y: 30 },
        ],
        w: 10,
        h: 40,
      },
    ],
    ['a frame with no area', { w: 0, h: 0 }, grid],
  ];
}

test('gives a tall box a column of its own and stacks the short boxes beside it', () => {
  const boxes = [{ w: 10, h: 30 }, square(10), square(10), square(10)];

  assert.deepEqual(packColumns(boxes, { w: 20, h: 30 }, NO_GAP), {
    positions: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
    ],
    w: 20,
    h: 30,
  });
});

test('keeps the boxes in their order rather than sorting them', () => {
  const boxes = [square(10), { w: 10, h: 30 }, square(10)];

  assert.deepEqual(packColumns(boxes, { w: 20, h: 40 }, NO_GAP), {
    positions: [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ],
    w: 20,
    h: 40,
  });
});

test('makes each column as wide as its widest box', () => {
  const boxes = [{ w: 30, h: 10 }, square(10), square(10), square(10)];

  assert.deepEqual(packColumns(boxes, { w: 40, h: 20 }, NO_GAP), {
    positions: [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
    ],
    w: 40,
    h: 20,
  });
});

test('spaces the columns and the boxes of a column by the gap', () => {
  const boxes = [square(10), square(10), square(10), square(10)];

  assert.deepEqual(packColumns(boxes, { w: 25, h: 22 }, { x: 5, y: 2 }), {
    positions: [
      { x: 0, y: 0 },
      { x: 0, y: 12 },
      { x: 15, y: 0 },
      { x: 15, y: 12 },
    ],
    w: 25,
    h: 22,
  });
});

test('tidies no boxes into an empty arrangement', () => {
  assert.deepEqual(tidyColumns([], { x: 10, y: 10 }), { positions: [], w: 0, h: 0 });
});

test('leaves the columns packColumns() arranges as they are', () => {
  const gap = { x: 5, y: 2 };
  const packed = packColumns([square(10), square(10), square(10), square(10)], { w: 25, h: 22 }, gap);
  const boxes = packed.positions.map((position) => ({ ...position, ...square(10) }));

  assert.deepEqual(tidyColumns(boxes, gap), packed);
});

test('lines boxes up in columns near where they are', async (t) => {
  for (const [name, boxes, expected] of dataProviderTidyColumns()) {
    await t.test(name, () => {
      assert.deepEqual(tidyColumns(boxes, { x: 10, y: 5 }), expected);
    });
  }
});

function dataProviderTidyColumns() {
  return [
    [
      'boxes with close left edges, stacked top to bottom',
      [
        { x: 0, y: 50, w: 100, h: 20 },
        { x: 30, y: 0, w: 100, h: 20 },
        { x: 10, y: 100, w: 100, h: 20 },
      ],
      {
        positions: [
          { x: 0, y: 25 },
          { x: 0, y: 0 },
          { x: 0, y: 50 },
        ],
        w: 100,
        h: 70,
      },
    ],
    [
      'a box beyond half the width of the first box in a column',
      [
        { x: 0, y: 0, w: 100, h: 20 },
        { x: 60, y: 40, w: 100, h: 20 },
      ],
      {
        positions: [
          { x: 0, y: 0 },
          { x: 110, y: 0 },
        ],
        w: 210,
        h: 20,
      },
    ],
    [
      'a box within the gap of a narrow first box',
      [
        { x: 0, y: 0, w: 16, h: 20 },
        { x: 9, y: 30, w: 100, h: 20 },
      ],
      {
        positions: [
          { x: 0, y: 0 },
          { x: 0, y: 25 },
        ],
        w: 100,
        h: 45,
      },
    ],
    [
      'columns far apart, moved beside each other at the top',
      [
        { x: 100, y: 200, w: 50, h: 50 },
        { x: 1000, y: 900, w: 50, h: 50 },
      ],
      {
        positions: [
          { x: 100, y: 200 },
          { x: 160, y: 200 },
        ],
        w: 110,
        h: 50,
      },
    ],
  ];
}
