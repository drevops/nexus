import { test, expect } from '@playwright/test';
import { nodePositions, loadExample, openDocument, selectedNodes, pagePosition } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('resets the singled-out focus when switching modes', async ({ page }) => {
  await loadExample(page);

  await page.evaluate(() => window.__nexus.cy.getElementById('node.session').emit('tap'));
  await page.waitForFunction(() => window.__nexus.cy.elements('.faded').length > 0);

  await page.click('#mode-build');
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded, .trace, .trace-source').length)).toBe(0);
});

test('isolates an entity on right-click and moves it with its fields', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');

  const isolated = await page.evaluate(() => {
    const cy = window.__nexus.cy;
    const session = cy.getElementById('node.session');
    session.emit('cxttap');
    return {
      othersFaded: cy.getElementById('node.event').hasClass('faded'),
      groupVisible: !session.hasClass('faded'),
      groupGrabbable: session.grabbable(),
      othersLocked: !cy.getElementById('node.event').grabbable(),
    };
  });
  expect(isolated).toEqual({ othersFaded: true, groupVisible: true, groupGrabbable: true, othersLocked: true });

  const move = await page.evaluate(() => {
    const cy = window.__nexus.cy;
    const session = cy.getElementById('node.session');
    const field = cy.nodes('[group="field"][entity="node.session"]')[0];
    const fb = { x: field.position('x'), y: field.position('y') };
    const eb = { x: session.position('x'), y: session.position('y') };
    session.emit('grabon');
    session.position({ x: eb.x + 120, y: eb.y + 40 });
    session.emit('drag');
    session.emit('dragfreeon');
    return { fieldDx: Math.round(field.position('x') - fb.x), fieldDy: Math.round(field.position('y') - fb.y) };
  });
  expect(move).toEqual({ fieldDx: 120, fieldDy: 40 });

  // A tap on the empty canvas releases the isolation.
  await page.evaluate(() => window.__nexus.cy.emit('tap', [{ target: window.__nexus.cy }]));
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBe(0);
});

// A diagram that fits the canvas at 100%: entity A with 1 field, beside
// entity B.
const MOVE_DOC = {
  nexus: 1,
  title: 'Move',
  entities: [
    { entityType: 'node', bundle: 'a', label: 'A', fields: [{ name: 'field_text', label: 'Text', fieldType: 'string', kind: 'single' }] },
    { entityType: 'node', bundle: 'b', label: 'B', fields: [] },
  ],
  layout: { 'node.a': { x: 0, y: 0 }, 'field:node.a:field_text': { x: 0, y: 150 }, 'node.b': { x: 300, y: 0 } },
};

// Presses a mouse button at a page point, drags by the offset in page pixels
// and releases it.
async function dragFrom(page, from, dx, dy, button = 'left') {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await page.mouse.up({ button });
}

// The page point of a model position on the canvas.
function pagePoint(page, position) {
  return page.evaluate((model) => {
    const cy = window.__nexus.cy;
    const box = cy.container().getBoundingClientRect();
    const pan = cy.pan();
    const zoom = cy.zoom();

    return { x: box.left + pan.x + model.x * zoom, y: box.top + pan.y + model.y * zoom };
  }, position);
}

function panOf(page) {
  return page.evaluate(() => ({ ...window.__nexus.cy.pan() }));
}

// An empty spot of MOVE_DOC's canvas, below entity B.
const EMPTY_SPOT = { x: 300, y: 200 };

// How far each node moved from 1 set of positions to another, rounded to
// whole pixels.
function offsets(before, after) {
  const offset = (id) => ({ x: Math.round(after[id].x - before[id].x), y: Math.round(after[id].y - before[id].y) });

  return Object.fromEntries(Object.keys(before).map((id) => [id, offset(id)]));
}

function fadedNodes(page) {
  return page.evaluate(() =>
    window.__nexus.cy
      .nodes('.faded')
      .map((node) => node.id())
      .sort(),
  );
}

for (const [mode, buttons] of dataProviderModes()) {
  test(`pans the canvas dragged with the right mouse button in ${mode} mode`, async ({ page }) => {
    await openDocument(page, MOVE_DOC);
    for (const button of buttons) {
      await page.click(button);
    }
    const before = await nodePositions(page);
    const undo = await page.locator('#undo').getAttribute('title');
    const start = await panOf(page);

    await dragFrom(page, await pagePosition(page, 'node.a'), 90, 60, 'right');
    await dragFrom(page, await pagePoint(page, EMPTY_SPOT), -30, 20, 'right');

    expect(await panOf(page)).toEqual({ x: start.x + 60, y: start.y + 80 });
    expect(await nodePositions(page)).toEqual(before);
    expect(await fadedNodes(page)).toEqual([]);
    await expect(page.locator('#undo')).toHaveAttribute('title', undo);
    await expect(page.locator('#cy')).not.toHaveClass(/is-panning/);
  });

  test(`keeps the canvas still on a left-drag over the empty canvas in ${mode} mode`, async ({ page }) => {
    await openDocument(page, MOVE_DOC);
    for (const button of buttons) {
      await page.click(button);
    }
    const start = await panOf(page);

    await dragFrom(page, await pagePoint(page, EMPTY_SPOT), 90, 60);

    expect(await panOf(page)).toEqual(start);
  });
}

