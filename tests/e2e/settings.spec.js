import { test, expect } from '@playwright/test';
import { CHECKS_DOC, closeSettings, loadExample, openDocument, openSettings, slSelect } from './helpers.js';

test.describe('Settings', { tag: '@runner-2' }, () => {
  const TABS = [
    ['types', 'Entity types', 'Colours, symbols, custom types'],
    ['defaults', 'New diagrams', 'Layout, mode, fields, switches'],
    ['frame', 'Mode frame', 'Canvas border per mode'],
    ['hover', 'Hover highlight', 'Light connections on hover'],
    ['markdown', 'Markdown export', 'Mermaid diagram in exports'],
    ['checks', 'Checks', 'Field limit warning'],
  ];

  // The id of the selected tab and the name of the shown tab panel.
  function shownTab(page) {
    return page.evaluate(() => ({
      tab: document.querySelector('#settings sl-tab[aria-selected="true"]').dataset.settingsTab,
      panels: [...document.querySelectorAll('#settings sl-tab-panel')].filter((panel) => panel.getBoundingClientRect().height > 0).map((panel) => panel.name),
    }));
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  for (const [name, open] of dataProviderOpeners()) {
    test(`opens Settings as a dialog over the diagram from ${name}`, async ({ page }) => {
      await loadExample(page);
      await open(page);

      await expect(page.locator('#settings')).toHaveAttribute('open', '');
      await expect(page.locator('#settings sl-tab-group')).toBeVisible();
      await expect(page.locator('#settings .settings-dialog__label')).toHaveText('Settings');
      await expect(page.locator('#settings .settings-dialog__label svg.icon')).toBeVisible();
      await expect(page.locator('.panel#settings')).toHaveCount(0);

      // The dialog's overlay takes the pointer from the canvas.
      const centre = await page.locator('#cy').boundingBox();
      expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y).closest('#cy'), { x: centre.x + 10, y: centre.y + centre.height / 2 })).toBe(
        false,
      );
    });
  }

  test('draws the same cog on the toolbar button and before the dialog title', async ({ page }) => {
    await loadExample(page);
    const toolbarCog = await page.locator('#settings-toggle svg.icon').innerHTML();

    await page.click('#settings-toggle');

    expect(toolbarCog).toContain('<circle cx="12" cy="12" r="3"');
    expect(await page.locator('#settings .settings-dialog__label svg.icon').innerHTML()).toBe(toolbarCog);
  });

  function dataProviderOpeners() {
    return [
      ['the toolbar button', (page) => page.click('#settings-toggle')],
      ['its shortcut', (page) => page.keyboard.press(',')],
    ];
  }

  for (const [name, close] of dataProviderClosers()) {
    test(`closes Settings with ${name}`, async ({ page }) => {
      await loadExample(page);
      await openSettings(page, 'types');

      await close(page);

      await expect(page.locator('#settings')).not.toHaveAttribute('open');
      await expect(page.locator('#settings sl-tab-group')).toHaveCount(0);
      await page.click('#legend-toggle');
      await expect(page.locator('#legend')).toHaveCount(0);
    });
  }

  function dataProviderClosers() {
    return [
      ['Done', (page) => page.click('#settings-close')],
      ['Escape', (page) => page.keyboard.press('Escape')],
      ['its close button', (page) => page.locator('#settings').evaluate((dialog) => dialog.shadowRoot.querySelector('[part~="close-button"]').click())],
    ];
  }

  test('lists every tab in order, each with its description', async ({ page }) => {
    await loadExample(page);
    await page.click('#settings-toggle');

    const tabs = page.locator('#settings sl-tab');
    await expect(tabs).toHaveCount(TABS.length);

    for (const [index, [id, label, description]] of TABS.entries()) {
      await expect(tabs.nth(index)).toHaveAttribute('data-settings-tab', id);
      await expect(tabs.nth(index).locator('.settings-tab__label')).toHaveText(label);
      await expect(tabs.nth(index).locator('.settings-tab__description')).toHaveText(description);
      await expect(tabs.nth(index)).toHaveAttribute('title', label + ': ' + description);
    }

    expect(await shownTab(page)).toEqual({ tab: 'types', panels: ['types'] });
  });

  for (const [id, label] of TABS) {
    test(`shows the ${label} tab when it is clicked`, async ({ page }) => {
      await loadExample(page);
      await openSettings(page, id);

      expect(await shownTab(page)).toEqual({ tab: id, panels: [id] });
      await expect(page.locator(`#settings sl-tab-panel[name="${id}"] .settings-pane__title`)).toHaveText(label);
    });
  }

  test('moves between the tabs with the arrow keys', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'types');
    await page.locator('#settings sl-tab[data-settings-tab="types"]').evaluate((tab) => tab.focus());

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => shownTab(page)).toEqual({ tab: 'defaults', panels: ['defaults'] });

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => shownTab(page)).toEqual({ tab: 'frame', panels: ['frame'] });

    await page.keyboard.press('ArrowUp');
    await expect.poll(() => shownTab(page)).toEqual({ tab: 'defaults', panels: ['defaults'] });

    await page.keyboard.press('End');
    await expect.poll(() => shownTab(page)).toEqual({ tab: 'checks', panels: ['checks'] });
  });

  test('opens again on the tab shown last', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'markdown');
    await closeSettings(page);

    await page.click('#settings-toggle');

    await expect.poll(() => shownTab(page)).toEqual({ tab: 'markdown', panels: ['markdown'] });
  });

  test('resets only the settings of the tab its Reset this tab button is on', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'markdown');
    await slSelect(page, '#settings [data-markdown="diagram"]', 'never');
    await openSettings(page, 'defaults');
    await slSelect(page, '#settings [data-default="layout"]', 'tb');

    await page.click('#settings [data-reset-tab="defaults"]');

    await expect(page.locator('#settings [data-default="layout"]')).toHaveJSProperty('value', 'columns');
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')))).toEqual({ markdown: { diagram: 'never' } });

    await openSettings(page, 'markdown');
    await expect(page.locator('#settings [data-markdown="diagram"]')).toHaveJSProperty('value', 'never');
  });

  // A document's own type colours sit over the stored ones until the stored
  // colours are reset.
  test('keeps the colours of the open document through Reset this tab on another tab', async ({ page }) => {
    const fill = () => page.evaluate(() => window.__nexus.cy.getElementById('node.article').style('background-color').replace(/\s/g, ''));

    await openDocument(page, { ...CHECKS_DOC, colors: { node: '#112233' } });
    expect(await fill()).toBe('rgb(17,34,51)');

    await openSettings(page, 'frame');
    await page.click('#settings [data-reset-tab="frame"]');
    await expect.poll(fill).toBe('rgb(17,34,51)');

    await openSettings(page, 'types');
    await page.click('#settings [data-reset-tab="types"]');
    await expect.poll(fill).toBe('rgb(217,226,243)');
  });

  test('names each frame switch and colour picker for assistive technology', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'frame');

    for (const mode of ['View mode', 'Edit mode']) {
      await expect(page.getByRole('switch', { name: 'Frame the canvas in ' + mode })).toHaveCount(1);
      await expect(page.locator('#settings').getByRole('button', { name: 'Frame colour in ' + mode })).toHaveCount(1);
    }

    await openSettings(page, 'types');
    await expect(page.locator('#settings').getByRole('button', { name: 'Colour of Content type' })).toHaveCount(1);
    await expect(page.locator('#settings').getByRole('button', { name: 'Colour of the new type' })).toHaveCount(1);
  });

  test('keeps custom types through Reset this tab on Entity types', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'types');
    await page.fill('#settings [data-new-type]', 'widget');
    await page.click('#settings [data-add-type]');
    await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');

    await page.click('#settings [data-reset-tab="types"]');

    await expect.poll(() => page.evaluate(() => document.querySelector('#settings sl-select[data-symbol="node"]').value)).toBe('rounded');
    await expect(page.locator('#settings [data-type-row="widget"]')).toHaveCount(1);
  });

  // Chromium closes an open select and the dialog with separate Escape
  // presses through CloseWatcher. Other browsers send both the same keydown,
  // which the second case reproduces by removing CloseWatcher.
  for (const [name, setUp] of dataProviderEscapeInSelect()) {
    test(`keeps the dialog open when Escape closes a select inside it ${name}`, async ({ page }) => {
      await setUp(page);
      await loadExample(page);
      await openSettings(page, 'defaults');
      const select = page.locator('#settings sl-select[data-default="layout"]');

      await select.locator('[part~="combobox"]').click();
      await expect(select).toHaveJSProperty('open', true);
      await page.keyboard.press('Escape');

      await expect(select).toHaveJSProperty('open', false);
      await page.waitForTimeout(300);
      await expect(page.locator('#settings')).toHaveAttribute('open', '');
    });
  }

  function dataProviderEscapeInSelect() {
    return [
      ['with CloseWatcher', async () => {}],
      [
        'without CloseWatcher',
        async (page) => {
          await page.addInitScript(() => {
            delete window.CloseWatcher;
          });
          await page.reload();
        },
      ],
    ];
  }

  test('ignores a stored layout with the Settings panel open', async ({ page }) => {
    await page.evaluate(() =>
      window.localStorage.setItem(
        'nexusLayout',
        JSON.stringify({ panels: { settings: { open: true, dock: 'right', order: 0 } }, dockWidth: { left: 320, right: 340 } }),
      ),
    );
    await page.reload();
    await loadExample(page);

    await expect(page.locator('.panel#settings')).toHaveCount(0);
    await expect(page.locator('#dock-right .panel')).toHaveCount(0);
    await expect(page.locator('#settings')).not.toHaveAttribute('open');
  });

  test('keeps the dialog inside a narrow window and drops the tab descriptions', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 800 });
    await loadExample(page);
    await openSettings(page, 'defaults');

    const panel = await page.locator('#settings').evaluate((dialog) => dialog.shadowRoot.querySelector('[part~="panel"]').getBoundingClientRect().toJSON());

    expect(panel.left).toBeGreaterThanOrEqual(0);
    expect(panel.right).toBeLessThanOrEqual(420);
    await expect(page.locator('#settings .settings-tab__description').first()).toBeHidden();
    await expect(page.locator('#settings .settings-tab__label').first()).toBeVisible();
    await expect(page.locator('#settings [data-default="layout"]')).toBeVisible();
  });
});
