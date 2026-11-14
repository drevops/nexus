import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadExample, slFill, createEntity, buildStoryWithField, tapNode, hoverNode, downloadFrom, saveFrom } from './helpers.js';

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

  const MARKDOWN = '# Plan\n**Bold**, *italic*, __underline__, ~~gone~~ and `code`.\nSee [docs](https://example.com).';

  // Places a Note in the middle of a new diagram in Edit mode and returns its
  // node id.
  async function placeNote(page) {
    await page.click('#new-btn');
    await page.click('#mode-build');
    await page.click('#add-note');
    const box = await page.locator('#cy').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#inspector .insp__title')).toHaveText('Note');

    return page.evaluate(() => window.__nexus.cy.nodes('[group="annotation"][kind="note"]').id());
  }

  // The client boxes of a note's Cytoscape node, without its border, and of
  // its HTML body.
  function noteBoxes(page, id) {
    return page.evaluate((nodeId) => {
      const cy = window.__nexus.cy;
      const node = cy.getElementById(nodeId);
      const origin = cy.container().getBoundingClientRect();
      const box = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
      const body = document.querySelector('#note-bodies .note-body[data-node-id="' + nodeId + '"]').getBoundingClientRect();

      return {
        node: { left: origin.left + box.x1, top: origin.top + box.y1, right: origin.left + box.x2, bottom: origin.top + box.y2 },
        body: { left: body.left, top: body.top, right: body.right, bottom: body.bottom },
      };
    }, id);
  }

  function inside(inner, outer) {
    return inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('places a Note and draws its Markdown on the canvas', async ({ page }) => {
    const id = await placeNote(page);
    await expect(page.locator('#inspector sl-textarea[data-note-text]')).toBeFocused();
    await expect(page.locator('#note-bodies .note-body')).toHaveText('Empty note');

    await slFill(page, '#inspector sl-textarea[data-note-text]', MARKDOWN);

    const body = page.locator('#note-bodies .note-body[data-node-id="' + id + '"]');
    await expect(body.locator('h1')).toHaveText('Plan');
    await expect(body.locator('strong')).toHaveText('Bold');
    await expect(body.locator('em')).toHaveText('italic');
    await expect(body.locator('u')).toHaveText('underline');
    await expect(body.locator('s')).toHaveText('gone');
    await expect(body.locator('code')).toHaveText('code');
    await expect(body.locator('.rich-text__link')).toHaveAttribute('title', 'https://example.com');
    await expect(body.locator('a')).toHaveCount(0);
    expect(await page.evaluate((nodeId) => window.__nexus.cy.getElementById(nodeId).data('note'), id)).toBe(MARKDOWN);
    await expect(page.locator('#notes .note-badge')).toHaveCount(0);
  });

  test('sizes a Note to its text and keeps its body on its box at any zoom', async ({ page }) => {
    const id = await placeNote(page);
    const height = () => page.evaluate((nodeId) => window.__nexus.cy.getElementById(nodeId).height(), id);
    const empty = await height();

    await slFill(page, '#inspector sl-textarea[data-note-text]', MARKDOWN);
    await expect.poll(height).toBeGreaterThan(empty);

    // zoom() returns the Cytoscape core, which Playwright is slow to
    // serialize, so the callback returns nothing.
    for (const zoom of [0.5, 1, 2]) {
      await page.evaluate((level) => {
        window.__nexus.cy.zoom(level);
      }, zoom);
      await expect
        .poll(async () => {
          const boxes = await noteBoxes(page, id);
          return inside(boxes.body, boxes.node);
        })
        .toBe(true);
    }
  });

  // Both layers take no pointer events, so elementFromPoint() can't tell
  // which one is on top.
  test('draws a Note over other nodes and their machine names', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');
    await page.click('#add-note');
    const box = await page.locator('#cy').boundingBox();
    await page.mouse.click(box.x + 10, box.y + 10);

    const order = await page.evaluate(() => {
      const cy = window.__nexus.cy;
      const layer = (id) => Number(getComputedStyle(document.getElementById(id)).zIndex);

      return {
        note: cy.nodes('[kind="note"]').style('z-index'),
        others: Math.max(...cy.nodes('[group="entity"], [group="field"], [group="proxy"]').map((node) => Number(node.style('z-index')))),
        bodies: layer('note-bodies'),
        captions: layer('captions'),
      };
    });

    expect(Number(order.note)).toBeGreaterThan(order.others);
    expect(order.bodies).toBeGreaterThan(order.captions);
  });

  test('shows no tooltip for a Note', async ({ page }) => {
    const id = await placeNote(page);
    await slFill(page, '#inspector sl-textarea[data-note-text]', 'Hello');

    await hoverNode(page, id);

    await expect(page.locator('#tooltip')).toBeHidden();
  });

  test('undoes and redoes the text of a Note', async ({ page }) => {
    const id = await placeNote(page);
    const body = page.locator('#note-bodies .note-body[data-node-id="' + id + '"]');
    await slFill(page, '#inspector sl-textarea[data-note-text]', '**Hello**');
    await expect(body.locator('strong')).toHaveText('Hello');

    await page.click('#undo');
    await expect(body).toHaveText('Empty note');

    await page.click('#redo');
    await expect(body.locator('strong')).toHaveText('Hello');
  });

  test('deletes a Note and its body', async ({ page }) => {
    await placeNote(page);

    await page.click('#inspector .insp__delete');

    await expect(page.locator('#note-bodies .note-body')).toHaveCount(0);
    expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="annotation"]').length)).toBe(0);
  });

  test('saves a Note and draws it again from the saved document', async ({ page }) => {
    const id = await placeNote(page);
    await slFill(page, '#inspector sl-textarea[data-note-text]', MARKDOWN);

    const doc = JSON.parse(readFileSync(await (await downloadFrom(page, '#doc-save')).path(), 'utf8'));
    expect(doc.annotations.nodes).toEqual([{ id: id, kind: 'note', label: 'Note', note: MARKDOWN }]);

    // openDocument() waits for an entity, which this diagram doesn't have.
    await page.goto('/index.html');
    await page.setInputFiles('#doc-open', { name: 'diagram.nexus.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });

    await expect(page.locator('#note-bodies .note-body[data-node-id="' + id + '"] h1')).toHaveText('Plan');
    const boxes = await noteBoxes(page, id);
    expect(inside(boxes.body, boxes.node)).toBe(true);
  });

  test("exports a Note's text in an SVG", async ({ page }) => {
    await placeNote(page);
    await slFill(page, '#inspector sl-textarea[data-note-text]', '# Plan\n**Check** the tags.');

    const svg = readFileSync(await (await saveFrom(page, 'svg')).path(), 'utf8');

    expect(svg).toContain('Plan');
    expect(svg).toContain('Check the tags.');
    expect(await page.evaluate(() => window.__nexus.cy.nodes('[kind="note"]').style('text-opacity'))).toBe('0');
  });

  test('leaves Note out of the kinds another annotation can take', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');

    await tapNode(page, 'ticketing_api');

    await expect(page.locator('#inspector .insp__title')).toHaveText('Annotation');
    await expect(page.locator('#inspector sl-option[value="event"]')).toHaveCount(1);
    await expect(page.locator('#inspector sl-option[value="note"]')).toHaveCount(0);
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
