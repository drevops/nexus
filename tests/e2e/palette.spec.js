import { test, expect } from '@playwright/test';
import { loadExample, openSettings, slFill, slSelect, captionsOf } from './helpers.js';

test.describe('Palette', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('shows the edit palette as a second toolbar row only in edit mode', async ({ page }) => {
    await loadExample(page);

    const palette = page.locator('#build-tools');
    await expect(palette).toBeHidden();
    expect(await palette.evaluate((el) => el.classList.contains('toolbar__palette'))).toBe(true);
    expect(await palette.evaluate((el) => el.parentElement.classList.contains('toolbar'))).toBe(true);

    await page.click('#mode-build');
    await expect(palette).toBeVisible();
  });

  // The symbol each palette type button draws: its symbol key, the tag of the
  // shape and the colour the shape is filled with.
  function paletteSymbols(page) {
    const read = (buttons) =>
      buttons.map((btn) => {
        const span = btn.querySelector('.palette__symbol');
        const shape = span.querySelector('svg > *');

        return { type: btn.dataset.addEntity, symbol: span.dataset.symbol, shape: shape.tagName, fill: shape.getAttribute('fill') };
      });

    return page.locator('#build-tools [data-add-entity]').evaluateAll(read);
  }

  // The symbol and colour each Settings type row has picked, in row order.
  function settingsSymbols(page) {
    const read = (rows) =>
      rows.map((row) => ({
        type: row.dataset.typeRow,
        symbol: row.querySelector('sl-select[data-symbol]').value,
        fill: row.querySelector('sl-color-picker[data-color]').value,
      }));

    return page.locator('#settings [data-type-row]').evaluateAll(read);
  }

  async function paletteSymbolOf(page, type) {
    return (await paletteSymbols(page)).find((entry) => entry.type === type);
  }

  test('draws each palette type button with the symbol and colour Settings picked for its type', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await openSettings(page, 'types');

    const symbols = (await paletteSymbols(page)).map(({ type, symbol, fill }) => ({ type, symbol, fill }));

    // Shoelace defines the Settings controls after the dialog renders, and an
    // undefined control has no value yet.
    await expect.poll(() => settingsSymbols(page)).toEqual(symbols);
    expect(await paletteSymbolOf(page, 'paragraph')).toEqual({ type: 'paragraph', symbol: 'cut', shape: 'polygon', fill: '#cdbdec' });
    expect(await paletteSymbolOf(page, 'user')).toEqual({ type: 'user', symbol: 'ellipse', shape: 'ellipse', fill: '#ea9999' });
    await expect(page.locator('#add-paragraph .palette__symbol svg')).toBeVisible();
  });

  test('redraws a palette type button when Settings changes its colour or symbol and when they are reset', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await openSettings(page, 'types');

    await slFill(page, 'sl-color-picker[data-color="paragraph"]', '#112233');
    await expect.poll(() => paletteSymbolOf(page, 'paragraph')).toEqual({ type: 'paragraph', symbol: 'cut', shape: 'polygon', fill: '#112233' });

    await slSelect(page, 'sl-select[data-symbol="paragraph"]', 'ellipse');
    await expect.poll(() => paletteSymbolOf(page, 'paragraph')).toEqual({ type: 'paragraph', symbol: 'ellipse', shape: 'ellipse', fill: '#112233' });

    await page.click('#settings-reset');
    await expect.poll(() => paletteSymbolOf(page, 'paragraph')).toEqual({ type: 'paragraph', symbol: 'cut', shape: 'polygon', fill: '#cdbdec' });
  });

  test('draws the shape of each note on its palette button', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');

    for (const id of ['#add-event', '#add-api', '#add-callback', '#add-note']) {
      await expect(page.locator(id + ' svg.icon')).toBeVisible();
      expect(await page.locator(id + ' svg.icon').evaluate((svg) => svg.childElementCount)).toBeGreaterThan(0);
    }
  });

  test('adds an external entity from the palette', async ({ page }) => {
    await page.click('#new-btn');
    await page.click('#mode-build');

    await page.click('[data-add-entity="external"]');
    await expect(page.locator('[data-new="entity"] .insp__title')).toHaveText('New External entity');
    await expect(page.locator('[data-new="entity"] sl-option[value="external"]')).toHaveCount(1);
    await slFill(page, '[data-new-bundle]', 'crm_contact');
    await slFill(page, '[data-new-label]', 'CRM contact');
    await page.click('[data-create-entity]');

    // A hexagon is drawn as a 6-cornered polygon, so its ends keep their size.
    const shape = await page.evaluate(() => {
      const node = window.__nexus.cy.getElementById('external.crm_contact');

      return node.style('shape') + ' ' + node.style('shape-polygon-points').split(' ').length / 2;
    });
    expect(shape).toBe('polygon 6');
    expect(await captionsOf(page, 'external.crm_contact')).toEqual([
      { text: 'External entity', shown: true },
      { text: 'crm_contact', shown: true },
    ]);
  });

  test('names entities dropped from the palette after their type', async ({ page }) => {
    await page.click('#new-btn');
    await page.click('#mode-build');

    await page.dragAndDrop('[data-add-entity="node"]', '#cy', { targetPosition: { x: 200, y: 160 } });
    await page.dragAndDrop('[data-add-entity="external"]', '#cy', { targetPosition: { x: 420, y: 160 } });
    await page.waitForFunction(() => window.__nexus.cy.nodes('[group="entity"]').length === 2);

    const entities = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').map((node) => node.id() + ' ' + node.data('label')));
    expect(entities.sort()).toEqual(['external.external_entity_1 External Entity 1', 'node.content_type_1 Content Type 1']);
  });

  test('adds an entity from a palette type button', async ({ page }) => {
    await page.click('#new-btn');
    await page.click('#mode-build');

    await page.click('[data-add-entity="media"]');
    await expect(page.locator('[data-new="entity"]')).toBeVisible();
    await slFill(page, '[data-new-bundle]', 'photo');
    await page.click('[data-create-entity]');

    expect(await page.evaluate(() => window.__nexus.cy.getElementById('media.photo').length)).toBe(1);
  });

  test('adds a field from the toolbar field tool', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');

    await page.click('#add-field');
    await expect(page.locator('[data-new="field"]')).toBeVisible();
    await slSelect(page, '[data-new-entity]', 'node.event');
    await page.fill('[data-new-name]', 'field_tagline');
    await page.click('[data-create-field]');

    expect(await page.evaluate(() => window.__nexus.cy.getElementById('field:node.event:field_tagline').length)).toBe(1);
  });

  test('places a note anywhere on the canvas', async ({ page }) => {
    await page.click('#new-btn');
    await page.click('#mode-build');

    await page.click('[data-add-note="event"]');
    const box = await page.locator('#cy').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await page.waitForFunction(() => window.__nexus.cy.nodes('[group="annotation"]').length === 1);
    expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="annotation"]').first().data('kind'))).toBe('event');
  });

  test('drags a note from the palette onto the canvas', async ({ page }) => {
    await page.click('#new-btn');
    await page.click('#mode-build');

    await page.dragAndDrop('[data-add-note="api"]', '#cy', { targetPosition: { x: 220, y: 160 } });

    await page.waitForFunction(() => window.__nexus.cy.nodes('[group="annotation"]').length === 1);
    expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="annotation"]').first().data('kind'))).toBe('api');
  });

  test('drags an entity type from the palette onto the canvas', async ({ page }) => {
    await page.click('#new-btn');
    await page.click('#mode-build');

    await page.dragAndDrop('[data-add-entity="paragraph"]', '#cy', { targetPosition: { x: 280, y: 220 } });

    await page.waitForFunction(() => window.__nexus.cy.nodes('[group="entity"][entityType="paragraph"]').length === 1);
    expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').length)).toBe(1);
  });

  // The ids of the visible nodes whose boxes overlap the box of a node.
  function overlapsOf(page, id) {
    return page.evaluate((nodeId) => {
      const cy = window.__nexus.cy;
      const node = cy.getElementById(nodeId);
      const box = node.boundingBox();
      const overlapping = cy
        .nodes(':visible')
        .not(node)
        .filter((other) => {
          const o = other.boundingBox();

          return o.x1 < box.x2 && box.x1 < o.x2 && o.y1 < box.y2 && box.y1 < o.y2;
        });

      return overlapping.map((other) => other.id());
    }, id);
  }

  test('places an entity created from a palette button clear of the entity at the centre of the view', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await page.evaluate(() => window.__nexus.cy.center(window.__nexus.cy.getElementById('node.event')));

    await page.click('[data-add-entity="media"]');
    await slFill(page, '[data-new-bundle]', 'photo');
    await page.click('[data-create-entity]');

    expect(await overlapsOf(page, 'media.photo')).toEqual([]);
    expect(await page.evaluate(() => window.__nexus.cy.getElementById('media.photo').visible())).toBe(true);
  });
});
