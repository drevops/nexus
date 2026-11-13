/**
 * The box a floating panel takes while 1 of its resize handles is dragged.
 *
 * A box is `{ left, top, width, height }` in pixels, within a frame of
 * `{ width, height }` whose top-left corner is the origin. The dragged edge
 * follows the pointer and the opposite edge stays put. The box stays inside
 * the frame and at least MIN_PANEL_SIZE, and the minimum wins over a frame
 * too small for it.
 */

export const MIN_PANEL_SIZE = { width: 200, height: 90 };

// The horizontal and vertical edges each handle moves: -1 the left edge, 1
// the right or bottom edge, 0 neither.
const HANDLES = {
  left: [-1, 0],
  right: [1, 0],
  bottom: [0, 1],
  'bottom-left': [-1, 1],
  'bottom-right': [1, 1],
};

export const RESIZE_HANDLES = Object.keys(HANDLES);

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/**
 * Returns the box `start` takes when the `handle` of RESIZE_HANDLES is
 * dragged by `dx` and `dy` within `frame`, in whole pixels. An unknown handle
 * leaves the box as it is.
 */
export function resizeBox(start, handle, dx, dy, frame) {
  const [x, y] = HANDLES[handle] || [0, 0];
  const right = Math.round(start.left + start.width);
  let left = Math.round(start.left);
  let width = Math.round(start.width);
  let height = Math.round(start.height);

  if (x === 1) {
    width = Math.round(clamp(start.width + dx, MIN_PANEL_SIZE.width, frame.width - start.left));
  }

  if (x === -1) {
    width = Math.round(clamp(start.width - dx, MIN_PANEL_SIZE.width, right));
    left = right - width;
  }

  if (y === 1) {
    height = Math.round(clamp(start.height + dy, MIN_PANEL_SIZE.height, frame.height - start.top));
  }

  return { left, top: Math.round(start.top), width, height };
}
