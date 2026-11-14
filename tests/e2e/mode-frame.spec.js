import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { closeSettings, loadExample, openSettings, slFill, saveFrom } from './helpers.js';

test.describe('Mode frame', { tag: '@runner-2' }, () => {
  // How the mode frame draws: its display, border width and colour, and
  // whether it takes pointer events.
  function modeFrame(page) {
    return page.locator('#mode-frame').evaluate((el) => {
      const style = getComputedStyle(el);

      return { display: style.display, width: style.borderTopWidth, color: style.borderTopColor, pointerEvents: style.pointerEvents };
    });
  }

  const AMBER = 'rgb(245, 158, 11)';

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('frames the canvas in Edit mode only by default', async ({ page }) => {
    await loadExample(page);
    expect((await modeFrame(page)).display).toBe('none');

    await page.click('#mode-build');
    expect(await modeFrame(page)).toEqual({ display: 'block', width: '5px', color: AMBER, pointerEvents: 'none' });

    await page.click('#mode-view');
    expect((await modeFrame(page)).display).toBe('none');
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

  // The switch and colour picker of each mode in the Settings dialog.
  function frameControls(page) {
    return page.evaluate(() =>
      Object.fromEntries(
        ['view', 'edit'].map((mode) => [
          mode,
          {
            checked: document.querySelector(`#settings sl-switch[data-frame-toggle="${mode}"]`).checked,
            disabled: document.querySelector(`#settings sl-color-picker[data-frame-color="${mode}"]`).disabled,
            preview: document.querySelector(`#settings [data-frame-preview="${mode}"]`).textContent.trim(),
          },
        ]),
      ),
    );
  }

  test('turns the frame of each mode on and off on its own in Settings', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'frame');

    // Shoelace defines each control after the tab renders, and an undefined
    // control has no checked or disabled value yet.
    await expect
      .poll(() => frameControls(page))
      .toEqual({ view: { checked: false, disabled: true, preview: 'No frame' }, edit: { checked: true, disabled: false, preview: 'Edit mode' } });

    await page.click('#settings sl-switch[data-frame-toggle="view"]');
    await page.click('#settings sl-switch[data-frame-toggle="edit"]');

    await expect
      .poll(() => frameControls(page))
      .toEqual({ view: { checked: true, disabled: false, preview: 'View mode' }, edit: { checked: false, disabled: true, preview: 'No frame' } });
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')).frame)).toEqual({
      view: { enabled: true, color: '#64748b' },
      edit: { enabled: false, color: '#f59e0b' },
    });

    await closeSettings(page);
    expect(await modeFrame(page)).toEqual({ display: 'block', width: '5px', color: 'rgb(100, 116, 139)', pointerEvents: 'none' });

    await page.click('#mode-build');
    expect((await modeFrame(page)).display).toBe('none');
  });

  test('sets the colour of each mode frame from Settings and keeps both across reloads', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await openSettings(page, 'frame');

    await slFill(page, '#settings sl-color-picker[data-frame-color="edit"]', '#112233');
    await expect.poll(async () => (await modeFrame(page)).color).toBe('rgb(17, 34, 51)');
    await expect(page.locator('#settings [data-frame-preview="edit"]')).toHaveCSS('border-top-color', 'rgb(17, 34, 51)');

    await page.click('#settings sl-switch[data-frame-toggle="view"]');
    await slFill(page, '#settings sl-color-picker[data-frame-color="view"]', '#445566');
    await closeSettings(page);
    await page.click('#mode-view');
    await expect.poll(async () => (await modeFrame(page)).color).toBe('rgb(68, 85, 102)');

    await page.reload();
    await loadExample(page);
    expect(await modeFrame(page)).toEqual({ display: 'block', width: '5px', color: 'rgb(68, 85, 102)', pointerEvents: 'none' });
    await page.click('#mode-build');
    expect((await modeFrame(page)).color).toBe('rgb(17, 34, 51)');

    await openSettings(page, 'frame');
    await expect(page.locator('#settings sl-color-picker[data-frame-color="view"]')).toHaveAttribute('value', '#445566');
    await expect(page.locator('#settings sl-color-picker[data-frame-color="edit"]')).toHaveAttribute('value', '#112233');
  });

  // Settings stored with 1 switch and a colour per mode open as the frames
  // they drew.
  for (const [name, stored, view, edit] of dataProviderStoredFrames()) {
    test(`reads a frame stored with 1 switch: ${name}`, async ({ page }) => {
      await page.evaluate((frame) => window.localStorage.setItem('nexusSettings', JSON.stringify({ frame })), stored);
      await page.reload();
      await loadExample(page);
      expect((await modeFrame(page)).display).toBe(view);

      await page.click('#mode-build');
      expect((await modeFrame(page)).display).toBe(edit);
    });
  }

  function dataProviderStoredFrames() {
    return [
      ['the defaults', { enabled: true, view: '#00000000', edit: '#f59e0b' }, 'none', 'block'],
      ['the switch off', { enabled: false, view: '#445566', edit: '#f59e0b' }, 'none', 'none'],
      ['a View colour', { enabled: true, view: '#445566', edit: '#f59e0b' }, 'block', 'block'],
    ];
  }

  test('leaves the mode frame out of an SVG export', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    expect((await modeFrame(page)).color).toBe(AMBER);

    const svg = readFileSync(await (await saveFrom(page, 'svg')).path(), 'utf8');

    expect(svg).toContain('<svg');
    expect(svg.toLowerCase()).not.toContain('#f59e0b');
    expect(svg).not.toContain(AMBER);
  });

  for (const reset of ['#settings-reset', '#settings [data-reset-tab="frame"]']) {
    test(`restores the mode frame with ${reset}`, async ({ page }) => {
      await loadExample(page);
      await page.click('#mode-build');
      await openSettings(page, 'frame');

      await slFill(page, '#settings sl-color-picker[data-frame-color="edit"]', '#112233');
      await page.click('#settings sl-switch[data-frame-toggle="edit"]');
      await page.click('#settings sl-switch[data-frame-toggle="view"]');
      await expect.poll(async () => (await modeFrame(page)).display).toBe('none');

      await page.click(reset);

      await expect.poll(() => modeFrame(page)).toEqual({ display: 'block', width: '5px', color: AMBER, pointerEvents: 'none' });
      await expect
        .poll(() => frameControls(page))
        .toEqual({ view: { checked: false, disabled: true, preview: 'No frame' }, edit: { checked: true, disabled: false, preview: 'Edit mode' } });
    });
  }
});
