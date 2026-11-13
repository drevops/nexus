import { test, expect } from '@playwright/test';
import { entityCount, waitForGraph } from './helpers.js';

test.describe('Templates', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('shows a loading screen while a template loads', async ({ page }) => {
    await page.route('**/templates/civictheme.nexus.json', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      route.continue();
    });
    await page.click('#template-civictheme');
    await expect(page.locator('#loader')).toBeVisible();
    await waitForGraph(page);
    await expect(page.locator('#loader')).toBeHidden();
  });

  test('lists every template with its badge, its counts and a drawn mark', async ({ page }) => {
    const rows = page.locator('.template-row');

    await expect(rows).toHaveCount(3);
    const ids = await rows.evaluateAll((elements) => elements.map((element) => element.id));

    expect(ids).toEqual(['template-drupal-cms', 'template-civictheme', 'template-umami']);

    for (const [id, label, badge, counts] of dataProviderTemplateRows()) {
      const row = page.locator('#template-' + id);

      await expect(row.locator('.template-row__name')).toHaveText(label);
      await expect(row.locator('.template-row__badge')).toHaveText(badge);
      await expect(row.locator('.template-row__counts')).toHaveText(counts);
      expect(await row.locator('.template-row__mark svg.icon > *').count()).toBeGreaterThan(0);
    }
  });

  function dataProviderTemplateRows() {
    return [
      ['civictheme', 'CivicTheme', '1.13.0', '3 content types · 31 paragraph types · 6 media types'],
      ['drupal-cms', 'Drupal CMS', '2.2.2', '2 content types · 5 media types · 1 vocabulary'],
      ['umami', 'Umami', '11.4.12', '3 content types · 5 media types · 4 block types'],
    ];
  }

  for (const [id, title, entities, entityId] of dataProviderTemplates()) {
    test(`loads the ${title} template`, async ({ page }) => {
      await page.click('#template-' + id);
      await waitForGraph(page);

      expect(await entityCount(page)).toBe(entities);
      expect(await page.evaluate((target) => window.__nexus.cy.getElementById(target).length, entityId)).toBe(1);
      await expect(page.locator('#diagram-title')).toHaveJSProperty('value', title);

      // The document holds no layout, so the app lays the entities out on open.
      const positions = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').map((node) => JSON.stringify(node.position())));

      expect(new Set(positions).size).toBe(entities);
    });
  }

  function dataProviderTemplates() {
    return [
      ['civictheme', 'CivicTheme 1.13.0', 49, 'paragraph.civictheme_accordion'],
      ['drupal-cms', 'Drupal CMS 2.2.2', 9, 'node.blog'],
      ['umami', 'Umami 11.4.12', 15, 'node.recipe'],
    ];
  }

  test('loads a template as 1 saved diagram', async ({ page }) => {
    const fetched = [];

    page.on('request', (request) => {
      if (request.url().includes('/templates/')) {
        fetched.push(new URL(request.url()).pathname);
      }
    });

    await page.click('#template-civictheme');
    await waitForGraph(page);

    expect(fetched).toEqual(['/templates/civictheme.nexus.json']);
  });

  for (const [name, response, message] of dataProviderBrokenTemplates()) {
    test(`reports ${name} on the landing screen`, async ({ page }) => {
      await page.route('**/templates/civictheme.nexus.json', (route) => route.fulfill(response));
      await page.click('#template-civictheme');

      await expect(page.locator('#landing-error')).toHaveAttribute('open', '');
      await expect(page.locator('#landing-error-text')).toHaveText('Could not load CivicTheme 1.13.0: ' + message);
      await expect(page.locator('#landing')).toBeVisible();
      await expect(page.locator('#loader')).toBeHidden();
    });
  }

  function dataProviderBrokenTemplates() {
    return [
      ['a template diagram the server cannot find', { status: 404, body: 'Not found' }, 'civictheme.nexus.json returned 404'],
      ['a template file that is not a diagram', { status: 200, contentType: 'application/json', body: '{ "nexus": 1 }' }, 'Not a valid Nexus document.'],
    ];
  }

  test('asks to check the connection when a template cannot be downloaded', async ({ page }) => {
    await page.route('**/templates/civictheme.nexus.json', (route) => route.abort());
    await page.click('#template-civictheme');

    await expect(page.locator('#landing-error-text')).toHaveText(
      'Could not load CivicTheme 1.13.0: civictheme.nexus.json could not be downloaded. Check your connection and try again.',
    );
    await expect(page.locator('#landing')).toBeVisible();
  });

  test('loads a template from the keyboard', async ({ page }) => {
    await page.focus('#template-drupal-cms');
    await page.keyboard.press('Enter');
    await waitForGraph(page);

    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Drupal CMS 2.2.2');
  });
});
