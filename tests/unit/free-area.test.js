import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_FREE_SHARE, freeArea } from '../../src/free-area.js';

const FRAME = { x1: 0, y1: 0, x2: 1000, y2: 600 };

test('uses an open area of at least a fifth of the frame', () => {
  assert.equal(MIN_FREE_SHARE, 0.2);
});

test('finds the largest part of the frame no box covers', async (t) => {
  for (const [name, frame, obstacles, expected] of dataProviderFreeArea()) {
    await t.test(name, () => {
      assert.deepEqual(freeArea(frame, obstacles), expected);
    });
  }
});

function dataProviderFreeArea() {
  return [
    ['no boxes', FRAME, [], FRAME],
    ['a box on the left', FRAME, [{ x1: 0, y1: 0, x2: 320, y2: 600 }], { x1: 320, y1: 0, x2: 1000, y2: 600 }],
    ['a box on the right', FRAME, [{ x1: 700, y1: 0, x2: 1000, y2: 600 }], { x1: 0, y1: 0, x2: 700, y2: 600 }],
    ['a box along the top', FRAME, [{ x1: 0, y1: 0, x2: 1000, y2: 200 }], { x1: 0, y1: 200, x2: 1000, y2: 600 }],
    ['a box floating clear of the edges', FRAME, [{ x1: 16, y1: 16, x2: 336, y2: 584 }], { x1: 336, y1: 0, x2: 1000, y2: 600 }],
    [
      'the gap between 2 boxes on the sides',
      { x1: 0, y1: 0, x2: 1280, y2: 600 },
      [
        { x1: 16, y1: 16, x2: 336, y2: 584 },
        { x1: 704, y1: 16, x2: 1264, y2: 584 },
      ],
      { x1: 336, y1: 0, x2: 704, y2: 600 },
    ],
    [
      '2 overlapping boxes',
      FRAME,
      [
        { x1: 0, y1: 0, x2: 300, y2: 600 },
        { x1: 200, y1: 0, x2: 400, y2: 300 },
      ],
      { x1: 400, y1: 0, x2: 1000, y2: 600 },
    ],
    ['a box partly outside the frame', FRAME, [{ x1: -100, y1: -100, x2: 200, y2: 700 }], { x1: 200, y1: 0, x2: 1000, y2: 600 }],
    ['a box wholly outside the frame', FRAME, [{ x1: 1100, y1: 0, x2: 1200, y2: 100 }], FRAME],
    ['a box touching the frame edge from outside', FRAME, [{ x1: 1000, y1: 0, x2: 1200, y2: 600 }], FRAME],
    ['a box covering the frame', FRAME, [{ x1: -10, y1: -10, x2: 1010, y2: 610 }], FRAME],
    [
      'a gap under a fifth of the frame',
      FRAME,
      [
        { x1: 0, y1: 0, x2: 450, y2: 600 },
        { x1: 550, y1: 0, x2: 1000, y2: 600 },
      ],
      FRAME,
    ],
    ['an open area of exactly a fifth of the frame', FRAME, [{ x1: 200, y1: 0, x2: 1000, y2: 600 }], { x1: 0, y1: 0, x2: 200, y2: 600 }],
    ['2 equal areas, nearer the centre wins', FRAME, [{ x1: 0, y1: 0, x2: 500, y2: 300 }], { x1: 0, y1: 300, x2: 1000, y2: 600 }],
    ['a frame away from the origin', { x1: 100, y1: 50, x2: 1100, y2: 650 }, [{ x1: 100, y1: 50, x2: 420, y2: 650 }], { x1: 420, y1: 50, x2: 1100, y2: 650 }],
  ];
}

test('leaves the frame it is given unchanged', () => {
  const frame = { ...FRAME };

  freeArea(frame, []).x1 = 99;

  assert.deepEqual(frame, FRAME);
});
