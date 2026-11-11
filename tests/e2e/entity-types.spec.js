import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadExample, slFill, slSelect } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('persists a custom entity colour across reloads', async ({ page }) => {
  await loadExample(page);

  await page.click('#settings-toggle');
  await slFill(page, 'sl-color-picker[data-color="paragraph"]', '#112233');

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')));
  expect(stored.colors.paragraph).toBe('#112233');

  await page.reload();
  await loadExample(page);

  const applied = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="paragraph"]').style('background-color'));
  expect(applied.replace(/\s/g, '')).toBe('rgb(17,34,51)');
});

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
  await page.click('#settings-toggle');

  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
  await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('diamond');

  await page.fill('#settings [data-new-type]', 'widget');
  await page.click('#settings [data-add-type]');
  await expect(page.locator('#settings [data-type-row="widget"]')).toHaveCount(1);
});

test('labels an entity of a custom type with the custom label in the inspector', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#settings-toggle');
  await page.fill('#settings [data-new-type]', 'widget');
  await page.fill('#settings input[placeholder="Label"]', 'Gadget widget');
  await page.click('#settings [data-add-type]');
  await page.click('#settings .panel__close');
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
  await page.click('#settings-toggle');

  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
  await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('diamond');

  await page.click('#settings-reset');

  await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('round-rectangle');
  await expect.poll(() => page.evaluate(() => document.querySelector('#settings sl-select[data-symbol="node"]').value)).toBe('rounded');
});

test('round-trips custom types and symbols through a saved document', async ({ page }) => {
  await loadExample(page);
  await page.click('#settings-toggle');

  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
  await page.fill('#settings [data-new-type]', 'gadget');
  await page.click('#settings [data-add-type]');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(doc.symbols.node).toBe('diamond');
  expect(doc.customTypes.some((t) => t.type === 'gadget')).toBe(true);
});

// Opens Settings with a custom type, then docks it in the right rail when
// asked, narrowed to the rail's minimum width when asked.
async function openTypeSettings(page, placement) {
  await loadExample(page);
  await page.click('#settings-toggle');
  await page.fill('#settings [data-new-type]', 'widget');
  await page.click('#settings [data-add-type]');

  if (placement === 'floating') {
    return;
  }

  await page.click('#settings .panel__pin');
  await expect(page.locator('#dock-right #settings')).toHaveCount(1);

  if (placement === 'narrowest rail') {
    const handle = await page.locator('#dock-right .dock__resize').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 120);
    await page.mouse.down();
    await page.mouse.move(handle.x + 400, handle.y + 120, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await page.locator('#dock-right').boundingBox()).width).toBe(220);
  }
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
  test(`lays out each entity type and the add form on 1 line in columns in a ${placement}`, async ({ page }) => {
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
  return ['floating panel', 'side rail'];
}

test('puts each entity type label and the new type names above their controls in the narrowest side rail', async ({ page }) => {
  await openTypeSettings(page, 'narrowest rail');
  await expect(page.locator('#settings .settings-body')).toHaveClass(/is-narrow/);

  const rows = await typeRowLayout(page);

  expect(rows.map((row) => row.lines)).toEqual(Array(9).fill(2));
  expect(rows.some((row) => row.overflow)).toBe(false);
  expect(typeof shared(rows, 'color')).toBe('number');
  expect(typeof shared(rows, 'symbol')).toBe('number');
  expect(typeof shared(rows, 'action')).toBe('number');
});

test('removes a custom type with its minus button and offers none on the built-in types', async ({ page }) => {
  await openTypeSettings(page, 'floating panel');

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
  await page.click('#settings-toggle');
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
  await page.click('#settings-toggle');
  const select = page.locator('#settings sl-select[data-symbol="node"]');
  await expect(select).toHaveAttribute('title', 'Symbol: Rounded rectangle');
  await expect(select.locator(':scope > .type-row__preview rect')).toHaveCount(1);

  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');

  await expect(select).toHaveAttribute('title', 'Symbol: Diamond');
  await expect(select.locator(':scope > .type-row__preview polygon')).toHaveCount(1);
});

for (const placement of dataProviderSymbolListPlacements()) {
  test(`opens the symbol list inside the window in a ${placement}`, async ({ page }) => {
    await openTypeSettings(page, placement);
    const select = page.locator('#settings sl-select[data-symbol="node"]');

    await select.click();
    await expect(select).toHaveJSProperty('open', true);

    const box = await select.evaluate((el) => el.shadowRoot.querySelector('[part~="listbox"]').getBoundingClientRect().toJSON());
    const width = await page.evaluate(() => document.documentElement.clientWidth);

    expect(box.width).toBeGreaterThan(150);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(width);
  });
}

function dataProviderSymbolListPlacements() {
  return ['floating panel', 'narrowest rail'];
}
