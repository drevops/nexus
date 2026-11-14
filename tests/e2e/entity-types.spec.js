import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { closeSettings, loadExample, openSettings, slFill, slSelect } from './helpers.js';

test.describe('Entity types', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('persists a custom entity colour across reloads', async ({ page }) => {
    await loadExample(page);

    await openSettings(page, 'types');
    await slFill(page, 'sl-color-picker[data-color="paragraph"]', '#112233');

    const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')));
    expect(stored.colors.paragraph).toBe('#112233');

    await page.reload();
    await loadExample(page);

    const applied = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="paragraph"]').style('background-color'));
    expect(applied.replace(/\s/g, '')).toBe('rgb(17,34,51)');
  });

  for (const [name, color, expected] of dataProviderLabelColours()) {
    test(`draws labels that read on ${name}`, async ({ page }) => {
      await loadExample(page);
      await openSettings(page, 'types');
      await slFill(page, 'sl-color-picker[data-color="taxonomy_term"]', color);

      const colors = await page.evaluate(() => {
        const cy = window.__nexus.cy;
        const entity = cy.nodes('[group="entity"][entityType="taxonomy_term"]').first();
        const proxy = cy.nodes('[group="proxy"][entityType="taxonomy_term"]').first();
        const caption = document.querySelector('.caption--type[data-node-id="' + entity.id() + '"]');

        return {
          entity: entity.style('color'),
          caption: getComputedStyle(caption).color,
          proxyFill: proxy.style('background-color'),
          proxy: proxy.style('color'),
        };
      });

      expect(Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, value.replace(/\s/g, '')]))).toEqual(expected);
    });
  }

  // A proxy draws its colour at 40% over the light canvas, which keeps dark
  // text readable even on black.
  function dataProviderLabelColours() {
    return [
      ['a pastel colour', '#d9e2f3', { entity: 'rgb(31,41,51)', caption: 'rgb(75,85,99)', proxyFill: 'rgb(217,226,243)', proxy: 'rgb(75,85,99)' }],
      ['a dark colour', '#14532d', { entity: 'rgb(255,255,255)', caption: 'rgb(229,231,235)', proxyFill: 'rgb(20,83,45)', proxy: 'rgb(75,85,99)' }],
      ['black', '#000000', { entity: 'rgb(255,255,255)', caption: 'rgb(229,231,235)', proxyFill: 'rgb(0,0,0)', proxy: 'rgb(75,85,99)' }],
    ];
  }

  test('draws entity types with their symbols and a dynamic legend', async ({ page }) => {
    await loadExample(page);

    const shapes = await page.evaluate(() => {
      const vocab = window.__nexus.cy.nodes('[group="entity"][entityType="taxonomy_term"]').first();

      return {
        node: window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'),
        vocab: vocab.style('shape'),
        vocabCorners: vocab.style('shape-polygon-points').split(' ').length / 2,
      };
    });
    expect(shapes.node).toBe('round-rectangle');
    // A tag is drawn as a 5-cornered polygon, so its point keeps its size.
    expect(shapes.vocab).toBe('polygon');
    expect(shapes.vocabCorners).toBe(5);

    const legend = await page.locator('#legend .legend__label').allTextContents();
    expect(legend).toContain('Content type');
    expect(legend).toContain('Vocabulary');
  });

  test('changes a type symbol and adds a custom entity type in settings', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'types');

    await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
    await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('diamond');

    await page.fill('#settings [data-new-type]', 'widget');
    await page.click('#settings [data-add-type]');
    await expect(page.locator('#settings [data-type-row="widget"]')).toHaveCount(1);
  });

  test('labels an entity of a custom type with the custom label in the inspector', async ({ page }) => {
    await page.click('#new-btn');
    await openSettings(page, 'types');
    await page.fill('#settings [data-new-type]', 'widget');
    await page.fill('#settings input[placeholder="Label"]', 'Gadget widget');
    await page.click('#settings [data-add-type]');
    await closeSettings(page);
    await page.click('#mode-build');

    await page.click('[data-add-entity="node"]');
    await slSelect(page, '[data-new="entity"] sl-select', 'widget');
    await expect(page.locator('[data-new="entity"] .insp__title')).toHaveText('New Gadget widget');
    await slFill(page, '[data-new-bundle]', 'spinner');
    await page.click('[data-create-entity]');

    await expect(page.locator('#inspector .insp__ro')).toHaveText('Gadget widget');
  });

  test('resets colours and symbols to defaults from settings', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'types');

    await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
    await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('diamond');

    await page.click('#settings-reset');

    await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('round-rectangle');
    await expect.poll(() => page.evaluate(() => document.querySelector('#settings sl-select[data-symbol="node"]').value)).toBe('rounded');
  });

  test('round-trips custom types and symbols through a saved document', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'types');

    await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
    await page.fill('#settings [data-new-type]', 'gadget');
    await page.click('#settings [data-add-type]');
    await closeSettings(page);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
    const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
    expect(doc.symbols.node).toBe('diamond');
    expect(doc.customTypes.some((t) => t.type === 'gadget')).toBe(true);
  });

  // Opens the Entity types tab of Settings with a custom type, in a window as
  // narrow as a phone's when asked.
  async function openTypeSettings(page, placement) {
    if (placement === 'narrow window') {
      await page.setViewportSize({ width: 420, height: 800 });
    }

    await loadExample(page);
    await openSettings(page, 'types');
    await page.fill('#settings [data-new-type]', 'widget');
    await page.click('#settings [data-add-type]');
    await expect(page.locator('#settings [data-type-row="widget"]')).toHaveCount(1);
  }

  // Each type row and the add row as the number of lines its cells take, the
  // left edge of its color, symbol and +/- cells, and whether a cell crosses
  // the right edge of the settings body.
  function typeRowLayout(page) {
    return page.evaluate(() => {
      const body = document.querySelector('#settings .settings-body').getBoundingClientRect();

      return [...document.querySelectorAll('#settings .type-row')].map((row) => {
        const cells = [...row.children].map((cell) => cell.getBoundingClientRect()).sort((a, b) => a.top - b.top);
        const left = (selector) => (row.querySelector(selector) ? Math.round(row.querySelector(selector).getBoundingClientRect().left) : null);
        let lines = 0;
        let bottom = -Infinity;

        for (const cell of cells) {
          if (cell.top >= bottom - 1) {
            lines++;
          }

          bottom = Math.max(bottom, cell.bottom);
        }

        return {
          lines: lines,
          color: left('sl-color-picker'),
          symbol: left('sl-select'),
          action: left('sl-button'),
          overflow: cells.some((cell) => cell.right > body.right + 0.5),
        };
      });
    });
  }

  // The value every row shares for a key, or the distinct values when the
  // rows differ.
  function shared(rows, key) {
    const values = [...new Set(rows.map((row) => row[key]).filter((value) => value !== null))];

    return values.length === 1 ? values[0] : values;
  }

  for (const placement of dataProviderOneLineTypeSettings()) {
    test(`lays out each entity type and the add form on 1 line in columns in the ${placement}`, async ({ page }) => {
      await openTypeSettings(page, placement);

      const rows = await typeRowLayout(page);

      expect(rows.length).toBe(9);
      expect(rows.map((row) => row.lines)).toEqual(Array(9).fill(1));
      expect(rows.some((row) => row.overflow)).toBe(false);
      expect(typeof shared(rows, 'color')).toBe('number');
      expect(typeof shared(rows, 'symbol')).toBe('number');
      expect(typeof shared(rows, 'action')).toBe('number');
      await expect(page.locator('#settings .settings-body')).not.toHaveClass(/is-narrow/);
    });
  }

  function dataProviderOneLineTypeSettings() {
    return ['dialog'];
  }

  test('puts each entity type label and the new type names above their controls in a narrow window', async ({ page }) => {
    await openTypeSettings(page, 'narrow window');
    await expect(page.locator('#settings .settings-body')).toHaveClass(/is-narrow/);

    const rows = await typeRowLayout(page);

    expect(rows.map((row) => row.lines)).toEqual(Array(9).fill(2));
    expect(rows.some((row) => row.overflow)).toBe(false);
    expect(typeof shared(rows, 'color')).toBe('number');
    expect(typeof shared(rows, 'symbol')).toBe('number');
    expect(typeof shared(rows, 'action')).toBe('number');
  });

  test('removes a custom type with its minus button and offers none on the built-in types', async ({ page }) => {
    await openTypeSettings(page, 'dialog');

    await expect(page.locator('#settings [data-remove-type]')).toHaveCount(1);
    const remove = page.locator('#settings [data-type-row="widget"] [data-remove-type="widget"]');
    await expect(remove).toHaveAttribute('aria-label', 'Remove Widget');
    await expect(remove.locator('svg.icon')).toHaveCount(1);

    await remove.click();

    await expect(page.locator('#settings [data-type-row="widget"]')).toHaveCount(0);
    await expect(page.locator('#settings [data-new-type]')).toBeFocused();
    await expect(page.locator('#settings [data-remove-type]')).toHaveCount(0);
  });

  test('adds a custom type with the plus button and empties the new type names', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'types');
    await expect(page.locator('#settings [data-add-type]')).toHaveAttribute('aria-label', 'Add a custom entity type');
    await expect(page.locator('#settings [data-add-type]')).toHaveText('');

    await page.fill('#settings [data-new-type]', 'gadget');
    await page.fill('#settings input[placeholder="Label"]', 'Gadget part');
    await page.click('#settings [data-add-type]');

    await expect(page.locator('#settings [data-type-row="gadget"] .type-row__label')).toHaveText('Gadget part');
    await expect(page.locator('#settings [data-new-type]')).toHaveValue('');
    await expect(page.locator('#settings input[placeholder="Label"]')).toHaveValue('');
  });

  test('draws the picked symbol in its select and names it in the title', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'types');
    const select = page.locator('#settings sl-select[data-symbol="node"]');
    await expect(select).toHaveAttribute('title', 'Symbol: Rounded rectangle');
    await expect(select.locator(':scope > .type-row__preview rect')).toHaveCount(1);

    await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');

    await expect(select).toHaveAttribute('title', 'Symbol: Diamond');
    await expect(select.locator(':scope > .type-row__preview polygon')).toHaveCount(1);
  });

  // Each symbol select's caret and symbol as the room left between them and
  // the select's border, and the height of the colour picker beside it.
  function symbolSelectLayout(page) {
    return page.evaluate(() =>
      [...document.querySelectorAll('#settings .type-row')].map((row) => {
        const select = row.querySelector('sl-select');
        const box = select.getBoundingClientRect();
        const caret = select.shadowRoot.querySelector('[part~="expand-icon"]').getBoundingClientRect();
        const symbol = select.querySelector('.type-row__preview svg').getBoundingClientRect();

        return {
          caretRoom: Math.round(box.right - caret.right),
          symbolRoom: Math.round(symbol.left - box.left),
          pickerHeight: Math.round(row.querySelector('sl-color-picker').getBoundingClientRect().height - box.height),
        };
      }),
    );
  }

  for (const placement of dataProviderSymbolListPlacements()) {
    test(`keeps the caret and symbol of each symbol select inside its border in the ${placement}`, async ({ page }) => {
      await openTypeSettings(page, placement);

      const rows = await symbolSelectLayout(page);

      expect(rows.length).toBe(9);

      for (const row of rows) {
        expect(row.caretRoom).toBeGreaterThanOrEqual(6);
        expect(row.symbolRoom).toBeGreaterThanOrEqual(6);
        expect(row.pickerHeight).toBe(0);
      }
    });
  }

  for (const placement of dataProviderSymbolListPlacements()) {
    test(`opens the symbol list inside the window in the ${placement}`, async ({ page }) => {
      await openTypeSettings(page, placement);
      const select = page.locator('#settings sl-select[data-symbol="node"]');

      await select.click();
      await expect(select).toHaveJSProperty('open', true);

      const box = await select.evaluate((el) => el.shadowRoot.querySelector('[part~="listbox"]').getBoundingClientRect().toJSON());
      const width = await page.evaluate(() => document.documentElement.clientWidth);

      expect(box.width).toBeGreaterThan(150);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);

      // Every option is as tall as the others, so no name wraps onto a second
      // line, and each draws its symbol at the Settings width.
      const read = (items) =>
        items.map((item) => ({
          height: Math.round(item.getBoundingClientRect().height),
          symbol: Number(item.querySelector('.type-row__preview svg').getAttribute('width')),
        }));
      const options = await select.locator('sl-option').evaluateAll(read);

      expect(options.length).toBe(11);
      expect(new Set(options.map((option) => option.height)).size).toBe(1);
      expect(options.map((option) => option.symbol)).toEqual(Array(11).fill(34));
    });
  }

  function dataProviderSymbolListPlacements() {
    return ['dialog', 'narrow window'];
  }
});
