import { test, expect } from '@playwright/test';
import { loadExample, tapNode, selectEvent, pickLayout } from './helpers.js';

// The position of every node, rounded to 0.01, so the rounding error of
// moving an island away and back doesn't count.
function roundedPositions(page) {
  return page.evaluate(() => {
    const positions = {};
    window.__nexus.cy.nodes().forEach((node) => {
      positions[node.id()] = { x: Math.round(node.position('x') * 100) / 100, y: Math.round(node.position('y') * 100) / 100 };
    });
    return positions;
  });
}

// Moves the island of shown elements that holds each entity by its offset.
function dragIslands(page, moves) {
  return page.evaluate((list) => {
    const cy = window.__nexus.cy;
    const islands = cy.elements().not('.hidden').components();

    list.forEach(([id, dx, dy]) => {
      const island = islands.find((candidate) => candidate.contains(cy.getElementById(id)));
      island.nodes().shift({ x: dx, y: dy });
    });
  }, moves);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('leaves a fresh layout and the view as they are when tidied', async ({ page }) => {
  await loadExample(page);
  await page.evaluate(() => {
    window.__nexus.cy.zoom(0.5);
  });
  const laidOut = await roundedPositions(page);

  await page.click('#tidy');

  expect(await roundedPositions(page)).toEqual(laidOut);
  expect(await page.evaluate(() => window.__nexus.cy.zoom())).toBeCloseTo(0.5, 2);
});

test('slots an entity dragged a little out of its column back in when tidied', async ({ page }) => {
  await loadExample(page);
  const laidOut = await roundedPositions(page);

  await dragIslands(page, [['node.news', 40, 15]]);
  await page.click('#tidy');

  expect(await roundedPositions(page)).toEqual(laidOut);
});

test('lines dragged entities up in columns that tidying again leaves alone', async ({ page }) => {
  await loadExample(page);
  await dragIslands(page, [
    ['node.event', 900, 400],
    ['media.image', -300, 1200],
    ['paragraph.quote', 150, -200],
  ]);

  await page.click('#tidy');
  const tidied = await roundedPositions(page);
  const overlaps = await page.evaluate(() => {
    const boxes = window.__nexus.cy
      .elements()
      .not('.hidden')
      .components()
      .map((island) => island.boundingBox());
    const overlap = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

    return boxes.filter((box, index) => boxes.some((other, otherIndex) => otherIndex !== index && overlap(box, other))).length;
  });
  await page.click('#tidy');

  expect(overlaps).toBe(0);
  expect(await roundedPositions(page)).toEqual(tidied);
});

test('lines a field added below an entity up with its other fields when tidied', async ({ page }) => {
  await selectEvent(page, 1);
  const count = await page.evaluate(() => window.__nexus.cy.nodes('[group="field"][entity="node.event"]').length);
  await page.click('.handle--bottom');
  await page.waitForFunction((before) => window.__nexus.cy.nodes('[group="field"][entity="node.event"]').length === before + 1, count);

  await page.click('#tidy');

  const xs = await page.evaluate(() => window.__nexus.cy.nodes('[group="field"][entity="node.event"]').map((field) => Math.round(field.position('x'))));
  expect(new Set(xs).size).toBe(1);
});

// The ids of an entity's shown fields, in order along `axis`.
function fieldOrder(page, entity, axis) {
  return page.evaluate(
    ([id, along]) =>
      window.__nexus.cy
        .nodes('[group="field"]')
        .not('.hidden')
        .filter((field) => field.data('entity') === id)
        .sort((a, b) => a.position(along) - b.position(along))
        .map((field) => field.id()),
    [entity, axis],
  );
}

// Swaps the first and last of an entity's shown fields along `axis`, each
// with its proxies, the way a user drags them into a new order.
function swapEndFields(page, entity, axis) {
  return page.evaluate(
    ([id, along]) => {
      const cy = window.__nexus.cy;
      const fields = cy
        .nodes('[group="field"]')
        .not('.hidden')
        .filter((field) => field.data('entity') === id)
        .sort((a, b) => a.position(along) - b.position(along));
      const unit = (field) => field.union(cy.nodes('[group="proxy"]').filter((proxy) => proxy.data('field') === field.id()));
      const first = fields.first();
      const last = fields.last();
      const distance = last.position(along) - first.position(along);

      unit(first).shift(along, distance);
      unit(last).shift(along, -distance);
    },
    [entity, axis],
  );
}

// The number of overlapping pairs among an entity's shown fields and proxies.
function fieldOverlaps(page, entity) {
  return page.evaluate((id) => {
    const boxes = window.__nexus.cy
      .nodes('[group="field"], [group="proxy"]')
      .not('.hidden')
      .filter((node) => node.data('entity') === id)
      .map((node) => node.boundingBox({ includeLabels: false }));
    const overlap = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

    return boxes.filter((box, index) => boxes.some((other, otherIndex) => otherIndex > index && overlap(box, other))).length;
  }, entity);
}

for (const [layout, axis] of dataProviderFieldOrderLayouts()) {
  test(`keeps the order of an entity's fields when tidied in the ${layout} layout`, async ({ page }) => {
    await loadExample(page);

    if (layout !== 'columns') {
      await pickLayout(page, layout);
    }

    const laidOut = await fieldOrder(page, 'node.event', axis);
    await swapEndFields(page, 'node.event', axis);
    const wanted = await fieldOrder(page, 'node.event', axis);

    await page.click('#tidy');

    expect(wanted).not.toEqual(laidOut);
    expect(await fieldOrder(page, 'node.event', axis)).toEqual(wanted);
    expect(await fieldOverlaps(page, 'node.event')).toBe(0);
  });
}

function dataProviderFieldOrderLayouts() {
  return [
    ['columns', 'y'],
    ['lr', 'y'],
    ['tb', 'x'],
  ];
}

// The first shown proxy and field of node.event.
function eventMembers(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const first = (group) =>
      cy
        .nodes('[group="' + group + '"]')
        .not('.hidden')
        .filter((node) => node.data('entity') === 'node.event')
        .first()
        .id();

    return { field: first('field'), proxy: first('proxy') };
  });
}

