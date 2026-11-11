import { test, expect } from '@playwright/test';
import { slFill, buildStoryWithField, tapNode } from './helpers.js';

function crumbs(page) {
  return page.locator('#inspector .insp__crumbs li').allTextContents();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

for (const [name, open, expected] of dataProviderEntityScreens()) {
  test(`leads ${name} back to its entity`, async ({ page }) => {
    await buildStoryWithField(page);
    await open(page);
    await expect(page.locator('#inspector .insp__crumbs li')).toHaveText(expected);
    await expect(page.locator('#inspector .insp__crumbs li[aria-current="page"]')).toHaveText(expected[1]);

    await page.click('#inspector [data-crumb="node.story"]');

    await expect(page.locator('#inspector .insp__title')).toHaveText('Entity');
    await expect(page.locator('#inspector [data-machine-name]')).toHaveJSProperty('value', 'story');
    await expect(page.locator('#inspector .insp__crumbs')).toHaveCount(0);
    await expect(page.locator('#handles .handle')).toHaveCount(4);
  });
}

function dataProviderEntityScreens() {
  return [
    ['a field’s inspector', async () => {}, ['Story', 'Field 1']],
    ['a new field opened from an entity', (page) => tapNode(page, 'node.story').then(() => page.click('#inspector [data-add-field]')), ['Story', 'New field']],
    ['the bulk fields form', (page) => tapNode(page, 'node.story').then(() => page.click('#inspector [data-bulk-fields]')), ['Story', 'Add fields']],
  ];
}

test('moves the focus into the entity form a crumb opens from the keyboard', async ({ page }) => {
  await buildStoryWithField(page);
  await page.locator('#inspector [data-crumb="node.story"]').focus();

  await page.keyboard.press('Enter');

  await expect(page.locator('#inspector .insp__title')).toHaveText('Entity');
  await expect(page.locator('#inspector .insp')).toBeFocused();
});

test('shows no breadcrumb on a screen with nothing above it', async ({ page }) => {
  await buildStoryWithField(page);

  await tapNode(page, 'node.story');
  await expect(page.locator('#inspector .insp__title')).toHaveText('Entity');
  expect(await crumbs(page)).toEqual([]);

  await page.click('#add-field');
  await expect(page.locator('#inspector [data-new="field"]')).toBeVisible();
  expect(await crumbs(page)).toEqual([]);

  await page.click('[data-add-entity="node"]');
  await expect(page.locator('#inspector [data-new="entity"]')).toBeVisible();
  expect(await crumbs(page)).toEqual([]);
});

test('relabels the breadcrumb with the field it shows', async ({ page }) => {
  await buildStoryWithField(page);

  await slFill(page, '#inspector sl-input:not([data-machine-name])', 'Subtitle');

  await expect(page.locator('#inspector .insp__crumbs li')).toHaveText(['Story', 'Subtitle']);
});
