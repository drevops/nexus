import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { loadExample, pickLevel, saveFrom, selectTrackField, slSelect, tapNode, TRACK_FIELD, activeLevel, stepLevel } from './helpers.js';

// The fields and edges the canvas shows, and the fields each level should
// show, worked out from each field's kind and type in the browser.
function canvasState(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const fields = cy.nodes('[group="field"]');
    const isReference = (field) => ['entity_reference', 'entity_reference_revisions'].includes(field.data('fieldType'));
    const ids = (nodes) => nodes.map((node) => node.id()).sort();
    const shownFieldIds = new Set(fields.filter(':visible').map((field) => field.id()));

    return {
      shown: ids(fields.filter(':visible')),
      expected: {
        entities: [],
        references: ids(fields.filter((field) => field.data('kind') !== 'system' && isReference(field))),
        configurable: ids(fields.filter((field) => field.data('kind') !== 'system')),
        all: ids(fields),
      },
      entities: cy.nodes('[group="entity"]:visible').length,
      allEntities: cy.nodes('[group="entity"]').length,
      collapsed: cy.edges('[group="collapsed"]:visible').length,
      has: cy.edges('[group="has"]:visible').length,
      strayProxies: cy.nodes('[group="proxy"]:visible').filter((proxy) => !shownFieldIds.has(proxy.data('field'))).length,
      proxies: cy.nodes('[group="proxy"]:visible').length,
    };
  });
}

