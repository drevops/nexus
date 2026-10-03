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

// Shoelace form controls render into shadow DOM, so set the value on the host
// and dispatch the events the component would fire.
async function slFill(page, selector, value) {
  await page.locator(selector).waitFor({ state: 'attached' });
  await page.locator(selector).evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('sl-input', { bubbles: true }));
    el.dispatchEvent(new Event('sl-change', { bubbles: true }));
  }, value);
}

async function slSelect(page, selector, value) {
  await page.locator(selector).waitFor({ state: 'attached' });
  await page.locator(selector).evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('sl-change', { bubbles: true }));
  }, value);
}

async function openDocument(page, doc) {
  await page.setInputFiles('#doc-open', { name: 'diagram.nexus.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await waitForGraph(page);
}

// Returns the text of each rendered line in every matched element. A character
// whose box sits lower than the current line starts a new one.
function renderedLines(locator) {
  return locator.evaluateAll((elements) =>
    elements.map((element) => {
      const lines = [];
      const range = document.createRange();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let top = null;

      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let i = 0; i < node.length; i++) {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const charTop = range.getBoundingClientRect().top;

          if (top === null || charTop > top + 1) {
            lines.push('');
            top = charTop;
          }

          lines[lines.length - 1] += node.data[i];
        }
      }

      return lines;
    }),
  );
}

// Returns the WCAG contrast ratio between an element's text colour and the
// first non-transparent background among its ancestors.
function textContrast(locator) {
  return locator.evaluate((element) => {
    const channels = (color) => color.match(/[\d.]+/g).map(Number);
    const luminance = (color) => {
      const [r, g, b] = channels(color).map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    let background = 'rgba(0, 0, 0, 0)';
    for (let node = element; node && background === 'rgba(0, 0, 0, 0)'; node = node.parentElement) {
      background = getComputedStyle(node).backgroundColor;
    }

    const [lighter, darker] = [luminance(getComputedStyle(element).color), luminance(background)].sort((a, b) => b - a);

    return (lighter + 0.05) / (darker + 0.05);
  });
}

// Returns every fitted identifier in the fields table with its text, its
// current and normal font size, and its rendered lines.
async function fittedIdentifiers(page) {
  const locator = page.locator('#field-table [data-fit]');
  const lines = await renderedLines(locator);
  const sizes = await locator.evaluateAll((elements) =>
    elements.map((element) => {
      const size = parseFloat(getComputedStyle(element).fontSize);
      const fitted = element.style.fontSize;

      element.style.fontSize = '';
      const normal = parseFloat(getComputedStyle(element).fontSize);
      element.style.fontSize = fitted;

      return { text: element.textContent, size: size, normal: normal };
    }),
  );

  return sizes.map((identifier, i) => ({ ...identifier, lines: lines[i] }));
}

// Returns the identifiers that break the fitting rules: drawn below 10px,
// shrunk but still wrapped, or wrapped anywhere but after an underscore.
function fitViolations(identifiers) {
  return identifiers.filter((i) => i.size < 10 || (i.size < i.normal && i.lines.length > 1) || i.lines.slice(0, -1).some((line) => !line.endsWith('_')));
}

function fittedIdentifier(page, text) {
  return fittedIdentifiers(page).then((identifiers) => identifiers.find((i) => i.text === text));
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
  await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Example content model');
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

test("traces a field's inbound and outbound connections", async ({ page }) => {
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

  // Proxies are enabled by default.
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
  await slFill(page, 'sl-color-picker[data-color="paragraph"]', '#112233');

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

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  expect(download.suggestedFilename()).toMatch(/\.nexus\.json$/);
  const saved = await download.path();

  await page.goto('/index.html');
  await page.setInputFiles('#doc-open', saved);
  await waitForGraph(page);

  expect(await entityCount(page)).toBe(before);
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.program').length)).toBe(1);
});

test('reopens a saved diagram with every node where it was saved', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const saved = await download.path();
  const doc = JSON.parse(readFileSync(saved, 'utf8'));

  await page.goto('/index.html');
  await page.setInputFiles('#doc-open', saved);
  await waitForGraph(page);

  const positions = await page.evaluate(() => {
    const result = {};
    window.__nexus.cy.nodes().forEach((node) => {
      result[node.id()] = node.position();
    });
    return result;
  });
  expect(positions).toEqual(doc.layout);
});

function proxyPlacement(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const overlap = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
    return cy.nodes('[group="proxy"]').map((proxy) => {
      const field = proxy.incomers('node');
      const box = proxy.boundingBox();
      return {
        gap: box.x1 - field.boundingBox().x2,
        clearance: box.x1 - cy.nodes('[group="field"][entity="' + field.data('entity') + '"]').boundingBox().x2,
        dx: Math.abs(proxy.position('x') - field.position('x')),
        dy: Math.abs(proxy.position('y') - field.position('y')),
        overlaps: cy.nodes().filter((node) => !node.same(proxy) && overlap(node.boundingBox(), box)).length,
      };
    });
  });
}

