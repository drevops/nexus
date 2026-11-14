import { test, expect } from '@playwright/test';
import { editExample, loadExample, pickLayout, selectEvent } from './helpers.js';

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
  const TIPS = /^F1 shows keyboard shortcuts · /;

  test('echoes a hovered control description into the status bar', async ({ page }) => {
    await loadExample(page);

    await page.locator('#layout-run').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);
  });

  test('shows a hovered control description in the same place as the status bar tips', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loadExample(page);

    const hint = page.locator('#statusbar-hint');
    await expect(hint).toHaveText(TIPS);
    await expect(hint).toHaveClass(/is-tips/);
    const tipsBox = await hint.boundingBox();

    await page.locator('#layout-run').hover();
    await expect(hint).toHaveText(LAYOUT_HINT);
    await expect(hint).not.toHaveClass(/is-tips/);
    expect(await hint.boundingBox()).toEqual(tipsBox);
    expect(await hint.evaluate((el) => getComputedStyle(el).textAlign)).not.toBe('center');
    expect(tipsBox.width).toBeGreaterThan(200);

    await page.locator('#cy').hover();
    await expect(hint).toHaveText(TIPS);
    await expect(hint).toHaveClass(/is-tips/);
    expect(await hint.boundingBox()).toEqual(tipsBox);
  });

  test('keeps a single text slot in the status bar', async ({ page }) => {
    await loadExample(page);

    const texts = await page.locator('#statusbar > span').evaluateAll((spans) => spans.map((span) => span.id));
    expect(texts).toEqual(['statusbar-hint']);
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
    await expect(page.locator('#statusbar-hint')).toHaveText(TIPS);
  });

  for (const [name, setup, selector] of dataProviderStageControls()) {
    test(`echoes the description of ${name} into the status bar`, async ({ page }) => {
      await setup(page);

      const control = page.locator(selector).first();
      const title = await control.getAttribute('title');
      expect(title).toBeTruthy();

      await control.hover();
      await expect(page.locator('#statusbar-hint')).toHaveText(title);
      await expect(page.locator('#statusbar-hint')).not.toHaveClass(/is-tips/);

      const hint = await page.locator('#statusbar-hint').boundingBox();
      await page.mouse.move(hint.x + hint.width / 2, hint.y + hint.height / 2);
      await expect(page.locator('#statusbar-hint')).toHaveText(TIPS);
      await expect(page.locator('#statusbar-hint')).toHaveClass(/is-tips/);
    });
  }

  test('describes a hovered option of a select list inside a panel', async ({ page }) => {
    await loadExample(page);
    await page.click('#settings-toggle');
    await page.click('#settings [data-default="level"]');

    const option = page.locator('#settings [data-default="level"] sl-option').nth(1);
    await expect(option).toBeVisible();
    const title = await option.getAttribute('title');
    expect(title).toBeTruthy();

    await option.hover();
    await expect(page.locator('#statusbar-hint')).toHaveText(title);
  });

  test('moves the status bar hint between controls in different regions', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    await page.locator('#entities .panel__close').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText('Close panel');

    await page.locator('#fit').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText('Fit the whole diagram in view');

    await page.locator('#layout-run').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);
  });

  test('drops the status bar hint of a panel closed from under the pointer', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    await page.locator('#entities .panel__close').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText('Close panel');

    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('#entities')).toHaveCount(0);
    await expect(page.locator('#statusbar-hint')).not.toHaveText('Close panel');
  });

  test('falls back to the title of an ancestor when the hovered control loses its own', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    await page.locator('#entities .panel__close').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText('Close panel');

    const headTitle = await page.locator('#entities .panel__head').getAttribute('title');
    await page.locator('#entities .panel__close').evaluate((el) => el.removeAttribute('title'));
    await expect(page.locator('#statusbar-hint')).toHaveText(headTitle);
  });

  test('shows the status bar tips over a control with an empty title', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    await page.locator('#entities .panel__close').evaluate((el) => el.setAttribute('title', ''));
    await page.locator('#entities .panel__close').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText(TIPS);
    await expect(page.locator('#statusbar-hint')).toHaveClass(/is-tips/);
  });

  test('shows interaction tips in the status bar', async ({ page }) => {
    await expect(page.locator('#statusbar-hint')).toContainText('Right-click');
  });

  // The tips are cut off at the end in a narrow window, so the pointer to the
  // shortcuts comes first.
  test('leads the status bar tips with the F1 shortcut view', async ({ page }) => {
    await expect(page.locator('#statusbar-hint')).toHaveText(TIPS);
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

  function dataProviderStageControls() {
    const withPanel = (toggle) => async (page) => {
      await loadExample(page);
      await page.click(toggle);
    };

    return [
      ['a panel pin', withPanel('#entities-toggle'), '#entities .panel__pin'],
      ['a panel grip', withPanel('#entities-toggle'), '#entities .panel__grip'],
      ['an Entities panel row', withPanel('#entities-toggle'), '#entities .entity-row__name'],
      ['a Fields table header', withPanel('#table-toggle'), '#table .field-table__sort'],
      ['a History panel version', withPanel('#history-toggle'), '#history .panel__body [title]'],
      ['a Settings control', withPanel('#settings-toggle'), '#settings [data-default="layout"]'],
      ['an Inspector control', (page) => selectEvent(page, 1), '#inspector .panel__body [title]'],
      ['a canvas handle', (page) => selectEvent(page, 1), '.handle--right'],
      ['an edit palette button', (page) => editExample(page), '#add-node'],
    ];
  }

  function dataProviderStatusbarWidths() {
    return [360, 420, 688, 689, 1280];
  }
});
