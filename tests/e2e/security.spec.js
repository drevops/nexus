import { test, expect } from '@playwright/test';
import { copyLink, entityCount, hoverNode, linkTo, loadExample, openDocument, openFrom, pasteDiagram, saveFrom, waitForGraph } from './helpers.js';

test.describe('Security', { tag: '@runner-1' }, () => {
  // Markup that runs script when a colour reaches innerHTML unchecked.
  const MARKUP = '#d9e2f3"/><img src="x" onerror="window.__injected = true">';

  // A document whose type styles carry markup.
  const CRAFTED = {
    nexus: 1,
    title: 'Crafted',
    colors: { node: MARKUP },
    symbols: { node: 'tag"/><img src="x" onerror="window.__injected = true">' },
    customTypes: [{ type: 'event"]', label: 'Event' }],
    entities: [{ entityType: 'node', bundle: 'article', label: 'Article', fields: [] }],
  };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__violations = [];
      document.addEventListener('securitypolicyviolation', (event) => window.__violations.push(event.violatedDirective + ' ' + event.blockedURI));
    });
    await page.goto('/index.html');
  });

  test('runs the main flows without a Content Security Policy violation', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await page.click('#table-toggle');
    await page.click('#history-toggle');
    await page.click('#settings-toggle');
    await expect(page.locator('#settings')).toBeVisible();

    for (const format of ['png', 'svg', 'csv', 'json']) {
      await saveFrom(page, format);
    }

    await copyLink(page);
    await page.click('#link-close');
    await page.goto(await linkTo(page, CRAFTED));
    await expect.poll(() => entityCount(page)).toBe(1);

    await openFrom(page, 'ai');
    await expect(page.locator('#ai-skill')).toContainText('create-nexus-diagram');

    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });

  for (const [name, open] of dataProviderCraftedSources()) {
    test(`draws the default colour and symbol for type styles carrying markup in ${name}`, async ({ page }) => {
      await open(page, CRAFTED);

      const swatch = page.locator('.legend__swatch').first();
      await expect(swatch.locator('svg')).toHaveCount(1);
      await expect(swatch.locator('img')).toHaveCount(0);
      await expect(swatch.locator('rect')).toHaveAttribute('fill', '#d9e2f3');
      expect(await page.evaluate(() => window.__injected)).toBeUndefined();
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });
  }

  function dataProviderCraftedSources() {
    return [
      ['an opened document', (page, doc) => openDocument(page, doc)],
      [
        'a pasted reply',
        async (page, doc) => {
          await pasteDiagram(page, JSON.stringify(doc));
          await waitForGraph(page);
        },
      ],
      [
        'a link',
        async (page, doc) => {
          await page.goto(await linkTo(page, doc, 'node.article'));
          await waitForGraph(page);
        },
      ],
    ];
  }

  // Help text and a bundle description that run script if their markup is
  // drawn as written.
  const HOSTILE_TEXT =
    'Use <em>this</em><img src="x" onerror="window.__injected = true"><script>window.__injected = true</script>' +
    '<a href="javascript:window.__injected = true" onclick="window.__injected = true">here</a>&lt;img src=x onerror=1&gt;';

  test('draws the allowed markup of help text and descriptions and nothing that runs', async ({ page }) => {
    await openDocument(page, {
      nexus: 1,
      title: 'Hostile text',
      entities: [
        {
          entityType: 'node',
          bundle: 'article',
          label: 'Article',
          description: HOSTILE_TEXT,
          fields: [{ name: 'field_summary', label: 'Summary', fieldType: 'string', kind: 'single', description: HOSTILE_TEXT }],
        },
      ],
    });
    await page.click('#table-toggle');

    const help = page.locator('#field-table td[data-column="description"]');
    const description = page.locator('#field-table .field-table__description');

    await hoverNode(page, 'field:node.article:field_summary');
    const tooltip = page.locator('#tooltip .tooltip__text');

    for (const area of [help, description, tooltip]) {
      await expect(area.locator('em')).toHaveText('this');
      await expect(area.locator('img, script, a')).toHaveCount(0);
      await expect(area.locator('.rich-text__link')).toHaveText('here');
      await expect(area).toContainText('<img src=x onerror=1>');
    }

    await help.locator('.rich-text__link').click();
    await page.keyboard.press('Escape');

    expect(await page.evaluate(() => window.__injected)).toBeUndefined();
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });

  test('ignores stored type styles carrying markup', async ({ page }) => {
    await page.evaluate((markup) => {
      window.localStorage.setItem('nexusSettings', JSON.stringify({ colors: { node: markup }, customTypes: [{ type: 'x"]', label: 'X' }] }));
    }, MARKUP);
    await page.reload();
    await openDocument(page, { nexus: 1, entities: [{ entityType: 'node', bundle: 'article', label: 'Article', fields: [] }] });

    await expect(page.locator('.legend__swatch rect').first()).toHaveAttribute('fill', '#d9e2f3');
    await expect(page.locator('.legend__swatch img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  });

  for (const [name, customTypes] of dataProviderInheritedTypeNames()) {
    test(`draws the fallback colour for an entity type named after an object property ${name}`, async ({ page }) => {
      await openDocument(page, { nexus: 1, customTypes: customTypes, entities: [{ entityType: 'constructor', bundle: 'event', label: 'Event', fields: [] }] });

      const fill = await page.evaluate(() => window.__nexus.cy.getElementById('constructor.event').style('background-color'));
      expect(fill).toBe('rgb(236,239,243)');
    });
  }

  function dataProviderInheritedTypeNames() {
    return [
      ['as a custom type', [{ type: 'constructor', label: 'Constructor' }]],
      ['with no custom type', []],
    ];
  }
});