test('places proxies missing from a saved layout beside their field', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
  doc.layout = Object.fromEntries(Object.entries(doc.layout).filter(([id]) => !id.startsWith('proxy:')));

  await page.goto('/index.html');
  await openDocument(page, doc);

  const placement = await proxyPlacement(page);
  expect(placement.length).toBeGreaterThan(0);
  placement.forEach((proxy) => {
    expect(proxy.clearance).toBeGreaterThan(0);
    expect(proxy.clearance).toBeLessThan(100);
    expect(proxy.dy).toBeLessThan(100);
    expect(proxy.overlaps).toBe(0);
  });
});

test('leaves hidden proxies out of a saved layout and places them beside their field on open', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#proxy-toggle');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(Object.keys(doc.layout).filter((id) => id.startsWith('proxy:'))).toEqual([]);

  await page.goto('/index.html');
  await openDocument(page, doc);

  const placement = await proxyPlacement(page);
  expect(placement.length).toBeGreaterThan(0);
  placement.forEach((proxy) => {
    expect(proxy.gap).toBeGreaterThan(0);
    expect(proxy.dx).toBeLessThan(300);
    expect(proxy.dy).toBeLessThan(200);
    expect(proxy.overlaps).toBe(0);
  });
});

function proxyDocument(extraLayout) {
  return {
    nexus: 1,
    title: 'Proxy placement',
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'Article',
        fields: [
          { name: 'field_tags', label: 'Tags', fieldType: 'entity_reference', kind: 'multi', targetType: 'taxonomy_term', targetBundles: ['tags', 'topics'] },
          { name: 'field_author', label: 'Author', fieldType: 'entity_reference', kind: 'single', targetType: 'user', targetBundles: ['user'] },
        ],
      },
      { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', fields: [] },
      { entityType: 'taxonomy_term', bundle: 'topics', label: 'Topics', fields: [] },
      { entityType: 'user', bundle: 'user', label: 'User', fields: [] },
    ],
    layout: {
      'node.article': { x: 0, y: 0 },
      'field:node.article:field_tags': { x: 200, y: 0 },
      'field:node.article:field_author': { x: -200, y: 0 },
      'taxonomy_term.tags': { x: 0, y: 300 },
      'taxonomy_term.topics': { x: 200, y: 300 },
      'user.user': { x: 0, y: -300 },
      ...extraLayout,
    },
  };
}

function proxyBoxes(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const read = (id) => {
      const node = cy.getElementById(id);
      const position = node.position();
      const half = node.outerWidth() / 2;
      return { left: position.x - half, right: position.x + half, x: position.x, y: position.y, height: node.outerHeight() };
    };
    return {
      tags: read('field:node.article:field_tags'),
      author: read('field:node.article:field_author'),
      tagsProxy: read('proxy:field:node.article:field_tags>taxonomy_term.tags'),
      topicsProxy: read('proxy:field:node.article:field_tags>taxonomy_term.topics'),
      userProxy: read('proxy:field:node.article:field_author>user.user'),
    };
  });
}

