import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EXAMPLE_DIR, entityCount, waitForGraph } from './helpers.js';

test.describe('Import', { tag: '@runner-1' }, () => {
  const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'config-min');

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('draws a config folder with its annotation overlay', async ({ page }) => {
    await expect(page.locator('#landing')).toBeVisible();
    await page.setInputFiles('#folder-input', EXAMPLE_DIR);

    await expect(page.locator('#landing')).toBeHidden();
    await waitForGraph(page);

    expect(await entityCount(page)).toBe(16);
    expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.event').length)).toBe(1);
    expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="annotation"]').length)).toBe(3);
    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Example content model');
  });

  test('parses an uploaded config folder in the browser', async ({ page }) => {
    await page.setInputFiles('#folder-input', FIXTURE_DIR);

    await expect(page.locator('#landing')).toBeHidden();
    await waitForGraph(page);

    // 2 node + 1 vocab + 1 media + 2 paragraph + the Any placeholder.
    expect(await entityCount(page)).toBe(7);
    expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.article').length)).toBe(1);
  });

  test('surfaces an alert when a diagram fails to open', async ({ page }) => {
    await page.setInputFiles('#doc-open', { name: 'broken.nexus.json', mimeType: 'application/json', buffer: Buffer.from('{ not valid json') });
    await expect(page.locator('#landing-error')).toHaveAttribute('open', '');
    await expect(page.locator('#landing-error-text')).toContainText('Could not open');
  });
});
