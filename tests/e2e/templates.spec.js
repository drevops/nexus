import { test, expect } from '@playwright/test';
import { entityCount, openBeforeAppStarts, waitForGraph } from './helpers.js';
import { formatCount } from '../../src/entity-types.js';
import { TEMPLATES, summaryCounts, templateTitle } from '../../src/templates.js';

// 'npm run update-templates' rewrites each template's version and counts, so
// the tests read both from TEMPLATES.
function template(id) {
  return TEMPLATES.find((candidate) => candidate.id === id);
}

function countsText(id) {
  return summaryCounts(template(id))
    .map(({ type, count }) => formatCount(type, count))
    .join(' · ');
}

function bundleTotal(id) {
  return Object.values(template(id).counts).reduce((total, count) => total + count, 0);
}

test.describe('Templates', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  // Holds a template's diagram until the returned function is called.
  async function holdDiagram(page, id) {
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });

    await page.route('**/templates/' + id + '.nexus.json', async (route) => {
      await held;
      await route.continue();
    });

    return release;
  }

  function progressOpacity(page, id) {
    return page.locator('#template-' + id + ' .template-row__progress').evaluate((element) => Number(getComputedStyle(element).opacity));
  }

  test('shows a loading screen when a template is opened before its diagram has downloaded', async ({ page }) => {
    const release = await holdDiagram(page, 'civictheme');

    await page.goto('/index.html');
    await expect(page.locator('#landing')).not.toHaveAttribute('aria-busy');
    await page.click('#template-civictheme');
    await expect(page.locator('#loader')).toBeVisible();

    release();

    await waitForGraph(page);
    await expect(page.locator('#loader')).toBeHidden();
  });

  test('draws the template rows and downloads their diagrams before the app starts', async ({ page }) => {
    const start = await openBeforeAppStarts(page);
    const rows = page.locator('.template-row');

    await expect(rows).toHaveCount(TEMPLATES.length);

    for (const template of TEMPLATES) {
      await expect(page.locator('#template-' + template.id)).toHaveAttribute('data-download', 'done');
    }

    // A downloaded row opens nothing until the app starts, so its bar stays.
    await expect.poll(() => progressOpacity(page, 'civictheme')).toBe(1);
    expect(await page.locator('#template-civictheme').evaluate((element) => element.style.getPropertyValue('--progress'))).toBe('1');

    start();

    await expect(page.locator('#landing')).not.toHaveAttribute('aria-busy');
    await expect.poll(() => progressOpacity(page, 'civictheme')).toBe(0);
  });

  test('shows the download of a template diagram as a bar along its row', async ({ page }) => {
    const release = await holdDiagram(page, 'civictheme');
    const row = page.locator('#template-civictheme');

    await page.goto('/index.html');
    await expect(page.locator('#landing')).not.toHaveAttribute('aria-busy');

    await expect(row).toHaveAttribute('data-download', 'loading');
    await expect(row).toHaveAttribute('aria-busy', 'true');
    await expect.poll(() => progressOpacity(page, 'civictheme')).toBe(1);
    await expect(page.locator('#template-umami')).toHaveAttribute('data-download', 'done');

    release();

    await expect(row).toHaveAttribute('data-download', 'done');
    await expect(row).not.toHaveAttribute('aria-busy');
    await expect.poll(() => progressOpacity(page, 'civictheme')).toBe(0);
  });

  test('lists every template with its badge, its counts and a drawn mark', async ({ page }) => {
    const rows = page.locator('.template-row');

    await expect(rows).toHaveCount(5);
    const ids = await rows.evaluateAll((elements) => elements.map((element) => element.id));

    expect(ids).toEqual(['template-drupal-cms', 'template-civictheme', 'template-umami', 'template-thunder', 'template-open-social']);

    for (const [id, label] of dataProviderTemplateRows()) {
      const row = page.locator('#template-' + id);

      await expect(row.locator('.template-row__name')).toHaveText(label);
      await expect(row.locator('.template-row__badge')).toHaveText(template(id).version);
      await expect(row.locator('.template-row__counts')).toHaveText(countsText(id));
      expect(await row.locator('.template-row__mark svg.icon > *').count()).toBeGreaterThan(0);
    }
  });

  function dataProviderTemplateRows() {
    return [
      ['civictheme', 'CivicTheme'],
      ['drupal-cms', 'Drupal CMS'],
      ['umami', 'Umami'],
      ['thunder', 'Thunder'],
      ['open-social', 'Open Social'],
    ];
  }

  // 'counts' holds built-in bundles only, so a reference target of another
  // entity type is listed in 'targets'.
  for (const [id, entityId, placeholders, targets] of dataProviderTemplates()) {
    test(`loads the ${template(id).label} template`, async ({ page }) => {
      const entities = bundleTotal(id) + placeholders.length + targets.length;

      await page.click('#template-' + id);
      await waitForGraph(page);

      expect(await entityCount(page)).toBe(entities);

      for (const target of [entityId, ...targets]) {
        expect(await page.evaluate((node) => window.__nexus.cy.getElementById(node).length, target), target).toBe(1);
      }

      await expect(page.locator('#diagram-title')).toHaveJSProperty('value', templateTitle(template(id)));
      expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][bundle="*"]').map((node) => node.id()))).toEqual(placeholders);

      // The document holds no layout, so the app lays the entities out on open.
      const positions = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').map((node) => JSON.stringify(node.position())));

      expect(new Set(positions).size).toBe(entities);
    });
  }

  function dataProviderTemplates() {
    return [
      ['civictheme', 'paragraph.civictheme_accordion', ['block.*'], []],
      ['drupal-cms', 'node.blog', [], []],
      ['umami', 'node.recipe', [], []],
      ['thunder', 'paragraph.instagram', [], []],
      [
        'open-social',
        'node.topic',
        ['user.*', 'group_type.*'],
        ['meeting_api_meeting.big_blue_button', 'meeting_api_meeting.custom_link', 'group.flexible_group'],
      ],
    ];
  }

  test('downloads each template diagram once and opens a template with no further request', async ({ page }) => {
    const fetched = [];

    page.on('request', (request) => {
      if (request.url().includes('/templates/')) {
        fetched.push(new URL(request.url()).pathname);
      }
    });

    await page.goto('/index.html');

    for (const template of TEMPLATES) {
      await expect(page.locator('#template-' + template.id)).toHaveAttribute('data-download', 'done');
    }

    expect([...fetched].sort()).toEqual(TEMPLATES.map((template) => '/templates/' + template.id + '.nexus.json').sort());

    await page.click('#template-civictheme');
    await waitForGraph(page);

    expect(fetched).toHaveLength(TEMPLATES.length);
  });

  for (const [name, response, message] of dataProviderBrokenTemplates()) {
    test(`reports ${name} on the landing screen`, async ({ page }) => {
      await page.route('**/templates/civictheme.nexus.json', (route) => route.fulfill(response));
      await page.goto('/index.html');
      await page.click('#template-civictheme');

      await expect(page.locator('#landing-error')).toHaveAttribute('open', '');
      await expect(page.locator('#landing-error-text')).toHaveText('Could not load ' + templateTitle(template('civictheme')) + ': ' + message);
      await expect(page.locator('#landing')).toBeVisible();
      await expect(page.locator('#loader')).toBeHidden();
    });
  }

  function dataProviderBrokenTemplates() {
    return [
      ['a template diagram the server cannot find', { status: 404, body: 'Not found' }, 'civictheme.nexus.json returned 404'],
      ['a template file that is not a diagram', { status: 200, contentType: 'application/json', body: '{ "nexus": 1 }' }, 'Not a valid Nexus document.'],
    ];
  }

  test('asks to check the connection when a template cannot be downloaded', async ({ page }) => {
    await page.route('**/templates/civictheme.nexus.json', (route) => route.abort());
    await page.goto('/index.html');
    await page.click('#template-civictheme');

    await expect(page.locator('#landing-error-text')).toHaveText(
      'Could not load ' + templateTitle(template('civictheme')) + ': civictheme.nexus.json could not be downloaded. Check your connection and try again.',
    );
    await expect(page.locator('#landing')).toBeVisible();
  });

  test('marks a row whose diagram fails to download and downloads it again when clicked', async ({ page }) => {
    let failures = 1;
    const row = page.locator('#template-civictheme');

    await page.route('**/templates/civictheme.nexus.json', (route) => {
      if (failures-- > 0) {
        return route.abort();
      }

      return route.continue();
    });
    await page.goto('/index.html');

    await expect(row).toHaveAttribute('data-download', 'failed');
    await expect.poll(() => progressOpacity(page, 'civictheme')).toBe(1);

    await page.click('#template-civictheme');
    await waitForGraph(page);

    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', templateTitle(template('civictheme')));
    await expect(row).toHaveAttribute('data-download', 'done');
  });

  test('loads a template from the keyboard', async ({ page }) => {
    await page.focus('#template-drupal-cms');
    await page.keyboard.press('Enter');
    await waitForGraph(page);

    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', templateTitle(template('drupal-cms')));
  });
});
