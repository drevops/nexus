import { test, expect } from '@playwright/test';
import { loadExample, openFrom, DARK_MARK, markFills } from './helpers.js';

test.describe('Logo', { tag: '@runner-1' }, () => {
  const LIGHT_MARK = { ink: ['rgb(51, 62, 67)'], ref: ['rgb(83, 180, 235)'] };

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('links the SVG favicon', async ({ page, request }) => {
    const favicon = page.locator('link[rel="icon"]');
    await expect(favicon).toHaveAttribute('href', 'assets/favicon.svg');
    await expect(favicon).toHaveAttribute('type', 'image/svg+xml');

    const response = await request.get(await favicon.evaluate((link) => link.href));
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toBe('image/svg+xml');
  });

  test('draws the Nexus mark beside the name on the landing screen and in the toolbar', async ({ page }) => {
    for (const brand of [page.locator('.landing__logo'), page.locator('.toolbar__brand')]) {
      await expect(brand).toHaveText('Nexus');
      await expect(brand.locator('svg.icon--nexus')).toBeVisible();
      await expect(brand.locator('svg.icon--nexus')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  test('colours the Nexus mark for the app theme, not the system one', async ({ page }) => {
    // The app reads the system scheme only at load, so it stays in the light theme.
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await markFills(page, '.landing__logo')).toEqual(LIGHT_MARK);
    expect(await markFills(page, '.toolbar__brand')).toEqual(LIGHT_MARK);

    await loadExample(page);
    await page.click('#theme-toggle');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await markFills(page, '.toolbar__brand')).toEqual(DARK_MARK);

    await openFrom(page, 'import');
    await expect(page.locator('#landing')).toBeVisible();
    expect(await markFills(page, '.landing__logo')).toEqual(DARK_MARK);
  });
});
