import { test, expect } from '@playwright/test';
import { loadExample, slFill, openDiagram } from './helpers.js';

// The outline boxes of the Find entity field and its search button, with
// their border colours and their inner corner radii.
function findControl(page) {
  return page.evaluate(() => {
    const part = (id) => document.getElementById(id).shadowRoot.querySelector('[part~="base"]');
    const box = (element) => {
      const rect = element.getBoundingClientRect();

      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const field = getComputedStyle(part('search'));
    const button = getComputedStyle(part('search-btn'));

    return {
      field: box(part('search')),
      button: box(part('search-btn')),
      fieldBorder: field.borderTopColor,
      buttonBorder: button.borderTopColor,
      innerRadii: [field.borderTopRightRadius, field.borderBottomRightRadius, button.borderTopLeftRadius, button.borderBottomLeftRadius],
      group: document.getElementById('search').parentElement.getAttribute('role'),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

for (const theme of dataProviderFindThemes()) {
  test(`joins the Find entity field and its search button into 1 control in the ${theme} theme`, async ({ page }) => {
    await loadExample(page);

    if (theme === 'dark') {
      await page.click('#theme-toggle');
      await expect(page.locator('html')).toHaveClass(/sl-theme-dark/);
    }

    // Shoelace animates border colours, so they match only once the theme
    // change has finished.
    await expect
      .poll(async () => {
        const borders = await findControl(page);

        return borders.buttonBorder === borders.fieldBorder;
      })
      .toBe(true);
    const control = await findControl(page);

    expect(control.group).toBe('search');
    expect(control.button.left).toBeCloseTo(control.field.right - 1, 1);
    expect(control.button.top).toBeCloseTo(control.field.top, 1);
    expect(control.button.bottom).toBeCloseTo(control.field.bottom, 1);
    expect(control.innerRadii).toEqual(['0px', '0px', '0px', '0px']);
  });
}

function dataProviderFindThemes() {
  return ['light', 'dark'];
}

test('keeps the Find entity field and its search button on 1 line when the toolbar wraps', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await loadExample(page);

  const control = await findControl(page);

  expect(control.button.top).toBeCloseTo(control.field.top, 1);
  expect(control.button.left).toBeCloseTo(control.field.right - 1, 1);
});

test('searches on the button and zooms to the match at 100%', async ({ page }) => {
  await loadExample(page);
  await page.evaluate(() => window.__nexus.cy.zoom(0.2));

  // Typing does not search.
  await slFill(page, '#search', 'session');
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBe(0);

  // The button runs the search: it fades the rest and zooms to 100%.
  await page.click('#search-btn');
  await page.waitForFunction(() => Math.abs(window.__nexus.cy.zoom() - 1) < 0.01);
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBeGreaterThan(0);
});

const MAP = 'paragraph.civictheme_map';

// Where an entity with its visible fields sits once the view stops moving:
// whether it overlaps an open floating panel, whether it stays inside the
// canvas, and how far its centre is from the canvas centre.
function placement(page, id) {
  return page.evaluate((entityId) => {
    const cy = window.__nexus.cy;
    const canvas = cy.container().getBoundingClientRect();
    const fields = cy.nodes('[group="field"]').filter((field) => field.data('entity') === entityId);
    const rendered = cy.getElementById(entityId).union(fields).filter(':visible').renderedBoundingBox();
    const box = { x1: canvas.left + rendered.x1, y1: canvas.top + rendered.y1, x2: canvas.left + rendered.x2, y2: canvas.top + rendered.y2 };
    const panels = [...document.querySelectorAll('.stage__canvas > .panel')].map((panel) => panel.getBoundingClientRect());
    const overlaps = (rect) => box.x1 < rect.right && rect.left < box.x2 && box.y1 < rect.bottom && rect.top < box.y2;

    return {
      animating: cy.animated(),
      underPanel: panels.some(overlaps),
      inCanvas: box.x1 >= canvas.left && box.x2 <= canvas.right && box.y1 >= canvas.top && box.y2 <= canvas.bottom,
      offCentre: Math.round(Math.hypot((box.x1 + box.x2) / 2 - (canvas.left + canvas.right) / 2, (box.y1 + box.y2) / 2 - (canvas.top + canvas.bottom) / 2)),
    };
  }, id);
}

async function findEntity(page, term) {
  await slFill(page, '#search', term);
  await page.click('#search-btn');
}

test('centres the match of Find entity and its fields in the area the open panels leave free', async ({ page }) => {
  await openDiagram(page, 'civictheme');
  await page.click('#entities-toggle');
  await page.click('#table-toggle');
  await expect(page.locator('#table')).toBeVisible();

  await findEntity(page, 'civictheme_map');

  await expect
    .poll(async () => ({ ...(await placement(page, MAP)), offCentre: null }))
    .toEqual({ animating: false, underPanel: false, inCanvas: true, offCentre: null });
});

test('centres an entity focused from the Entities panel in the area the open panels leave free', async ({ page }) => {
  await openDiagram(page, 'civictheme');
  await page.click('#entities-toggle');
  await page.click('#table-toggle');
  await expect(page.locator('#table')).toBeVisible();

  await page.locator('#entity-list .entity-row__name', { hasText: /^Map/ }).click();

  await expect
    .poll(async () => ({ ...(await placement(page, MAP)), offCentre: null }))
    .toEqual({ animating: false, underPanel: false, inCanvas: true, offCentre: null });
});

test('centres the match of Find entity and its fields in the canvas when no panel is open', async ({ page }) => {
  await openDiagram(page, 'civictheme');
  await page.click('#legend-toggle');
  await expect(page.locator('.stage__canvas > .panel')).toHaveCount(0);

  await findEntity(page, 'civictheme_map');

  await expect.poll(() => placement(page, MAP)).toEqual({ animating: false, underPanel: false, inCanvas: true, offCentre: 0 });
});