test('stacks missing proxies beside their field, on the side away from the entity', async ({ page }) => {
  await openDocument(page, proxyDocument({}));
  const box = await proxyBoxes(page);

  expect(box.tagsProxy.left).toBeGreaterThan(box.tags.right);
  expect(box.tagsProxy.left - box.tags.right).toBeLessThan(100);
  expect(box.topicsProxy.left).toBeCloseTo(box.tagsProxy.left);
  expect(box.tagsProxy.y).toBeCloseTo(box.tags.y);
  expect(box.topicsProxy.y - box.tagsProxy.y).toBeGreaterThanOrEqual(box.tagsProxy.height);

  expect(box.userProxy.right).toBeLessThan(box.author.left);
  expect(box.author.left - box.userProxy.right).toBeLessThan(100);
  expect(box.userProxy.y).toBeCloseTo(box.author.y);
});

test("adds a missing proxy to the column of its field's saved proxies", async ({ page }) => {
  await openDocument(page, proxyDocument({ 'proxy:field:node.article:field_tags>taxonomy_term.tags': { x: 400, y: 0 } }));
  const box = await proxyBoxes(page);

  expect(box.tagsProxy.x).toBe(400);
  expect(box.tagsProxy.y).toBe(0);
  expect(box.topicsProxy.x).toBeCloseTo(400);
  expect(Math.abs(box.topicsProxy.y - box.tagsProxy.y)).toBeGreaterThanOrEqual(box.tagsProxy.height);
  expect(Math.abs(box.topicsProxy.y - box.tagsProxy.y)).toBeLessThan(2 * box.tagsProxy.height);
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
  await expect(page.locator('#folder-btn svg.icon')).toBeVisible();
});

test('surfaces an alert when a diagram fails to open', async ({ page }) => {
  await page.setInputFiles('#doc-open', { name: 'broken.nexus.json', mimeType: 'application/json', buffer: Buffer.from('{ not valid json') });
  await expect(page.locator('#landing-error')).toHaveAttribute('open', '');
  await expect(page.locator('#landing-error-text')).toContainText('Could not open');
});

test('builds a new entity and field and saves them', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

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

  // Renaming the machine name in the inspector re-ids the field.
  await slFill(page, '#inspector sl-input[data-machine-name]', 'field_summary');

  expect(await page.evaluate(() => window.__nexus.cy.getElementById('field:node.story:field_summary').length)).toBe(1);
});

// Captions and handles are repositioned 1 frame after a Cytoscape redraw, so
// this resolves 2 frames after the redraw the selection causes.
async function selectProgram(page, zoom) {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#mode-build');
  await page.evaluate(
    (z) =>
      new Promise((resolve) => {
        const cy = window.__nexus.cy;
        const program = cy.getElementById('node.program');
        cy.one('render', () => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        cy.zoom(z);
        cy.center(program);
        program.emit('tap');
      }),
    zoom,
  );
  await expect(page.locator('.handle--bottom')).toBeVisible();
}

// Viewport pixels from the bottom edges of Program's box and of its shown
// machine-name caption down to the top edge of its bottom handle.
function bottomHandleGaps(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const program = cy.getElementById('node.program');
    const handleTop = document.querySelector('.handle--bottom').getBoundingClientRect().top;
    const boxBottom = cy.container().getBoundingClientRect().top + program.renderedPosition('y') + program.renderedOuterHeight() / 2;
    const names = [...document.querySelectorAll('#captions .caption:not(.caption--type)')];
    const caption = names.find((c) => c.textContent === 'program' && c.style.display === 'block');
    return { box: handleTop - boxBottom, caption: caption ? handleTop - caption.getBoundingClientRect().bottom : null };
  });
}

function expectJustBelow(gap) {
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(10);
}

for (const zoom of [0.5, 1, 2, 3]) {
  test(`keeps the bottom handle clear of the selected entity's machine name at ${zoom * 100}% zoom`, async ({ page }) => {
    await selectProgram(page, zoom);

    expectJustBelow((await bottomHandleGaps(page)).caption);
  });
}

