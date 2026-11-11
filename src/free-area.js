/**
 * Finds the part of a frame that a set of boxes leaves uncovered, such as
 * the part of the canvas no floating panel covers.
 *
 * Every box is { x1, y1, x2, y2 }.
 */

// The smallest share of the frame an open area must cover to be used; below
// it the whole frame is used instead.
export const MIN_FREE_SHARE = 0.2;

const area = (box) => (box.x2 - box.x1) * (box.y2 - box.y1);

const overlaps = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

// The sorted, distinct edges of the obstacles along 1 axis that fall inside
// the frame, with the frame's own edges.
function edges(frame, obstacles, low, high) {
  const values = [frame[low], frame[high]];

  obstacles.forEach((box) => {
    values.push(box[low], box[high]);
  });

  return [...new Set(values.filter((value) => value >= frame[low] && value <= frame[high]))].sort((a, b) => a - b);
}

/**
 * Returns the largest box inside the frame that overlaps no obstacle.
 *
 * Of 2 boxes with the same area, the one whose centre is nearer the frame's
 * centre wins. When the largest box covers less than MIN_FREE_SHARE of the
 * frame, the frame itself is returned.
 */
export function freeArea(frame, obstacles) {
  const inside = obstacles.filter((box) => overlaps(box, frame));
  const xs = edges(frame, inside, 'x1', 'x2');
  const ys = edges(frame, inside, 'y1', 'y2');
  const centre = { x: (frame.x1 + frame.x2) / 2, y: (frame.y1 + frame.y2) / 2 };
  const distance = (box) => Math.hypot((box.x1 + box.x2) / 2 - centre.x, (box.y1 + box.y2) / 2 - centre.y);
  let best = null;

  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      for (let k = 0; k < ys.length; k++) {
        for (let l = k + 1; l < ys.length; l++) {
          const box = { x1: xs[i], y1: ys[k], x2: xs[j], y2: ys[l] };

          if (inside.some((other) => overlaps(box, other))) {
            continue;
          }

          if (!best || area(box) > area(best) || (area(box) === area(best) && distance(box) < distance(best))) {
            best = box;
          }
        }
      }
    }
  }

  return best && area(best) >= MIN_FREE_SHARE * area(frame) ? best : { ...frame };
}
