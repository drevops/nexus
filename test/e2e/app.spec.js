import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'config-min');

function entityCount(page) {
  return page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').length);
}

async function waitForGraph(page) {
  await page.waitForFunction(() => window.__nexus && window.__nexus.cy.nodes('[group="entity"]').length > 0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('renders the bundled example', async ({ page }) => {
  await expect(page.locator('#landing')).toBeVisible();
  await page.click('#example-btn');

  await expect(page.locator('#landing')).toBeHidden();
  await waitForGraph(page);

  expect(await entityCount(page)).toBe(30);
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.program').length)).toBe(1);
  await expect(page.locator('#diagram-title')).toHaveValue('Example content model');
});

test('parses an uploaded config folder in the browser', async ({ page }) => {
  await page.setInputFiles('#folder-input', FIXTURE_DIR);

  await expect(page.locator('#landing')).toBeHidden();
  await waitForGraph(page);

  // 2 node + 1 vocab + 1 media + 2 paragraph + the Any placeholder.
  expect(await entityCount(page)).toBe(7);
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.article').length)).toBe(1);
});

test('shows fields by default and collapses to an overview', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  // Fields and machine names are shown by default.
  await expect(page.locator('#fields-toggle')).toHaveClass(/is-active/);
  await expect(page.locator('#machine-names')).toHaveClass(/is-active/);
  expect(await page.locator('#captions .caption').count()).toBeGreaterThan(0);
  const detailed = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);

  await page.click('#fields-toggle');
  await expect(page.locator('#fields-toggle')).not.toHaveClass(/is-active/);
  const overview = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);
  expect(overview).toBeLessThan(detailed);

  await page.click('#entities-toggle');
  await expect(page.locator('#entity-list .entity-row').first()).toBeVisible();

  await page.click('#table-toggle');
  await expect(page.locator('#field-table')).toContainText('References');
  await expect(page.locator('#field-table')).toContainText('field_media');
});

test('floats, pins, unpins and closes a panel', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const entities = page.locator('#entities');
  await page.click('#entities-toggle');
  await expect(entities).toBeVisible();
  expect(await entities.evaluate((el) => el.parentElement.classList.contains('stage__canvas'))).toBe(true);
  await expect(entities).not.toHaveClass(/is-docked/);

  await page.click('#entities .panel__pin');
  expect(await entities.evaluate((el) => el.closest('.dock').id)).toBe('dock-left');
  await expect(entities).toHaveClass(/is-docked/);

  await page.click('#entities .panel__pin');
  expect(await entities.evaluate((el) => el.parentElement.classList.contains('stage__canvas'))).toBe(true);
  await expect(entities).not.toHaveClass(/is-docked/);

  await page.click('#entities .panel__close');
  await expect(entities).toBeHidden();
  await expect(page.locator('#entities-toggle')).not.toHaveClass(/is-active/);
});

test('drags a panel by its header', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#entities-toggle');
  const box = await page.locator('#entities .panel__head').boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 200, { steps: 8 });
  await page.mouse.up();

  const pos = await page.locator('#entities').evaluate((el) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) }));
  expect(pos.left).toBeGreaterThan(120);
  expect(pos.top).toBeGreaterThan(120);
});

test('stacks pinned panels in a side dock and resizes it', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#legend .panel__pin');
  await page.click('#table-toggle');
  await page.click('#table .panel__pin');

  const dockRight = page.locator('#dock-right');
  await expect(dockRight).toBeVisible();
  await expect(dockRight.locator('.panel')).toHaveCount(2);

  const before = (await dockRight.boundingBox()).width;
  const handle = await page.locator('#dock-right .dock__resize').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 120);
  await page.mouse.down();
  await page.mouse.move(handle.x - 130, handle.y + 120, { steps: 6 });
  await page.mouse.up();
  const after = (await dockRight.boundingBox()).width;
  expect(after).toBeGreaterThan(before + 60);
});

test('docks a panel by dragging it to the screen edge', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#entities-toggle');

  const entities = page.locator('#entities');
  await expect(entities).not.toHaveClass(/is-docked/);

  const head = await entities.locator('.panel__head').boundingBox();
  const stage = await page.locator('#stage-root').boundingBox();
  await page.mouse.move(head.x + 40, head.y + head.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width - 200, head.y + 150, { steps: 6 });
  await page.mouse.move(stage.x + stage.width - 20, head.y + 150, { steps: 6 });
  await page.mouse.up();

  await expect(entities).toHaveClass(/is-docked/);
  expect(await entities.evaluate((el) => el.closest('.dock').id)).toBe('dock-right');
});

test('resizes a docked panel vertically', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#legend .panel__pin');
  await page.click('#table-toggle');
  await page.click('#table .panel__pin');

  const before = (await page.locator('#table').boundingBox()).height;
  const handle = await page.locator('#table .panel__vresize').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 150, { steps: 6 });
  await page.mouse.up();
  const after = (await page.locator('#table').boundingBox()).height;
  expect(after).toBeGreaterThan(before + 70);
});

test('remembers the panel layout across reloads', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#entities-toggle');
  await page.click('#entities .panel__pin');
  await expect(page.locator('#entities')).toHaveClass(/is-docked/);
  await page.waitForTimeout(500);

  await page.reload();
  await page.click('#example-btn');
  await waitForGraph(page);

  await expect(page.locator('#entities')).toHaveClass(/is-docked/);
  expect(await page.locator('#entities').evaluate((el) => el.closest('.dock').id)).toBe('dock-left');
});