test('keeps the bottom handle at the entity box while its captions are hidden', async ({ page }) => {
  await selectProgram(page, 0.3);

  const gaps = await bottomHandleGaps(page);
  expect(gaps.caption).toBeNull();
  expectJustBelow(gaps.box);
});

test('adds a field below an entity from its bottom handle', async ({ page }) => {
  await selectProgram(page, 1);
  const before = await page.evaluate(() => window.__nexus.cy.nodes('[group="field"][entity="node.program"]').map((field) => field.id()));

  await page.click('.handle--bottom');

  await page.waitForFunction((count) => window.__nexus.cy.nodes('[group="field"][entity="node.program"]').length === count + 1, before.length);
  const offset = await page.evaluate((ids) => {
    const cy = window.__nexus.cy;
    const added = cy.nodes('[group="field"][entity="node.program"]').filter((field) => !ids.includes(field.id()));
    return added.position('y') - cy.getElementById('node.program').position('y');
  }, before);
  expect(offset).toBeGreaterThan(0);
});

test('reuses an existing field via autocomplete from the field tool', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
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

test('shows the edit palette as a second toolbar row only in edit mode', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const palette = page.locator('#build-tools');
  await expect(palette).toBeHidden();
  expect(await palette.evaluate((el) => el.classList.contains('toolbar__palette'))).toBe(true);
  expect(await palette.evaluate((el) => el.parentElement.classList.contains('toolbar'))).toBe(true);

  await page.click('#mode-build');
  await expect(palette).toBeVisible();
});

test('adds an entity from a palette type button', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.click('[data-add-entity="media"]');
  await expect(page.locator('[data-new="entity"]')).toBeVisible();
  await slFill(page, '[data-new-bundle]', 'photo');
  await page.click('[data-create-entity]');

  expect(await page.evaluate(() => window.__nexus.cy.getElementById('media.photo').length)).toBe(1);
});

test('adds a field from the toolbar field tool', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#mode-build');

  await page.click('#add-field');
  await expect(page.locator('[data-new="field"]')).toBeVisible();
  await slSelect(page, '[data-new-entity]', 'node.program');
  await page.fill('[data-new-name]', 'field_tagline');
  await page.click('[data-create-field]');

  expect(await page.evaluate(() => window.__nexus.cy.getElementById('field:node.program:field_tagline').length)).toBe(1);
});

test('places a note anywhere on the canvas', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.click('[data-add-note="event"]');
  const box = await page.locator('#cy').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await page.waitForFunction(() => window.__nexus.cy.nodes('[group="annotation"]').length === 1);
  expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="annotation"]').first().data('kind'))).toBe('event');
});

test('drags a note from the palette onto the canvas', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.dragAndDrop('[data-add-note="api"]', '#cy', { targetPosition: { x: 220, y: 160 } });

  await page.waitForFunction(() => window.__nexus.cy.nodes('[group="annotation"]').length === 1);
  expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="annotation"]').first().data('kind'))).toBe('api');
});

test('drags an entity type from the palette onto the canvas', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.dragAndDrop('[data-add-entity="paragraph"]', '#cy', { targetPosition: { x: 280, y: 220 } });

  await page.waitForFunction(() => window.__nexus.cy.nodes('[group="entity"][entityType="paragraph"]').length === 1);
  expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').length)).toBe(1);
});

test('toggles a dark theme that persists across reloads', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(false);
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
  await page.click('#theme-toggle');
  expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(true);
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
  expect(await page.evaluate(() => window.localStorage.getItem('nexusTheme'))).toBe('dark');

  await page.reload();
  await page.click('#example-btn');
  await waitForGraph(page);
  expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(true);
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
});

test('exports the diagram as PNG named after the title', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-png')]);
  expect(download.suggestedFilename()).toBe('example-content-model.png');
});

test('exports the diagram as SVG and honours a renamed title', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await slFill(page, '#diagram-title', 'My Model');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-svg')]);
  expect(download.suggestedFilename()).toBe('my-model.svg');
});

