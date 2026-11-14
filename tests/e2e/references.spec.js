import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  nodePositions,
  loadExample,
  slFill,
  slSelect,
  openDocument,
  tapNode,
  referenceView,
  PROXY_VIEW,
  TRACK_FIELD,
  TRACKS,
  editExample,
  selectTrackField,
  addTarget,
  pickLevel,
} from './helpers.js';

test.describe('References', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test("traces a field's inbound and outbound connections", async ({ page }) => {
    await loadExample(page);

    const result = await page.evaluate(() => {
      const cy = window.__nexus.cy;
      const refEdge = cy.edges('[group="ref"]').first();
      const field = refEdge.source();
      const hasEdge = field.connectedEdges('[group="has"]');
      field.emit('tap');
      return {
        sourceTraced: field.hasClass('trace-source'),
        outboundEdgeTraced: refEdge.hasClass('trace'),
        targetTraced: refEdge.target().hasClass('trace'),
        inboundEdgeTraced: hasEdge.hasClass('trace'),
        ownerTraced: hasEdge.source().hasClass('trace'),
        unrelatedFaded: cy.nodes().some((n) => n.hasClass('faded') && !n.hasClass('trace') && !n.hasClass('trace-source')),
      };
    });

    expect(result.sourceTraced).toBe(true);
    expect(result.outboundEdgeTraced).toBe(true);
    expect(result.targetTraced).toBe(true);
    expect(result.inboundEdgeTraced).toBe(true);
    expect(result.ownerTraced).toBe(true);
    expect(result.unrelatedFaded).toBe(true);
  });

  test('declutters references into faded proxies', async ({ page }) => {
    await loadExample(page);

    await expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', true);
    await expect(page.locator('#detail-level')).toHaveText('Fields: All');

    const counts = await page.evaluate(() => {
      const cy = window.__nexus.cy;
      return {
        proxies: cy.nodes('[group="proxy"]:visible').length,
        refEdges: cy.edges('[group="ref"]:visible').length,
        proxyEdges: cy.edges('[group="proxyedge"]:visible').length,
      };
    });
    expect(counts.proxies).toBeGreaterThan(0);
    expect(counts.refEdges).toBe(0);
    expect(counts.proxyEdges).toBe(counts.proxies);

    const focus = await page.evaluate(() => {
      const cy = window.__nexus.cy;
      const proxy = cy.nodes('[group="proxy"]').first();
      const target = proxy.data('target');
      proxy.emit('tap');
      return { targetFaded: cy.getElementById(target).hasClass('faded'), someFaded: cy.nodes().some((n) => n.hasClass('faded')) };
    });
    expect(focus.targetFaded).toBe(false);
    expect(focus.someFaded).toBe(true);

    await page.click('#proxy-toggle');
    const after = await page.evaluate(() => ({
      proxies: window.__nexus.cy.nodes('[group="proxy"]:visible').length,
      refEdges: window.__nexus.cy.edges('[group="ref"]:visible').length,
    }));
    expect(after.proxies).toBe(0);
    expect(after.refEdges).toBeGreaterThan(0);
  });

  test('connects a reference by dragging on the canvas', async ({ page }) => {
    await page.click('#new-btn');
    await page.click('#mode-build');

    await page.click('[data-add-entity="node"]');
    await slFill(page, '[data-new-bundle]', 'a');
    await slFill(page, '[data-new-label]', 'A');
    await page.click('[data-create-entity]');
    await page.click('[data-add-field]');
    await page.fill('[data-new-name]', 'field_ref');
    await slFill(page, '[data-new-label]', 'Ref');
    await page.click('[data-create-field]');
    await page.click('[data-add-entity="node"]');
    await slFill(page, '[data-new-bundle]', 'b');
    await slFill(page, '[data-new-label]', 'B');
    await page.click('[data-create-entity]');

    const coords = await page.evaluate(() => {
      const cy = window.__nexus.cy;
      cy.resize();
      cy.getElementById('node.a').position({ x: 120, y: 320 });
      cy.getElementById('field:node.a:field_ref').position({ x: 140, y: 120 });
      cy.getElementById('node.b').position({ x: 520, y: 120 });
      cy.zoom(1);
      cy.pan({ x: 120, y: 90 });
      const box = cy.container().getBoundingClientRect();
      const f = cy.getElementById('field:node.a:field_ref').renderedPosition();
      const t = cy.getElementById('node.b').renderedPosition();
      return { fx: box.left + f.x, fy: box.top + f.y, tx: box.left + t.x, ty: box.top + t.y };
    });

    await page.click('#connect-toggle');
    await page.mouse.move(coords.fx, coords.fy);
    await page.mouse.down();
    await page.mouse.move((coords.fx + coords.tx) / 2, coords.fy, { steps: 6 });
    await page.mouse.move(coords.tx, coords.ty, { steps: 6 });
    await page.mouse.up();

    expect(await page.evaluate(() => window.__nexus.cy.getElementById('ref:field:node.a:field_ref>node.b').length)).toBe(1);
    expect(await referenceView(page, 'field:node.a:field_ref', 'node.b')).toEqual(PROXY_VIEW);
  });

  function refCount(page, fieldId, targetId) {
    return page.evaluate(
      ([source, target]) => window.__nexus.cy.edges('[group="ref"]').filter((edge) => edge.source().id() === source && edge.target().id() === target).length,
      [fieldId, targetId],
    );
  }

  test('edits a reference loaded from configuration in the inspector', async ({ page }) => {
    await loadExample(page);
    await page.click('#mode-build');

    // A field with 1 reference target, so the inspector shows exactly 1 tag.
    const ref = await page.evaluate(() => {
      const edge = window.__nexus.cy
        .edges('[group="ref"]')
        .filter((e) => e.source().outgoers('edge[group="ref"]').length === 1)
        .first();
      return { field: edge.source().id(), target: edge.target().id() };
    });
    await tapNode(page, ref.field);
    const tags = page.locator('#inspector sl-tag.insp__reftag');
    await expect(tags).toHaveCount(1);

    await slSelect(page, '#inspector sl-select[data-add-target]', ref.target);
    expect(await refCount(page, ref.field, ref.target)).toBe(1);
    await expect(tags).toHaveCount(1);

    await tags.evaluate((el) => el.dispatchEvent(new Event('sl-remove', { bubbles: true })));
    expect(await refCount(page, ref.field, ref.target)).toBe(0);
    await expect(tags).toHaveCount(0);
    expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).length, 'proxy:' + ref.field + '>' + ref.target)).toBe(0);
  });

  // Proxies left on the canvas without the reference they draw.
  function orphanProxies(page) {
    return page.evaluate(() => {
      const cy = window.__nexus.cy;
      const drawn = (proxy) => proxy.incomers('node').some((field) => cy.getElementById('ref:' + field.id() + '>' + proxy.data('target')).nonempty());

      return cy
        .nodes('[group="proxy"]')
        .filter((proxy) => !drawn(proxy))
        .map((proxy) => proxy.id());
    });
  }

  test('removes the proxies of references dropped by deleting a field, deleting an entity or renaming an entity', async ({ page }) => {
    await editExample(page);

    const field = await page.evaluate(() => window.__nexus.cy.nodes('[group="proxy"]').first().incomers('node').id());
    await tapNode(page, field);
    await page.click('#inspector .insp__delete');
    expect(await orphanProxies(page)).toEqual([]);

    await tapNode(page, 'node.event');
    await slFill(page, '#inspector sl-input[data-machine-name]', 'gathering');
    expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.gathering').length)).toBe(1);
    expect(await orphanProxies(page)).toEqual([]);

    await tapNode(page, TRACKS);
    await page.click('#inspector .insp__delete');
    expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).empty(), TRACKS)).toBe(true);
    expect(await orphanProxies(page)).toEqual([]);
  });

  test('draws a reference added in edit mode as a proxy in the column of its field', async ({ page }) => {
    await selectTrackField(page);
    await addTarget(page, 'node.event');

    expect(await referenceView(page, TRACK_FIELD, 'node.event')).toEqual(PROXY_VIEW);

    const placement = await page.evaluate(
      ([added, sibling]) => {
        const cy = window.__nexus.cy;
        const proxy = cy.getElementById(added);
        const box = proxy.boundingBox();
        const overlap = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
        return {
          dx: proxy.position('x') - cy.getElementById(sibling).position('x'),
          overlaps: cy.nodes(':visible').filter((node) => !node.same(proxy) && overlap(node.boundingBox(), box)).length,
        };
      },
      ['proxy:' + TRACK_FIELD + '>node.event', 'proxy:' + TRACK_FIELD + '>' + TRACKS],
    );
    expect(placement).toEqual({ dx: 0, overlaps: 0 });
  });

  test('shows a reference added in edit mode in the overview and as a proxy again after it', async ({ page }) => {
    await selectTrackField(page);
    await addTarget(page, 'node.event');

    await pickLevel(page, 'entities');
    expect(await referenceView(page, TRACK_FIELD, 'node.event')).toEqual({ ref: false, proxy: false, proxyEdge: false, collapsed: true });

    await pickLevel(page, 'references');
    expect(await referenceView(page, TRACK_FIELD, 'node.event')).toEqual(PROXY_VIEW);
  });

  test('saves the proxy of a reference added in edit mode and reopens it where it was', async ({ page }) => {
    await selectTrackField(page);
    // A saved field holds 1 target entity type, so the new target is a
    // vocabulary too.
    await addTarget(page, 'taxonomy_term.sponsors');
    const proxyId = 'proxy:' + TRACK_FIELD + '>taxonomy_term.sponsors';

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
    const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
    expect(doc.layout[proxyId]).toBeDefined();

    await page.goto('/index.html');
    await openDocument(page, doc);

    expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).position(), proxyId)).toEqual(doc.layout[proxyId]);
  });

  for (const [name, nodeId, machineName, renamedId] of dataProviderRenamedProxies()) {
    test(`keeps every proxy where it was when ${name} is renamed`, async ({ page }) => {
      await editExample(page);
      const before = await nodePositions(page, '[group="proxy"]');

      await tapNode(page, nodeId);
      await slFill(page, '#inspector sl-input[data-machine-name]', machineName);

      const expected = Object.fromEntries(Object.entries(before).map(([id, position]) => [id.split(nodeId).join(renamedId), position]));
      expect(await nodePositions(page, '[group="proxy"]')).toEqual(expected);
    });
  }

  function dataProviderRenamedProxies() {
    return [
      ["Session's track field", TRACK_FIELD, 'field_track_renamed', 'field:node.session:field_track_renamed'],
      ['the Tracks vocabulary', TRACKS, 'streams', 'taxonomy_term.streams'],
    ];
  }

  test('relabels the proxies of an entity relabelled in edit mode', async ({ page }) => {
    await editExample(page);

    await tapNode(page, 'media.image');
    await slFill(page, '#inspector sl-input[data-label]', 'Picture');

    const labels = await page.evaluate(() => window.__nexus.cy.nodes('[group="proxy"][target="media.image"]').map((proxy) => proxy.data('label')));
    expect(labels.length).toBeGreaterThan(0);
    expect([...new Set(labels)]).toEqual(['Picture']);
  });

  test('wraps the long name of a proxy over several lines inside its shape', async ({ page }) => {
    await editExample(page);

    await tapNode(page, 'taxonomy_term.topics');
    await slFill(page, '#inspector sl-input[data-label]', 'Conference session topics, tracks and the keywords speakers pick');

    // A proxy wraps at 130 pixels of text, and 3 lines of 10 pixel text with a
    // 1.25 line height stand 35 pixels tall.
    const proxies = () =>
      page.evaluate(() =>
        window.__nexus.cy.nodes('[group="proxy"][target="taxonomy_term.topics"]').map((proxy) => ({
          wrap: proxy.style('text-wrap'),
          width: proxy.width(),
          height: proxy.height(),
          corners: proxy.style('shape-polygon-points').split(' ').length / 2,
        })),
      );

    await expect.poll(async () => (await proxies()).length && (await proxies())[0].height).toBeGreaterThanOrEqual(35);
    const drawn = await proxies();

    for (const proxy of drawn) {
      expect(proxy.wrap).toBe('wrap');
      expect(proxy.width).toBeLessThan(160);
      expect(proxy.corners).toBe(5);
    }
  });

  test('relabels the proxy edges of a field whose cardinality changes in edit mode', async ({ page }) => {
    await selectTrackField(page);
    await slSelect(page, '#inspector sl-select[data-cardinality]', '3');

    expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).data('cardinality'), 'pe:' + TRACK_FIELD + '>' + TRACKS)).toBe('1..3');
  });

  test('removes the overview edge of the last reference between 2 entities', async ({ page }) => {
    await editExample(page);

    // The only reference from the Sponsors vocabulary to Image media.
    await tapNode(page, 'field:taxonomy_term.sponsors:field_sponsor_logo');
    const tags = page.locator('#inspector sl-tag.insp__reftag');
    await expect(tags).toHaveCount(1);
    await tags.evaluate((el) => el.dispatchEvent(new Event('sl-remove', { bubbles: true })));
    await page.click('#detail-level');

    expect(await page.evaluate(() => window.__nexus.cy.getElementById('c:taxonomy_term.sponsors>media.image').length)).toBe(0);
  });

  test('hides the fields of an entity renamed in edit mode with its entity type', async ({ page }) => {
    await editExample(page);

    await tapNode(page, 'node.event');
    await slFill(page, '#inspector sl-input[data-machine-name]', 'gathering');
    await page.click('#entities-toggle');
    await page.locator('#type-filters label', { hasText: 'Content type' }).locator('input').uncheck();

    expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="field"][entity="node.gathering"]:visible').length)).toBe(0);
  });

  test('lists a reference added in edit mode in the tooltip of its field', async ({ page }) => {
    await selectTrackField(page);
    await addTarget(page, 'node.event');
    await page.evaluate((id) => {
      window.__nexus.cy.getElementById(id).emit('mouseover');
    }, TRACK_FIELD);

    await expect(page.locator('#tooltip')).toContainText('→ Tracks, Event');
  });

  test('lays out the proxy of a reference added while its target type was filtered out once the filter is lifted', async ({ page }) => {
    await editExample(page);
    await page.click('#entities-toggle');
    const media = page.locator('#type-filters label', { hasText: 'Media' }).locator('input');
    await media.uncheck();
    await tapNode(page, 'field:node.event:field_media');
    await addTarget(page, 'media.document');
    await media.check();
    const shown = await nodePositions(page);

    await page.click('#layout-run');

    expect(await nodePositions(page)).toEqual(shown);
  });

  test('selects the entity a proxy stands in for when the proxy is tapped in edit mode', async ({ page }) => {
    await editExample(page);
    await tapNode(page, 'proxy:' + TRACK_FIELD + '>' + TRACKS);

    await expect(page.locator('#inspector .insp__title')).toHaveText('Entity');
    await expect(page.locator('#inspector sl-input[data-machine-name]')).toHaveJSProperty('value', 'tracks');
  });

  test('labels reference edges with cardinality in the default proxy view', async ({ page }) => {
    await loadExample(page);

    // Proxies are on by default, so the visible reference lines are proxy edges;
    // they must still carry the cardinality label.
    const result = await page.evaluate(() => {
      const pe = window.__nexus.cy.edges('[group="proxyedge"]');
      return {
        total: pe.length,
        withCardinality: pe.filter((e) => !!e.data('cardinality')).length,
        hasMulti: pe.some((e) => e.data('cardinality') === '1..n'),
      };
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.withCardinality).toBe(result.total);
    expect(result.hasMulti).toBe(true);
  });
});
