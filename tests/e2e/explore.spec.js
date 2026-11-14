import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createEntity, downloadFrom, exploreFrom, hoverNode, nodePositions, openDocument, openEntityMenu, slSelect, tapNode } from './helpers.js';

test.describe('Explore', { tag: '@runner-2' }, () => {
  // Landing references Hero and Text, Hero references Image, Image
  // references Tags and Tags references Landing, so Landing, Hero, Image and
  // Tags form a cycle. Article references Image, and Promo has no
  // references. The Sync API is attached to Article, and the Lone event to
  // nothing.
  const reference = (name, targetType, targetBundles) => ({
    name: name,
    label: name,
    fieldType: 'entity_reference',
    kind: 'single',
    targetType,
    targetBundles,
  });
  const EXPLORE_DOC = {
    nexus: 1,
    title: 'Explore',
    entities: [
      { entityType: 'node', bundle: 'landing', label: 'Landing', fields: [reference('field_sections', 'paragraph', ['hero', 'text'])] },
      { entityType: 'node', bundle: 'article', label: 'Article', fields: [reference('field_image', 'media', ['image'])] },
      { entityType: 'paragraph', bundle: 'hero', label: 'Hero', fields: [reference('field_media', 'media', ['image'])] },
      { entityType: 'paragraph', bundle: 'text', label: 'Text', fields: [{ name: 'field_body', label: 'Body', fieldType: 'text_long', kind: 'single' }] },
      { entityType: 'media', bundle: 'image', label: 'Image', fields: [reference('field_tags', 'taxonomy_term', ['tags'])] },
      { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', fields: [reference('field_featured', 'node', ['landing'])] },
      { entityType: 'block_content', bundle: 'promo', label: 'Promo', fields: [] },
    ],
    annotations: {
      nodes: [
        { id: 'sync', kind: 'api', label: 'Sync' },
        { id: 'lone', kind: 'event', label: 'Lone' },
      ],
      edges: [{ from: 'sync', to: 'node.article', label: 'fills' }],
    },
  };

  const ALL_ENTITIES = ['block_content.promo', 'media.image', 'node.article', 'node.landing', 'paragraph.hero', 'paragraph.text', 'taxonomy_term.tags'];

  function shownEntities(page) {
    return page.evaluate(() =>
      window.__nexus.cy
        .nodes('[group="entity"]')
        .filter((node) => node.visible())
        .map((node) => node.id())
        .sort(),
    );
  }

  function shownIds(page) {
    return page.evaluate(() =>
      window.__nexus.cy
        .nodes()
        .filter((node) => node.visible())
        .map((node) => node.id())
        .sort(),
    );
  }

  function viewport(page) {
    return page.evaluate(() => ({ zoom: window.__nexus.cy.zoom(), pan: { ...window.__nexus.cy.pan() } }));
  }

  async function choose(page, depth, direction) {
    await slSelect(page, '#explore-depth', String(depth));
    await slSelect(page, '#explore-direction', direction);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await openDocument(page, EXPLORE_DOC);
  });

  test('opens the explore view from the right-click menu in View mode and names it in the status bar', async ({ page }) => {
    const undo = await page.locator('#undo').getAttribute('title');

    await openEntityMenu(page, 'media.image');
    await expect(page.locator('#entity-menu sl-menu-item')).toHaveText('Explore from here');
    await page.click('#entity-menu [data-explore]');

    await expect(page.locator('#entity-menu')).toBeHidden();
    await expect(page.locator('#explore-bar')).toBeVisible();
    await expect(page.locator('#statusbar-hint')).toBeHidden();
    await expect(page.locator('#explore-entity')).toHaveText('Image');
    await expect(page.locator('#explore-entity')).toHaveAttribute('title', 'Showing Image and what it references or is referenced by, up to 1 reference away');
    await expect(page.locator('#explore-depth')).toHaveJSProperty('value', '1');
    await expect(page.locator('#explore-direction')).toHaveJSProperty('value', 'both');
    expect(await shownEntities(page)).toEqual(['media.image', 'node.article', 'paragraph.hero', 'taxonomy_term.tags']);
    await expect(page.locator('#undo')).toHaveAttribute('title', undo);
  });

  test('hides the tooltip of the entity when its menu opens and when the view lays the entities out', async ({ page }) => {
    await hoverNode(page, 'media.image');
    await expect(page.locator('#tooltip')).toBeVisible();

    await openEntityMenu(page, 'media.image');
    await expect(page.locator('#tooltip')).toBeHidden();

    await hoverNode(page, 'media.image');
    await page.click('#entity-menu [data-explore]');
    await expect(page.locator('#tooltip')).toBeHidden();
  });

  test('keeps the status bar inside a narrow window while the view holds', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 600 });
    await exploreFrom(page, 'media.image');

    const overflow = await page.locator('#statusbar').evaluate((bar) => bar.scrollWidth - bar.clientWidth);
    const zoom = await page.locator('#zoom-level').boundingBox();

    expect(overflow).toBe(0);
    expect(zoom.x + zoom.width).toBeLessThanOrEqual(760);
  });

  test('closes the entity menu on Escape and on a press outside it', async ({ page }) => {
    await openEntityMenu(page, 'media.image');
    await page.keyboard.press('Escape');
    await expect(page.locator('#entity-menu')).toBeHidden();

    await openEntityMenu(page, 'media.image');
    await page.locator('#statusbar').click({ position: { x: 2, y: 2 } });
    await expect(page.locator('#entity-menu')).toBeHidden();
    await expect(page.locator('#explore-bar')).toBeHidden();
  });

  test('opens the explore view from the entity Inspector in Edit mode', async ({ page }) => {
    await page.click('#mode-build');
    await tapNode(page, 'node.article');
    await page.click('#inspector [data-explore-entity]');

    await expect(page.locator('#explore-entity')).toHaveText('Article');
    expect(await shownEntities(page)).toEqual(['media.image', 'node.article']);

    // A view started from another entity replaces the first.
    await tapNode(page, 'paragraph.text');
    await page.click('#inspector [data-explore-entity]');

    await expect(page.locator('#explore-entity')).toHaveText('Text');
    expect(await shownEntities(page)).toEqual(['node.landing', 'paragraph.text']);
  });

  test('shows the entities within each depth and direction and lays them out again', async ({ page }) => {
    await exploreFrom(page, 'media.image');

    for (const [depth, direction, expected] of dataProviderDepthsAndDirections()) {
      await page.evaluate(() => {
        window.__nexus.cy.zoom(0.5);
      });
      await choose(page, depth, direction);

      expect(await shownEntities(page), `${depth} ${direction}`).toEqual(expected);
      expect((await viewport(page)).zoom, `${depth} ${direction}`).toBe(1);
    }
  });

  function dataProviderDepthsAndDirections() {
    return [
      [1, 'out', ['media.image', 'taxonomy_term.tags']],
      [2, 'out', ['media.image', 'node.landing', 'taxonomy_term.tags']],
      [3, 'out', ['media.image', 'node.landing', 'paragraph.hero', 'paragraph.text', 'taxonomy_term.tags']],
      [5, 'out', ['media.image', 'node.landing', 'paragraph.hero', 'paragraph.text', 'taxonomy_term.tags']],
      [1, 'in', ['media.image', 'node.article', 'paragraph.hero']],
      [2, 'in', ['media.image', 'node.article', 'node.landing', 'paragraph.hero']],
      [3, 'in', ['media.image', 'node.article', 'node.landing', 'paragraph.hero', 'taxonomy_term.tags']],
      [1, 'both', ['media.image', 'node.article', 'paragraph.hero', 'taxonomy_term.tags']],
      [2, 'both', ['media.image', 'node.article', 'node.landing', 'paragraph.hero', 'taxonomy_term.tags']],
      [3, 'both', ['media.image', 'node.article', 'node.landing', 'paragraph.hero', 'paragraph.text', 'taxonomy_term.tags']],
    ];
  }

  test('keeps the depth and direction for the next explore view', async ({ page }) => {
    await exploreFrom(page, 'media.image');
    await choose(page, 2, 'in');
    await page.click('#explore-clear');

    await exploreFrom(page, 'node.landing');

    await expect(page.locator('#explore-depth')).toHaveJSProperty('value', '2');
    await expect(page.locator('#explore-direction')).toHaveJSProperty('value', 'in');
    expect(await shownEntities(page)).toEqual(['media.image', 'node.landing', 'taxonomy_term.tags']);
  });

  test('hides the fields, proxies and annotations outside the view', async ({ page }) => {
    await exploreFrom(page, 'node.article');
    await choose(page, 1, 'out');

    expect(await shownIds(page)).toEqual([
      'field:media.image:field_tags',
      'field:node.article:field_image',
      'media.image',
      'node.article',
      'proxy:field:node.article:field_image>media.image',
      'sync',
    ]);
  });

  test('restores the visibility, positions and view when cleared, with no history step', async ({ page }) => {
    const positions = await nodePositions(page);
    const view = await viewport(page);
    const shown = await shownIds(page);
    const undo = await page.locator('#undo').getAttribute('title');

    await exploreFrom(page, 'media.image');
    await choose(page, 2, 'out');
    expect(await nodePositions(page)).not.toEqual(positions);

    await page.click('#explore-clear');

    await expect(page.locator('#explore-bar')).toBeHidden();
    await expect(page.locator('#statusbar-hint')).toBeVisible();
    expect(await shownEntities(page)).toEqual(ALL_ENTITIES);
    expect(await shownIds(page)).toEqual(shown);
    expect(await nodePositions(page)).toEqual(positions);
    expect(await viewport(page)).toEqual(view);
    await expect(page.locator('#undo')).toHaveAttribute('title', undo);
  });

  test('saves the diagram with its own layout while the view holds', async ({ page }) => {
    const positions = await nodePositions(page, '[group="entity"]');

    await exploreFrom(page, 'node.article');
    const download = await downloadFrom(page, '#doc-save');
    const saved = JSON.parse(readFileSync(await download.path(), 'utf8'));

    for (const [id, position] of Object.entries(positions)) {
      expect(saved.layout[id], id).toEqual({ x: Math.round(position.x), y: Math.round(position.y) });
    }

    expect(await shownEntities(page)).toEqual(['media.image', 'node.article']);
  });

  test('ends the view before an undo', async ({ page }) => {
    await page.click('#mode-build');
    await createEntity(page, 'node', 'extra', 'Extra');
    const positions = await nodePositions(page);

    await exploreFrom(page, 'node.article');
    await page.click('#undo');

    await expect(page.locator('#explore-bar')).toBeHidden();
    expect(await shownEntities(page)).toEqual(ALL_ENTITIES);
    delete positions['node.extra'];
    expect(await nodePositions(page)).toEqual(positions);
  });

  test('ends the view when the entity it started from is deleted', async ({ page }) => {
    await page.click('#mode-build');
    await tapNode(page, 'node.article');
    await page.click('#inspector [data-explore-entity]');

    await page.click('#inspector .insp__delete');

    await expect(page.locator('#explore-bar')).toBeHidden();
    expect(await shownEntities(page)).toEqual(ALL_ENTITIES.filter((id) => id !== 'node.article'));
  });

  test('ends the view when another diagram opens', async ({ page }) => {
    await exploreFrom(page, 'node.article');

    await openDocument(page, EXPLORE_DOC);

    await expect(page.locator('#explore-bar')).toBeHidden();
    expect(await shownEntities(page)).toEqual(ALL_ENTITIES);
  });
});
