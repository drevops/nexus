import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadExample, slFill, slSelect, openDocument, createEntity, tapNode, selectEvent } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('builds a new entity and field and saves them', async ({ page }) => {
  await loadExample(page);

  await page.click('#mode-build');
  await page.click('[data-add-entity="node"]');
  await slFill(page, '[data-new-bundle]', 'campaign');
  await slFill(page, '[data-new-label]', 'Campaign');
  await page.click('[data-create-entity]');
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.campaign').length)).toBe(1);

  await page.click('[data-add-field]');
  await page.fill('[data-new-name]', 'field_body');
  await slFill(page, '[data-new-label]', 'Body');
  await page.click('[data-create-field]');
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('field:node.campaign:field_body').length)).toBe(1);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
  const campaign = doc.entities.find((e) => e.entityType === 'node' && e.bundle === 'campaign');
  expect(campaign).toBeTruthy();
  expect(campaign.fields.some((f) => f.name === 'field_body')).toBe(true);
});

test('adds a field from an entity + handle, then renames it', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.click('[data-add-entity="node"]');
  await slFill(page, '[data-new-bundle]', 'story');
  await slFill(page, '[data-new-label]', 'Story');
  await page.click('[data-create-entity]');

  await expect(page.locator('.handle--right')).toBeVisible();
  await page.click('.handle--right');

  // The field appears immediately (auto name), no creation dialog.
  await page.waitForFunction(() => window.__nexus.cy.nodes('[group="field"][entity="node.story"]').length === 1);
  await expect(page.locator('#inspector [data-new]')).toHaveCount(0);

  await slFill(page, '#inspector sl-input[data-machine-name]', 'field_summary');

  expect(await page.evaluate(() => window.__nexus.cy.getElementById('field:node.story:field_summary').length)).toBe(1);
});

// Viewport pixels from the bottom edges of Event's box and of its shown
// machine-name caption down to the top edge of its bottom handle.
function bottomHandleGaps(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const entity = cy.getElementById('node.event');
    const handleTop = document.querySelector('.handle--bottom').getBoundingClientRect().top;
    const boxBottom = cy.container().getBoundingClientRect().top + entity.renderedPosition('y') + entity.renderedOuterHeight() / 2;
    const names = [...document.querySelectorAll('#captions .caption:not(.caption--type)')];
    const caption = names.find((c) => c.textContent === 'event' && c.style.display === 'block');
    return { box: handleTop - boxBottom, caption: caption ? handleTop - caption.getBoundingClientRect().bottom : null };
  });
}

function expectJustBelow(gap) {
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(10);
}

for (const zoom of [0.5, 1, 2, 3]) {
  test(`keeps the bottom handle clear of the selected entity's machine name at ${zoom * 100}% zoom`, async ({ page }) => {
    await selectEvent(page, zoom);

    expectJustBelow((await bottomHandleGaps(page)).caption);
  });
}

test('keeps the bottom handle at the entity box while its captions are hidden', async ({ page }) => {
  await selectEvent(page, 0.3);

  const gaps = await bottomHandleGaps(page);
  expect(gaps.caption).toBeNull();
  expectJustBelow(gaps.box);
});

test('moves the bottom handle when machine names are toggled on a selected entity', async ({ page }) => {
  await selectEvent(page, 1);
  expectJustBelow((await bottomHandleGaps(page)).caption);

  await page.click('#machine-names');
  const hidden = await bottomHandleGaps(page);
  expect(hidden.caption).toBeNull();
  expectJustBelow(hidden.box);

  await page.click('#machine-names');
  expectJustBelow((await bottomHandleGaps(page)).caption);
});

test('adds a field below an entity from its bottom handle', async ({ page }) => {
  await selectEvent(page, 1);
  const before = await page.evaluate(() => window.__nexus.cy.nodes('[group="field"][entity="node.event"]').map((field) => field.id()));

  await page.click('.handle--bottom');

  await page.waitForFunction((count) => window.__nexus.cy.nodes('[group="field"][entity="node.event"]').length === count + 1, before.length);
  const offset = await page.evaluate((ids) => {
    const cy = window.__nexus.cy;
    const added = cy.nodes('[group="field"][entity="node.event"]').filter((field) => !ids.includes(field.id()));
    return added.position('y') - cy.getElementById('node.event').position('y');
  }, before);
  expect(offset).toBeGreaterThan(0);
});

