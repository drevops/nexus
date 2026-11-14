/**
 * The explore view: 1 entity and the entities within a chosen number of
 * references of it.
 *
 * A choice is `{ depth, direction }`. `depth` is 1 of EXPLORE_DEPTHS and
 * `direction` the id of 1 of EXPLORE_DIRECTIONS: `out` follows references
 * from an entity to their targets, `in` from targets back to the entities
 * that reference them, and `both` follows either.
 */

export const EXPLORE_DEPTHS = Object.freeze([1, 2, 3, 4, 5]);

// The directions, in the order the status bar lists them.
export const EXPLORE_DIRECTIONS = Object.freeze([
  { id: 'out', label: 'Outward', title: 'Show the entities this one references, and the entities those reference in turn' },
  { id: 'in', label: 'Inward', title: 'Show the entities that reference this one, and the entities that reference those in turn' },
  { id: 'both', label: 'Both', title: 'Show the entities linked to this one by references either way' },
]);

export const EXPLORE_DEFAULTS = Object.freeze({ depth: 1, direction: 'both' });

/**
 * Returns the direction with the id, or undefined.
 */
export function exploreDirection(id) {
  return EXPLORE_DIRECTIONS.find((direction) => direction.id === id);
}

/**
 * Returns a complete choice from a partial one, with the default for a
 * missing or unknown value.
 */
export function readExplore(choice) {
  const entry = choice && typeof choice === 'object' ? choice : {};
  const depth = Object.hasOwn(entry, 'depth') && EXPLORE_DEPTHS.includes(entry.depth) ? entry.depth : EXPLORE_DEFAULTS.depth;
  const known = Object.hasOwn(entry, 'direction') && exploreDirection(entry.direction) !== undefined;

  return { depth: depth, direction: known ? entry.direction : EXPLORE_DEFAULTS.direction };
}

/**
 * Returns the entities within `depth` references of `start` as a Map of
 * entity id to its number of references from `start`, which is 0 for
 * `start` itself.
 *
 * `links` lists each reference as `{ source, target }`, the ids of the
 * entity that holds the reference field and of the entity it targets.
 */
export function exploreEntities(links, start, depth, direction) {
  const next = new Map();
  const link = (from, to) => next.set(from, (next.get(from) || []).concat([to]));

  links.forEach(({ source, target }) => {
    if (direction !== 'in') {
      link(source, target);
    }

    if (direction !== 'out') {
      link(target, source);
    }
  });

  const reached = new Map([[start, 0]]);
  let ring = [start];

  for (let distance = 1; distance <= depth && ring.length; distance++) {
    const found = [];

    ring.forEach((id) => {
      (next.get(id) || []).forEach((other) => {
        if (!reached.has(other)) {
          reached.set(other, distance);
          found.push(other);
        }
      });
    });

    ring = found;
  }

  return reached;
}

/**
 * Describes the entities a choice shows from the entity labelled `label`,
 * such as 'Article and what it references, up to 2 references away'.
 */
export function exploreSummary(label, choice) {
  const { depth, direction } = readExplore(choice);
  const relation = { out: 'what it references', in: 'what references it', both: 'what it references or is referenced by' }[direction];

  return label + ' and ' + relation + ', up to ' + depth + (depth === 1 ? ' reference' : ' references') + ' away';
}
