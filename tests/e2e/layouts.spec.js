import { test, expect } from '@playwright/test';
import { nodePositions, loadExample, pickLayout, eventLayout } from './helpers.js';

test.describe('Layouts', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  for (const [name, toggle] of dataProviderLayoutToggles()) {
    test(`lays the diagram out as the layout button does after switching ${name} and back`, async ({ page }) => {
      await loadExample(page);
      await page.click('#entities-toggle');
      await page.click('#layout-run');
      const tidied = await nodePositions(page);

      await toggle(page);
      await toggle(page);

      expect(await nodePositions(page)).toEqual(tidied);
    });
  }

  function dataProviderLayoutToggles() {
    return [
      [
        'the detail level through every level',
        async (page) => {
          await page.click('#detail-level');
          await page.click('#detail-level');
        },
      ],
      ['Proxies', (page) => page.click('#proxy-toggle')],
      ['the Media filter', (page) => page.locator('#type-filters label', { hasText: 'Media' }).locator('input').click()],
    ];
  }

  test('opens and re-runs the layout at 100% zoom', async ({ page }) => {
    await loadExample(page);
    expect(await page.evaluate(() => window.__nexus.cy.zoom())).toBeCloseTo(1, 2);
    await expect(page.locator('#zoom-level')).toHaveText('100%');

    await page.evaluate(() => {
      window.__nexus.cy.zoom(0.5);
    });
    await page.click('#layout-run');
    expect(await page.evaluate(() => window.__nexus.cy.zoom())).toBeCloseTo(1, 2);
  });

  // The zoom at which the visible diagram fits the canvas.
  function fitZoom(page) {
    return page.evaluate(() => {
      const cy = window.__nexus.cy;
      const box = cy.elements(':visible').boundingBox();

      return Math.min(cy.width() / box.w, cy.height() / box.h);
    });
  }

  test('stacks the entities in columns that fit the canvas better than 1 left-to-right flow', async ({ page }) => {
    await loadExample(page);
    await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: Columns');
    const columns = await fitZoom(page);

    await pickLayout(page, 'lr');

    expect(columns).toBeGreaterThan(await fitZoom(page));
  });

  test('stacks the entities in columns in the order of their types, then of their labels', async ({ page }) => {
    await loadExample(page);

    // Column by column, left to right, then top to bottom within a column.
    const order = await page.evaluate(() => {
      const entities = window.__nexus.cy.nodes('[group="entity"]').map((node) => ({ id: node.id(), x: node.boundingBox().x1, y: node.position('y') }));

      return entities.sort((a, b) => (Math.abs(a.x - b.x) < 50 ? a.y - b.y : a.x - b.x)).map((entity) => entity.id);
    });

    expect(order).toEqual([
      'node.event',
      'node.news',
      'node.page',
      'node.session',
      'node.speaker',
      'taxonomy_term.sponsors',
      'taxonomy_term.topics',
      'taxonomy_term.tracks',
      'taxonomy_term.venues',
      'media.document',
      'media.image',
      'media.remote_video',
      'paragraph.gallery',
      'paragraph.quote',
      'paragraph.text',
      'block_content.basic',
    ]);
  });

  for (const [value, label, expected] of dataProviderLayouts()) {
    test(`lays the diagram out ${label} when it is picked from the layout menu`, async ({ page }) => {
      await loadExample(page);

      await pickLayout(page, value);

      await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: ' + label);
      await expect(page.locator('#layout-menu sl-menu-item[checked]')).toHaveAttribute('value', value);
      expect(await eventLayout(page)).toEqual(expected);
    });
  }

  function dataProviderLayouts() {
    return [
      ['lr', 'LR', { right: true, below: false, turn: 'horizontal' }],
      ['tb', 'TB', { right: false, below: true, turn: 'vertical' }],
      ['columns', 'Columns', { right: true, below: false, turn: 'horizontal' }],
    ];
  }

  test('re-runs the picked layout when the layout button is pressed', async ({ page }) => {
    await loadExample(page);
    await pickLayout(page, 'tb');
    const laidOut = await nodePositions(page);

    await page.evaluate(() => {
      window.__nexus.cy.getElementById('node.event').shift({ x: 300, y: 300 });
    });
    await page.click('#layout-run');

    expect(await nodePositions(page)).toEqual(laidOut);
    await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: TB');
  });

  test('keeps the picked layout ticked when it is picked again', async ({ page }) => {
    await loadExample(page);

    await pickLayout(page, 'columns');

    await expect(page.locator('#layout-menu sl-menu-item[checked]')).toHaveCount(1);
    await expect(page.locator('#layout-menu sl-menu-item[checked]')).toHaveAttribute('value', 'columns');
  });

  test('opens the next diagram in the default layout, not the one last picked from the menu', async ({ page }) => {
    await loadExample(page);
    await pickLayout(page, 'lr');

    await page.reload();
    await loadExample(page);

    await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: Columns');
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')))).toBeNull();
  });
});
