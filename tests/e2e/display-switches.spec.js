import { test, expect } from '@playwright/test';
import { loadExample } from './helpers.js';

test.describe('Display switches', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('shows fields by default and collapses to an overview', async ({ page }) => {
    await loadExample(page);

    await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
    await expect(page.locator('#machine-names')).toHaveJSProperty('checked', true);
    expect(await page.locator('#captions .caption').count()).toBeGreaterThan(0);
    const detailed = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);

    await page.click('#fields-toggle');
    await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', false);
    const overview = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);
    expect(overview).toBeLessThan(detailed);

    await page.click('#entities-toggle');
    await expect(page.locator('#entity-list .entity-row').first()).toBeVisible();

    await page.click('#table-toggle');
    await expect(page.locator('#field-table')).toContainText('References');
    await expect(page.locator('#field-table')).toContainText('field_media');
  });

  test('enables proxy declutter by default on render', async ({ page }) => {
    await loadExample(page);
    await expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', true);
    expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="proxy"]:visible').length)).toBeGreaterThan(0);
  });

  test('puts the display switches at the left end of the status bar', async ({ page }) => {
    await loadExample(page);

    const parts = await page.evaluate(() => [...document.querySelector('#statusbar').children].map((el) => el.id || el.className));
    expect(parts).toEqual(['statusbar__display', 'statusbar-hint', 'statusbar__tips', 'statusbar__zoom']);

    const switches = await page.evaluate(() =>
      [...document.querySelectorAll('.statusbar__display > *')].map((el) => [el.tagName.toLowerCase(), el.id, el.textContent, el.dataset.shortcut]),
    );
    expect(switches).toEqual([
      ['sl-switch', 'fields-toggle', 'Fields', 'F'],
      ['sl-switch', 'proxy-toggle', 'Proxies', 'P'],
      ['sl-switch', 'machine-names', 'Machine names', 'M'],
    ]);
    await expect(page.locator('.toolbar sl-switch, .toolbar #fields-toggle, .toolbar #proxy-toggle, .toolbar #machine-names')).toHaveCount(0);
  });

  for (const side of dataProviderSwitchClickSides()) {
    test(`turns a display switch off and on again with a click on its ${side}`, async ({ page }) => {
      await loadExample(page);
      const fields = page.locator('#fields-toggle');
      const box = await fields.boundingBox();
      const position = { x: side === 'track' ? 4 : box.width - 4, y: box.height / 2 };
      const detailed = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);

      await fields.click({ position: position });
      await expect(fields).toHaveJSProperty('checked', false);
      expect(await page.evaluate(() => window.__nexus.cy.nodes(':visible').length)).toBeLessThan(detailed);

      await fields.click({ position: position });
      await expect(fields).toHaveJSProperty('checked', true);
      expect(await page.evaluate(() => window.__nexus.cy.nodes(':visible').length)).toBe(detailed);
    });
  }

  function dataProviderSwitchClickSides() {
    return ['track', 'label'];
  }

  test('turns a focused display switch off with Space', async ({ page }) => {
    await loadExample(page);

    await page.locator('#machine-names').evaluate((el) => el.focus());
    await page.keyboard.press('Space');

    await expect(page.locator('#machine-names')).toHaveJSProperty('checked', false);
    await expect(page.locator('#captions .caption:not(.caption--type)')).toHaveCount(0);
  });

  test('echoes a hovered display switch description into the status bar', async ({ page }) => {
    await loadExample(page);

    await page.locator('#proxy-toggle').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText('Show references as semi-opaque proxies instead of long edges');
  });
});
