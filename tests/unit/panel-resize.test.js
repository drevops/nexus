import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_PANEL_SIZE, RESIZE_HANDLES, resizeBox } from '../../src/panel-resize.js';

// A 400x300 panel at (100, 50) in a 1000x700 frame.
const START = { left: 100, top: 50, width: 400, height: 300 };
const FRAME = { width: 1000, height: 700 };

test('lists the handles of the left, right and bottom edges and the bottom corners', () => {
  assert.deepEqual(RESIZE_HANDLES, ['left', 'right', 'bottom', 'bottom-left', 'bottom-right']);
});

test('moves the dragged edges and keeps the others in place', async (t) => {
  for (const [name, handle, dx, dy, expected] of dataProviderResizeBox()) {
    await t.test(name, () => {
      assert.deepEqual(resizeBox(START, handle, dx, dy, FRAME), expected);
    });
  }
});

// The right edge sits at 500 and the bottom edge at 350.
function dataProviderResizeBox() {
  return [
    ['the right edge out', 'right', 60, 40, { left: 100, top: 50, width: 460, height: 300 }],
    ['the right edge in', 'right', -60, 0, { left: 100, top: 50, width: 340, height: 300 }],
    ['the right edge past the frame', 'right', 900, 0, { left: 100, top: 50, width: 900, height: 300 }],
    ['the right edge past the minimum', 'right', -900, 0, { left: 100, top: 50, width: 200, height: 300 }],
    ['the left edge out', 'left', -60, 40, { left: 40, top: 50, width: 460, height: 300 }],
    ['the left edge in', 'left', 60, 0, { left: 160, top: 50, width: 340, height: 300 }],
    ['the left edge past the frame', 'left', -900, 0, { left: 0, top: 50, width: 500, height: 300 }],
    ['the left edge past the minimum', 'left', 900, 0, { left: 300, top: 50, width: 200, height: 300 }],
    ['the bottom edge out', 'bottom', 60, 40, { left: 100, top: 50, width: 400, height: 340 }],
    ['the bottom edge in', 'bottom', 0, -40, { left: 100, top: 50, width: 400, height: 260 }],
    ['the bottom edge past the frame', 'bottom', 0, 900, { left: 100, top: 50, width: 400, height: 650 }],
    ['the bottom edge past the minimum', 'bottom', 0, -900, { left: 100, top: 50, width: 400, height: 90 }],
    ['the bottom-left corner', 'bottom-left', -60, 40, { left: 40, top: 50, width: 460, height: 340 }],
    ['the bottom-left corner past both bounds', 'bottom-left', 900, 900, { left: 300, top: 50, width: 200, height: 650 }],
    ['the bottom-right corner', 'bottom-right', 60, 40, { left: 100, top: 50, width: 460, height: 340 }],
    ['the bottom-right corner past both bounds', 'bottom-right', -900, -900, { left: 100, top: 50, width: 200, height: 90 }],
    ['an unknown handle', 'top', 60, 40, START],
  ];
}

test('keeps the minimum size in a frame too small for it', () => {
  const box = resizeBox(START, 'bottom-right', 0, 0, { width: 150, height: 60 });

  assert.deepEqual([box.width, box.height], [MIN_PANEL_SIZE.width, MIN_PANEL_SIZE.height]);
});

test('returns whole pixels and keeps the right edge whole while the left edge moves', () => {
  const box = resizeBox({ left: 99.6, top: 50.4, width: 400.2, height: 299.7 }, 'left', -10.2, 0, FRAME);

  assert.deepEqual(box, { left: 90, top: 50, width: 410, height: 300 });
});
