import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitForGraph, loadExample, pickLevel } from './helpers.js';

test.describe('Hidden fields', { tag: '@runner-2' }, () => {
  // A reference field of the conference fixture to 2 media types, so it has 2
  // proxies.
  const EVENT_MEDIA = 'field:node.event:field_media';

  const MEDIA_SHOWN = { field: true, proxies: [true, true] };

  const MEDIA_HIDDEN = { field: false, proxies: [false, false] };

  function visibilityButton(page, id) {
    return page.locator('[data-field-visibility="' + id + '"]');
  }

  function goToButton(page, id) {
    return page.locator('[data-field-go-to="' + id + '"]');
  }

  // Whether a field and each of its proxies are drawn on the canvas.
  function fieldOnCanvas(page, id) {
    return page.evaluate((fieldId) => {
      const cy = window.__nexus.cy;
      const proxies = cy.nodes('[group="proxy"]').filter((proxy) => proxy.data('field') === fieldId);

      return { field: !cy.getElementById(fieldId).hasClass('hidden'), proxies: proxies.map((proxy) => !proxy.hasClass('hidden')) };
    }, id);
  }

  // The position of a field relative to its entity.
  function offsetFromEntity(page, id) {
    return page.evaluate((fieldId) => {
      const field = window.__nexus.cy.getElementById(fieldId);
      const entity = window.__nexus.cy.getElementById(field.data('entity'));

      return { x: field.position('x') - entity.position('x'), y: field.position('y') - entity.position('y') };
    }, id);
  }

  function isTraced(page, id) {
    return page.evaluate((fieldId) => window.__nexus.cy.getElementById(fieldId).hasClass('trace-source'), id);
  }

  async function hideEventMedia(page) {
    await loadExample(page);
    await page.click('#table-toggle');
    await visibilityButton(page, EVENT_MEDIA).click();
    await expect(visibilityButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Show Media on the canvas');
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('hides a field with its proxies from the Fields table and shows it again', async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');

    await expect(page.locator('#field-table thead th')).toHaveCount(10);
    await expect(visibilityButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Hide Media on the canvas');
    expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_SHOWN);

    await visibilityButton(page, EVENT_MEDIA).click();
    expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_HIDDEN);
    await expect(visibilityButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Show Media on the canvas');
    await expect(page.locator('#field-table tr.is-hidden-field')).toHaveCount(1);

    await visibilityButton(page, EVENT_MEDIA).click();
    expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_SHOWN);
    await expect(page.locator('#field-table tr.is-hidden-field')).toHaveCount(0);
  });

  test('goes to a field from the Fields table', async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');

    await expect(goToButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Go to Media on the canvas');
    await goToButton(page, EVENT_MEDIA).click();

    expect(await isTraced(page, EVENT_MEDIA)).toBe(true);
  });

  for (const [name, takeOff, title] of dataProviderFieldOffCanvas()) {
    test(`offers no go-to for a field off the canvas because of ${name}`, async ({ page }) => {
      await loadExample(page);
      await page.click('#table-toggle');
      await takeOff(page);

      await expect(goToButton(page, EVENT_MEDIA)).toHaveAttribute('title', title);
      await expect(goToButton(page, EVENT_MEDIA)).toHaveAttribute('aria-disabled', 'true');
      // Playwright refuses to click an aria-disabled button, so the click is
      // dispatched.
      await goToButton(page, EVENT_MEDIA).dispatchEvent('click');
      expect(await isTraced(page, EVENT_MEDIA)).toBe(false);
    });
  }

  function dataProviderFieldOffCanvas() {
    return [
      ['its own eye', (page) => visibilityButton(page, EVENT_MEDIA).click(), 'Show this field to go to it'],
      ['the Entities level', (page) => page.click('#detail-level'), 'Fields: Entities hides this field. Pick References to go to it'],
      [
        'its entity type filter',
        async (page) => {
          await page.click('#entities-toggle');
          await page.locator('#type-filters label', { hasText: 'Content type' }).locator('input').uncheck();
        },
        'Show its entity type to go to this field',
      ],
    ];
  }

  for (const [level, id, title] of dataProviderLevelHides()) {
    test(`names the ${level} level on the go-to button of ${id}`, async ({ page }) => {
      await loadExample(page);
      await page.click('#table-toggle');
      await pickLevel(page, level);

      await expect(goToButton(page, id)).toHaveAttribute('title', title);
      await expect(goToButton(page, id)).toHaveAttribute('aria-disabled', 'true');
    });
  }

  function dataProviderLevelHides() {
    return [
      ['entities', EVENT_MEDIA, 'Fields: Entities hides this field. Pick References to go to it'],
      ['entities', 'field:node.event:field_summary', 'Fields: Entities hides this field. Pick Configurable to go to it'],
      ['references', 'field:node.event:field_summary', 'Fields: References hides this field. Pick Configurable to go to it'],
      ['references', 'field:node.event:title', 'Fields: References hides this field. Pick All to go to it'],
      ['configurable', 'field:node.event:title', 'Fields: Configurable hides this field. Pick All to go to it'],
    ];
  }

  test('keeps a hidden field hidden at every level', async ({ page }) => {
    await hideEventMedia(page);

    for (const level of ['entities', 'references', 'configurable', 'all']) {
      await pickLevel(page, level);
      expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_HIDDEN);
      await expect(goToButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Show this field to go to it');
    }
  });

  test('keeps a hidden field beside its entity through a layout run', async ({ page }) => {
    await hideEventMedia(page);
    const before = await offsetFromEntity(page, EVENT_MEDIA);

    await page.click('#layout-run');

    expect(await offsetFromEntity(page, EVENT_MEDIA)).toEqual(before);
  });

  test('undoes and redoes hiding a field', async ({ page }) => {
    await hideEventMedia(page);
    await expect(page.locator('#undo')).toHaveAttribute('title', /Hid field “Media”/);

    await page.click('#undo');
    expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_SHOWN);
    await expect(visibilityButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Hide Media on the canvas');

    await page.click('#redo');
    expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_HIDDEN);
  });

  test('saves a hidden field and reopens it hidden', async ({ page }) => {
    await hideEventMedia(page);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
    const saved = await download.path();
    const doc = JSON.parse(readFileSync(saved, 'utf8'));
    const fields = doc.entities.flatMap((entity) =>
      entity.fields.map((field) => ({ id: 'field:' + entity.entityType + '.' + entity.bundle + ':' + field.name, hidden: field.hidden })),
    );
    expect(fields.filter((field) => field.hidden).map((field) => field.id)).toEqual([EVENT_MEDIA]);

    await page.goto('/index.html');
    await page.setInputFiles('#doc-open', saved);
    await waitForGraph(page);

    expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_HIDDEN);
  });
});
