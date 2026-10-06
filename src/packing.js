/**
 * Column packing: arranges boxes in columns.
 *
 * packColumns() keeps the boxes in their given order and fills each column
 * top to bottom before it starts the next. It tries every column count and
 * keeps the arrangement that fits the frame at the largest zoom, so the
 * result takes the frame's shape.
 *
 * Cutting an ordered list into a set number of columns with the shortest
 * tallest column is the linear partition problem. shortestLimit() solves it
 * with a binary search over the column height, and splitColumns() tests each
 * height with a greedy fill.
 *
 * tidyColumns() takes the columns from where the boxes already are, so the
 * boxes keep their place relative to each other.
 */

// Fills columns top to bottom and starts a new one when the next box would
// make the current one taller than `limit`. A box taller than the limit gets
// a column of its own. Each column holds the indexes of its boxes.
function splitColumns(boxes, limit, gap) {
  const columns = [];
  let height = Infinity;

  boxes.forEach((box, index) => {
    if (height + gap.y + box.h > limit) {
      columns.push([]);
      height = -gap.y;
    }

    columns[columns.length - 1].push(index);
    height += gap.y + box.h;
  });

  return columns;
}

// The shortest column height, to within 1 unit, that fits the boxes into at
// most `count` columns. No column is shorter than the tallest box, and 1
// column holding every box always fits.
function shortestLimit(boxes, count, gap) {
  let low = Math.max(...boxes.map((box) => box.h));

  if (splitColumns(boxes, low, gap).length <= count) {
    return low;
  }

  let high = boxes.reduce((sum, box) => sum + gap.y + box.h, -gap.y);

  while (high - low > 1) {
    const mid = (low + high) / 2;

    if (splitColumns(boxes, mid, gap).length <= count) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return high;
}

// Places the columns side by side, each as wide as its widest box, with
// every box against the left edge of its column.
function arrange(boxes, columns, gap) {
  const positions = [];
  let x = 0;
  let height = 0;

  columns.forEach((column) => {
    let y = 0;

    column.forEach((index) => {
      positions[index] = { x: x, y: y };
      y += boxes[index].h + gap.y;
    });

    height = Math.max(height, y - gap.y);
    x += Math.max(...column.map((index) => boxes[index].w)) + gap.x;
  });

  return { positions: positions, w: x - gap.x, h: height };
}

/**
 * Packs boxes of { w, h } into columns that fill a frame, in order.
 *
 * `frame` is the { w, h } area to fill. A frame with no area counts as a
 * square, so the arrangement is as square as the boxes allow. `gap` is the
 * { x, y } space between columns and between the boxes of a column.
 *
 * Returns the top-left corner of each box, in input order, as `positions`,
 * and the size of the whole arrangement as `w` and `h`.
 */
export function packColumns(boxes, frame, gap) {
  if (!boxes.length) {
    return { positions: [], w: 0, h: 0 };
  }

  const frameW = frame.w > 0 && frame.h > 0 ? frame.w : 1;
  const frameH = frame.w > 0 && frame.h > 0 ? frame.h : 1;
  let best = null;

  for (let count = 1; count <= boxes.length; count++) {
    const arrangement = arrange(boxes, splitColumns(boxes, shortestLimit(boxes, count, gap), gap), gap);
    const scale = Math.max(arrangement.w / frameW, arrangement.h / frameH);

    if (!best || scale < best.scale) {
      best = { ...arrangement, scale: scale };
    }
  }

  return { positions: best.positions, w: best.w, h: best.h };
}

/**
 * Lines boxes of { x, y, w, h } up in columns near where they are.
 *
 * Taken from left to right, a box joins the column of the box before it
 * when its left edge is within half the width of that column's first box,
 * or within `gap.x` of it for a narrower box. Otherwise it starts a column.
 * Each column keeps its boxes in top-to-bottom order.
 *
 * The columns are spaced as packColumns() spaces them, from the top-left
 * corner of all the boxes, so columns that already are tidy stay as they are.
 *
 * Returns the new top-left corner of each box, in input order, as
 * `positions`, and the size of the whole arrangement as `w` and `h`.
 */
export function tidyColumns(boxes, gap) {
  if (!boxes.length) {
    return { positions: [], w: 0, h: 0 };
  }

  const byLeft = boxes.map((box, index) => index).sort((a, b) => boxes[a].x - boxes[b].x || boxes[a].y - boxes[b].y);
  const columns = [];

  byLeft.forEach((index) => {
    const column = columns[columns.length - 1];
    const first = column ? boxes[column[0]] : null;

    if (first && boxes[index].x - first.x <= Math.max(gap.x, first.w / 2)) {
      column.push(index);
    } else {
      columns.push([index]);
    }
  });

  columns.forEach((column) => column.sort((a, b) => boxes[a].y - boxes[b].y || boxes[a].x - boxes[b].x));

  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const arrangement = arrange(boxes, columns, gap);
  const positions = arrangement.positions.map((position) => ({ x: left + position.x, y: top + position.y }));

  return { positions: positions, w: arrangement.w, h: arrangement.h };
}
