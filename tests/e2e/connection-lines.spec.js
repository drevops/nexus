import { test, expect } from '@playwright/test';
import { loadExample } from './helpers.js';

test.describe('Connection lines', { tag: '@runner-1' }, () => {
  // The curve styles of the visible edges, and how many of the visible edges
  // with no parallel edge bend. Cytoscape gives a straight edge neither
  // segment points nor control points.
  function lines(page) {
    return page.evaluate(() => {
      const edges = window.__nexus.cy.edges(':visible');
      const lone = edges.filter((edge) => edge.parallelEdges(':visible').length === 1);
      const bent = lone.filter((edge) => (edge.segmentPoints() || edge.controlPoints() || []).length > 0);

      return { curves: [...new Set(edges.map((edge) => edge.style('curve-style')))], lone: lone.length, bent: bent.length };
    });
  }

  // Groups the visible right-angled edges by their source and the side of it
  // they leave from, and measures how far apart the turns of each group of 2
  // or more edges lie. The layouts run left to right, so a turn is the x of
  // an edge's first segment point.
  function turns(page) {
    return page.evaluate(() => {
      const groups = new Map();

      window.__nexus.cy.edges(':visible').forEach((edge) => {
        const side = Math.sign(edge.target().position('x') - edge.source().position('x'));
        const key = edge.source().id() + ' ' + side;

        if (side === 0) {
          return;
        }

        groups.set(key, (groups.get(key) || []).concat(edge.segmentPoints()[0].x));
      });

      const spreads = [...groups.values()].filter((xs) => xs.length > 1).map((xs) => Math.max(...xs) - Math.min(...xs));

      return { groups: spreads.length, widest: Math.max(...spreads) };
    });
  }

  // Picks a line style from the toolbar menu and waits for the menu to
  // close, since a Shoelace dropdown reopened while it closes stays hidden.
  async function pickLines(page, style) {
    await page.click('#lines-choose');
    await page.click('#lines-menu sl-menu-item[value="' + style + '"]');
    await expect(page.locator('#lines-menu')).toBeHidden();
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('lists the line styles in the toolbar menu and ticks the one in use', async ({ page }) => {
    await loadExample(page);

    await expect(page.locator('#lines-choose')).toHaveText('Lines: Right-angled');
    await page.click('#lines-choose');

    const items = page.locator('#lines-menu sl-menu-item');
    await expect(items).toHaveText(['Right-angled', 'Merged', 'Straight']);
    await expect(items.locator('svg.icon')).toHaveCount(3);
    expect(await items.evaluateAll((all) => all.map((item) => item.checked))).toEqual([true, false, false]);
  });

  test('draws right-angled lines that turn halfway to each target by default', async ({ page }) => {
    await loadExample(page);

    expect((await lines(page)).curves).toEqual(['taxi']);

    const drawn = await turns(page);
    expect(drawn.groups).toBeGreaterThan(0);
    expect(drawn.widest).toBeGreaterThan(1);
  });

  test('merges the lines from each node into 1 line', async ({ page }) => {
    await loadExample(page);
    await pickLines(page, 'merged');

    await expect(page.locator('#lines-choose')).toHaveText('Lines: Merged');
    await expect(page.locator('#lines-choose')).toHaveAttribute('title', /merging the lines from each node into 1 line/);
    expect((await lines(page)).curves).toEqual(['taxi']);

    const drawn = await turns(page);
    expect(drawn.groups).toBeGreaterThan(0);
    expect(drawn.widest).toBeLessThan(0.5);
  });

  test('merges the lines in the overview', async ({ page }) => {
    await loadExample(page);
    await pickLines(page, 'merged');

    await page.click('#detail-level');
    await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="field"]:visible').length)).toBe(0);

    const drawn = await turns(page);
    expect(drawn.groups).toBeGreaterThan(0);
    expect(drawn.widest).toBeLessThan(0.5);
  });

  test('straightens the lines and keeps the style across reloads', async ({ page }) => {
    await loadExample(page);
    await pickLines(page, 'straight');

    await expect(page.locator('#lines-choose')).toHaveText('Lines: Straight');
    const drawn = await lines(page);
    expect(drawn.curves).toEqual(['bezier']);
    expect(drawn.lone).toBeGreaterThan(0);
    expect(drawn.bent).toBe(0);
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')).lines)).toEqual({ style: 'straight' });

    await page.reload();
    await loadExample(page);

    await expect(page.locator('#lines-choose')).toHaveText('Lines: Straight');
    expect((await lines(page)).curves).toEqual(['bezier']);
  });

  test('keeps straight lines in the overview', async ({ page }) => {
    await loadExample(page);
    await pickLines(page, 'straight');

    await page.click('#detail-level');
    await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="field"]:visible').length)).toBe(0);

    const drawn = await lines(page);
    expect(drawn.curves).toEqual(['bezier']);
    expect(drawn.lone).toBeGreaterThan(0);
    expect(drawn.bent).toBe(0);
  });

  test('keeps the line style through a layout run and Reset to defaults', async ({ page }) => {
    await loadExample(page);
    await pickLines(page, 'merged');

    await page.click('#layout-run');
    await page.click('#settings-toggle');
    await page.click('#settings-reset');

    await expect(page.locator('#lines-choose')).toHaveText('Lines: Merged');
    expect((await turns(page)).widest).toBeLessThan(0.5);
  });

  test('opens the lines menu with its shortcut', async ({ page }) => {
    await loadExample(page);

    await page.keyboard.press('Alt+KeyL');

    await expect(page.locator('#lines-menu')).toBeVisible();
  });
});
