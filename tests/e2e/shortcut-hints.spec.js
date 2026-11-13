import { test, expect } from '@playwright/test';
import { loadExample, openFrom, slFill, boxesOverlap } from './helpers.js';

test.describe('Shortcut hints', { tag: '@runner-2' }, () => {
  const MAC_LABELS = {
    'doc-save': '⌘S',
    'doc-new': '⌥N',
    redo: '⇧⌘Z',
    'save-choose': '⇧⌘S',
    fit: '⇧1',
    'zoom-in': '+',
    search: '/',
    'fields-toggle': 'F',
  };

  const PC_LABELS = {
    'doc-save': 'Ctrl+S',
    'doc-new': 'Alt+N',
    redo: 'Ctrl+Shift+Z',
    'save-choose': 'Ctrl+Shift+S',
    fit: 'Shift+1',
    'zoom-in': '+',
    search: '/',
    'fields-toggle': 'F',
  };

  // Reloads the page as a browser on the given platform, which decides how the
  // shortcut labels are written.
  async function onPlatform(page, platform) {
    await page.addInitScript((value) => Object.defineProperty(navigator, 'platform', { get: () => value }), platform);
    await page.reload();
  }

  // The badges the shortcut view draws, each as the id of the control it
  // labels and its label.
  function shortcutHints(page) {
    return page.locator('#shortcut-hints .shortcut-hint').evaluateAll((badges) => badges.map((badge) => [badge.dataset.for, badge.textContent]));
  }

  // The ids of the controls with a shortcut that are drawn outside the inert
  // regions.
  function availableShortcuts(page) {
    return page.evaluate(() => {
      const available = [...document.querySelectorAll('[data-shortcut]')].filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'));

      return available.map((el) => el.id);
    });
  }

  // Each badge of the shortcut view with its box and the box of its control.
  function hintLayout(page) {
    return page.locator('#shortcut-hints .shortcut-hint').evaluateAll((badges) =>
      badges.map((badge) => {
        const control = document.getElementById(badge.dataset.for);

        return { id: badge.dataset.for, badge: badge.getBoundingClientRect().toJSON(), control: control.getBoundingClientRect().toJSON() };
      }),
    );
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('labels every control on screen with its shortcut on F1 and hides the labels on F1 again', async ({ page }) => {
    await loadExample(page);
    await expect(page.locator('#shortcut-hints')).toBeHidden();

    await page.keyboard.press('F1');

    await expect(page.locator('#shortcut-hints')).toBeVisible();
    const labelled = (await shortcutHints(page)).map(([id]) => id);
    expect(labelled).toEqual(await availableShortcuts(page));
    expect(labelled).toEqual(expect.arrayContaining(['about-toggle', 'doc-save', 'undo', 'search', 'history-toggle', 'zoom-level']));
    expect(labelled).not.toContain('add-node');

    await page.keyboard.press('F1');

    await expect(page.locator('#shortcut-hints')).toBeHidden();
    await expect(page.locator('#shortcut-hints .shortcut-hint')).toHaveCount(0);
  });

  for (const [name, platform, labels, undoLabel] of dataProviderShortcutPlatforms()) {
    test(`writes the shortcut labels the way ${name} does`, async ({ page }) => {
      await onPlatform(page, platform);
      await loadExample(page);

      await page.keyboard.press('F1');
      const hints = Object.fromEntries(await shortcutHints(page));

      for (const [id, label] of Object.entries(labels)) {
        expect(hints[id], id).toBe(label);
      }

      await slFill(page, '#diagram-title', 'Roadmap');
      await expect(page.locator('#undo')).toHaveAttribute('title', 'Undo: Renamed the diagram (' + undoLabel + ')');
    });
  }

  function dataProviderShortcutPlatforms() {
    return [
      ['a Mac', 'MacIntel', MAC_LABELS, '⌘Z'],
      ['an iPad', 'iPad', MAC_LABELS, '⌘Z'],
      ['Windows', 'Win32', PC_LABELS, 'Ctrl+Z'],
      ['Linux', 'Linux x86_64', PC_LABELS, 'Ctrl+Z'],
    ];
  }

  for (const [name, platform, edit] of dataProviderHintLayouts()) {
    test(`keeps each shortcut label on its control and clear of the others on ${name}`, async ({ page }) => {
      await onPlatform(page, platform);
      await loadExample(page);

      if (edit) {
        await page.click('#mode-build');
      }

      await page.keyboard.press('F1');
      const layout = await hintLayout(page);

      expect(layout.length).toBeGreaterThan(edit ? 35 : 25);

      for (const { id, badge, control } of layout) {
        expect(Math.abs(badge.x + badge.width / 2 - (control.x + control.width / 2)), id).toBeLessThan(1);
        expect(badge.y, id).toBeLessThan(control.y + control.height + 2 * badge.height);
        expect(badge.y + badge.height, id).toBeGreaterThan(control.y - 2 * badge.height);
      }

      const overlapping = layout.filter((hint, i) => layout.slice(i + 1).some((other) => boxesOverlap(hint.badge, other.badge)));
      expect(overlapping.map((hint) => hint.id)).toEqual([]);
    });
  }

  function dataProviderHintLayouts() {
    return [
      ['a Mac in view mode', 'MacIntel', false],
      ['a Mac in edit mode', 'MacIntel', true],
      ['Windows in view mode', 'Win32', false],
      ['Windows in edit mode', 'Win32', true],
    ];
  }

  test('dims the label of a control that is disabled', async ({ page }) => {
    await loadExample(page);

    await page.keyboard.press('F1');

    await expect(page.locator('#shortcut-hints [data-for="undo"]')).toHaveClass(/is-disabled/);
    await expect(page.locator('#shortcut-hints [data-for="doc-save"]')).not.toHaveClass(/is-disabled/);
  });

  for (const [name, close] of dataProviderHintClosers()) {
    test(`hides the shortcut labels on ${name}`, async ({ page }) => {
      await loadExample(page);
      await page.keyboard.press('F1');
      await expect(page.locator('#shortcut-hints')).toBeVisible();

      await close(page);

      await expect(page.locator('#shortcut-hints')).toBeHidden();
    });
  }

  function dataProviderHintClosers() {
    return [
      ['Escape', (page) => page.keyboard.press('Escape')],
      ['a click', (page) => page.click('.statusbar__tips')],
      ['a shortcut', (page) => page.keyboard.press('m')],
      ['a resize', (page) => page.setViewportSize({ width: 1100, height: 700 })],
      ['a scroll', (page) => page.locator('#legend .panel__body').dispatchEvent('scroll')],
    ];
  }

  for (const [name, open] of dataProviderHelpKeyScreens()) {
    test(`keeps the browser's help from opening on F1 on ${name}`, async ({ page }) => {
      await open(page);
      await page.evaluate(() => {
        window.addEventListener('keydown', (evt) => {
          window.helpPrevented = evt.defaultPrevented;
        });
      });

      await page.keyboard.press('F1');

      expect(await page.evaluate(() => window.helpPrevented)).toBe(true);
    });
  }

  function dataProviderHelpKeyScreens() {
    return [
      ['the landing screen', () => {}],
      ['a diagram', loadExample],
      [
        'the About box',
        async (page) => {
          await loadExample(page);
          await page.click('#about-toggle');
          await expect(page.locator('#about-dialog')).toBeVisible();
        },
      ],
    ];
  }

  test('opens the About box with ? and leaves every shortcut off while it is open', async ({ page }) => {
    await loadExample(page);

    await page.keyboard.press('?');
    await expect(page.locator('#about-dialog')).toBeVisible();

    await page.keyboard.press('f');
    await page.keyboard.press('F1');

    await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
    await expect(page.locator('#shortcut-hints')).toBeHidden();
  });

  test("labels the landing screen's controls and none of the toolbar's behind it", async ({ page }) => {
    await onPlatform(page, 'Win32');

    await page.keyboard.press('F1');

    expect(await shortcutHints(page)).toEqual([
      ['landing-theme', 'D'],
      ['folder-btn', 'Alt+I'],
      ['landing-open', 'Ctrl+O'],
      ['new-btn', 'Alt+N'],
      ['landing-ai', 'Alt+A'],
      ['template-drupal-cms', '1'],
      ['template-civictheme', '2'],
      ['template-umami', '3'],
      ['template-thunder', '4'],
    ]);
  });

  test('closes the shortcut labels and then the import screen with Escape', async ({ page }) => {
    await loadExample(page);
    await openFrom(page, 'import');

    await page.keyboard.press('F1');
    expect(Object.fromEntries(await shortcutHints(page))['landing-cancel']).toBe('Esc');

    await page.keyboard.press('Escape');
    await expect(page.locator('#shortcut-hints')).toBeHidden();
    await expect(page.locator('#landing')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#landing')).toBeHidden();
  });
});
