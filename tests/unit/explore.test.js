import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPLORE_DEFAULTS, EXPLORE_DEPTHS, EXPLORE_DIRECTIONS, exploreDirection, exploreEntities, exploreSummary, readExplore } from '../../src/explore.js';

// A references B, B references C and C references A, so A, B and C form a
// cycle. D references A, C references E, E references itself and A references
// B through 2 fields. F has no references.
const LINKS = [
  { source: 'A', target: 'B' },
  { source: 'A', target: 'B' },
  { source: 'B', target: 'C' },
  { source: 'C', target: 'A' },
  { source: 'D', target: 'A' },
  { source: 'C', target: 'E' },
  { source: 'E', target: 'E' },
];

test('lists the depths from 1 to 5', () => {
  assert.deepEqual(EXPLORE_DEPTHS, [1, 2, 3, 4, 5]);
});

test('lists the directions outward, inward and both, each with a label and a title', () => {
  assert.deepEqual(
    EXPLORE_DIRECTIONS.map((direction) => direction.id),
    ['out', 'in', 'both'],
  );

  for (const direction of EXPLORE_DIRECTIONS) {
    assert.ok(direction.label, direction.id);
    assert.ok(direction.title, direction.id);
  }
});

test('explores 1 reference both ways by default', () => {
  assert.deepEqual(EXPLORE_DEFAULTS, { depth: 1, direction: 'both' });
});

test('finds a direction by its id', async (t) => {
  for (const [name, id, expected] of dataProviderExploreDirection()) {
    await t.test(name, () => {
      assert.equal(exploreDirection(id), expected);
    });
  }
});

function dataProviderExploreDirection() {
  return [
    ['outward', 'out', EXPLORE_DIRECTIONS[0]],
    ['inward', 'in', EXPLORE_DIRECTIONS[1]],
    ['both', 'both', EXPLORE_DIRECTIONS[2]],
    ['an unknown id', 'up', undefined],
    ['an inherited key', 'constructor', undefined],
    ['no id', undefined, undefined],
  ];
}

test('completes a choice with the defaults', async (t) => {
  for (const [name, choice, expected] of dataProviderReadExplore()) {
    await t.test(name, () => {
      assert.deepEqual(readExplore(choice), expected);
    });
  }
});

function dataProviderReadExplore() {
  return [
    ['nothing', undefined, EXPLORE_DEFAULTS],
    ['null', null, EXPLORE_DEFAULTS],
    ['a string', 'out', EXPLORE_DEFAULTS],
    ['an empty object', {}, EXPLORE_DEFAULTS],
    ['a full choice', { depth: 3, direction: 'out' }, { depth: 3, direction: 'out' }],
    ['a depth only', { depth: 5 }, { depth: 5, direction: 'both' }],
    ['a direction only', { direction: 'in' }, { depth: 1, direction: 'in' }],
    ['a depth of 0', { depth: 0, direction: 'in' }, { depth: 1, direction: 'in' }],
    ['a depth past the limit', { depth: 6, direction: 'in' }, { depth: 1, direction: 'in' }],
    ['a fractional depth', { depth: 1.5, direction: 'in' }, { depth: 1, direction: 'in' }],
    ['a depth written as text', { depth: '2', direction: 'in' }, { depth: 1, direction: 'in' }],
    ['an unknown direction', { depth: 2, direction: 'up' }, { depth: 2, direction: 'both' }],
    ['a direction in another case', { depth: 2, direction: 'Out' }, { depth: 2, direction: 'both' }],
    ['an inherited choice', Object.create({ depth: 2, direction: 'out' }), EXPLORE_DEFAULTS],
  ];
}

test('finds the entities within the depth of a start entity in a model with a cycle', async (t) => {
  for (const [name, start, depth, direction, expected] of dataProviderExploreEntities()) {
    await t.test(name, () => {
      assert.deepEqual(Object.fromEntries(exploreEntities(LINKS, start, depth, direction)), expected);
    });
  }
});

function dataProviderExploreEntities() {
  return [
    ['outward, 1 reference', 'A', 1, 'out', { A: 0, B: 1 }],
    ['outward, 2 references', 'A', 2, 'out', { A: 0, B: 1, C: 2 }],
    ['outward, 3 references', 'A', 3, 'out', { A: 0, B: 1, C: 2, E: 3 }],
    ['outward, past the end of the cycle', 'A', 5, 'out', { A: 0, B: 1, C: 2, E: 3 }],
    ['outward from an entity nothing else reaches', 'D', 5, 'out', { D: 0, A: 1, B: 2, C: 3, E: 4 }],
    ['outward from an entity that references only itself', 'E', 5, 'out', { E: 0 }],
    ['inward, 1 reference', 'A', 1, 'in', { A: 0, C: 1, D: 1 }],
    ['inward, 2 references', 'A', 2, 'in', { A: 0, C: 1, D: 1, B: 2 }],
    ['inward, past the end of the cycle', 'A', 5, 'in', { A: 0, C: 1, D: 1, B: 2 }],
    ['inward to an entity only the cycle reaches', 'E', 2, 'in', { E: 0, C: 1, B: 2 }],
    ['inward to an entity nothing references', 'D', 5, 'in', { D: 0 }],
    ['both ways, 1 reference', 'A', 1, 'both', { A: 0, B: 1, C: 1, D: 1 }],
    ['both ways, 2 references', 'A', 2, 'both', { A: 0, B: 1, C: 1, D: 1, E: 2 }],
    ['both ways from the end of a chain', 'E', 3, 'both', { E: 0, C: 1, A: 2, B: 2, D: 3 }],
    ['an entity with no references', 'F', 5, 'both', { F: 0 }],
    ['an entity the links do not name', 'Z', 5, 'both', { Z: 0 }],
  ];
}

test('finds only the start entity in a model with no references', () => {
  assert.deepEqual(Object.fromEntries(exploreEntities([], 'A', 5, 'both')), { A: 0 });
});

test('describes what a choice shows', async (t) => {
  for (const [name, choice, expected] of dataProviderExploreSummary()) {
    await t.test(name, () => {
      assert.equal(exploreSummary('Article', choice), expected);
    });
  }
});

function dataProviderExploreSummary() {
  return [
    ['outward, 1 reference', { depth: 1, direction: 'out' }, 'Article and what it references, up to 1 reference away'],
    ['inward, 2 references', { depth: 2, direction: 'in' }, 'Article and what references it, up to 2 references away'],
    ['both ways, 5 references', { depth: 5, direction: 'both' }, 'Article and what it references or is referenced by, up to 5 references away'],
    ['an invalid choice', { depth: 9, direction: 'up' }, 'Article and what it references or is referenced by, up to 1 reference away'],
  ];
}
