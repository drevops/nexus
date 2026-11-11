import { test, expect } from '@playwright/test';
import { loadExample, slFill, downloadFrom, exportFrom, topmostOf } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('exports the diagram as PNG named after the title', async ({ page }) => {
  await loadExample(page);

  const download = await exportFrom(page, 'png');
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

test('exports the diagram as SVG and honours a renamed title', async ({ page }) => {
  await loadExample(page);

  await slFill(page, '#diagram-title', 'My Model');

  const download = await exportFrom(page, 'svg');
  expect(download.suggestedFilename()).toBe('my-model.svg');
});

for (const [filename, startDownload] of dataProviderUntitledDownloads()) {
  test(`names the ${filename} download after the default title when the title is empty`, async ({ page }) => {
    await loadExample(page);
    await slFill(page, '#diagram-title', '');

    expect((await startDownload(page)).suggestedFilename()).toBe(filename);
  });
}

function dataProviderUntitledDownloads() {
  return [
    ['content-model.png', (page) => exportFrom(page, 'png')],
    ['content-model.svg', (page) => exportFrom(page, 'svg')],
    ['content-model-fields.csv', (page) => exportFrom(page, 'csv')],
    ['content-model.nexus.json', (page) => downloadFrom(page, '#doc-save')],
  ];
}

test('opens the export menu from the Export button until a format is chosen', async ({ page }) => {
  await loadExample(page);

  const downloads = [];
  page.on('download', (download) => downloads.push(download));

  await expect(page.locator('#export-run')).toHaveText('Export');
  await page.click('#export-run');

  await expect(page.locator('#export-menu')).toBeVisible();
  await expect(page.locator('#export-menu sl-menu-item')).toHaveText(['PNG', 'SVG', 'CSV']);
  expect(downloads).toEqual([]);
});

for (const [format, label, filename, title] of dataProviderExportFormats()) {
  test(`repeats ${label} from the Export button once it is chosen from the menu`, async ({ page }) => {
    await loadExample(page);

    expect((await exportFrom(page, format)).suggestedFilename()).toBe(filename);
    await expect(page.locator('#export-run')).toHaveText('Export ' + label);
    await expect(page.locator('#export-run')).toHaveAttribute('title', title);

    expect((await downloadFrom(page, '#export-run')).suggestedFilename()).toBe(filename);
    await expect(page.locator('#export-dropdown')).toHaveJSProperty('open', false);
  });
}

function dataProviderExportFormats() {
  return [
    ['png', 'PNG', 'example-content-model.png', 'Export the diagram as a PNG image'],
    ['svg', 'SVG', 'example-content-model.svg', 'Export the diagram as a scalable SVG'],
    ['csv', 'CSV', 'example-content-model-fields.csv', 'Export the fields table as CSV'],
  ];
}

test('remembers the chosen export format across reloads', async ({ page }) => {
  await loadExample(page);
  await exportFrom(page, 'svg');

  await page.reload();
  await loadExample(page);

  await expect(page.locator('#export-run')).toHaveText('Export SVG');
  expect((await downloadFrom(page, '#export-run')).suggestedFilename()).toBe('example-content-model.svg');
});

for (const [name, stored] of dataProviderUnknownExportFormats()) {
  test(`ignores a stored export format that is ${name}`, async ({ page }) => {
    await page.evaluate((value) => window.localStorage.setItem('nexusExportFormat', value), stored);
    await page.reload();
    await loadExample(page);

    await expect(page.locator('#export-run')).toHaveText('Export');
    await page.click('#export-run');
    await expect(page.locator('#export-menu')).toBeVisible();
  });
}

function dataProviderUnknownExportFormats() {
  return [
    ['unknown', 'pdf'],
    ['in capitals', 'SVG'],
    ['an inherited object property', 'constructor'],
    ['empty', ''],
  ];
}

test('ignores an export menu item that names no format', async ({ page }) => {
  await loadExample(page);

  const errors = [];
  const downloads = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('download', (download) => downloads.push(download));

  await page.evaluate(() => {
    const item = document.createElement('sl-menu-item');
    item.setAttribute('value', 'pdf');
    item.textContent = 'PDF';
    document.getElementById('export-menu').append(item);
  });

  await page.click('#export-choose');
  await page.click('#export-menu sl-menu-item[value="pdf"]');
  await expect(page.locator('#export-menu')).toBeHidden();

  await expect(page.locator('#export-run')).toHaveText('Export');
  expect(await page.evaluate(() => window.localStorage.getItem('nexusExportFormat'))).toBeNull();
  expect(errors).toEqual([]);
  expect(downloads).toEqual([]);
});

test('switches the export format from the menu', async ({ page }) => {
  await loadExample(page);
  await exportFrom(page, 'svg');

  expect((await exportFrom(page, 'csv')).suggestedFilename()).toBe('example-content-model-fields.csv');
  await expect(page.locator('#export-run')).toHaveText('Export CSV');
  expect((await downloadFrom(page, '#export-run')).suggestedFilename()).toBe('example-content-model-fields.csv');
});

test('closes the export menu when the Export button is pressed again', async ({ page }) => {
  await loadExample(page);

  await page.click('#export-run');
  await expect(page.locator('#export-menu')).toBeVisible();

  await page.click('#export-run');
  await expect(page.locator('#export-menu')).toBeHidden();
});

test('exports from the Export button while its menu is open and closes the menu', async ({ page }) => {
  await loadExample(page);
  await exportFrom(page, 'png');

  await page.click('#export-choose');
  await expect(page.locator('#export-menu')).toBeVisible();

  expect((await downloadFrom(page, '#export-run')).suggestedFilename()).toBe('example-content-model.png');
  await expect(page.locator('#export-menu')).toBeHidden();
});

test('opens the export menu and exports from the keyboard', async ({ page }) => {
  await loadExample(page);

  // locator.focus() leaves a Shoelace button unfocused, so this calls the
  // button's own focus().
  await page.locator('#export-run').evaluate((button) => button.focus());
  await expect(page.locator('#export-run')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#export-menu')).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#export-menu sl-menu-item[value="png"]')).toBeFocused();

  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toBe('example-content-model.png');
  await expect(page.locator('#export-run')).toHaveText('Export PNG');
});

test('draws the export menu above a panel under it', async ({ page }) => {
  await loadExample(page);
  await page.click('#entities-toggle');

  const caret = await page.locator('#export-choose').boundingBox();
  const head = await page.locator('#entities .panel__head').boundingBox();
  await page.mouse.move(head.x + 40, head.y + head.height / 2);
  await page.mouse.down();
  await page.mouse.move(caret.x - 40, head.y, { steps: 8 });
  await page.mouse.up();

  await page.click('#export-choose');
  await expect(page.locator('#export-menu')).toBeVisible();
  await expect.poll(() => topmostOf(page, ['#export-menu', '#entities'])).toBe('#export-menu');
});

test('describes the Export button in the status bar', async ({ page }) => {
  await loadExample(page);

  await page.hover('#export-run');
  await expect(page.locator('#statusbar-hint')).toHaveText('Export the diagram or its fields table');

  await exportFrom(page, 'csv');
  await page.hover('#export-run');
  await expect(page.locator('#statusbar-hint')).toHaveText('Export the fields table as CSV');
});

test('describes a hovered export menu item in the status bar', async ({ page }) => {
  await loadExample(page);

  await page.click('#export-choose');
  await page.hover('#export-menu sl-menu-item[value="png"]');
  await expect(page.locator('#statusbar-hint')).toHaveText('Export the diagram as a PNG image');

  await page.hover('#export-menu sl-menu-item[value="csv"]');
  await expect(page.locator('#statusbar-hint')).toHaveText('Export the fields table as CSV');
});
