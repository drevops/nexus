import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'config-min');

function entityCount(page) {
  return page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').length);
}

async function waitForGraph(page) {
  await page.waitForFunction(() => window.__nexus && window.__nexus.cy.nodes('[group="entity"]').length > 0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('renders the bundled PBS example', async ({ page }) => {
  await expect(page.locator('#landing')).toBeVisible();
  await page.click('#example-btn');

  await expect(page.locator('#landing')).toBeHidden();
  await waitForGraph(page);

  expect(await entityCount(page)).toBe(30);
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.program').length)).toBe(1);
  await expect(page.locator('#diagram-title')).toHaveText('PBS content model');
});

test('parses an uploaded config folder in the browser', async ({ page }) => {
  await page.setInputFiles('#folder-input', FIXTURE_DIR);

  await expect(page.locator('#landing')).toBeHidden();
  await waitForGraph(page);

  // 2 node + 1 vocab + 1 media + 2 paragraph + the Any placeholder.
  expect(await entityCount(page)).toBe(7);
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.article').length)).toBe(1);
});

test('reveals fields, entity index and field table', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const overview = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);

  await page.click('#fields-toggle');
  await expect(page.locator('#fields-toggle')).toHaveText('Hide fields');
  const detailed = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);
  expect(detailed).toBeGreaterThan(overview);

  await page.click('#entities-toggle');
  await expect(page.locator('#entity-list .entity-row').first()).toBeVisible();

  await page.click('#table-toggle');
  await expect(page.locator('#field-table')).toContainText('References');
  await expect(page.locator('#field-table')).toContainText('field_media');
});

test('persists a custom entity colour across reloads', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#settings-toggle');
  await page.locator('input[data-color="paragraph"]').fill('#112233');

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')));
  expect(stored.colors.paragraph).toBe('#112233');

  await page.reload();
  await page.click('#example-btn');
  await waitForGraph(page);

  const applied = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="paragraph"]').style('background-color'));
  expect(applied.replace(/\s/g, '')).toBe('rgb(17,34,51)');
});

test('exports the diagram as PNG', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-png'),
  ]);
  expect(download.suggestedFilename()).toBe('content-model.png');
});

test('exports the diagram as PDF', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-pdf'),
  ]);
  expect(download.suggestedFilename()).toBe('content-model.pdf');
});