test('enables proxy declutter by default on render', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await expect(page.locator('#proxy-toggle')).toHaveClass(/is-active/);
  expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="proxy"]:visible').length)).toBeGreaterThan(0);
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

test('sets the zoom level from the status bar dropdown', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#zoom-level');
  await page.click('sl-menu-item[value="2"]');

  await page.waitForFunction(() => Math.abs(window.__nexus.cy.zoom() - 2) < 0.01);
  await expect(page.locator('#zoom-level')).toHaveText(/200%/);
});

test('labels each entity with its type in the caption layer', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const types = await page.locator('#captions .caption--type').allTextContents();
  expect(types.length).toBeGreaterThan(0);
  expect(types).toContain('Content type');
});

test('searches on the button and zooms to the match at 100%', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.evaluate(() => window.__nexus.cy.zoom(0.2));

  // Typing does not search.
  await slFill(page, '#search', 'episode');
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBe(0);

  // The button runs the search: it fades the rest and zooms to 100%.
  await page.click('#search-btn');
  await page.waitForFunction(() => Math.abs(window.__nexus.cy.zoom() - 1) < 0.01);
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBeGreaterThan(0);
});

test('a single docked panel fills the sidebar height', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#legend .panel__pin');
  await expect(page.locator('#legend.is-docked')).toBeVisible();

  const sizes = await page.evaluate(() => {
    const panel = document.getElementById('legend');
    const scroll = panel.closest('.dock__scroll');
    return { panelH: panel.getBoundingClientRect().height, scrollH: scroll.clientHeight };
  });
  // The lone docked panel fills the dock's content box (minus its padding).
  expect(sizes.panelH).toBeGreaterThan(sizes.scrollH - 40);
});

test('labels reference edges with cardinality in the default proxy view', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  // Proxies are on by default, so the visible reference lines are proxy edges;
  // they must still carry the cardinality label.
  const result = await page.evaluate(() => {
    const pe = window.__nexus.cy.edges('[group="proxyedge"]');
    return { total: pe.length, withCardinality: pe.filter((e) => !!e.data('cardinality')).length, hasMulti: pe.some((e) => e.data('cardinality') === '1..n') };
  });
  expect(result.total).toBeGreaterThan(0);
  expect(result.withCardinality).toBe(result.total);
  expect(result.hasMulti).toBe(true);
});

test('scales node captions with the canvas zoom', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const sizeAtZoom = (zoom) =>
    page.evaluate(
      (z) =>
        new Promise((resolve) => {
          window.__nexus.cy.zoom(z);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const cap = [...document.querySelectorAll('#captions .caption--type')].find((c) => c.style.display === 'block');
              resolve(cap ? parseFloat(cap.style.fontSize) : 0);
            }),
          );
        }),
      zoom,
    );

  const small = await sizeAtZoom(1);
  const large = await sizeAtZoom(2.5);
  expect(small).toBeGreaterThan(0);
  expect(large).toBeGreaterThan(small * 2);
});

test('adds an entity note that badges the canvas and reveals on hover', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#mode-build');

  await page.evaluate(() => window.__nexus.cy.getElementById('node.episode').emit('tap'));
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
  const episode = doc.entities.find((e) => e.entityType === 'node' && e.bundle === 'episode');
  expect(episode.note).toBe('Core content type.');
});

test('adds a note to a field too, not just entities', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
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

test('resets the singled-out focus when switching modes', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.evaluate(() => window.__nexus.cy.getElementById('node.episode').emit('tap'));
  await page.waitForFunction(() => window.__nexus.cy.elements('.faded').length > 0);

  await page.click('#mode-build');
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded, .trace, .trace-source').length)).toBe(0);
});

test('opens and tidies the diagram at 100% zoom', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  expect(await page.evaluate(() => window.__nexus.cy.zoom())).toBeCloseTo(1, 2);
  await expect(page.locator('#zoom-level')).toHaveText('100%');

  await page.evaluate(() => window.__nexus.cy.zoom(0.5));
  await page.click('#tidy');
  expect(await page.evaluate(() => window.__nexus.cy.zoom())).toBeCloseTo(1, 2);
});

