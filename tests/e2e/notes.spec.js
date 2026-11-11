import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadExample, slFill, createEntity, buildStoryWithField, tapNode } from './helpers.js';

test.describe('Notes', { tag: '@runner-1' }, () => {
  // Sorted by node id, so the result doesn't depend on the order badges were
  // drawn in.
  function noteBadges(page) {
    return page.evaluate(() =>
      [...document.querySelectorAll('#notes .note-badge')]
        .map((badge) => ({ nodeId: badge.dataset.nodeId || '', shown: badge.style.display === 'flex' }))
        .sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    );
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test("keeps an entity's note badge on its box corner while its machine name is wider than the box", async ({ page }) => {
    await page.click('#new-btn');
    await page.click('#mode-build');
    await createEntity(page, 'node', 'story_with_a_long_machine_name', 'Story');
    await slFill(page, '#inspector sl-textarea[data-note]', 'Entity note');
    await expect(page.locator('#notes .note-badge')).toHaveCount(1);

    const offset = await page.evaluate(() => {
      const cy = window.__nexus.cy;
      const entity = cy.getElementById('node.story_with_a_long_machine_name');
      const origin = cy.container().getBoundingClientRect();
      const badge = document.querySelector('#notes .note-badge').getBoundingClientRect();
      const corner = {
        x: origin.left + entity.renderedPosition('x') + entity.renderedOuterWidth() / 2,
        y: origin.top + entity.renderedPosition('y') - entity.renderedOuterHeight() / 2,
      };
      return { x: badge.left + badge.width / 2 - corner.x, y: badge.top + badge.height / 2 - corner.y };
    });

    expect(Math.abs(offset.x)).toBeLessThan(3);
    expect(Math.abs(offset.y)).toBeLessThan(3);
  });

  test('adds an entity note that badges the canvas and reveals on hover', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');

    await page.evaluate(() => window.__nexus.cy.getElementById('node.session').emit('tap'));
    await expect(page.locator('#inspector sl-textarea[data-note]')).toBeVisible();

    await page.locator('#inspector sl-textarea[data-note]').evaluate((el) => {
      el.value = 'Core content type.';
      el.dispatchEvent(new Event('sl-input', { bubbles: true }));
    });

    await expect(page.locator('#notes .note-badge')).toHaveCount(1);

    const reveal = await page.evaluate(() => {
      document.querySelector('#notes .note-badge').dispatchEvent(new Event('mouseenter'));
      const tt = document.getElementById('tooltip');
      return { hidden: tt.hidden, text: tt.textContent };
    });
    expect(reveal.hidden).toBe(false);
    expect(reveal.text).toContain('Core content type.');

    // The note round-trips through a saved document.
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
    const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
    const session = doc.entities.find((e) => e.entityType === 'node' && e.bundle === 'session');
    expect(session.note).toBe('Core content type.');
  });

  test('adds a note to a field too, not just entities', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');

    await page.evaluate(() =>
      window.__nexus.cy
        .nodes('[group="field"]')
        .filter((n) => (n.data('name') || '').startsWith('field_'))[0]
        .emit('tap'),
    );
    await expect(page.locator('#inspector sl-textarea[data-note]')).toBeVisible();

    await page.locator('#inspector sl-textarea[data-note]').evaluate((el) => {
      el.value = 'Field-level note';
      el.dispatchEvent(new Event('sl-input', { bubbles: true }));
    });

    await expect(page.locator('#notes .note-badge')).toHaveCount(1);
  });

  test('keeps the note badges of a renamed entity and its fields', async ({ page }) => {
    await buildStoryWithField(page);
    await slFill(page, '#inspector sl-textarea[data-note]', 'Field note');
    await tapNode(page, 'node.story');
    await slFill(page, '#inspector sl-textarea[data-note]', 'Entity note');
    expect(await noteBadges(page)).toEqual([
      { nodeId: 'field:node.story:field_1', shown: true },
      { nodeId: 'node.story', shown: true },
    ]);

    await slFill(page, '#inspector sl-input[data-machine-name]', 'article');

    expect(await noteBadges(page)).toEqual([
      { nodeId: 'field:node.article:field_1', shown: true },
      { nodeId: 'node.article', shown: true },
    ]);
    const reveal = await page.evaluate(() => {
      document.querySelector('#notes .note-badge[data-node-id="node.article"]').dispatchEvent(new Event('mouseenter'));
      return document.getElementById('tooltip').textContent;
    });
    expect(reveal).toBe('Entity note');
  });
});