test.describe('Display switches', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('shows every field by default and collapses to an overview', async ({ page }) => {
    await loadExample(page);

    await expect(activeLevel(page)).toHaveAttribute('data-level', 'all');
    await expect(page.locator('#machine-names')).toHaveJSProperty('checked', true);
    expect(await page.locator('#captions .caption').count()).toBeGreaterThan(0);
    const detailed = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);

    await stepLevel(page);
    await expect(activeLevel(page)).toHaveAttribute('data-level', 'entities');
    const overview = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);
    expect(overview).toBeLessThan(detailed);

    await page.click('#entities-toggle');
    await expect(page.locator('#entity-list .entity-row').first()).toBeVisible();

    await page.click('#table-toggle');
    await expect(page.locator('#field-table')).toContainText('Machine name');
    await expect(page.locator('#field-table')).toContainText('field_media');
  });

  for (const [level, label] of dataProviderLevels()) {
    test(`shows exactly the fields of the ${label} level`, async ({ page }) => {
      await loadExample(page);
      await pickLevel(page, level);

      await expect(activeLevel(page)).toHaveCount(1);
      await expect(activeLevel(page)).toHaveAttribute('data-level', level);
      await expect(page.locator('#detail-levels [data-level="' + level + '"]')).toHaveAttribute('aria-pressed', 'true');

      const state = await canvasState(page);
      expect(state.shown).toEqual(state.expected[level]);
      expect(state.entities).toBe(state.allEntities);
      expect(state.strayProxies).toBe(0);

      if (level === 'entities') {
        expect(state.collapsed).toBeGreaterThan(0);
        expect(state.has).toBe(0);
        expect(state.proxies).toBe(0);
      } else {
        expect(state.collapsed).toBe(0);
        expect(state.has).toBe(state.shown.length);
        expect(state.proxies).toBeGreaterThan(0);
      }
    });
  }

  function dataProviderLevels() {
    return [
      ['entities', 'Entities'],
      ['references', 'References'],
      ['configurable', 'Configurable'],
      ['all', 'All'],
    ];
  }

  test('tells the levels apart in the conference diagram', async ({ page }) => {
    await loadExample(page);

    const { expected } = await canvasState(page);
    expect(expected.references.length).toBeGreaterThan(0);
    expect(expected.configurable.length).toBeGreaterThan(expected.references.length);
    expect(expected.all.length).toBeGreaterThan(expected.configurable.length);
  });

  test('cycles the levels with F, the group titled with the level it moves to', async ({ page }) => {
    await loadExample(page);
    const group = page.locator('#detail-levels');

    for (const [level, next] of [
      ['all', 'Entities'],
      ['entities', 'References'],
      ['references', 'Configurable'],
      ['configurable', 'All'],
    ]) {
      await expect(activeLevel(page)).toHaveAttribute('data-level', level);
      await expect(group).toHaveAttribute('title', 'Switch to the next detail level: ' + next);
      await page.keyboard.press('f');
    }

    await expect(activeLevel(page)).toHaveAttribute('data-level', 'all');
    await stepLevel(page);
    await expect(activeLevel(page)).toHaveAttribute('data-level', 'entities');
  });

  test('offers an icon button for every level, titled with its name and what it shows', async ({ page }) => {
    await loadExample(page);

    const buttons = await page
      .locator('#detail-levels [data-level]')
      .evaluateAll((elements) => elements.map((el) => [el.dataset.level, el.getAttribute('aria-label'), el.title, el.querySelectorAll('svg.icon').length]));

    expect(buttons.map(([level, label]) => [level, label])).toEqual(dataProviderLevels());
    buttons.forEach(([, label, title, icons]) => {
      expect(title.startsWith(label + ': ')).toBe(true);
      expect(icons).toBe(1);
    });
    await expect(activeLevel(page)).toHaveCount(1);
    await expect(activeLevel(page)).toHaveAttribute('data-level', 'all');
  });

  test('leaves the level alone when its own button is clicked again', async ({ page }) => {
    await loadExample(page);
    const before = await page.evaluate(() => window.__nexus.cy.getElementById('node.session').position());

    await page.click('#detail-levels [data-level="all"]');

    await expect(activeLevel(page)).toHaveAttribute('data-level', 'all');
    expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.session').position())).toEqual(before);
  });

  test('re-runs the layout at each level', async ({ page }) => {
    await loadExample(page);
    const session = () => page.evaluate(() => window.__nexus.cy.getElementById('node.session').position());

    const before = await session();
    await pickLevel(page, 'entities');
    const overview = await session();
    expect(overview).not.toEqual(before);

    await pickLevel(page, 'references');
    expect(await session()).not.toEqual(overview);
  });

  test('records no history step and saves no level', async ({ page }) => {
    await loadExample(page);

    for (const level of ['entities', 'references', 'configurable']) {
      await pickLevel(page, level);
    }
    await stepLevel(page);

    await expect(page.locator('#undo')).toHaveAttribute('disabled', '');

    const download = await saveFrom(page, 'json');
    const saved = await readFile(await download.path(), 'utf8');
    expect(saved).not.toContain('"level"');
    expect(saved).not.toContain('configurable');
  });

  test('turns the Entities level to References when proxies go on', async ({ page }) => {
    await loadExample(page);
    await pickLevel(page, 'entities');
    await page.click('#proxy-toggle');
    await expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', false);

    await page.click('#proxy-toggle');

    await expect(activeLevel(page)).toHaveAttribute('data-level', 'references');
    const state = await canvasState(page);
    expect(state.shown).toEqual(state.expected.references);
    expect(state.proxies).toBeGreaterThan(0);
  });

  test('turns the Entities level to All on entering Edit mode and keeps a level that shows fields', async ({ page }) => {
    await loadExample(page);
    await pickLevel(page, 'entities');

    await page.click('#mode-build');
    await expect(activeLevel(page)).toHaveAttribute('data-level', 'all');

    await page.click('#mode-view');
    await pickLevel(page, 'configurable');
    await page.click('#mode-build');
    await expect(activeLevel(page)).toHaveAttribute('data-level', 'configurable');
  });

  test('moves to a level that shows a field created in Edit mode', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await pickLevel(page, 'references');
    await tapNode(page, 'node.session');
    await expect(page.locator('.handle--right')).toBeVisible();
    const sessionFields = () =>
      page.evaluate(() => window.__nexus.cy.nodes('[group="field"][entity="node.session"][kind!="system"]').map((field) => field.visible()));
    const before = await sessionFields();

    await page.click('.handle--right');

    await expect(activeLevel(page)).toHaveAttribute('data-level', 'configurable');
    expect(await sessionFields()).toEqual(Array(before.length + 1).fill(true));
    await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Added field/);
  });

  test('moves to a level that shows a field whose type the Inspector changes', async ({ page }) => {
    await selectTrackField(page);
    await pickLevel(page, 'references');

    await slSelect(page, '#inspector sl-select[title="The field type"]', 'string');

    await expect(activeLevel(page)).toHaveAttribute('data-level', 'configurable');
    expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).visible(), TRACK_FIELD)).toBe(true);
  });

  test('applies the level to a field retyped after the level was picked', async ({ page }) => {
    await loadExample(page);
    await pickLevel(page, 'references');
    const field = 'field:node.session:field_track';

    expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).visible(), field)).toBe(true);
    await page.evaluate((id) => window.__nexus.cy.getElementById(id).data('fieldType', 'string'), field);
    expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).visible(), field)).toBe(false);
  });

  test('puts the display controls at the left end of the status bar', async ({ page }) => {
    await loadExample(page);

    const parts = await page.evaluate(() => [...document.querySelector('#statusbar').children].map((el) => el.id || el.className));
    expect(parts).toEqual(['statusbar__display', 'explore-bar', 'statusbar-hint', 'statusbar__zoom']);

    const controls = await page.evaluate(() =>
      [...document.querySelectorAll('.statusbar__display > *')].map((el) => [el.tagName.toLowerCase(), el.id || el.className, el.dataset.shortcut]),
    );
    expect(controls).toEqual([
      ['sl-button-group', 'detail-levels', 'F'],
      ['sl-switch', 'proxy-toggle', 'P'],
      ['sl-switch', 'machine-names', 'M'],
    ]);
    await expect(page.locator('#detail-levels')).toHaveAttribute('data-shortcut', 'F');
    await expect(page.locator('.toolbar sl-switch, .toolbar #detail-levels, .toolbar #proxy-toggle, .toolbar #machine-names')).toHaveCount(0);
  });

  test('keeps the switches in place as the level label changes', async ({ page }) => {
    await loadExample(page);
    const left = () => page.locator('#proxy-toggle').evaluate((el) => el.getBoundingClientRect().left);
    const start = await left();

    for (const level of ['entities', 'references', 'configurable', 'all']) {
      await pickLevel(page, level);
      expect(await left()).toBe(start);
    }
  });

  for (const side of dataProviderSwitchClickSides()) {
    test(`turns a display switch off and on again with a click on its ${side}`, async ({ page }) => {
      await loadExample(page);
      const proxies = page.locator('#proxy-toggle');
      const box = await proxies.boundingBox();
      const position = { x: side === 'track' ? 4 : box.width - 4, y: box.height / 2 };
      const count = () => page.evaluate(() => window.__nexus.cy.nodes('[group="proxy"]:visible').length);
      const shown = await count();

      await proxies.click({ position: position });
      await expect(proxies).toHaveJSProperty('checked', false);
      expect(await count()).toBe(0);

      await proxies.click({ position: position });
      await expect(proxies).toHaveJSProperty('checked', true);
      expect(await count()).toBe(shown);
    });
  }

  function dataProviderSwitchClickSides() {
    return ['track', 'label'];
  }

  test('turns a focused display switch off with Space', async ({ page }) => {
    await loadExample(page);

    await page.locator('#machine-names').evaluate((el) => el.focus());
    await page.keyboard.press('Space');

    await expect(page.locator('#machine-names')).toHaveJSProperty('checked', false);
    await expect(page.locator('#captions .caption:not(.caption--type)')).toHaveCount(0);
  });

  test('echoes a hovered display control description into the status bar', async ({ page }) => {
    await loadExample(page);

    await page.locator('#proxy-toggle').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText('Show references as semi-opaque proxies instead of long edges');

    await page.locator('#detail-levels [data-level="references"]').hover();
    await expect(page.locator('#statusbar-hint')).toHaveText('References: Show the entities with their reference fields');
  });
});
