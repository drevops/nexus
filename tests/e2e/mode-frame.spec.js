import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadExample, slFill, saveFrom } from './helpers.js';

test.describe('Mode frame', { tag: '@runner-2' }, () => {
  // How the mode frame draws: its display, border width and colour, and
  // whether it takes pointer events.
  function modeFrame(page) {
    return page.locator('#mode-frame').evaluate((el) => {
      const style = getComputedStyle(el);

      return { display: style.display, width: style.borderTopWidth, color: style.borderTopColor, pointerEvents: style.pointerEvents };
    });
  }

  const TRANSPARENT = 'rgba(0, 0, 0, 0)';

  const AMBER = 'rgb(245, 158, 11)';

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('frames the canvas in the colour of the mode', async ({ page }) => {
    await loadExample(page);
    expect(await modeFrame(page)).toEqual({ display: 'block', width: '5px', color: TRANSPARENT, pointerEvents: 'none' });

    await page.click('#mode-build');
    expect(await modeFrame(page)).toEqual({ display: 'block', width: '5px', color: AMBER, pointerEvents: 'none' });

    await page.click('#mode-view');
    expect((await modeFrame(page)).color).toBe(TRANSPARENT);
  });

  test('keeps the mode frame inside the canvas, off the docked panels and out of the way of the pointer', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await page.click('#legend .panel__pin');
    await expect(page.locator('#legend')).toHaveClass(/is-docked/);

    const frame = await page.locator('#mode-frame').boundingBox();
    const canvas = await page.locator('.stage__canvas').boundingBox();
    const rail = await page.locator('#dock-right').boundingBox();
    expect(frame).toEqual(canvas);
    expect(frame.x + frame.width).toBeLessThanOrEqual(rail.x);

    // A point in the frame's band reaches the canvas under it.
    const hit = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y).closest('#cy')), { x: frame.x + 2, y: frame.y + frame.height / 2 });
    expect(hit).toBe(true);
  });

  test('sets the mode frame from Settings and keeps it across reloads', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await page.click('#settings-toggle');

    await slFill(page, '#settings sl-color-picker[data-frame-color="edit"]', '#112233');
    await expect.poll(async () => (await modeFrame(page)).color).toBe('rgb(17, 34, 51)');

    await slFill(page, '#settings sl-color-picker[data-frame-color="view"]', '#445566');
    await page.click('#mode-view');
    await expect.poll(async () => (await modeFrame(page)).color).toBe('rgb(68, 85, 102)');

    await page.click('#frame-toggle');
    await expect.poll(async () => (await modeFrame(page)).display).toBe('none');
    await expect(page.locator('#settings sl-color-picker[data-frame-color="view"]')).toHaveAttribute('disabled', '');

    // The panel layout is saved after a short delay, so the reload waits for
    // it to keep Settings open.
    await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('nexusLayout') || '{}').panels?.settings?.open === true);
    await page.reload();
    await loadExample(page);
    expect((await modeFrame(page)).display).toBe('none');

    // The reload keeps the open panels but not their stack, so Settings is
    // raised over the Legend.
    await page.click('#settings .panel__title');
    await page.click('#frame-toggle');
    await expect.poll(() => modeFrame(page)).toEqual({ display: 'block', width: '5px', color: 'rgb(68, 85, 102)', pointerEvents: 'none' });
    await page.click('#mode-build');
    expect((await modeFrame(page)).color).toBe('rgb(17, 34, 51)');
  });

  test('leaves the mode frame out of an SVG export', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    expect((await modeFrame(page)).color).toBe(AMBER);

    const svg = readFileSync(await (await saveFrom(page, 'svg')).path(), 'utf8');

    expect(svg).toContain('<svg');
    expect(svg.toLowerCase()).not.toContain('#f59e0b');
    expect(svg).not.toContain(AMBER);
  });

  test('restores the mode frame with Reset to defaults', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await page.click('#settings-toggle');

    await slFill(page, '#settings sl-color-picker[data-frame-color="edit"]', '#112233');
    await page.click('#frame-toggle');
    await expect.poll(async () => (await modeFrame(page)).display).toBe('none');

    await page.click('#settings-reset');

    await expect.poll(() => modeFrame(page)).toEqual({ display: 'block', width: '5px', color: AMBER, pointerEvents: 'none' });
    await expect.poll(() => page.evaluate(() => document.getElementById('frame-toggle').checked)).toBe(true);
  });
});
