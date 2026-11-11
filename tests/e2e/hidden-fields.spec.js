import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitForGraph, loadExample } from './helpers.js';

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

  await expect(page.locator('#field-table thead th')).toHaveCount(7);
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
    ['the Fields switch', (page) => page.click('#fields-toggle'), 'Turn on Fields to go to this field'],
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

test('keeps a hidden field hidden when the Fields switch turns back on', async ({ page }) => {
  await hideEventMedia(page);

  await page.click('#fields-toggle');
  await page.click('#fields-toggle');

  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
  expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_HIDDEN);
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
