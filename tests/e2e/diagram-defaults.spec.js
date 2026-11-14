import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { nodePositions, waitForGraph, loadExample, slSelect, eventLayout, activeLevel } from './helpers.js';

test.describe('Diagram defaults', { tag: '@runner-1' }, () => {
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
        'the Entities level',
        (page) => slSelect(page, '#settings [data-default="level"]', 'entities'),
        async (page) => {
          await expect(activeLevel(page)).toHaveAttribute('data-level', 'entities');
          expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="field"]:visible').length)).toBe(0);
        },
      ],
      [
        'the Configurable level',
        (page) => slSelect(page, '#settings [data-default="level"]', 'configurable'),
        async (page) => {
          await expect(activeLevel(page)).toHaveAttribute('data-level', 'configurable');
          expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="field"][kind="system"]:visible').length)).toBe(0);
          expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="field"]:visible').length)).toBeGreaterThan(0);
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

  test('opens the next diagram at the All level instead of Entities when it opens in Edit mode', async ({ page }) => {
    await loadExample(page);
    await openSettings(page);
    await slSelect(page, '#settings [data-default="level"]', 'entities');
    await slSelect(page, '#settings [data-default="mode"]', 'edit');

    await page.reload();
    await loadExample(page);

    await expect(activeLevel(page)).toHaveAttribute('data-level', 'all');
  });

  test('keeps a level that shows fields when the next diagram opens in Edit mode', async ({ page }) => {
    await loadExample(page);
    await openSettings(page);
    await slSelect(page, '#settings [data-default="level"]', 'references');
    await slSelect(page, '#settings [data-default="mode"]', 'edit');

    await page.reload();
    await loadExample(page);

    await expect(activeLevel(page)).toHaveAttribute('data-level', 'references');
  });

  for (const [fields, label] of dataProviderStoredFieldsSwitch()) {
    test(`reads a stored Fields switch set to ${fields} as the ${label} level`, async ({ page }) => {
      await page.evaluate((value) => window.localStorage.setItem('nexusSettings', JSON.stringify({ newDiagrams: { fields: value, proxies: false } })), fields);
      await page.reload();
      await loadExample(page);

      await expect(activeLevel(page)).toHaveAttribute('data-level', label.toLowerCase());
      await expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', false);
      await openSettings(page);
      await expect(page.locator('#settings [data-default="level"]')).toHaveJSProperty('value', label.toLowerCase());
    });
  }

  function dataProviderStoredFieldsSwitch() {
    return [
      [true, 'All'],
      [false, 'Entities'],
    ];
  }

  test('opens a saved diagram where it was saved, with the display settings for new diagrams', async ({ page }) => {
    await loadExample(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
    const saved = await download.path();
    const doc = JSON.parse(readFileSync(saved, 'utf8'));
    await openSettings(page);
    await slSelect(page, '#settings [data-default="level"]', 'entities');

    await page.goto('/index.html');
    await page.setInputFiles('#doc-open', saved);
    await waitForGraph(page);

    await expect(activeLevel(page)).toHaveAttribute('data-level', 'entities');
    const positions = await nodePositions(page, '[group="entity"]');
    expect(Object.keys(positions).length).toBeGreaterThan(0);
    expect(positions).toEqual(Object.fromEntries(Object.keys(positions).map((id) => [id, doc.layout[id]])));
  });

  test('restores the new diagram settings with Reset to defaults', async ({ page }) => {
    await loadExample(page);
    await openSettings(page);
    await slSelect(page, '#settings [data-default="layout"]', 'tb');
    await slSelect(page, '#settings [data-default="level"]', 'entities');

    await page.click('#settings-reset');

    await expect(page.locator('#settings [data-default="layout"]')).toHaveJSProperty('value', 'columns');
    await expect(page.locator('#settings [data-default="level"]')).toHaveJSProperty('value', 'all');

    await page.reload();
    await loadExample(page);

    await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: Columns');
    await expect(activeLevel(page)).toHaveAttribute('data-level', 'all');
  });
});
