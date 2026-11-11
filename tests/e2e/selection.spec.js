import { test, expect } from '@playwright/test';
import { slFill, TRACK_FIELD, TRACKS, editExample, selectedNodes, pagePosition } from './helpers.js';

test.describe('Selection', { tag: '@runner-1' }, () => {
  // Centres a node in the view, so no panel covers it, and clicks it.
  async function clickNode(page, id, modifiers = []) {
    await page.evaluate((nodeId) => {
      window.__nexus.cy.center(window.__nexus.cy.getElementById(nodeId));
    }, id);
    const point = await pagePosition(page, id);

    await page.mouse.move(point.x, point.y);
    for (const key of modifiers) {
      await page.keyboard.down(key);
    }
    await page.mouse.down();
    await page.mouse.up();
    for (const key of modifiers) {
      await page.keyboard.up(key);
    }
  }

  // A page point on the canvas clear of every element and every panel.
  function emptyCanvasPoint(page) {
    return page.evaluate(() => {
      const cy = window.__nexus.cy;
      const box = cy.container().getBoundingClientRect();
      const canvas = cy.container().querySelector('canvas');

      for (let x = 20; x < box.width; x += 23) {
        for (let y = 20; y < box.height; y += 23) {
          const hit = cy.elements(':visible').some((ele) => {
            const bounds = ele.renderedBoundingBox();
            return x > bounds.x1 - 6 && x < bounds.x2 + 6 && y > bounds.y1 - 6 && y < bounds.y2 + 6;
          });
          const top = document.elementFromPoint(box.left + x, box.top + y);

          if (!hit && top && top.closest('canvas') && cy.container().contains(top) && canvas) {
            return { x: box.left + x, y: box.top + y };
          }
        }
      }

      return null;
    });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('keeps a field clicked in Edit mode selected while the Inspector shows it', async ({ page }) => {
    await editExample(page);

    await clickNode(page, TRACK_FIELD);

    await expect(page.locator('#inspector .insp__title')).toHaveText('Field');
    await expect.poll(() => selectedNodes(page)).toEqual([TRACK_FIELD]);
    await page.waitForTimeout(300);
    expect(await selectedNodes(page)).toEqual([TRACK_FIELD]);
  });

  // Drags a selection box around a node from just outside its top left corner,
  // holding the given keys.
  async function boxSelect(page, id, modifiers = []) {
    const box = await page.evaluate((nodeId) => {
      const cy = window.__nexus.cy;
      cy.center(cy.getElementById(nodeId));
      const origin = cy.container().getBoundingClientRect();
      const bounds = cy.getElementById(nodeId).renderedBoundingBox();

      return { x1: origin.left + bounds.x1 - 12, y1: origin.top + bounds.y1 - 12, x2: origin.left + bounds.x2 + 12, y2: origin.top + bounds.y2 + 12 };
    }, id);

    await page.mouse.move(box.x1, box.y1);
    for (const key of modifiers) {
      await page.keyboard.down(key);
    }
    await page.mouse.down();
    await page.mouse.move(box.x2, box.y2, { steps: 8 });
    await page.mouse.up();
    for (const key of modifiers) {
      await page.keyboard.up(key);
    }
  }

  test('closes the Inspector when a box selection leaves its node out', async ({ page }) => {
    await editExample(page);
    await clickNode(page, TRACK_FIELD);
    await expect(page.locator('#inspector')).toBeVisible();

    await boxSelect(page, 'node.speaker');

    await expect(page.locator('#inspector')).toBeHidden();
    await expect(page.locator('#handles .handle')).toHaveCount(0);
    expect(await selectedNodes(page)).toEqual(['node.speaker']);
  });

  test('keeps the Inspector when a shift box selection adds to its node', async ({ page }) => {
    await editExample(page);
    await clickNode(page, TRACK_FIELD);

    await boxSelect(page, 'node.speaker', ['Shift']);

    await expect.poll(() => selectedNodes(page)).toEqual([TRACK_FIELD, 'node.speaker']);
    await expect(page.locator('#inspector')).toBeVisible();
    await expect(page.locator('#inspector .insp__title')).toHaveText('Field');
  });

  test('shows the + handles only around an entity the Inspector shows', async ({ page }) => {
    await editExample(page);
    await clickNode(page, TRACK_FIELD);
    await expect(page.locator('#handles .handle')).toHaveCount(0);

    await page.click('#inspector [data-crumb="node.session"]');
    await expect(page.locator('#handles .handle')).toHaveCount(4);

    await page.locator('#inspector .insp__field', { hasText: 'field_speakers' }).click();
    await expect(page.locator('#inspector .insp__title')).toHaveText('Field');
    await expect(page.locator('#handles .handle')).toHaveCount(0);
  });

  for (const [name, act, expected] of dataProviderInspectorSelections()) {
    test(`selects on the canvas the node the Inspector shows after ${name}`, async ({ page }) => {
      await editExample(page);
      await clickNode(page, TRACK_FIELD);
      await expect.poll(() => selectedNodes(page)).toEqual([TRACK_FIELD]);

      await act(page);

      await expect.poll(() => selectedNodes(page)).toEqual(expected);
    });
  }

  function dataProviderInspectorSelections() {
    return [
      ['its breadcrumb opens the entity', (page) => page.click('#inspector [data-crumb="node.session"]'), ['node.session']],
      [
        'the entity form opens another of its fields',
        async (page) => {
          await page.click('#inspector [data-crumb="node.session"]');
          await page.locator('#inspector .insp__field', { hasText: 'field_speakers' }).click();
        },
        ['field:node.session:field_speakers'],
      ],
      ['a click on a proxy opens its entity', (page) => clickNode(page, 'proxy:' + TRACK_FIELD + '>' + TRACKS), [TRACKS]],
      [
        'a click on the empty canvas',
        async (page) => {
          const point = await emptyCanvasPoint(page);
          await page.mouse.click(point.x, point.y);
        },
        [TRACK_FIELD],
      ],
      [
        'a relabel is undone and redone',
        async (page) => {
          await slFill(page, '#inspector sl-input:not([data-machine-name])', 'Stream');
          await page.click('#undo');
          await page.click('#redo');
        },
        [TRACK_FIELD],
      ],
      [
        'a shift-click adds another field',
        (page) => clickNode(page, 'field:node.session:field_speakers', ['Shift']),
        ['field:node.session:field_speakers', TRACK_FIELD],
      ],
    ];
  }
});
