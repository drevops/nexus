import { test, expect } from '@playwright/test';
import { loadExample } from './helpers.js';

test.describe('Toolbar', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  for (const [name, button, trigger] of dataProviderDropdownTriggers()) {
    test(`lines the ${name} up with the button beside it`, async ({ page }) => {
      await loadExample(page);

      const [buttonBox, triggerBox] = await page.evaluate(
        (selectors) =>
          selectors.map((selector) => {
            const box = document.querySelector(selector).shadowRoot.querySelector('[part~="base"]').getBoundingClientRect();

            return { top: Math.round(box.top * 10) / 10, bottom: Math.round(box.bottom * 10) / 10 };
          }),
        [button, trigger],
      );

      expect(triggerBox).toEqual(buttonBox);
    });
  }

  function dataProviderDropdownTriggers() {
    return [
      ['layout menu caret', '#layout-run', '#layout-choose'],
      ['open menu caret', '#doc-open-btn', '#open-choose'],
      ['save menu caret', '#doc-save', '#save-choose'],
      ['zoom level menu', '#zoom-in', '#zoom-level'],
    ];
  }

  test('links to the project on GitHub from the toolbar', async ({ page }) => {
    await expect(page.locator('#github-link')).toHaveAttribute('href', 'https://github.com/drevops/nexus');
    await expect(page.locator('#github-link')).toHaveAttribute('target', '_blank');
    await expect(page.locator('#github-link svg.icon')).toHaveCount(1);
  });

  test('keeps about, settings, theme and github on the brand line', async ({ page }) => {
    await expect(page.locator('.toolbar__brandline #about-toggle')).toHaveCount(1);
    await expect(page.locator('.toolbar__brandline #settings-toggle')).toHaveCount(1);
    await expect(page.locator('.toolbar__brandline #github-link')).toHaveCount(1);
    await expect(page.locator('.toolbar__tools #settings-toggle')).toHaveCount(0);
    await expect(page.locator('#settings-toggle')).toHaveText('');

    const order = await page.evaluate(() => [...document.querySelectorAll('.toolbar__brandline [id]')].map((el) => el.id));
    expect(order.indexOf('about-toggle')).toBeLessThan(order.indexOf('github-link'));
  });

  // The ids of the buttons and inputs in each section of the tools row.
  function toolbarSections(page) {
    return page.evaluate(() => {
      const sections = [...document.querySelectorAll('.toolbar__tools > .toolbar__section')];

      return sections.map((section) => [...section.querySelectorAll('sl-button, sl-input')].map((control) => control.id));
    });
  }

  // Each section of the tools row with its separator - 'visible', 'hidden' or
  // 'none' - and whether it ends a line, the next section starting lower down.
  function toolbarSeparators(page) {
    return page.evaluate(() => {
      const sections = [...document.querySelectorAll('.toolbar__tools > .toolbar__section')];

      return sections.map((section, i) => {
        const separator = getComputedStyle(section, '::after');
        const next = sections[i + 1];

        return {
          separator: separator.content === 'none' ? 'none' : separator.visibility,
          lineEnd: !next || next.getBoundingClientRect().top >= section.getBoundingClientRect().bottom,
        };
      });
    });
  }

  // The sections that show a separator at the end of a line, or hide one
  // between 2 sections on the same line.
  function misplacedSeparators(sections) {
    return sections.filter((section) => section.separator !== 'none' && section.lineEnd !== (section.separator === 'hidden'));
  }

  // The indexes of the sections whose separator is hidden.
  async function hiddenSeparators(page) {
    const sections = await toolbarSeparators(page);

    return sections.flatMap((section, i) => (section.separator === 'hidden' ? [i] : []));
  }

  // The index of the section that ends the first line of the tools row.
  async function firstLineEnd(page) {
    const sections = await toolbarSeparators(page);

    return sections.findIndex((section) => section.lineEnd);
  }

  // The space below the lowest control of each section of the tools row, in
  // whole pixels.
  function toolbarSectionSlack(page) {
    return page.evaluate(() => {
      const sections = [...document.querySelectorAll('.toolbar__tools > .toolbar__section')];

      return sections.map((section) => {
        const bottom = Math.max(...[...section.children].map((control) => control.getBoundingClientRect().bottom));

        return Math.round(section.getBoundingClientRect().bottom - bottom);
      });
    });
  }

  test('groups the toolbar tools into sections in order', async ({ page }) => {
    await expect(page.locator('.toolbar__tools > :not(.toolbar__section)')).toHaveCount(0);

    expect(await toolbarSections(page)).toEqual([
      ['doc-new', 'doc-open-btn', 'open-choose', 'doc-save', 'save-choose'],
      ['undo', 'redo'],
      ['mode-view', 'mode-build'],
      ['search', 'search-btn'],
      ['layout-run', 'layout-choose', 'tidy'],
      ['entities-toggle', 'table-toggle', 'legend-toggle', 'history-toggle'],
    ]);
  });

  test('ends every toolbar section but the last in a separator', async ({ page }) => {
    await page.setViewportSize({ width: 3000, height: 800 });
    await loadExample(page);

    const shown = { separator: 'visible', lineEnd: false };
    await expect.poll(() => toolbarSeparators(page)).toEqual([shown, shown, shown, shown, shown, { separator: 'none', lineEnd: true }]);
  });

  for (const width of dataProviderWrappedToolbarWidths()) {
    test(`hides the separator that ends each toolbar line ${width}px wide`, async ({ page }) => {
      await page.setViewportSize({ width: width, height: 800 });
      await loadExample(page);

      await expect.poll(async () => misplacedSeparators(await toolbarSeparators(page))).toEqual([]);
      expect(await toolbarSeparators(page)).toHaveLength(6);
      expect(await hiddenSeparators(page)).not.toEqual([]);
    });
  }

  function dataProviderWrappedToolbarWidths() {
    return [1440, 1280, 1000, 420];
  }

  test('hides the toolbar separators that end a line as the window narrows and shows them as it widens', async ({ page }) => {
    await page.setViewportSize({ width: 3000, height: 800 });
    await loadExample(page);
    await expect.poll(() => toolbarSeparators(page)).toHaveLength(6);

    await page.setViewportSize({ width: 1000, height: 800 });
    await expect.poll(() => hiddenSeparators(page)).not.toEqual([]);
    expect(misplacedSeparators(await toolbarSeparators(page))).toEqual([]);

    await page.setViewportSize({ width: 3000, height: 800 });
    await expect.poll(() => hiddenSeparators(page)).toEqual([]);
  });

  test('moves the hidden toolbar separator when a section grows past the end of its line', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await loadExample(page);
    await expect.poll(async () => misplacedSeparators(await toolbarSeparators(page))).toEqual([]);
    const lineEnd = await firstLineEnd(page);

    // Widens the Layout button by the room left at the end of the first line,
    // so the last section on that line moves down.
    await page.evaluate((index) => {
      const row = document.querySelector('.toolbar__tools').getBoundingClientRect();
      const last = document.querySelectorAll('.toolbar__tools > .toolbar__section')[index].getBoundingClientRect();

      document.querySelector('#layout-run .layout-label').style.paddingRight = row.right - last.right + 1 + 'px';
    }, lineEnd);

    await expect.poll(() => firstLineEnd(page)).toBe(lineEnd - 1);
    await expect.poll(async () => misplacedSeparators(await toolbarSeparators(page))).toEqual([]);
  });

  test('keeps each toolbar section as tall as its controls when its separator no longer fits beside them', async ({ page }) => {
    await page.setViewportSize({ width: 3000, height: 800 });
    await loadExample(page);

    // A window that leaves the row 8px wider than the first section's controls,
    // too narrow for the separator after them.
    const width = await page.evaluate(() => {
      const row = document.querySelector('.toolbar__tools').getBoundingClientRect();
      const section = document.querySelector('.toolbar__tools > .toolbar__section');
      const controls = section.lastElementChild.getBoundingClientRect().right - section.getBoundingClientRect().left;

      return Math.ceil(controls + 8 + window.innerWidth - row.width);
    });

    await page.setViewportSize({ width: width, height: 800 });
    await expect.poll(() => toolbarSectionSlack(page)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
