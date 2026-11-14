import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { downloadFrom, entityIds, loadExample, openFrom, saveFrom, waitForGraph } from './helpers.js';

test.describe('CSV import', { tag: '@runner-1' }, () => {
  const HEADER = 'Entity type,Bundle,Entity,Field,Machine name,Field type,Cardinality,Required,References';

  const SHOP_CSV = [
    HEADER,
    'Content type,product,Product,Title,title,string,1,yes,',
    'Content type,product,Product,Category,field_category,entity_reference,1..n,no,Categories (taxonomy_term.categories)',
    'Vocabulary,categories,Categories,Name,name,string,1,yes,',
  ].join('\r\n');

  function csvFile(name, text) {
    return { name: name, mimeType: 'text/csv', buffer: Buffer.from(text) };
  }

  // Clicks the control and picks the file in the chooser it opens.
  async function chooseFile(page, click, file) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click()]);
    await chooser.setFiles(file);
  }

  function fieldIds(page) {
    return page.evaluate(() =>
      window.__nexus.cy
        .nodes('[group="field"]')
        .map((node) => node.id())
        .sort(),
    );
  }

  function refEdgeIds(page) {
    return page.evaluate(() =>
      window.__nexus.cy
        .edges('[group="ref"]')
        .map((edge) => edge.id())
        .sort(),
    );
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('imports a CSV chosen from the Open menu', async ({ page }) => {
    await page.click('#new-btn');

    await chooseFile(page, () => openFrom(page, 'csv'), csvFile('shop-model.csv', SHOP_CSV));

    await waitForGraph(page);
    expect(await entityIds(page)).toEqual(['node.product', 'taxonomy_term.categories']);
    expect(await refEdgeIds(page)).toEqual(['ref:field:node.product:field_category>taxonomy_term.categories']);
    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Shop model');

    await page.click('#history-toggle');
    await expect(page.locator('#history .history__label')).toHaveText(['Imported shop-model.csv']);
  });

  test('imports a CSV chosen from the Open menu over an open diagram', async ({ page }) => {
    await loadExample(page);

    await chooseFile(page, () => openFrom(page, 'csv'), csvFile('shop.csv', SHOP_CSV));

    await expect.poll(() => entityIds(page)).toEqual(['node.product', 'taxonomy_term.categories']);
  });

  test('imports a CSV dropped on the landing screen', async ({ page }) => {
    await page.evaluate((text) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], 'dropped.csv', { type: 'text/csv' }));
      document.getElementById('dropzone').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, SHOP_CSV);

    await waitForGraph(page);
    expect(await entityIds(page)).toEqual(['node.product', 'taxonomy_term.categories']);
    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Dropped');
  });

  test('downloads a CSV template from the Open menu that imports as a diagram', async ({ page }) => {
    await page.click('#new-btn');
    await page.click('#open-choose');
    const download = await downloadFrom(page, '#open-menu sl-menu-item[value="csv-template"]');
    await expect(page.locator('#open-menu')).toBeHidden();
    expect(download.suggestedFilename()).toBe('nexus-template.csv');
    expect(readFileSync(await download.path(), 'utf8').split('\r\n')[0]).toBe(
      'Entity,Entity type,Bundle,Field,Machine name,Field type,Cardinality,Required,References,Help text,Default,Allowed values,Translatable',
    );

    await page.setInputFiles('#csv-open', { name: download.suggestedFilename(), mimeType: 'text/csv', buffer: readFileSync(await download.path()) });

    await waitForGraph(page);
    expect(await entityIds(page)).toEqual(['media.image', 'node.article', 'paragraph.hero', 'taxonomy_term.tags']);
    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Nexus template');
  });

  test('imports an exported CSV as the same fields and references', async ({ page }) => {
    await loadExample(page);
    const fields = await fieldIds(page);
    const refs = await refEdgeIds(page);

    const download = await saveFrom(page, 'csv');
    await page.setInputFiles('#csv-open', { name: 'example-content-model-fields.csv', mimeType: 'text/csv', buffer: readFileSync(await download.path()) });

    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Example content model');
    expect(await fieldIds(page)).toEqual(fields);
    expect(await refEdgeIds(page)).toEqual(refs);
  });

  test('lists the problems of a CSV that fails to import and keeps the landing screen open', async ({ page }) => {
    const text = [HEADER, 'node,article,Article,Body,,,0', 'node,article,Article,Tags,,,,maybe,Topics'].join('\n');

    await page.setInputFiles('#csv-open', csvFile('broken.csv', text));

    await expect(page.locator('#landing-error')).toHaveAttribute('open', '');
    await expect(page.locator('#landing-error-text')).toHaveText(
      [
        'Could not import broken.csv:',
        'Row 2: Cardinality “0” is not a number above 0, “1..n” or “unlimited”.',
        'Row 3: Required “maybe” is not “yes” or “no”.',
      ].join('\n'),
    );
    await expect(page.locator('#landing-error-text')).toBeInViewport();
    await expect(page.locator('#landing')).toBeVisible();
    await expect(page.locator('#landing-cancel')).toBeHidden();
  });

  test('keeps the open diagram when a CSV from the Open menu fails to import', async ({ page }) => {
    await loadExample(page);
    const before = await entityIds(page);

    await chooseFile(page, () => openFrom(page, 'csv'), csvFile('broken.csv', 'Field\nBody'));

    await expect(page.locator('#landing-error-text')).toContainText('The header row has no “Entity type” column.');
    await expect(page.locator('#landing-cancel')).toBeVisible();
    await page.click('#landing-cancel');
    expect(await entityIds(page)).toEqual(before);
  });
});