test('shows a loading screen while the example loads', async ({ page }) => {
  await page.route('**/manifest.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    route.continue();
  });
  await page.click('#example-btn');
  await expect(page.locator('#loader')).toBeVisible();
  await waitForGraph(page);
  await expect(page.locator('#loader')).toBeHidden();
});

test('traces a field\'s inbound and outbound connections', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

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
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#proxy-toggle');
  await expect(page.locator('#proxy-toggle')).toHaveClass(/is-active/);
  await expect(page.locator('#fields-toggle')).toHaveClass(/is-active/);

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

test('persists a custom entity colour across reloads', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#settings-toggle');
  await page.locator('input[data-color="paragraph"]').fill('#112233');

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')));
  expect(stored.colors.paragraph).toBe('#112233');

  await page.reload();
  await page.click('#example-btn');
  await waitForGraph(page);

  const applied = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="paragraph"]').style('background-color'));
  expect(applied.replace(/\s/g, '')).toBe('rgb(17,34,51)');
});

test('saves and reloads a Nexus diagram document', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  const before = await entityCount(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#doc-save'),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.nexus\.json$/);
  const saved = await download.path();

  await page.goto('/index.html');
  await page.setInputFiles('#doc-open', saved);
  await waitForGraph(page);

  expect(await entityCount(page)).toBe(before);
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.program').length)).toBe(1);
});

test('reopens the import screen and cancels back to the diagram', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#doc-import');
  await expect(page.locator('#landing')).toBeVisible();
  await expect(page.locator('#landing-cancel')).toBeVisible();

  await page.click('#landing-cancel');
  await expect(page.locator('#landing')).toBeHidden();
  expect(await entityCount(page)).toBeGreaterThan(0);
});

test('renders toolbar icons from the icon set', async ({ page }) => {
  await expect(page.locator('#doc-import svg.icon')).toBeVisible();
  await expect(page.locator('#doc-save svg.icon')).toBeVisible();
  await expect(page.locator('#layout-toggle svg.icon')).toBeVisible();
  await expect(page.locator('#layout-toggle .layout-label')).toHaveText('Layout: LR');
});

test('builds a new entity and field and saves them', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#mode-build');
  await page.click('#add-entity');
  await page.fill('[data-new-bundle]', 'campaign');
  await page.fill('[data-new-label]', 'Campaign');
  await page.click('[data-create-entity]');
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.campaign').length)).toBe(1);

  await page.click('[data-add-field]');
  await page.fill('[data-new-name]', 'field_body');
  await page.fill('[data-new-label]', 'Body');
  await page.click('[data-create-field]');
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('field:node.campaign:field_body').length)).toBe(1);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#doc-save'),
  ]);
  const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
  const campaign = doc.entities.find((e) => e.entityType === 'node' && e.bundle === 'campaign');
  expect(campaign).toBeTruthy();
  expect(campaign.fields.some((f) => f.name === 'field_body')).toBe(true);
});

test('connects a reference by dragging on the canvas', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.click('#add-entity');
  await page.fill('[data-new-bundle]', 'a');
  await page.fill('[data-new-label]', 'A');
  await page.click('[data-create-entity]');
  await page.click('[data-add-field]');
  await page.fill('[data-new-name]', 'field_ref');
  await page.fill('[data-new-label]', 'Ref');
  await page.click('[data-create-field]');
  await page.click('#add-entity');
  await page.fill('[data-new-bundle]', 'b');
  await page.fill('[data-new-label]', 'B');
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
});

test('adds a field from an entity + handle', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.click('#add-entity');
  await page.fill('[data-new-bundle]', 'story');
  await page.fill('[data-new-label]', 'Story');
  await page.click('[data-create-entity]');

  await expect(page.locator('.handle--right')).toBeVisible();
  await page.click('.handle--right');

  await expect(page.locator('[data-new="field"][data-side="right"]')).toBeVisible();
  await page.fill('[data-new-name]', 'field_summary');
  await page.click('[data-create-field]');

  expect(await page.evaluate(() => window.__nexus.cy.getElementById('field:node.story:field_summary').length)).toBe(1);
});

test('reuses an existing field via autocomplete', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#mode-build');

  await page.evaluate(() => {
    const cy = window.__nexus.cy;
    const node = cy.getElementById('node.program');
    cy.zoom(1.2);
    cy.center(node);
    node.emit('tap');
  });

  await page.click('.handle--bottom');
  expect(await page.evaluate(() => document.getElementById('existing-field-list').options.length)).toBeGreaterThan(0);

  await page.fill('[data-new-name]', 'body');
  const prefill = await page.evaluate(() => {
    const insp = document.querySelector('[data-new="field"]');
    return { label: insp.querySelector('[data-new-label]').value, type: insp.querySelector('[data-new-fieldtype]').value };
  });
  expect(prefill.label).toBe('Body');
  expect(prefill.type).toBe('text_with_summary');
});

test('exports the diagram as PNG named after the title', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-png'),
  ]);
  expect(download.suggestedFilename()).toBe('example-content-model.png');
});

test('exports the diagram as SVG and honours a renamed title', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.fill('#diagram-title', 'My Model');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-svg'),
  ]);
  expect(download.suggestedFilename()).toBe('my-model.svg');
});
