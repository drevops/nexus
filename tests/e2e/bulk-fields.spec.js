import { test, expect } from '@playwright/test';
import { nodePositions, loadExample, slFill, slSelect, createEntity, tapNode, hasNode } from './helpers.js';

// The fields of an entity, each as its machine name, label, type,
// cardinality, required flag and reference targets, sorted by name.
function fieldDefinitions(page, entityId) {
  return page.evaluate(
    (id) =>
      window.__nexus.cy
        .nodes('[group="field"][entity="' + id + '"]')
        .map((field) => ({
          name: field.data('name'),
          label: field.data('label'),
          fieldType: field.data('fieldType'),
          cardinality: field.data('cardinality'),
          required: field.data('required'),
          targets: field
            .outgoers('edge[group="ref"]')
            .map((edge) => edge.target().id())
            .sort(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    entityId,
  );
}

// A new document in edit mode holding a Tags vocabulary and an Article, with
// the bulk fields form open on the Article.
async function openBulkFields(page) {
  await page.click('#new-btn');
  await page.click('#mode-build');
  await createEntity(page, 'taxonomy_term', 'tags', 'Tags');
  await createEntity(page, 'node', 'article', 'Article');
  await page.click('#inspector [data-bulk-fields]');
  await expect(page.locator('#inspector [data-new="bulk-fields"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('adds several fields to an entity in 1 step', async ({ page }) => {
  await openBulkFields(page);
  await expect(page.getByRole('textbox', { name: 'Fields, 1 per line' })).toBeFocused();
  await expect(page.locator('#inspector [data-create-fields]')).toHaveAttribute('disabled', '');

  await slFill(
    page,
    '#inspector [data-bulk-text]',
    'Body, text_with_summary\nfield_tags, entity_reference, unlimited, taxonomy_term.tags\nSubtitle (field_sub), required',
  );
  await expect(page.locator('#inspector .insp__bulkline')).toHaveCount(3);
  await expect(page.locator('#inspector [data-create-fields]')).toContainText('Add 3 fields');
  await page.click('#inspector [data-create-fields]');

  expect(await fieldDefinitions(page, 'node.article')).toEqual([
    { name: 'field_body', label: 'Body', fieldType: 'text_with_summary', cardinality: 1, required: false, targets: [] },
    { name: 'field_sub', label: 'Subtitle', fieldType: 'string', cardinality: 1, required: true, targets: [] },
    { name: 'field_tags', label: 'Tags', fieldType: 'entity_reference', cardinality: -1, required: false, targets: ['taxonomy_term.tags'] },
  ]);
  expect(await hasNode(page, 'proxy:field:node.article:field_tags>taxonomy_term.tags')).toBe(true);
  await expect(page.locator('#inspector .insp__field')).toHaveCount(3);
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Added 3 fields to entity “Article” \(/);

  await page.click('#undo');
  expect(await fieldDefinitions(page, 'node.article')).toEqual([]);
  expect(await hasNode(page, 'node.article')).toBe(true);
});

test('stacks fields added together in a column beside their entity', async ({ page }) => {
  await openBulkFields(page);
  await slFill(page, '#inspector [data-bulk-text]', 'One\nTwo\nThree');
  await page.click('#inspector [data-create-fields]');

  const positions = await nodePositions(page, '[group="field"]');
  const entity = (await nodePositions(page, '[id="node.article"]'))['node.article'];
  const column = ['field_one', 'field_two', 'field_three'].map((name) => positions['field:node.article:' + name]);

  expect(new Set(column.map((position) => position.x)).size).toBe(1);
  expect(column[0].x).toBeGreaterThan(entity.x);
  expect(column[0].y).toBeLessThan(column[1].y);
  expect(column[1].y).toBeLessThan(column[2].y);
  expect(column[1].y).toBe(entity.y);
});

test('lists why a bulk field line cannot be added and adds nothing', async ({ page }) => {
  await openBulkFields(page);
  await slFill(page, '#inspector [data-bulk-text]', 'Body\nTeaser, strnig\nbody (field_body)');

  const errors = page.locator('#inspector .insp__bulkline.is-error');
  await expect(errors).toHaveText([/^Line 2: “strnig” is not a field type/, 'Line 3: “field_body” is on an earlier line']);
  await expect(page.locator('#inspector [data-create-fields]')).toHaveAttribute('disabled', '');
  await expect(page.locator('#inspector [data-create-fields]')).toContainText('Fix 2 lines');

  await page.locator('#inspector [data-create-fields]').click({ force: true });
  expect(await fieldDefinitions(page, 'node.article')).toEqual([]);
});

test('copies the fields of another entity into the bulk fields form', async ({ page }) => {
  await openBulkFields(page);
  await slFill(page, '#inspector [data-bulk-text]', 'Body, text_long, required\nfield_tags, entity_reference, 3, taxonomy_term.tags\nfield_image, image');
  await page.click('#inspector [data-create-fields]');

  await createEntity(page, 'node', 'page', 'Page');
  await page.click('#inspector [data-add-field]');
  await page.fill('[data-new-name]', 'field_image');
  await page.click('[data-create-field]');
  await tapNode(page, 'node.page');
  await page.click('#inspector [data-bulk-fields]');

  // The Article is the only other entity with fields to copy.
  await expect(page.locator('#inspector [data-copy-from] sl-option')).toHaveText(['Article (3)']);
  await slSelect(page, '#inspector [data-copy-from]', 'node.article');
  await expect(page.locator('#inspector [data-bulk-text]')).toHaveJSProperty(
    'value',
    'Body (field_body), text_long, 1, required\nTags (field_tags), entity_reference, 3, taxonomy_term.tags',
  );
  await expect(page.locator('#inspector [data-copied]')).toHaveText('Copied 2 fields from Article, skipped 1 already listed or on this entity.');
  await page.click('#inspector [data-create-fields]');

  const copied = await fieldDefinitions(page, 'node.page');
  const article = await fieldDefinitions(page, 'node.article');
  expect(copied.filter((field) => field.name !== 'field_image')).toEqual(article.filter((field) => field.name !== 'field_image'));
  expect(copied.map((field) => field.name)).toEqual(['field_body', 'field_image', 'field_tags']);
});

test('copies fields after the lines already in the bulk fields form', async ({ page }) => {
  await openBulkFields(page);
  await slFill(page, '#inspector [data-bulk-text]', 'Body');
  await page.click('#inspector [data-create-fields]');
  await createEntity(page, 'node', 'page', 'Page');
  await page.click('#inspector [data-bulk-fields]');

  await slFill(page, '#inspector [data-bulk-text]', 'Intro\n');
  await slSelect(page, '#inspector [data-copy-from]', 'node.article');
  await expect(page.locator('#inspector [data-bulk-text]')).toHaveJSProperty('value', 'Intro\nBody (field_body), string, 1');

  // Copying again adds nothing, since the form already lists every field.
  await slSelect(page, '#inspector [data-copy-from]', 'node.article');
  await expect(page.locator('#inspector [data-bulk-text]')).toHaveJSProperty('value', 'Intro\nBody (field_body), string, 1');
  await expect(page.locator('#inspector [data-copied]')).toHaveText('Copied 0 fields from Article, skipped 1 already listed or on this entity.');
});

test('leaves base fields out when copying fields from another entity', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');

  const fields = await page.evaluate(() => {
    const kinds = (kind) =>
      window.__nexus.cy
        .nodes('[group="field"][entity="node.session"]')
        .filter((field) => (field.data('kind') === 'system') === (kind === 'system'))
        .map((field) => field.data('name'));

    return { base: kinds('system'), other: kinds('other') };
  });
  expect(fields.base.length).toBeGreaterThan(0);
  expect(fields.other.length).toBeGreaterThan(0);

  await tapNode(page, 'taxonomy_term.tracks');
  await page.click('#inspector [data-bulk-fields]');
  await expect(page.locator('#inspector [data-copy-from] sl-option[value="node.session"]')).toContainText('(' + fields.other.length + ')');
  await slSelect(page, '#inspector [data-copy-from]', 'node.session');

  const copied = await page.locator('#inspector [data-bulk-text]').evaluate((el) => el.value.split('\n').map((line) => line.match(/\(([a-z0-9_]+)\),/)[1]));
  expect(copied.sort()).toEqual([...fields.other].sort());
});

test('closes the bulk fields form when an undo removes its entity', async ({ page }) => {
  await openBulkFields(page);

  await page.evaluate(() => document.activeElement.blur());
  await page.click('#undo');

  expect(await hasNode(page, 'node.article')).toBe(false);
  await expect(page.locator('#inspector [data-new="bulk-fields"]')).toHaveCount(0);
});
