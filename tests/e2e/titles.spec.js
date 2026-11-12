import { test, expect } from '@playwright/test';
import { loadExample, tapNode } from './helpers.js';

test.describe('Titles', { tag: '@runner-1' }, () => {
  // Describes each visible control, table header and badge that shows no
  // title on hover. A native control inside a titled label shows the label's
  // title. Options read as their own text and a note badge shows the note, so
  // neither needs one.
  function untitledControls(page) {
    return page.evaluate(() => {
      const selector = [
        'button',
        'a[href]',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[role="button"]',
        'sl-button',
        'sl-input',
        'sl-select',
        'sl-switch',
        'sl-checkbox',
        'sl-color-picker',
        'sl-textarea',
        'sl-tag',
        'sl-menu-item',
        'th',
        '.badge',
        '.dock__resize',
        '.panel__vresize',
        '.handle',
      ].join(', ');
      const shown = (element) => {
        const rect = element.getBoundingClientRect();

        return rect.width > 1 && rect.height > 1 && getComputedStyle(element).visibility !== 'hidden';
      };
      const titled = (element) => !!element.getAttribute('title') || (/^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName) && !!element.closest('label[title]'));

      return [...document.querySelectorAll(selector)]
        .filter((element) => shown(element) && !titled(element))
        .map((element) => element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') + ' "' + (element.textContent || '').trim().slice(0, 30) + '"');
    });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  // Each case opens 1 screen, panel, form or menu.
  for (const [name, open] of dataProviderTitledScreens()) {
    test(`titles every control, header and badge on ${name}`, async ({ page }) => {
      await open(page);

      expect(await untitledControls(page)).toEqual([]);
    });
  }

  function dataProviderTitledScreens() {
    const editing = async (page) => {
      await loadExample(page);
      await page.click('#mode-build');
    };
    const menu = (trigger, menuId) => async (page) => {
      await loadExample(page);
      await page.click(trigger);
      await expect(page.locator(menuId)).toBeVisible();
    };

    return [
      ['the landing screen', (page) => page.goto('/index.html')],
      [
        'every panel',
        async (page) => {
          await loadExample(page);

          for (const toggle of ['#entities-toggle', '#table-toggle', '#history-toggle', '#settings-toggle']) {
            await page.click(toggle);
          }

          await expect(page.locator('#settings [data-default="layout"]')).toBeVisible();
        },
      ],
      [
        'the entity Inspector',
        async (page) => {
          await editing(page);
          await tapNode(page, 'node.event');
          await expect(page.locator('#inspector [data-add-field]')).toBeVisible();
        },
      ],
      [
        'the field Inspector',
        async (page) => {
          await editing(page);
          await tapNode(page, 'field:node.event:field_media');
          await expect(page.locator('#inspector .insp__reftag').first()).toBeVisible();
        },
      ],
      [
        'the annotation Inspector',
        async (page) => {
          await editing(page);
          await tapNode(page, 'ticketing_api');
          await expect(page.locator('#inspector .insp__title')).toHaveText('Annotation');
        },
      ],
      [
        'the new entity form',
        async (page) => {
          await editing(page);
          await page.click('[data-add-entity="node"]');
          await expect(page.locator('#inspector [data-new-bundle]')).toBeVisible();
        },
      ],
      [
        'the new field form',
        async (page) => {
          await editing(page);
          await tapNode(page, 'node.event');
          await page.click('#inspector [data-add-field]');
          await expect(page.locator('#inspector [data-new-name]')).toBeVisible();
        },
      ],
      [
        'the bulk fields form',
        async (page) => {
          await editing(page);
          await tapNode(page, 'node.event');
          await page.click('#inspector [data-bulk-fields]');
          await expect(page.locator('#inspector [data-copy-from]')).toBeVisible();
        },
      ],
      ['the open menu', menu('#open-choose', '#open-menu')],
      ['the save menu', menu('#save-choose', '#save-menu')],
      ['the layout menu', menu('#layout-choose', '#layout-menu')],
      ['the zoom menu', menu('#zoom-level', '#zoom-menu')],
      ...['prompt', 'skill', 'install'].map((tab) => [
        `the ${tab} tab of the Create with AI dialog`,
        async (page) => {
          await page.click('#landing-ai');
          await page.click('#ai-tab-' + tab);
          await expect(page.locator(`sl-tab-panel[name="${tab}"]`)).toBeVisible();
        },
      ]),
      [
        'the About box',
        async (page) => {
          await loadExample(page);
          await page.click('#about-toggle');
          await expect(page.locator('#about-close')).toBeVisible();
        },
      ],
    ];
  }

  test('titles the whole of a Shoelace control the app draws, not only its inner element', async ({ page }) => {
    await loadExample(page);
    await page.click('#settings-toggle');

    const fields = page.locator('#settings [data-default="fields"]');
    await expect(fields).toHaveAttribute('title', 'Show the fields of each entity in a new diagram');
    expect(await fields.evaluate((element) => element.shadowRoot.querySelector('input').getAttribute('title'))).toBe(
      'Show the fields of each entity in a new diagram',
    );
  });
});
