import { test, expect } from '@playwright/test';
import { loadExample, openDocument, pagePosition } from './helpers.js';

test.describe('Cursors', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  // Entity A with 1 field, beside entity B, with room below B.
  const DOC = {
    nexus: 1,
    title: 'Cursors',
    entities: [
      { entityType: 'node', bundle: 'a', label: 'A', fields: [{ name: 'field_text', label: 'Text', fieldType: 'string', kind: 'single' }] },
      { entityType: 'node', bundle: 'b', label: 'B', fields: [] },
    ],
    layout: { 'node.a': { x: 0, y: 0 }, 'field:node.a:field_text': { x: 0, y: 150 }, 'node.b': { x: 300, y: 0 } },
  };
  const ENTITY = 'node.a';
  const FIELD = 'field:node.a:field_text';

  function cursorOf(page) {
    return page.evaluate(() => getComputedStyle(window.__nexus.cy.container()).cursor);
  }

  // The page point of the empty canvas below entity B.
  function emptySpot(page) {
    return page.evaluate(() => {
      const cy = window.__nexus.cy;
      const box = cy.container().getBoundingClientRect();
      const pan = cy.pan();
      const zoom = cy.zoom();

      return { x: box.left + pan.x + 300 * zoom, y: box.top + pan.y + 200 * zoom };
    });
  }

  async function hover(page, point) {
    await page.mouse.move(point.x, point.y, { steps: 4 });
  }

  for (const [mode, buttons, expected] of dataProviderModes()) {
    test(`shows the cursor of each target in ${mode} mode`, async ({ page }) => {
      await openDocument(page, DOC);
      for (const button of buttons) {
        await page.click(button);
      }

      await hover(page, await pagePosition(page, ENTITY));
      expect(await cursorOf(page)).toBe(expected.entity);

      await hover(page, await pagePosition(page, FIELD));
      expect(await cursorOf(page)).toBe(expected.field);

      await hover(page, await emptySpot(page));
      expect(await cursorOf(page)).toBe('auto');
    });
  }

  function dataProviderModes() {
    return [
      ['View', ['#mode-view'], { entity: 'pointer', field: 'pointer' }],
      ['Edit', ['#mode-build'], { entity: 'grab', field: 'grab' }],
      ['Connect', ['#mode-build', '#connect-toggle'], { entity: 'pointer', field: 'crosshair' }],
    ];
  }

  test('shows the default cursor once the pointer leaves the canvas from a node', async ({ page }) => {
    await openDocument(page, DOC);

    await hover(page, await pagePosition(page, ENTITY));
    expect(await cursorOf(page)).toBe('pointer');

    await page.mouse.move(5, 5);
    expect(await cursorOf(page)).toBe('auto');
  });

  test('shows a grabbing cursor while a node is dragged in Edit mode', async ({ page }) => {
    await openDocument(page, DOC);
    await page.click('#mode-build');
    const from = await pagePosition(page, ENTITY);

    await hover(page, from);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 30, { steps: 6 });
    expect(await cursorOf(page)).toBe('grabbing');

    await page.mouse.up();
    expect(await cursorOf(page)).toBe('grab');
  });

  test('shows a grabbing cursor while the canvas is panned with the right mouse button', async ({ page }) => {
    await openDocument(page, DOC);
    const from = await emptySpot(page);

    await hover(page, from);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(from.x + 60, from.y + 40, { steps: 6 });
    expect(await cursorOf(page)).toBe('grabbing');

    await page.mouse.up({ button: 'right' });
    expect(await cursorOf(page)).toBe('auto');
  });

  test('shows a crosshair while a Note waits for its spot, over nodes too', async ({ page }) => {
    await openDocument(page, DOC);
    await page.click('#mode-build');
    await page.click('#add-note');

    await hover(page, await pagePosition(page, ENTITY));
    expect(await cursorOf(page)).toBe('crosshair');

    await page.mouse.click((await emptySpot(page)).x, (await emptySpot(page)).y);
    expect(await cursorOf(page)).not.toBe('crosshair');
  });

  test('shows a crosshair while a connection is drawn from a field', async ({ page }) => {
    await openDocument(page, DOC);
    await page.click('#mode-build');
    await page.click('#connect-toggle');
    const from = await pagePosition(page, FIELD);

    await hover(page, from);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y - 60, { steps: 6 });
    expect(await cursorOf(page)).toBe('crosshair');

    await page.mouse.up();
    expect(await cursorOf(page)).toBe('auto');
  });

  test('shows a pointer over the entity type filters, checkbox included', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');
    const filter = page.locator('#type-filters .filters__item').first();

    expect(await filter.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
    expect(await filter.locator('input').evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
  });
});
