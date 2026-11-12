import { test, expect } from '@playwright/test';
import { loadExample, openDocument, openFrom, pasteDiagram, saveFrom, waitForGraph } from './helpers.js';

test.describe('Security', { tag: '@runner-1' }, () => {
  // Markup that runs script when a colour reaches innerHTML unchecked.
  const MARKUP = '#d9e2f3"/><img src="x" onerror="window.__injected = true">';

  // A document whose type styles carry markup.
  const CRAFTED = {
    nexus: 1,
    title: 'Crafted',
    colors: { node: MARKUP },
    symbols: { node: 'tag"/><img src="x" onerror="window.__injected = true">' },
    customTypes: [{ type: 'event"]', label: 'Event' }],
    entities: [{ entityType: 'node', bundle: 'article', label: 'Article', fields: [] }],
  };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__violations = [];
      document.addEventListener('securitypolicyviolation', (event) => window.__violations.push(event.violatedDirective + ' ' + event.blockedURI));
    });
    await page.goto('/index.html');
  });

  test('runs the main flows without a Content Security Policy violation', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await page.click('#table-toggle');
    await page.click('#history-toggle');
    await page.click('#settings-toggle');
    await expect(page.locator('#settings')).toBeVisible();

    for (const format of ['png', 'svg', 'csv', 'json']) {
      await saveFrom(page, format);
    }

    await openFrom(page, 'ai');
    await expect(page.locator('#ai-skill')).toContainText('create-nexus-diagram');

    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });

  for (const [name, open] of dataProviderCraftedSources()) {
    test(`draws the default colour and symbol for type styles carrying markup in ${name}`, async ({ page }) => {
      await open(page, CRAFTED);

      const swatch = page.locator('.legend__swatch').first();
      await expect(swatch.locator('svg')).toHaveCount(1);
      await expect(swatch.locator('img')).toHaveCount(0);
      await expect(swatch.locator('rect')).toHaveAttribute('fill', '#d9e2f3');
      expect(await page.evaluate(() => window.__injected)).toBeUndefined();
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });
  }

  function dataProviderCraftedSources() {
    return [
      ['an opened document', (page, doc) => openDocument(page, doc)],
      [
        'a pasted reply',
        async (page, doc) => {
          await pasteDiagram(page, JSON.stringify(doc));
          await waitForGraph(page);
        },
      ],
    ];
  }

  test('ignores stored type styles carrying markup', async ({ page }) => {
    await page.evaluate((markup) => {
      window.localStorage.setItem('nexusSettings', JSON.stringify({ colors: { node: markup }, customTypes: [{ type: 'x"]', label: 'X' }] }));
    }, MARKUP);
    await page.reload();
    await openDocument(page, { nexus: 1, entities: [{ entityType: 'node', bundle: 'article', label: 'Article', fields: [] }] });

    await expect(page.locator('.legend__swatch rect').first()).toHaveAttribute('fill', '#d9e2f3');
    await expect(page.locator('.legend__swatch img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  });
});
