import { test, expect } from '@playwright/test';
import { TEMPLATES } from '../../src/templates.js';
import { CHECK_DEFAULTS } from '../../src/model-checks.js';
import { CHECKS_DOC, buildEntities, openDocument, selectedNodes, slFill, waitForGraph, activeLevel, stepLevel } from './helpers.js';

const TAGS_FIELD = 'field:node.article:field_tags';

test.describe('Checks', { tag: '@runner-2' }, () => {
  // The problems the panel lists, by level, each as its message.
  function listedProblems(page) {
    return page
      .locator('#checks .checks__group')
      .evaluateAll((groups) =>
        groups.map((group) => [group.dataset.level, [...group.querySelectorAll('.checks__message')].map((message) => message.textContent)]),
      );
  }

  function badge(page) {
    return page.locator('#checks-toggle .checks-badge');
  }

  function hasClass(page, id, name) {
    return page.evaluate(([nodeId, className]) => window.__nexus.cy.getElementById(nodeId).hasClass(className), [id, name]);
  }

  async function openChecks(page, doc) {
    await openDocument(page, doc);
    await page.click('#checks-toggle');
    await expect(page.locator('#checks')).toBeVisible();
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('lists the problems grouped by level, with their count on the toolbar button', async ({ page }) => {
    await openChecks(page, CHECKS_DOC);

    expect(await listedProblems(page)).toEqual([
      ['error', ['field_tags on “Article” references no entity']],
      ['warning', ['No field references the paragraph type “Hero”', 'field_size on “Article” is a list with no allowed values']],
    ]);
    await expect(page.locator('#checks [data-level="error"] .checks__count')).toHaveText('1');
    await expect(page.locator('#checks [data-level="warning"] .checks__count')).toHaveText('2');
    await expect(badge(page)).toBeVisible();
    await expect(badge(page)).toHaveText('3');
    await expect(badge(page)).toHaveAttribute('data-level', 'error');
    await expect(badge(page)).toHaveAttribute('title', '1 error and 2 warnings');
  });

  test('colours the badge as a warning when the model has no errors', async ({ page }) => {
    const doc = structuredClone(CHECKS_DOC);
    doc.entities[0].fields[0] = { name: 'field_body', label: 'Body', fieldType: 'text_long', kind: 'single' };

    await openChecks(page, doc);

    await expect(badge(page)).toHaveText('2');
    await expect(badge(page)).toHaveAttribute('data-level', 'warning');
    await expect(badge(page)).toHaveAttribute('title', '0 errors and 2 warnings');
  });

  test('says when the model has no problems and hides the badge', async ({ page }) => {
    const doc = {
      nexus: 1,
      title: 'Sound',
      entities: [
        { entityType: 'node', bundle: 'page', label: 'Page', fields: [{ name: 'field_body', label: 'Body', fieldType: 'text_long', kind: 'single' }] },
      ],
    };

    await openChecks(page, doc);

    await expect(page.locator('#checks .checks-empty')).toHaveText('No problems found.');
    await expect(page.locator('#checks .checks__item')).toHaveCount(0);
    await expect(badge(page)).toBeHidden();
  });

  test('opens and closes with its shortcut', async ({ page }) => {
    await openDocument(page, CHECKS_DOC);

    await page.keyboard.press('5');
    await expect(page.locator('#checks')).toBeVisible();
    await expect(page.locator('#checks-toggle')).toHaveClass(/is-active/);

    await page.keyboard.press('5');
    await expect(page.locator('#checks')).toHaveCount(0);
  });

  test('focuses the field a problem is on', async ({ page }) => {
    await openChecks(page, CHECKS_DOC);

    await page.click(`#checks [data-check-id="${TAGS_FIELD}"]`);

    await expect.poll(() => hasClass(page, TAGS_FIELD, 'faded')).toBe(false);
    expect(await hasClass(page, TAGS_FIELD, 'trace-source')).toBe(true);
    expect(await hasClass(page, 'paragraph.hero', 'faded')).toBe(true);
  });

  test('focuses the entity of a field the canvas does not show', async ({ page }) => {
    await openChecks(page, CHECKS_DOC);
    await stepLevel(page);
    await expect(activeLevel(page)).toHaveAttribute('data-level', 'entities');

    await page.click(`#checks [data-check-id="${TAGS_FIELD}"]`);

    await expect.poll(() => hasClass(page, 'node.article', 'faded')).toBe(false);
    expect(await hasClass(page, 'paragraph.hero', 'faded')).toBe(true);
  });

  test('says how to reach a problem on an entity of a hidden type, and goes nowhere until it is shown', async ({ page }) => {
    const hero = page.locator('#checks [data-check-id="paragraph.hero"]');
    const paragraphs = page.locator('#type-filters label', { hasText: 'Paragraph' }).locator('input');
    await openChecks(page, CHECKS_DOC);
    await page.click('#entities-toggle');

    await paragraphs.uncheck();
    await expect(hero).toHaveAttribute('aria-disabled', 'true');
    await expect(hero).toHaveAttribute('title', 'Paragraph, media or block type no field references. Show its entity type to go to it');
    // Playwright clicks an aria-disabled button only when forced.
    await hero.click({ force: true });
    expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBe(0);

    await paragraphs.check();
    await expect(hero).not.toHaveAttribute('aria-disabled');
    await hero.click();
    await expect.poll(() => hasClass(page, 'paragraph.hero', 'faded')).toBe(false);
    expect(await hasClass(page, 'node.article', 'faded')).toBe(true);
  });

  test('opens the Inspector on the node a problem is on in Edit mode', async ({ page }) => {
    await openChecks(page, CHECKS_DOC);
    await page.click('#mode-build');

    await page.click(`#checks [data-check-id="${TAGS_FIELD}"]`);

    await expect(page.locator('#inspector')).toBeVisible();
    await expect.poll(() => selectedNodes(page)).toEqual([TAGS_FIELD]);

    await page.click('#checks [data-check-id="paragraph.hero"]');
    await expect.poll(() => selectedNodes(page)).toEqual(['paragraph.hero']);
  });

  test('checks the model again after each edit, undo and redo', async ({ page }) => {
    await buildEntities(page, ['story']);
    await page.click('#checks-toggle');
    const noFields = ['warning', ['“STORY” has no fields of its own']];
    expect(await listedProblems(page)).toEqual([noFields]);

    await page.click('.handle--right');
    await expect(page.locator('#checks .checks-empty')).toBeVisible();
    await expect(badge(page)).toBeHidden();

    await page.click('#undo');
    await expect.poll(() => listedProblems(page)).toEqual([noFields]);
    await expect(badge(page)).toHaveText('1');

    await page.click('#redo');
    await expect(page.locator('#checks .checks-empty')).toBeVisible();
    await expect(badge(page)).toBeHidden();
  });

  test('takes the field limit from the Settings panel', async ({ page }) => {
    const limitWarning = '“Article” has 2 fields, more than the limit of 1';
    const input = page.locator('#settings [data-check-setting="fieldLimit"]');
    await openChecks(page, CHECKS_DOC);
    await page.click('#settings-toggle');
    await expect(input).toHaveJSProperty('value', String(CHECK_DEFAULTS.fieldLimit));

    await slFill(page, '#settings [data-check-setting="fieldLimit"]', '1');
    await expect(page.locator('#checks .checks__message', { hasText: limitWarning })).toHaveCount(1);
    await expect(badge(page)).toHaveText('4');

    await slFill(page, '#settings [data-check-setting="fieldLimit"]', '0');
    await expect(input).toHaveJSProperty('value', '1');
    await expect(page.locator('#checks .checks__message', { hasText: limitWarning })).toHaveCount(1);

    await page.click('#settings-reset');
    await expect(input).toHaveJSProperty('value', String(CHECK_DEFAULTS.fieldLimit));
    await expect(page.locator('#checks .checks__message', { hasText: limitWarning })).toHaveCount(0);
    await expect(badge(page)).toHaveText('3');
  });

  test('keeps the field limit for the next visit', async ({ page }) => {
    await openDocument(page, CHECKS_DOC);
    await page.click('#settings-toggle');
    await slFill(page, '#settings [data-check-setting="fieldLimit"]', '1');
    await expect(badge(page)).toHaveText('4');

    await page.reload();
    await openDocument(page, CHECKS_DOC);

    await expect(badge(page)).toHaveText('4');
  });

  for (const template of TEMPLATES) {
    test(`opens the ${template.label} template with no errors`, async ({ page }) => {
      await page.click('#template-' + template.id);
      await waitForGraph(page);
      await page.click('#checks-toggle');
      await expect(page.locator('#checks')).toBeVisible();

      await expect(page.locator('#checks [data-level="error"]')).toHaveCount(0);
      await expect(badge(page)).not.toHaveAttribute('data-level', 'error');
    });
  }
});
