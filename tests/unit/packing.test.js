import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packColumns } from '../../src/packing.js';

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
