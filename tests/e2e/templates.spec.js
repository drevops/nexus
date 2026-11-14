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

  test('shows a loading screen while a template loads', async ({ page }) => {
    await page.route('**/templates/civictheme.nexus.json', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      route.continue();
    });
    await page.click('#template-civictheme');
    await expect(page.locator('#loader')).toBeVisible();
    await waitForGraph(page);
    await expect(page.locator('#loader')).toBeHidden();
  });

  test('shows a loader in place of the templates until the app starts', async ({ page }) => {
    const start = await openBeforeAppStarts(page);
    const loader = page.locator('#template-list .template-list__loader');

    await expect(loader).toBeVisible();
    await expect(loader).toHaveText('Loading templates…');
    await expect(loader).toHaveAttribute('role', 'status');
    await expect(page.locator('.template-row')).toHaveCount(0);

    start();

    await expect(page.locator('.template-row')).toHaveCount(TEMPLATES.length);
    await expect(loader).toHaveCount(0);
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

  test('loads a template as 1 saved diagram', async ({ page }) => {
    const fetched = [];

    page.on('request', (request) => {
      if (request.url().includes('/templates/')) {
        fetched.push(new URL(request.url()).pathname);
      }
    });

    await page.click('#template-civictheme');
    await waitForGraph(page);

    expect(fetched).toEqual(['/templates/civictheme.nexus.json']);
  });

  for (const [name, response, message] of dataProviderBrokenTemplates()) {
    test(`reports ${name} on the landing screen`, async ({ page }) => {
      await page.route('**/templates/civictheme.nexus.json', (route) => route.fulfill(response));
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
    await page.click('#template-civictheme');

    await expect(page.locator('#landing-error-text')).toHaveText(
      'Could not load ' + templateTitle(template('civictheme')) + ': civictheme.nexus.json could not be downloaded. Check your connection and try again.',
    );
    await expect(page.locator('#landing')).toBeVisible();
  });

  test('loads a template from the keyboard', async ({ page }) => {
    await page.focus('#template-drupal-cms');
    await page.keyboard.press('Enter');
    await waitForGraph(page);

    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', templateTitle(template('drupal-cms')));
  });
});
