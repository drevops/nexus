import { test, expect } from '@playwright/test';

test.describe('Icons', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('renders toolbar icons from the icon set', async ({ page }) => {
    await expect(page.locator('#doc-import svg.icon')).toBeVisible();
    await expect(page.locator('#doc-save svg.icon')).toBeVisible();
    await expect(page.locator('#layout-run svg.icon')).toBeVisible();
    await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: Columns');
    await expect(page.locator('#folder-btn svg.icon')).toBeVisible();
  });

  test('renders a non-empty glyph for every toolbar, status bar and landing icon', async ({ page }) => {
    const empty = await page.evaluate(() =>
      [...document.querySelectorAll('.toolbar [data-icon], .statusbar [data-icon], .landing [data-icon]')]
        .filter((el) => {
          const svg = el.querySelector('svg.icon');
          return !svg || svg.children.length === 0;
        })
        .map((el) => el.id || el.getAttribute('data-icon')),
    );
    expect(empty).toEqual([]);
  });
});
