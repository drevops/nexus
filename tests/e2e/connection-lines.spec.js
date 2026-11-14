import { test, expect } from '@playwright/test';
import { loadExample, slSelect } from './helpers.js';

test.describe('Connection lines', { tag: '@runner-1' }, () => {
  const SELECT = '#settings [data-lines="style"]';

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

  async function openSettings(page) {
    if (!(await page.locator('#settings').isVisible())) {
      await page.click('#settings-toggle');
    }

    await expect(page.locator(SELECT)).toBeVisible();
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('draws the connection lines at right angles by default', async ({ page }) => {
    await loadExample(page);
    await openSettings(page);

    await expect(page.locator(SELECT)).toHaveJSProperty('value', 'right-angled');

    const drawn = await lines(page);
    expect(drawn.curves).toEqual(['taxi']);
    expect(drawn.bent).toBeGreaterThan(0);
  });

  test('straightens the connection lines from Settings and keeps them across reloads', async ({ page }) => {
    await loadExample(page);
    await openSettings(page);
    await slSelect(page, SELECT, 'straight');

    await expect.poll(async () => (await lines(page)).curves).toEqual(['bezier']);
    const drawn = await lines(page);
    expect(drawn.lone).toBeGreaterThan(0);
    expect(drawn.bent).toBe(0);
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')).lines)).toEqual({ style: 'straight' });

    // The panel layout is saved after a short delay, so the reload waits for
    // it to keep Settings open.
    await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('nexusLayout') || '{}').panels?.settings?.open === true);
    await page.reload();
    await loadExample(page);
    await openSettings(page);

    await expect(page.locator(SELECT)).toHaveJSProperty('value', 'straight');
    expect((await lines(page)).curves).toEqual(['bezier']);
  });

  test('keeps straight lines in the overview', async ({ page }) => {
    await loadExample(page);
    await openSettings(page);
    await slSelect(page, SELECT, 'straight');

    await page.click('#fields-toggle');
    await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="field"]:visible').length)).toBe(0);

    const drawn = await lines(page);
    expect(drawn.curves).toEqual(['bezier']);
    expect(drawn.lone).toBeGreaterThan(0);
    expect(drawn.bent).toBe(0);
  });

  test('restores right-angled lines with Reset to defaults', async ({ page }) => {
    await loadExample(page);
    await openSettings(page);
    await slSelect(page, SELECT, 'straight');
    await expect.poll(async () => (await lines(page)).curves).toEqual(['bezier']);

    await page.click('#settings-reset');

    await expect(page.locator(SELECT)).toHaveJSProperty('value', 'right-angled');
    expect((await lines(page)).curves).toEqual(['taxi']);
  });
});