test('isolates an entity on right-click and moves it with its fields', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#mode-build');

  const isolated = await page.evaluate(() => {
    const cy = window.__nexus.cy;
    const ep = cy.getElementById('node.episode');
    ep.emit('cxttap');
    return {
      othersFaded: cy.getElementById('node.program').hasClass('faded'),
      groupVisible: !ep.hasClass('faded'),
      groupGrabbable: ep.grabbable(),
      othersLocked: !cy.getElementById('node.program').grabbable(),
    };
  });
  expect(isolated).toEqual({ othersFaded: true, groupVisible: true, groupGrabbable: true, othersLocked: true });

  const move = await page.evaluate(() => {
    const cy = window.__nexus.cy;
    const ep = cy.getElementById('node.episode');
    const field = cy.nodes('[group="field"][entity="node.episode"]')[0];
    const fb = { x: field.position('x'), y: field.position('y') };
    const eb = { x: ep.position('x'), y: ep.position('y') };
    ep.emit('grab');
    ep.position({ x: eb.x + 120, y: eb.y + 40 });
    ep.emit('drag');
    ep.emit('free');
    return { fieldDx: Math.round(field.position('x') - fb.x), fieldDy: Math.round(field.position('y') - fb.y) };
  });
  expect(move).toEqual({ fieldDx: 120, fieldDy: 40 });

  // A tap on the empty canvas releases the isolation.
  await page.evaluate(() => window.__nexus.cy.emit('tap', [{ target: window.__nexus.cy }]));
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBe(0);
});

test('links to the project on GitHub from the toolbar', async ({ page }) => {
  await expect(page.locator('#github-link')).toHaveAttribute('href', 'https://github.com/drevops/nexus');
  await expect(page.locator('#github-link')).toHaveAttribute('target', '_blank');
  await expect(page.locator('#github-link svg.icon')).toHaveCount(1);
});

test('exports the fields table as CSV', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv')]);
  expect(download.suggestedFilename()).toBe('example-content-model-fields.csv');

  const csv = readFileSync(await download.path(), 'utf8');
  const lines = csv.split('\r\n');
  expect(lines[0]).toBe('Entity,Entity type,Field,Machine name,Field type,Cardinality,Required,References');
  expect(lines.some((l) => l.startsWith('Episode,Content type,'))).toBe(true);
});

test('wraps field types and machine names in the fields table only after an underscore', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#table-toggle');
  await expect(page.locator('#field-table')).toContainText('entity_reference_revisions');

  const types = await renderedLines(page.locator('#field-table tbody td:nth-child(2)'));
  const names = await renderedLines(page.locator('#field-table tbody td:nth-child(1) code'));
  const midWord = [...types, ...names].filter((lines) => lines.slice(0, -1).some((line) => !line.endsWith('_')));
  expect(midWord).toEqual([]);

  // entity_reference_revisions is far wider than its column, so its cell must
  // wrap.
  const revisions = page.locator('#field-table tbody td:nth-child(2)', { hasText: 'entity_reference_revisions' }).first();
  await expect(revisions).toHaveText('entity_reference_revisions');
  const [revisionLines] = await renderedLines(revisions);
  expect(revisionLines.length).toBeGreaterThan(1);
});

test('shrinks identifiers in the fields table to fit 1 line, but not below 10px', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#table-toggle');
  await expect(page.locator('#field-table')).toContainText('entity_reference_revisions');

  const identifiers = await fittedIdentifiers(page);
  expect(fitViolations(identifiers)).toEqual([]);
  expect(identifiers.some((i) => i.size < i.normal)).toBe(true);
  expect(identifiers.filter((i) => i.text === 'entity_reference' && i.lines.length > 1)).toEqual([]);

  // entity_reference_revisions would need less than 10px, so it keeps its
  // normal size and wraps instead.
  const revisions = identifiers.find((i) => i.text === 'entity_reference_revisions');
  expect(revisions.size).toBe(revisions.normal);
  expect(revisions.lines.length).toBeGreaterThan(1);
});