for (const [name, mode, member] of dataProviderTidySelections()) {
  test(`tidies only the entity of ${name}`, async ({ page }) => {
    await loadExample(page);
    const members = await eventMembers(page);

    if (mode === 'edit') {
      await page.click('#mode-build');
    }

    // Pulls 1 of Event's fields out of its column and moves another island
    // away, so a whole-diagram Tidy would move both back.
    await page.evaluate((field) => window.__nexus.cy.getElementById(field).shift({ x: 70, y: 0 }), members.field);
    await dragIslands(page, [['node.news', 600, 300]]);
    await tapNode(page, member === 'entity' ? 'node.event' : members[member]);
    await expect(page.locator('#tidy')).toHaveAttribute('title', /^Tidy up Event: /);
    const before = await roundedPositions(page);
    const group = await page.evaluate(() =>
      window.__nexus.cy
        .nodes()
        .filter((node) => node.id() === 'node.event' || node.data('entity') === 'node.event')
        .map((node) => node.id()),
    );

    await page.click('#tidy');

    const after = await roundedPositions(page);
    const moved = Object.keys(before).filter((id) => before[id].x !== after[id].x || before[id].y !== after[id].y);
    const xs = await page.evaluate(() =>
      window.__nexus.cy
        .nodes('[group="field"]')
        .filter((field) => field.data('entity') === 'node.event')
        .map((field) => Math.round(field.position('x'))),
    );

    expect(moved.length).toBeGreaterThan(0);
    expect(moved.filter((id) => !group.includes(id))).toEqual([]);
    expect(new Set(xs).size).toBe(1);
    await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Tidied Event \(/);
  });
}

function dataProviderTidySelections() {
  return [
    ['a focused entity', 'view', 'entity'],
    ['a focused field', 'view', 'field'],
    ['a focused proxy', 'view', 'proxy'],
    ['an entity open in the Inspector', 'edit', 'entity'],
    ['a field open in the Inspector', 'edit', 'field'],
  ];
}

test('names the entity Tidy will work on in its title until the selection clears', async ({ page }) => {
  await loadExample(page);
  const tidy = page.locator('#tidy');
  const whole = /^Tidy up: straighten each entity/;
  await expect(tidy).toHaveAttribute('title', whole);

  await tapNode(page, 'node.event');
  await expect(tidy).toHaveAttribute('title', /^Tidy up Event: /);

  await page.evaluate(() => window.__nexus.cy.emit('tap'));
  await expect(tidy).toHaveAttribute('title', whole);

  await page.click('#mode-build');
  await tapNode(page, 'node.event');
  await expect(tidy).toHaveAttribute('title', /^Tidy up Event: /);

  await page.click('#mode-view');
  await expect(tidy).toHaveAttribute('title', whole);
});
