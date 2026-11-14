import { test, expect } from '@playwright/test';
import { loadExample, pickLayout } from './helpers.js';

test.describe('Status bar', { tag: '@runner-1' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('sets the zoom level from the status bar dropdown', async ({ page }) => {
    await loadExample(page);

    await page.click('#zoom-level');
    await page.click('sl-menu-item[value="2"]');

    await page.waitForFunction(() => Math.abs(window.__nexus.cy.zoom() - 2) < 0.01);
    await expect(page.locator('#zoom-level')).toHaveText(/200%/);
  });

  const LAYOUT_HINT = 'Stack the entities in columns that fill the screen';

  test('echoes a hovered control description into the status bar', async ({ page }) => {
    await loadExample(page);

    await page.locator('#layout-run').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);
  });

  test('shows a hovered control description in place of the status bar tips', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loadExample(page);

    await page.locator('#layout-run').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);
    await expect(page.locator('#statusbar-hint')).toBeVisible();
    await expect(page.locator('#statusbar .statusbar__tips')).toBeHidden();
    expect((await page.locator('#statusbar-hint').boundingBox()).width).toBeGreaterThan(200);

    await page.locator('#cy').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText('');
    await expect(page.locator('#statusbar .statusbar__tips')).toBeVisible();
  });

  test('describes the picked layout when the layout button is hovered', async ({ page }) => {
    await loadExample(page);
    await pickLayout(page, 'tb');

    await page.locator('#layout-run').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText('Lay the diagram out top to bottom');
  });

  test('describes a hovered layout menu item in the status bar', async ({ page }) => {
    await loadExample(page);

    await page.click('#layout-choose');
    await page.hover('#layout-menu sl-menu-item[value="lr"]');
    await expect(page.locator('#statusbar-hint')).toHaveText('Lay the diagram out left to right');

    await page.hover('#layout-menu sl-menu-item[value="columns"]');
    await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);
  });

  test('describes the switched theme when the theme toggle is hovered again', async ({ page }) => {
    await loadExample(page);

    await page.click('#theme-toggle');
    await page.locator('#layout-run').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);

    await page.locator('#theme-toggle').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText('Switch to light theme');
  });

  test('refreshes the status bar hint when the hovered theme toggle is clicked', async ({ page }) => {
    await loadExample(page);

    // Rest the pointer beside the icon and click in place, so neither a replaced
    // icon nor pointer movement fires a fresh mouseover.
    await page.locator('#theme-toggle').hover({ position: { x: 3, y: 12 } });
    await expect(page.locator('#statusbar-hint')).toHaveText('Switch to dark theme');

    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
    await expect(page.locator('#statusbar-hint')).toHaveText('Switch to light theme');

    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
    await expect(page.locator('#statusbar-hint')).toHaveText('Switch to dark theme');
  });

  test('keeps the status bar hint on the hovered control when another control is retitled', async ({ page }) => {
    await loadExample(page);

    await page.locator('#layout-run').hover();
    await page.locator('#theme-toggle').evaluate((el) => el.click());
    await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
    await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);

    await page.locator('#cy').hover();
    await page.locator('#theme-toggle').evaluate((el) => el.click());
    await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
    await expect(page.locator('#statusbar-hint')).toHaveText('');
  });

  test('shows interaction tips in the middle of the status bar', async ({ page }) => {
    await expect(page.locator('#statusbar .statusbar__tips')).toContainText('Right-click');
  });

  // The tips are cut off at the end in a narrow window, so the pointer to the
  // shortcuts comes first.
  test('leads the status bar tips with the F1 shortcut view', async ({ page }) => {
    await expect(page.locator('#statusbar .statusbar__tips')).toHaveText(/^F1 shows keyboard shortcuts · /);
  });

  for (const width of dataProviderStatusbarWidths()) {
    test(`keeps the display controls and the zoom controls in the window and clear of each other ${width}px wide`, async ({ page }) => {
      await page.setViewportSize({ width: width, height: 800 });
      await loadExample(page);

      const box = (selector) => page.locator(selector).boundingBox();
      const [display, zoom, statusbar, stage] = await Promise.all(['.statusbar__display', '.statusbar__zoom', '#statusbar', '#stage-root'].map(box));
      const apart = display.x + display.width <= zoom.x || display.y + display.height <= zoom.y;

      expect(apart).toBe(true);
      expect(Math.max(display.x + display.width, zoom.x + zoom.width)).toBeLessThanOrEqual(width);
      expect(Math.min(display.x, zoom.x)).toBeGreaterThanOrEqual(0);
      expect(stage.y + stage.height).toBeLessThanOrEqual(statusbar.y);
      expect(statusbar.y + statusbar.height).toBeLessThanOrEqual(800);
    });
  }

  function dataProviderStatusbarWidths() {
    return [360, 420, 688, 689, 1280];
  }
});