function dataProviderModes() {
  return [
    ['View', ['#mode-view']],
    ['Edit', ['#mode-build']],
    ['Connect', ['#mode-build', '#connect-toggle']],
  ];
}

test('keeps every node in place on a left-drag in View mode', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  const before = await nodePositions(page);

  await dragFrom(page, await pagePosition(page, 'node.a'), 90, 60);

  expect(await nodePositions(page)).toEqual(before);
  expect(await selectedNodes(page)).toEqual([]);
});

test('selects the nodes inside a box dragged on the canvas in Edit mode and moves them together', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  await page.click('#mode-build');
  const before = await nodePositions(page);

  // Cytoscape selects every node the box overlaps, so the box crosses the top
  // halves of A and B and stays clear of A's field.
  const corner = await pagePoint(page, { x: -150, y: -80 });
  const far = await pagePoint(page, { x: 450, y: -5 });
  await dragFrom(page, corner, far.x - corner.x, far.y - corner.y);

  expect(await selectedNodes(page)).toEqual(['node.a', 'node.b']);
  expect(await nodePositions(page)).toEqual(before);

  await dragFrom(page, await pagePosition(page, 'node.a'), 90, 60);

  expect(offsets(before, await nodePositions(page))).toEqual({
    'node.a': { x: 90, y: 60 },
    'field:node.a:field_text': { x: 0, y: 0 },
    'node.b': { x: 90, y: 60 },
  });
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Moved 2 nodes \(/);

  await page.click('#undo');
  expect(await nodePositions(page)).toEqual(before);
});

test('moves a node dragged with the left mouse button in Edit mode as 1 step', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  await page.click('#mode-build');
  const before = await nodePositions(page);

  await dragFrom(page, await pagePosition(page, 'node.b'), 90, 60);

  expect(offsets(before, await nodePositions(page))).toEqual({
    'node.a': { x: 0, y: 0 },
    'field:node.a:field_text': { x: 0, y: 0 },
    'node.b': { x: 90, y: 60 },
  });
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Moved entity “B” \(/);
});

test('isolates an entity on a right-click in View mode and keeps the group locked', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  const before = await nodePositions(page);
  const entity = await pagePosition(page, 'node.a');

  await page.mouse.click(entity.x, entity.y, { button: 'right' });
  expect(await fadedNodes(page)).toEqual(['node.b']);

  await dragFrom(page, await pagePosition(page, 'field:node.a:field_text'), 90, 60);
  expect(await nodePositions(page)).toEqual(before);
  expect(await fadedNodes(page)).toEqual(['node.b']);
});

test('isolates an entity on a right-click in Edit mode and moves the group dragged with the left mouse button', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  await page.click('#mode-build');
  const before = await nodePositions(page);
  const entity = await pagePosition(page, 'node.a');

  await page.mouse.click(entity.x, entity.y, { button: 'right' });
  expect(await fadedNodes(page)).toEqual(['node.b']);
  expect(await nodePositions(page)).toEqual(before);

  await dragFrom(page, await pagePosition(page, 'field:node.a:field_text'), 90, 60);
  const grouped = await nodePositions(page);
  expect(offsets(before, grouped)).toEqual({
    'node.a': { x: 90, y: 60 },
    'field:node.a:field_text': { x: 90, y: 60 },
    'node.b': { x: 0, y: 0 },
  });
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Moved entity “A” with its fields \(/);

  // A node the isolation fades stays where it is, and the isolation holds.
  await dragFrom(page, await pagePosition(page, 'node.b'), 90, 60);
  expect(await nodePositions(page)).toEqual(grouped);
  expect(await fadedNodes(page)).toEqual(['node.b']);
});

test('switches to Edit mode with a node selected when it is double-clicked in View mode', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  const entity = await pagePosition(page, 'node.b');

  await page.mouse.dblclick(entity.x, entity.y);

  await expect(page.locator('#mode-build')).toHaveClass(/is-active/);
  await expect(page.locator('#build-tools')).toBeVisible();
  await expect(page.locator('#inspector')).toBeVisible();
  expect(await selectedNodes(page)).toEqual(['node.b']);
  expect(await fadedNodes(page)).toEqual([]);
});

// The first click focuses the node and animates the view to it, so the
// second click of a quick double-click can land beside the node.
test('opens the node the first click of a double-click hit when the second click lands beside it', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  const entity = await pagePosition(page, 'node.b');
  const empty = await pagePoint(page, EMPTY_SPOT);

  await page.mouse.click(entity.x, entity.y);
  await page.mouse.click(empty.x, empty.y);

  await expect(page.locator('#mode-build')).toHaveClass(/is-active/);
  await expect(page.locator('#inspector')).toBeVisible();
  await expect.poll(() => selectedNodes(page)).toEqual(['node.b']);
});

test('keeps View mode when the canvas is double-clicked', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  const empty = await pagePoint(page, EMPTY_SPOT);

  await page.mouse.dblclick(empty.x, empty.y);

  await expect(page.locator('#mode-view')).toHaveClass(/is-active/);
});
