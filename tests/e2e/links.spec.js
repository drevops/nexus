import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { copyLink, entityCount, linkTo, loadExample, openDocument, tapNode, waitForGraph } from './helpers.js';

test.describe('Links', { tag: '@runner-2' }, () => {
  // A diagram with its own type settings and layout.
  const STYLED = {
    nexus: 1,
    title: 'Styled',
    colors: { node: '#123456', event: '#abcdef' },
    symbols: { node: 'diamond', event: 'ellipse' },
    customTypes: [{ type: 'event', label: 'Event' }],
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'Article',
        fields: [{ name: 'field_launch', label: 'Launch', fieldType: 'entity_reference', kind: 'single', targetType: 'event', targetBundles: ['launch'] }],
      },
      { entityType: 'event', bundle: 'launch', label: 'Launch', fields: [] },
    ],
    layout: { 'node.article': { x: 10, y: 20 }, 'field:node.article:field_launch': { x: 300, y: 40 }, 'event.launch': { x: -400, y: 260 } },
  };

  // A diagram whose descriptions don't compress, so its link passes the
  // limit.
  function largeDocument() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let seed = 7;
    const text = (length) =>
      Array.from({ length: length }, () => {
        seed = (seed * 48271) % 2147483647;
        return alphabet[seed % alphabet.length];
      }).join('');

    return {
      nexus: 1,
      title: 'Large',
      entities: Array.from({ length: 200 }, (_, i) => ({ entityType: 'node', bundle: 'b' + i, label: 'B' + i, description: text(256), fields: [] })),
    };
  }

  // The saved document of the open diagram, without its panel layout.
  async function savedDocument(page) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
    const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));

    delete doc.ui;

    return doc;
  }

  function linkedDocument(page, link) {
    return page.evaluate(async (url) => {
      const { decodeDocument, linkParams } = await import('./src/doc-link.js');

      return decodeDocument(linkParams(new URL(url).hash).encoded);
    }, link);
  }

  function focusState(page, id) {
    return page.evaluate((nodeId) => {
      const cy = window.__nexus.cy;
      const box = cy.getElementById(nodeId).renderedBoundingBox();

      return {
        faded: cy.getElementById(nodeId).hasClass('faded'),
        othersFaded: cy.nodes('[group="entity"].faded').length > 0,
        inView: box.x1 >= 0 && box.y1 >= 0 && box.x2 <= cy.width() && box.y2 <= cy.height(),
      };
    }, id);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('copies a link that opens the same model, layout and type settings', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openDocument(page, STYLED);
    const before = await savedDocument(page);

    await copyLink(page);

    await expect(page.locator('#link-text')).toHaveText('Copied a link to this diagram. The diagram travels inside the link.');
    await expect(page.locator('#link-protection')).toBeVisible();
    await expect(page.locator('#link-limits')).toBeVisible();
    const link = await page.locator('#link-url').evaluate((input) => input.value);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    expect(link.startsWith(new URL('/index.html#doc=', page.url()).href)).toBe(true);
    expect(link).toMatch(/#doc=[A-Za-z0-9_-]+$/);
    expect((await linkedDocument(page, link)).ui).toBeNull();

    const other = await context.newPage();
    await other.goto(link);
    await waitForGraph(other);

    await expect(other.locator('#landing')).toBeHidden();
    expect(await savedDocument(other)).toEqual(before);
    expect(
      await other.evaluate(() => {
        const node = window.__nexus.cy.getElementById('node.article');
        return [node.style('shape'), node.style('background-color')];
      }),
    ).toEqual(['diamond', 'rgb(18,52,86)']);
  });

  test('opens a link without a request to any server', async ({ page, context }) => {
    await loadExample(page);
    const link = await linkTo(page, await savedDocument(page));

    const other = await context.newPage();
    const requests = [];
    other.on('request', (request) => requests.push({ url: request.url(), type: request.resourceType() }));
    await other.goto(link);
    await waitForGraph(other);

    expect(await entityCount(other)).toBe(16);
    expect(requests.filter((request) => ['fetch', 'xhr', 'websocket', 'eventsource'].includes(request.type))).toEqual([]);
    const origin = new URL(link).origin + '/';
    expect(requests.filter((request) => !request.url.startsWith(origin) && !request.url.startsWith('data:'))).toEqual([]);
    expect(requests.filter((request) => request.url.includes('doc='))).toEqual([]);
  });

  test('puts the focused entity in the link and centres it once the diagram is drawn', async ({ page, context }) => {
    await loadExample(page);
    await tapNode(page, 'node.event');
    await copyLink(page);
    const link = await page.locator('#link-url').evaluate((input) => input.value);

    expect(link).toMatch(/&focus=node\.event$/);

    const other = await context.newPage();
    await other.goto(link);
    await waitForGraph(other);

    await expect.poll(() => focusState(other, 'node.event')).toEqual({ faded: false, othersFaded: true, inView: true });
  });

  test('leaves the focus out of a link to a diagram with nothing focused', async ({ page }) => {
    await loadExample(page);
    await copyLink(page);

    expect(await page.locator('#link-url').evaluate((input) => input.value)).not.toContain('focus=');
  });

  for (const [name, focus] of dataProviderIgnoredFocus()) {
    test(`opens a link focusing ${name} with nothing focused`, async ({ page }) => {
      await page.goto(await linkTo(page, STYLED, focus));
      await waitForGraph(page);

      expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBe(0);
    });
  }

  function dataProviderIgnoredFocus() {
    return [
      ['an unknown id', 'node.missing'],
      ['a field', 'field:node.article:field_launch'],
    ];
  }

  test('opens a link put into the address bar of an open diagram', async ({ page }) => {
    await loadExample(page);
    const link = await linkTo(page, await savedDocument(page), 'node.event');
    await openDocument(page, STYLED);

    await page.goto(link);

    await expect.poll(() => entityCount(page)).toBe(16);
    await expect.poll(() => focusState(page, 'node.event')).toEqual({ faded: false, othersFaded: true, inView: true });
  });

  test('selects the link to copy when the clipboard is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error('NotAllowedError'));
    });
    await page.goto('/index.html');
    await loadExample(page);

    await copyLink(page);

    await expect(page.locator('#link-text')).toContainText('Copy the link below.');
    await expect
      .poll(() =>
        page.locator('#link-url').evaluate((host) => {
          const input = host.shadowRoot.querySelector('input');
          return input.selectionStart === 0 && input.selectionEnd === host.value.length && host.value.length > 0;
        }),
      )
      .toBe(true);
  });

  test('copies the link again from the dialog', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loadExample(page);
    await copyLink(page);
    await page.evaluate(() => navigator.clipboard.writeText('something else'));

    await page.click('#link-copy');

    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(await page.locator('#link-url').evaluate((input) => input.value));
    await page.click('#link-close');
    await expect(page.locator('#link-dialog')).not.toHaveAttribute('open', '');
  });

  test('offers the .nexus.json instead of a link longer than the limit', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openDocument(page, largeDocument());
    await page.evaluate(() => navigator.clipboard.writeText('unchanged'));

    await copyLink(page);

    await expect(page.locator('#link-text')).toContainText('longer than the 32,000 a link can hold');
    await expect(page.locator('#link-url')).toBeHidden();
    await expect(page.locator('#link-copy')).toBeHidden();
    await expect(page.locator('#link-limits')).toBeVisible();
    await expect(page.locator('#link-protection')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('unchanged');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#link-save')]);

    expect(download.suggestedFilename()).toBe('large.nexus.json');
    await expect(page.locator('#link-dialog')).not.toHaveAttribute('open', '');
  });

  for (const [name, fragment, message] of dataProviderBrokenLinks()) {
    test(`shows the open alert for ${name} and keeps the landing screen usable`, async ({ page }) => {
      await page.goto('/index.html#' + (await fragment(page)));

      await expect(page.locator('#landing')).toBeVisible();
      await expect(page.locator('#landing-error')).toHaveAttribute('open', '');
      await expect(page.locator('#landing-error-text')).toHaveText('Could not open that diagram: ' + message);
      await expect(page.locator('#loader')).toBeHidden();

      await page.click('#template-drupal-cms');
      await waitForGraph(page);
      await expect(page.locator('#landing')).toBeHidden();
    });
  }

  function dataProviderBrokenLinks() {
    const damaged = 'The link is incomplete or damaged.';
    const fragmentOf = async (page, doc) => new URL(await linkTo(page, doc)).hash.slice(1);

    return [
      ['an empty document', async () => 'doc=', damaged],
      ['characters outside base64url', async () => 'doc=abc$def', damaged],
      ['data that is not compressed', async () => 'doc=bm90IGEgZGlhZ3JhbQ', damaged],
      [
        'a truncated link',
        async (page) => {
          const fragment = await fragmentOf(page, STYLED);
          return fragment.slice(0, fragment.length - 12);
        },
        damaged,
      ],
      ['JSON that is not a document', (page) => fragmentOf(page, [1, 2]), 'Not a valid Nexus document.'],
    ];
  }

  test('leaves an ordinary fragment alone', async ({ page }) => {
    await page.goto('/index.html#annotation-overlay');

    await expect(page.locator('#landing')).toBeVisible();
    await expect(page.locator('#landing-error')).not.toHaveAttribute('open', '');
  });
});
