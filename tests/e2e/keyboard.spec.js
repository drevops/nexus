import { test, expect } from '@playwright/test';
import {
  entityCount,
  nodePositions,
  waitForGraph,
  loadExample,
  slFill,
  openDocument,
  selectTrackField,
  SCATTERED_DOC,
  entityIds,
  buildEntities,
  dataProviderShortcutModifiers,
} from './helpers.js';

test.describe('Keyboard', { tag: '@runner-2' }, () => {
  function zoomLevel(page) {
    return page.evaluate(() => window.__nexus.cy.zoom());
  }

  // Records each key pressed with a modifier that the page keeps from the
  // browser. The listener runs last, after the shortcut listener.
  function recordKeptKeys(page) {
    return page.evaluate(() => {
      window.keptKeys = [];
      window.addEventListener('keydown', (evt) => {
        if ((evt.ctrlKey || evt.metaKey) && evt.defaultPrevented && !['Control', 'Meta', 'Shift'].includes(evt.key)) {
          window.keptKeys.push(evt.key);
        }
      });
    });
  }

  function keptKeys(page) {
    return page.evaluate(() => window.keptKeys);
  }

  // Expects the inspector to offer a new entity of the type with this label.
  function offersNewEntity(label) {
    return (page) => expect(page.locator('#inspector .insp__title')).toHaveText('New ' + label);
  }

  // Expects a click on the empty canvas to place a note of this kind.
  function placesNote(kind) {
    return async (page) => {
      const box = await page.locator('#cy').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="annotation"]').map((node) => node.data('kind')))).toEqual([kind]);
    };
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  for (const [name, key, ran] of dataProviderToolbarShortcuts()) {
    test(`runs ${name} with ${key}`, async ({ page }) => {
      await loadExample(page);

      await page.keyboard.press(key);

      await ran(page);
    });
  }

  function dataProviderToolbarShortcuts() {
    return [
      ['the theme toggle', 'd', (page) => expect(page.locator('html')).toHaveClass(/sl-theme-dark/)],
      ['Settings', ',', (page) => expect(page.locator('#settings')).toBeVisible()],
      ['the Open menu', 'Shift+O', (page) => expect(page.locator('#open-menu')).toBeVisible()],
      ['the Save as menu', 'Control+Shift+S', (page) => expect(page.locator('#save-menu')).toBeVisible()],
      ['Fields', 'f', (page) => expect(page.locator('#detail-level')).toHaveText('Fields: Entities')],
      ['Proxies', 'p', (page) => expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', false)],
      ['Machine names', 'm', (page) => expect(page.locator('#machine-names')).toHaveJSProperty('checked', false)],
      ['Entities', '1', (page) => expect(page.locator('#entities')).toBeVisible()],
      ['the Fields panel', '2', (page) => expect(page.locator('#table')).toBeVisible()],
      ['Legend', '3', (page) => expect(page.locator('#legend')).toHaveCount(0)],
      ['History', '4', (page) => expect(page.locator('#history')).toBeVisible()],
      ['the zoom menu', 'z', (page) => expect(page.locator('#zoom-menu')).toBeVisible()],
    ];
  }

  test('tidies the layout with T', async ({ page }) => {
    await openDocument(page, SCATTERED_DOC);
    const saved = await nodePositions(page);

    await page.keyboard.press('t');

    expect(await nodePositions(page)).not.toEqual(saved);
    await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Tidied the layout \(/);
  });

  test('re-runs the picked layout with L', async ({ page }) => {
    await loadExample(page);
    const laidOut = await nodePositions(page);

    await page.evaluate(() => {
      window.__nexus.cy.getElementById('node.event').shift({ x: 300, y: 300 });
    });
    await page.keyboard.press('l');

    expect(await nodePositions(page)).toEqual(laidOut);
  });

  test('picks a layout from the keyboard once Shift+L opens the layout menu', async ({ page }) => {
    await loadExample(page);

    await page.keyboard.press('Shift+L');
    await expect(page.locator('#layout-menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#layout-menu sl-menu-item[value="lr"]')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: LR');
  });

  test('switches between view and edit modes with V and E', async ({ page }) => {
    await loadExample(page);

    await page.keyboard.press('e');
    await expect(page.locator('#mode-build')).toHaveClass(/is-active/);
    await expect(page.locator('#build-tools')).toBeVisible();

    await page.keyboard.press('v');
    await expect(page.locator('#mode-view')).toHaveClass(/is-active/);
    await expect(page.locator('#build-tools')).toBeHidden();
  });

  test('focuses the search box with / and selects what it holds', async ({ page }) => {
    await loadExample(page);
    await slFill(page, '#search', 'news');

    await page.keyboard.press('/');
    await expect(page.locator('#search')).toBeFocused();
    await page.keyboard.type('session');

    await expect(page.locator('#search')).toHaveJSProperty('value', 'session');
  });

  test('zooms in with + and =, out with -, back to 100% with 0 and to fit with Shift+1', async ({ page }) => {
    await loadExample(page);

    await page.keyboard.press('0');
    expect(await zoomLevel(page)).toBeCloseTo(1, 5);
    await page.keyboard.press('+');
    expect(await zoomLevel(page)).toBeCloseTo(1.25, 5);
    await page.keyboard.press('=');
    expect(await zoomLevel(page)).toBeCloseTo(1.5625, 5);
    await page.keyboard.press('-');
    expect(await zoomLevel(page)).toBeCloseTo(1.25, 5);

    await page.keyboard.press('Shift+1');
    const fitted = await zoomLevel(page);
    await page.keyboard.press('0');
    await page.click('#fit');
    expect(await zoomLevel(page)).toBeCloseTo(fitted, 5);
  });

  for (const [name, modifier] of dataProviderShortcutModifiers()) {
    test(`zooms the diagram instead of the page with ${name} and =, - and 0`, async ({ page }) => {
      await loadExample(page);
      await page.keyboard.press('0');
      await recordKeptKeys(page);

      await page.keyboard.press(modifier + '+=');
      expect(await zoomLevel(page)).toBeCloseTo(1.25, 5);
      await page.keyboard.press(modifier + '++');
      expect(await zoomLevel(page)).toBeCloseTo(1.5625, 5);
      await page.keyboard.press(modifier + '+-');
      expect(await zoomLevel(page)).toBeCloseTo(1.25, 5);
      await page.keyboard.press(modifier + '+0');
      expect(await zoomLevel(page)).toBeCloseTo(1, 5);

      expect(await keptKeys(page)).toEqual(['=', '+', '-', '0']);
    });
  }

  test('keeps the browser zoom keys from the page on the landing screen and under a dialog', async ({ page }) => {
    await recordKeptKeys(page);
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+-');

    await page.click('#new-btn');
    await page.click('#about-toggle');
    await expect(page.locator('#about-dialog')).toHaveAttribute('open', '');
    await page.keyboard.press('Control+0');
    await page.keyboard.press('Control+_');

    expect(await keptKeys(page)).toEqual(['=', '-', '0', '_']);
  });

  test('keeps a pinch outside the canvas from zooming the page and zooms the diagram with a pinch on it', async ({ page }) => {
    await loadExample(page);

    const kept = await page.evaluate(() =>
      ['.toolbar', '#statusbar'].map((selector) => {
        const target = document.querySelector(selector);
        const wheel = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
        const gesture = new Event('gesturechange', { bubbles: true, cancelable: true });

        return [!target.dispatchEvent(wheel), !target.dispatchEvent(gesture)];
      }),
    );
    expect(kept).toEqual([
      [true, true],
      [true, true],
    ]);

    await page.keyboard.press('0');
    const box = await page.locator('#cy').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');

    await expect.poll(() => zoomLevel(page)).toBeGreaterThan(1);
  });

  for (const [name, modifier] of dataProviderShortcutModifiers()) {
    test(`saves the diagram with ${name}+S, from the title box too`, async ({ page }) => {
      await loadExample(page);

      const [saved] = await Promise.all([page.waitForEvent('download'), page.keyboard.press(modifier + '+s')]);
      expect(saved.suggestedFilename()).toBe('example-content-model.nexus.json');

      await page.locator('#diagram-title').click();
      const [renamed] = await Promise.all([page.waitForEvent('download'), page.keyboard.press(modifier + '+s')]);
      expect(renamed.suggestedFilename()).toBe('example-content-model.nexus.json');
    });
  }

  test('picks a save format from the keyboard once Ctrl+Shift+S opens the menu', async ({ page }) => {
    await loadExample(page);

    await page.keyboard.press('Control+Shift+S');
    await expect(page.locator('#save-menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#save-menu > sl-menu-item:has(sl-menu-item[value="csv"])')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#save-menu sl-menu-item[value="dot"]')).toBeFocused();

    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    expect(download.suggestedFilename()).toBe('example-content-model.dot');
  });

  test('picks a CSV from the Save as submenu with the arrow keys', async ({ page }) => {
    await loadExample(page);

    await page.keyboard.press('Control+Shift+S');
    await expect(page.locator('#save-menu')).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#save-menu > sl-menu-item:has(sl-menu-item[value="csv"])')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#save-menu sl-menu-item[value="bundles-csv"]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#save-menu sl-menu-item[value="csv"]')).toBeFocused();

    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    expect(download.suggestedFilename()).toBe('example-content-model-fields.csv');
  });

  for (const [name, key, input, open] of dataProviderFilePickerShortcuts()) {
    test(`opens the ${name} with ${key}`, async ({ page }) => {
      await open(page);
      const chooser = page.waitForEvent('filechooser');

      // Waiting for a file chooser turns on its interception without waiting
      // for it, and a key press can reach the page first, so a round trip to
      // the page comes before the key.
      await page.evaluate(() => {});
      await page.keyboard.press(key);

      expect(await (await chooser).element().evaluate((el) => el.id)).toBe(input);
    });
  }

  function dataProviderFilePickerShortcuts() {
    return [
      ['saved diagram picker', 'Control+o', 'doc-open', loadExample],
      ['saved diagram picker from the landing screen', 'Control+o', 'doc-open', () => {}],
      ['config folder picker from the landing screen', 'Alt+i', 'folder-input', () => {}],
    ];
  }

  for (const [name, open] of dataProviderNewShortcutScreens()) {
    test(`starts a new content model with Alt+N from ${name}`, async ({ page }) => {
      await open(page);

      await page.keyboard.press('Alt+n');

      await expect(page.locator('#landing')).toBeHidden();
      await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'New content model');
      expect(await entityCount(page)).toBe(0);
    });
  }

  function dataProviderNewShortcutScreens() {
    return [
      ['a diagram', loadExample],
      ['the landing screen', () => {}],
    ];
  }

  for (const [key, title] of dataProviderTemplateNumbers()) {
    test(`loads the template numbered ${key} on the landing screen`, async ({ page }) => {
      await page.keyboard.press(key);
      await waitForGraph(page);

      expect(await page.locator('#diagram-title').evaluate((el) => el.value)).toMatch(title);
    });
  }

  function dataProviderTemplateNumbers() {
    return [
      ['1', /^Drupal CMS /],
      ['2', /^CivicTheme /],
      ['3', /^Umami /],
      ['4', /^Thunder /],
      ['5', /^Open Social /],
    ];
  }

  test('switches the theme with D on the landing screen', async ({ page }) => {
    await page.keyboard.press('d');

    await expect(page.locator('html')).toHaveClass(/sl-theme-dark/);
    await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to light theme');
  });

  for (const [name, key, ran] of dataProviderPaletteShortcuts()) {
    test(`runs the ${name} button of the edit palette with ${key}`, async ({ page }) => {
      await page.click('#new-btn');
      await page.keyboard.press('e');

      await page.keyboard.press(key);

      await ran(page);
    });
  }

  function dataProviderPaletteShortcuts() {
    return [
      ['Content', 'Shift+C', offersNewEntity('Content type')],
      ['Vocab', 'Shift+V', offersNewEntity('Vocabulary')],
      ['Media', 'Shift+M', offersNewEntity('Media')],
      ['Para', 'Shift+P', offersNewEntity('Paragraph')],
      ['Block', 'Shift+B', offersNewEntity('Block')],
      ['User', 'Shift+U', offersNewEntity('User')],
      ['External', 'Shift+X', offersNewEntity('External entity')],
      ['Field', 'Shift+F', (page) => expect(page.locator('#inspector [data-new="field"]')).toBeVisible()],
      ['Event', 'Shift+E', placesNote('event')],
      ['API', 'Shift+A', placesNote('api')],
      ['Callback', 'Shift+K', placesNote('callback')],
      ['Note', 'Shift+N', placesNote('note')],
      ['Connect', 'c', (page) => expect(page.locator('#connect-toggle')).toHaveClass(/is-active/)],
    ];
  }

  for (const [name, key, field] of dataProviderNewItemForms()) {
    test(`types the machine name of a new ${name} straight after ${key} opens its form`, async ({ page }) => {
      await buildEntities(page, ['story']);
      await page.evaluate(() => document.activeElement.blur());

      await page.keyboard.press(key);
      await expect(page.locator(field)).toBeFocused();
      await page.keyboard.type('cf');

      await expect(page.locator(field)).toHaveJSProperty('value', 'cf');
      await expect(page.locator('#connect-toggle')).not.toHaveClass(/is-active/);
      await expect(page.locator('#detail-level')).toHaveText('Fields: All');
    });
  }

  function dataProviderNewItemForms() {
    return [
      ['content type', 'Shift+C', '#inspector [data-new-bundle]'],
      ['field', 'Shift+F', '#inspector [data-new-name]'],
    ];
  }

  test('opens the form of the palette type picked last', async ({ page }) => {
    await page.click('#new-btn');
    await page.click('#mode-build');

    await page.click('[data-add-entity="node"]');
    await page.click('[data-add-entity="taxonomy_term"]');

    await expect(page.locator('#inspector .insp__title')).toHaveText('New Vocabulary');
    await expect(page.locator('#inspector [data-new-bundle]')).toBeFocused();
  });

  test('leaves the focus on the page when an undo redraws an open new field form', async ({ page }) => {
    await buildEntities(page, ['a', 'b']);
    await page.click('#add-field');
    await expect(page.locator('#inspector [data-new-name]')).toBeFocused();
    await page.evaluate(() => document.activeElement.blur());

    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');

    expect(await entityIds(page)).toEqual([]);
    await expect(page.locator('#inspector [data-new-name]')).not.toBeFocused();
  });

  test('types into a text box instead of running the shortcuts of the keys', async ({ page }) => {
    await loadExample(page);
    await page.locator('#search').click();

    await page.keyboard.type('f1?');
    await page.keyboard.press('Alt+n');

    await expect(page.locator('#search')).toHaveJSProperty('value', 'f1?');
    await expect(page.locator('#detail-level')).toHaveText('Fields: All');
    await expect(page.locator('#entities')).toHaveCount(0);
    await expect(page.locator('#about-dialog')).not.toBeVisible();
    expect(await entityCount(page)).toBeGreaterThan(0);
  });

  test('leaves letter keys to a focused select', async ({ page }) => {
    await selectTrackField(page);
    await page.locator('#inspector sl-select[data-cardinality]').click();

    await page.keyboard.press('m');

    await expect(page.locator('#machine-names')).toHaveJSProperty('checked', true);
  });

  test('leaves letter keys to an open menu', async ({ page }) => {
    await loadExample(page);
    await page.keyboard.press('Control+Shift+S');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#save-menu > sl-menu-item:has(sl-menu-item[value="csv"])')).toBeFocused();

    await page.keyboard.press('p');

    await expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', true);
    await expect(page.locator('#save-menu')).toBeVisible();
  });

  test('repeats a held zoom key, but not a held toggle or F1', async ({ page }) => {
    await loadExample(page);
    await page.keyboard.press('0');

    await page.keyboard.down('-');
    await page.keyboard.down('-');
    await page.keyboard.up('-');
    expect(await zoomLevel(page)).toBeCloseTo(0.64, 5);

    await page.keyboard.down('f');
    await page.keyboard.down('f');
    await page.keyboard.up('f');
    await expect(page.locator('#detail-level')).toHaveText('Fields: Entities');

    await page.keyboard.down('F1');
    await page.keyboard.down('F1');
    await page.keyboard.up('F1');
    await expect(page.locator('#shortcut-hints')).toBeVisible();
  });

  test('undoes 1 step after another while Ctrl+Z is held', async ({ page }) => {
    await buildEntities(page, ['a', 'b']);
    await page.evaluate(() => document.activeElement.blur());

    await page.keyboard.down('Control');
    await page.keyboard.down('z');
    await page.keyboard.down('z');
    await page.keyboard.up('z');
    await page.keyboard.up('Control');

    expect(await entityIds(page)).toEqual([]);
  });
});
