import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openDocument, saveFrom, slFill, tapNode } from './helpers.js';

test.describe('Shared fields', { tag: '@runner-1' }, () => {
  function field(name, label, values = {}) {
    return { name, label, fieldType: 'string', kind: 'single', ...values };
  }

  // Tags on 3 content types, an image field on 2 of them and a near-duplicate
  // on the third, and a media type with an image field of the same name.
  const SHARED_DOC = {
    nexus: 1,
    title: 'Shared fields',
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'Article',
        fields: [field('title', 'Title', { kind: 'system' }), field('field_tags', 'Tags'), field('field_image', 'Image')],
      },
      { entityType: 'node', bundle: 'page', label: 'Page', fields: [field('field_tags', 'Topics'), field('field_main_image', 'Main image')] },
      { entityType: 'node', bundle: 'event', label: 'Event', fields: [field('field_tags', 'Tags'), field('field_image', 'Event image')] },
      { entityType: 'media', bundle: 'image', label: 'Image', fields: [field('field_image', 'Image')] },
    ],
  };

  function usedInCell(page, entityId, name) {
    return page.locator('#field-table tr:has([data-field-visibility="field:' + entityId + ':' + name + '"]) .field-table__used-in');
  }

  // The bundle count of each field, keyed by field id, with base fields as
  // empty text.
  function usedInCounts(page) {
    return page
      .locator('#field-table tbody tr:has([data-field-visibility])')
      .evaluateAll((rows) =>
        Object.fromEntries(
          rows.map((row) => [row.querySelector('[data-field-visibility]').dataset.fieldVisibility, row.querySelector('.field-table__used-in').textContent]),
        ),
      );
  }

  // The machine names of the Article's rows, in table order.
  function articleRows(page) {
    return page.locator('#field-table tbody tr:has([data-field-visibility^="field:node.article:"]) code').allTextContents();
  }

  function sharedBundles(page) {
    return page
      .locator('#inspector [data-shared-bundle]')
      .evaluateAll((buttons) => buttons.map((b) => [b.dataset.sharedBundle, b.textContent.replace(/\s+/g, ' ').trim()]));
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('counts the bundles of the entity type that use each field', async ({ page }) => {
    await openDocument(page, SHARED_DOC);
    await page.click('#table-toggle');

    await expect(page.locator('#field-table th.field-table__col--usedIn')).toHaveText('Used in');
    expect(await usedInCounts(page)).toEqual({
      'field:node.article:title': '',
      'field:node.article:field_tags': '3',
      'field:node.article:field_image': '2',
      'field:node.page:field_tags': '3',
      'field:node.page:field_main_image': '1',
      'field:node.event:field_tags': '3',
      'field:node.event:field_image': '2',
      'field:media.image:field_image': '1',
    });
    await expect(usedInCell(page, 'node.article', 'field_tags').locator('span')).toHaveAttribute('title', 'Used in 3 bundles: Article, Event, Page');
    await expect(usedInCell(page, 'media.image', 'field_image').locator('span')).toHaveAttribute('title', 'Used in 1 bundle: Image');
  });

  test('sorts the fields by the bundles that use them, with base fields last', async ({ page }) => {
    await openDocument(page, SHARED_DOC);
    await page.click('#table-toggle');

    const header = page.locator('#field-table [data-sort="usedIn"]');
    await expect(header).toHaveAttribute('title', 'Sort by used in, ascending');

    await header.click();
    expect(await articleRows(page)).toEqual(['field_image', 'field_tags', 'title']);

    await header.click();
    expect(await articleRows(page)).toEqual(['field_tags', 'field_image', 'title']);
  });

  test('exports the bundle count of each field in the CSV', async ({ page }) => {
    await openDocument(page, SHARED_DOC);

    const download = await saveFrom(page, 'csv');
    const lines = readFileSync(await download.path(), 'utf8').split('\r\n');

    expect(lines[0]).toBe(
      'Entity,Entity type,Bundle,Field,Machine name,Field type,Cardinality,Required,References,Used in,Help text,Default,Allowed values,Translatable',
    );
    expect(lines).toContain('Article,Content type,article,Title,title,string,1,no,,,,,,');
    expect(lines).toContain('Article,Content type,article,Tags,field_tags,string,1,no,,3,,,,');
    expect(lines).toContain('Page,Content type,page,Main image,field_main_image,string,1,no,,1,,,,');
  });

  test('updates the counts after a field is added, renamed or removed, and after undo and redo', async ({ page }) => {
    await openDocument(page, SHARED_DOC);
    await page.click('#mode-build');
    await page.click('#table-toggle');
    const imageCount = usedInCell(page, 'node.article', 'field_image');
    await expect(imageCount).toHaveText('2');

    await tapNode(page, 'field:node.page:field_main_image');
    await slFill(page, '#inspector sl-input[data-machine-name]', 'field_image');
    await expect(imageCount).toHaveText('3');

    await page.click('#undo');
    await expect(imageCount).toHaveText('2');
    await page.click('#redo');
    await expect(imageCount).toHaveText('3');

    await tapNode(page, 'field:node.event:field_image');
    await page.click('#inspector .insp__delete');
    await expect(imageCount).toHaveText('2');

    await tapNode(page, 'node.event');
    await page.click('#inspector [data-add-field]');
    await page.fill('[data-new-name]', 'field_image');
    await page.click('[data-create-field]');
    await expect(imageCount).toHaveText('3');

    await page.click('#undo');
    await expect(imageCount).toHaveText('2');
  });

  test('lists the other bundles that share a field in the Inspector and opens them', async ({ page }) => {
    await openDocument(page, SHARED_DOC);
    await page.click('#mode-build');

    await tapNode(page, 'field:node.article:field_tags');
    await expect(page.locator('#inspector [data-shared-with] .insp__sectionhead')).toHaveText('Also used in');
    expect(await sharedBundles(page)).toEqual([
      ['node.event', 'Event Tags'],
      ['node.page', 'Page Topics'],
    ]);
    await expect(page.locator('#inspector [data-shared-bundle="node.page"]')).toHaveAttribute('title', 'Open Page, which labels this field Topics');

    await page.click('#inspector [data-shared-bundle="node.page"]');
    await expect(page.locator('#inspector .insp__title')).toHaveText('Entity');
    await expect(page.locator('#inspector sl-input[data-machine-name]')).toHaveJSProperty('value', 'page');
    await expect(page.locator('#inspector .insp')).toBeFocused();

    await tapNode(page, 'field:node.page:field_main_image');
    await expect(page.locator('#inspector [data-shared-with]')).toContainText('No other bundle has this field.');
    expect(await sharedBundles(page)).toEqual([]);

    await tapNode(page, 'field:media.image:field_image');
    await expect(page.locator('#inspector [data-shared-with]')).toContainText('No other bundle has this field.');

    await tapNode(page, 'field:node.article:title');
    await expect(page.locator('#inspector .insp__title')).toHaveText('Field');
    await expect(page.locator('#inspector [data-shared-with]')).toHaveCount(0);
  });
});
