import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { nodePositions, waitForGraph, loadExample, slSelect, eventLayout } from './helpers.js';

async function openSettings(page) {
  if (!(await page.locator('#settings').isVisible())) {
    await page.click('#settings-toggle');
  }

  await expect(page.locator('#settings [data-default="layout"]')).toBeVisible();
}

// Turns a new diagram switch in the Settings panel on or off.
async function setDefaultSwitch(page, key, checked) {
  const control = page.locator('#settings [data-default="' + key + '"]');

  if ((await control.evaluate((el) => el.checked)) !== checked) {
    await control.click();
  }

  await expect(control).toHaveJSProperty('checked', checked);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

// Each case sets 1 new diagram setting, then checks a diagram drawn after a
// reload.
for (const [name, set, check] of dataProviderDiagramDefaults()) {
  test(`opens the next diagram with ${name} from the Settings panel`, async ({ page }) => {
    await loadExample(page);
    await openSettings(page);
    await set(page);

    await page.reload();
    await loadExample(page);

    await check(page);
  });
}

function dataProviderDiagramDefaults() {
  return [
    [
      'the LR layout',
      (page) => slSelect(page, '#settings [data-default="layout"]', 'lr'),
      async (page) => {
        await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: LR');
        expect(await eventLayout(page)).toEqual({ right: true, below: false, turn: 'horizontal' });
      },
    ],
    [
      'Fields off',
      (page) => setDefaultSwitch(page, 'fields', false),
      async (page) => {
        await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', false);
        expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="field"]:visible').length)).toBe(0);
      },
    ],
    [
      'Proxies off',
      (page) => setDefaultSwitch(page, 'proxies', false),
      async (page) => {
        await expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', false);
        expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="proxy"]:visible').length)).toBe(0);
      },
    ],
    [
      'Machine names off',
      (page) => setDefaultSwitch(page, 'machineNames', false),
      async (page) => {
        await expect(page.locator('#machine-names')).toHaveJSProperty('checked', false);
        await expect(page.locator('#captions .caption:not(.caption--type)')).toHaveCount(0);
      },
    ],
    [
      'Edit mode',
      (page) => slSelect(page, '#settings [data-default="mode"]', 'edit'),
      async (page) => {
        await expect(page.locator('#mode-build')).toHaveClass(/is-active/);
        await expect(page.locator('#build-tools')).toBeVisible();
      },
    ],
  ];
}

test('opens each new diagram in the default mode, whatever mode the last one was in', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  await expect(page.locator('#mode-build')).toHaveClass(/is-active/);

  await page.click('#doc-new');

  await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'New content model');
  await expect(page.locator('#mode-view')).toHaveClass(/is-active/);
  await expect(page.locator('#build-tools')).toBeHidden();
});

test('opens the next diagram with Fields on when it opens in Edit mode', async ({ page }) => {
  await loadExample(page);
  await openSettings(page);
  await setDefaultSwitch(page, 'fields', false);
  await slSelect(page, '#settings [data-default="mode"]', 'edit');

  await page.reload();
  await loadExample(page);

  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
});

test('opens a saved diagram where it was saved, with the display settings for new diagrams', async ({ page }) => {
  await loadExample(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const saved = await download.path();
  const doc = JSON.parse(readFileSync(saved, 'utf8'));
  await openSettings(page);
  await setDefaultSwitch(page, 'fields', false);

  await page.goto('/index.html');
  await page.setInputFiles('#doc-open', saved);
  await waitForGraph(page);

  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', false);
  const positions = await nodePositions(page, '[group="entity"]');
  expect(Object.keys(positions).length).toBeGreaterThan(0);
  expect(positions).toEqual(Object.fromEntries(Object.keys(positions).map((id) => [id, doc.layout[id]])));
});

test('restores the new diagram settings with Reset to defaults', async ({ page }) => {
  await loadExample(page);
  await openSettings(page);
  await slSelect(page, '#settings [data-default="layout"]', 'tb');
  await setDefaultSwitch(page, 'fields', false);

  await page.click('#settings-reset');

  await expect(page.locator('#settings [data-default="layout"]')).toHaveJSProperty('value', 'columns');
  await expect(page.locator('#settings [data-default="fields"]')).toHaveJSProperty('checked', true);

  await page.reload();
  await loadExample(page);

  await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: Columns');
  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
});