test('refits identifiers when browser zoom narrows the fields panel', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#table-toggle');
  await expect(page.locator('#field-table')).toContainText('field_link_facebook');

  const before = await fittedIdentifier(page, 'field_link_facebook');
  expect(before.size).toBeLessThan(before.normal);
  expect(before.lines).toEqual(['field_link_facebook']);

  // A 1280px window at about 250% zoom lays out as a 520px viewport, which
  // squeezes the panel without a store update to re-render the table.
  await page.setViewportSize({ width: 520, height: 720 });

  await expect.poll(async () => (await fittedIdentifier(page, 'field_link_facebook')).size).toBe(before.normal);
  expect((await fittedIdentifier(page, 'field_link_facebook')).lines.length).toBeGreaterThan(1);
  expect(fitViolations(await fittedIdentifiers(page))).toEqual([]);
});

test('refits identifiers when the docked fields panel is resized', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#table-toggle');
  await page.click('#table .panel__pin');
  await expect(page.locator('#table')).toHaveClass(/is-docked/);

  const narrow = await fittedIdentifier(page, 'field_link_facebook');
  expect(narrow.size).toBe(narrow.normal);
  expect(narrow.lines.length).toBeGreaterThan(1);

  const handle = await page.locator('#dock-right .dock__resize').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 120);
  await page.mouse.down();
  await page.mouse.move(handle.x - 300, handle.y + 120, { steps: 6 });
  await page.mouse.up();

  await expect.poll(async () => (await fittedIdentifier(page, 'field_link_facebook')).lines).toEqual(['field_link_facebook']);
  expect(fitViolations(await fittedIdentifiers(page))).toEqual([]);
});

test('keeps the multi-value cardinality badge legible in both themes', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#table-toggle');

  const badge = page.locator('#field-table .badge--multi').first();
  expect(await textContrast(badge)).toBeGreaterThanOrEqual(4.5);

  await page.click('#theme-toggle');
  expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(true);
  expect(await textContrast(badge)).toBeGreaterThanOrEqual(4.5);
});

test('echoes a hovered control description into the status bar', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.locator('#tidy').hover();
  await expect(page.locator('#statusbar-hint')).toHaveText('Tidy up: re-run the layout to arrange everything neatly');
});

test('describes the switched theme when the theme toggle is hovered again', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.click('#theme-toggle');
  await page.locator('#tidy').hover();
  await expect(page.locator('#statusbar-hint')).toHaveText('Tidy up: re-run the layout to arrange everything neatly');

  await page.locator('#theme-toggle').hover();
  await expect(page.locator('#statusbar-hint')).toHaveText('Switch to light theme');
});

test('refreshes the status bar hint when the hovered theme toggle is clicked', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  // Rest the pointer beside the icon and click in place, so neither a replaced
  // icon nor pointer movement fires a fresh mouseover.
  await page.locator('#theme-toggle').hover({ position: { x: 3, y: 12 } });
  await expect(page.locator('#statusbar-hint')).toHaveText('Switch to dark theme');

  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
  await expect(page.locator('#statusbar-hint')).toHaveText('Switch to light theme');

  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
  await expect(page.locator('#statusbar-hint')).toHaveText('Switch to dark theme');
});

test('keeps the status bar hint on the hovered control when another control is retitled', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  await page.locator('#tidy').hover();
  await page.locator('#theme-toggle').evaluate((el) => el.click());
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
  await expect(page.locator('#statusbar-hint')).toHaveText('Tidy up: re-run the layout to arrange everything neatly');

  await page.locator('#cy').hover();
  await page.locator('#theme-toggle').evaluate((el) => el.click());
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
  await expect(page.locator('#statusbar-hint')).toHaveText('');
});

test('shows interaction tips in the middle of the status bar', async ({ page }) => {
  await expect(page.locator('#statusbar .statusbar__tips')).toContainText('Right-click');
});