test('reuses an existing field via autocomplete from the field tool', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');

  // A fresh entity with no "body" field yet.
  await page.click('[data-add-entity="node"]');
  await slFill(page, '[data-new-bundle]', 'promo');
  await page.click('[data-create-entity]');

  await page.click('#add-field');
  await slSelect(page, '[data-new-entity]', 'node.promo');
  expect(await page.evaluate(() => document.getElementById('existing-field-list').options.length)).toBeGreaterThan(0);

  // Typing an existing field name reuses its definition (type text_with_summary).
  await page.fill('[data-new-name]', 'body');
  await page.click('[data-create-field]');

  await page.waitForFunction(() => window.__nexus.cy.getElementById('field:node.promo:body').length === 1);
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('field:node.promo:body').data('fieldType'))).toBe('text_with_summary');
});

test('renames an entity machine name and migrates its fields', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.dragAndDrop('[data-add-entity="node"]', '#cy', { targetPosition: { x: 250, y: 200 } });
  await page.waitForFunction(() => window.__nexus.cy.nodes('[group="entity"]').length === 1);
  const oldId = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').first().id());

  await page.click('.handle--right');
  await page.waitForFunction(() => window.__nexus.cy.nodes('[group="field"]').length === 1);

  await page.evaluate(() => {
    const cy = window.__nexus.cy;
    cy.getElementById(cy.nodes('[group="entity"]').first().id()).emit('tap');
  });
  await slFill(page, '#inspector sl-input[data-machine-name]', 'article');

  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.article').length)).toBe(1);
  expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).length, oldId)).toBe(0);
  expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="field"][entity="node.article"]').length)).toBe(1);
});

test('derives machine names the same way for bundles, fields and custom entity types', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await createEntity(page, 'node', 'Blog  Post', 'Blog post');
  await page.click('.handle--right');
  await page.waitForFunction(() => window.__nexus.cy.getElementById('field:node.blog_post:field_1').nonempty());
  await slFill(page, '#inspector sl-input[data-machine-name]', 'Field__Body');

  await page.click('#settings-toggle');
  await page.fill('#settings [data-new-type]', 'My Widget__Type');
  await page.click('#settings [data-add-type]');

  const ids = await page.evaluate(() => window.__nexus.cy.nodes().map((node) => node.id()));
  expect(ids).toContain('node.blog_post');
  expect(ids).toContain('field:node.blog_post:field__body');
  await expect(page.locator('#settings [data-type-row="my_widget__type"]')).toHaveCount(1);
});

function annotationEdges(page) {
  return page.evaluate(() =>
    window.__nexus.cy
      .edges('[group="annotation"]')
      .map((edge) => edge.source().id() + '>' + edge.target().id() + ' ' + edge.data('label'))
      .sort(),
  );
}

test('keeps the annotation edges of a renamed entity and its fields', async ({ page }) => {
  await openDocument(page, {
    nexus: 1,
    title: 'Annotated renames',
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'Article',
        fields: [{ name: 'field_tags', label: 'Tags', fieldType: 'string', kind: 'single' }],
      },
    ],
    annotations: {
      nodes: [
        { id: 'sync', kind: 'api', label: 'Sync API' },
        { id: 'published', kind: 'event', label: 'Published' },
      ],
      edges: [
        { from: 'node.article', to: 'published', label: 'emits' },
        { from: 'sync', to: 'field:node.article:field_tags', label: 'fills' },
      ],
    },
  });
  await page.click('#mode-build');

  await tapNode(page, 'field:node.article:field_tags');
  await slFill(page, '#inspector sl-input[data-machine-name]', 'field_topics');
  await tapNode(page, 'node.article');
  await slFill(page, '#inspector sl-input[data-machine-name]', 'story');

  expect(await annotationEdges(page)).toEqual(['node.story>published emits', 'sync>field:node.story:field_topics fills']);
});

test('changes a field cardinality from the inspector', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.click('[data-add-entity="node"]');
  await slFill(page, '[data-new-bundle]', 'promo');
  await page.click('[data-create-entity]');

  await page.click('.handle--right');
  await page.waitForFunction(() => window.__nexus.cy.nodes('[group="field"]').length === 1);

  await slSelect(page, '#inspector sl-select[data-cardinality]', '5');
  const data = await page.evaluate(() => {
    const f = window.__nexus.cy.nodes('[group="field"]').first();
    return { cardinality: f.data('cardinality'), kind: f.data('kind') };
  });
  expect(data.cardinality).toBe(5);
  expect(data.kind).toBe('multi');
});
