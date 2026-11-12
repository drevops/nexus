import { test, expect } from '@playwright/test';
import { loadExample, slFill, downloadFrom, saveFrom, topmostOf } from './helpers.js';

test.describe('Save', { tag: '@runner-1' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('saves the diagram as PNG named after the title', async ({ page }) => {
    await loadExample(page);

    const download = await saveFrom(page, 'png');
    expect(download.suggestedFilename()).toBe('example-content-model.png');
  });

  test('loads the SVG exporter without a duplicate registration warning', async ({ page }) => {
    const warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') {
        warnings.push(message.text());
      }
    });

    await page.reload();
    await loadExample(page);

    expect(warnings.filter((warning) => warning.includes('Can not register'))).toEqual([]);
  });

  test('saves the diagram as SVG and honours a renamed title', async ({ page }) => {
    await loadExample(page);

    await slFill(page, '#diagram-title', 'My Model');

    const download = await saveFrom(page, 'svg');
    expect(download.suggestedFilename()).toBe('my-model.svg');
  });

  for (const [name, filename, startDownload] of dataProviderUntitledDownloads()) {
    test(`names the ${name} after the default title when the title is empty`, async ({ page }) => {
      await loadExample(page);
      await slFill(page, '#diagram-title', '');

      expect((await startDownload(page)).suggestedFilename()).toBe(filename);
    });
  }

  function dataProviderUntitledDownloads() {
    return [
      ['PNG', 'content-model.png', (page) => saveFrom(page, 'png')],
      ['SVG', 'content-model.svg', (page) => saveFrom(page, 'svg')],
      ['CSV', 'content-model-fields.csv', (page) => saveFrom(page, 'csv')],
      ['JSON from the Save as menu', 'content-model.nexus.json', (page) => saveFrom(page, 'json')],
      ['JSON from the Save button', 'content-model.nexus.json', (page) => downloadFrom(page, '#doc-save')],
    ];
  }

  test('lists every format under Save as', async ({ page }) => {
    await loadExample(page);

    await page.click('#save-choose');

    await expect(page.locator('#save-menu')).toBeVisible();
    await expect(page.locator('#save-menu sl-menu-label')).toHaveText('Save as');
    await expect(page.locator('#save-menu sl-menu-item')).toHaveText(['JSON', 'PNG', 'SVG', 'CSV']);
  });

  for (const [format, filename] of dataProviderSaveFormats()) {
    test(`keeps the Save button on the document after saving as ${format}`, async ({ page }) => {
      await loadExample(page);

      expect((await saveFrom(page, format)).suggestedFilename()).toBe(filename);

      await expect(page.locator('#doc-save')).toHaveText('Save');
      await expect(page.locator('#doc-save')).toHaveAttribute('title', 'Save this diagram as a Nexus document (.nexus.json)');
      expect((await downloadFrom(page, '#doc-save')).suggestedFilename()).toBe('example-content-model.nexus.json');
    });
  }

  function dataProviderSaveFormats() {
    return [
      ['png', 'example-content-model.png'],
      ['svg', 'example-content-model.svg'],
      ['csv', 'example-content-model-fields.csv'],
    ];
  }

  test('ignores a save menu item that names no format', async ({ page }) => {
    await loadExample(page);

    const errors = [];
    const downloads = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('download', (download) => downloads.push(download));

    await page.evaluate(() => {
      const item = document.createElement('sl-menu-item');
      item.setAttribute('value', 'pdf');
      item.textContent = 'PDF';
      document.getElementById('save-menu').append(item);
    });

    await page.click('#save-choose');
    await page.click('#save-menu sl-menu-item[value="pdf"]');
    await expect(page.locator('#save-menu')).toBeHidden();

    expect(errors).toEqual([]);
    expect(downloads).toEqual([]);
  });

  test('saves the document from the Save button while its menu is open and closes the menu', async ({ page }) => {
    await loadExample(page);

    await page.click('#save-choose');
    await expect(page.locator('#save-menu')).toBeVisible();

    expect((await downloadFrom(page, '#doc-save')).suggestedFilename()).toBe('example-content-model.nexus.json');
    await expect(page.locator('#save-menu')).toBeHidden();
  });

  test('draws the save menu above a panel under it', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    const caret = await page.locator('#save-choose').boundingBox();
    const head = await page.locator('#entities .panel__head').boundingBox();
    await page.mouse.move(head.x + 40, head.y + head.height / 2);
    await page.mouse.down();
    await page.mouse.move(caret.x - 40, head.y, { steps: 8 });
    await page.mouse.up();

    await page.click('#save-choose');
    await expect(page.locator('#save-menu')).toBeVisible();
    await expect.poll(() => topmostOf(page, ['#save-menu', '#entities'])).toBe('#save-menu');
  });

  test('describes a hovered save menu item in the status bar', async ({ page }) => {
    await loadExample(page);

    await page.click('#save-choose');
    await page.hover('#save-menu sl-menu-item[value="png"]');
    await expect(page.locator('#statusbar-hint')).toHaveText('Save the diagram as a PNG image');

    await page.hover('#save-menu sl-menu-item[value="csv"]');
    await expect(page.locator('#statusbar-hint')).toHaveText('Save the fields table as CSV');
  });
});