test('renders a non-empty glyph for every toolbar and status bar icon', async ({ page }) => {
  const empty = await page.evaluate(() =>
    [...document.querySelectorAll('.toolbar [data-icon], .statusbar [data-icon]')]
      .filter((el) => {
        const svg = el.querySelector('svg.icon');
        return !svg || svg.children.length === 0;
      })
      .map((el) => el.id || el.getAttribute('data-icon')),
  );
  expect(empty).toEqual([]);
});

test('keeps about, settings, theme and github on the brand line', async ({ page }) => {
  await expect(page.locator('.toolbar__brandline #about-toggle')).toHaveCount(1);
  await expect(page.locator('.toolbar__brandline #settings-toggle')).toHaveCount(1);
  await expect(page.locator('.toolbar__brandline #github-link')).toHaveCount(1);
  await expect(page.locator('.toolbar__tools #settings-toggle')).toHaveCount(0);
  await expect(page.locator('#settings-toggle')).toHaveText('');

  // About sits before the GitHub link in the brand line.
  const order = await page.evaluate(() => [...document.querySelectorAll('.toolbar__brandline [id]')].map((el) => el.id));
  expect(order.indexOf('about-toggle')).toBeLessThan(order.indexOf('github-link'));
});

test('opens an about dialog explaining browser-only storage and the licence', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await expect(page.locator('#about-dialog')).not.toBeVisible();

  await page.click('#about-toggle');
  await expect(page.locator('#about-dialog')).toBeVisible();
  await expect(page.locator('#about-dialog')).toContainText('content-model visual builder');
  await expect(page.locator('#about-dialog')).toContainText('there is no backend');
  await expect(page.locator('#about-dialog')).toContainText('without warranty');
  await expect(page.locator('#about-repo')).toHaveAttribute('href', 'https://github.com/drevops/nexus');
  await expect(page.locator('#about-license')).toHaveAttribute('href', 'https://github.com/drevops/nexus/blob/main/LICENSE');

  await page.click('#about-close');
  await expect(page.locator('#about-dialog')).not.toBeVisible();
});

test('shows the app version on the landing screen and in the about dialog', async ({ page }) => {
  await expect(page.locator('#landing-version')).toHaveText('dev');

  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#about-toggle');
  await expect(page.locator('#about-version')).toHaveText('dev');
});

test('draws entity types with their symbols and a dynamic legend', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);

  const shapes = await page.evaluate(() => ({
    node: window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'),
    vocab: window.__nexus.cy.nodes('[group="entity"][entityType="taxonomy_term"]').first().style('shape'),
  }));
  expect(shapes.node).toBe('round-rectangle');
  expect(shapes.vocab).toBe('tag');

  const legend = await page.locator('#legend .legend__label').allTextContents();
  expect(legend).toContain('Content type');
  expect(legend).toContain('Vocabulary');
});

test('changes a type symbol and adds a custom entity type in settings', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#settings-toggle');

  // Change the content-type symbol to a diamond and see the node reshape.
  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
  await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('diamond');

  // Add a custom type; it becomes a settings row.
  await page.fill('#settings [data-new-type]', 'widget');
  await page.click('#settings [data-add-type]');
  await expect(page.locator('#settings [data-type-row="widget"]')).toHaveCount(1);
});

test('resets colours and symbols to defaults from settings', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#settings-toggle');

  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
  await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('diamond');

  await page.click('#settings-reset');

  await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('round-rectangle');
  await expect.poll(() => page.evaluate(() => document.querySelector('#settings sl-select[data-symbol="node"]').value)).toBe('rounded');
});

test('round-trips custom types and symbols through a saved document', async ({ page }) => {
  await page.click('#example-btn');
  await waitForGraph(page);
  await page.click('#settings-toggle');

  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
  await page.fill('#settings [data-new-type]', 'gadget');
  await page.click('#settings [data-add-type]');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(doc.symbols.node).toBe('diamond');
  expect(doc.customTypes.some((t) => t.type === 'gadget')).toBe(true);
});
