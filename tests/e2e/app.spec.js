import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'config-min');
const EXAMPLE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'conference');

function entityCount(page) {
  return page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').length);
}

// The position of each node the selector matches, or of every node, keyed by
// node id.
function nodePositions(page, selector) {
  return page.evaluate((nodeSelector) => {
    const positions = {};
    window.__nexus.cy.nodes(nodeSelector).forEach((node) => {
      positions[node.id()] = node.position();
    });
    return positions;
  }, selector);
}

async function waitForGraph(page) {
  await page.waitForFunction(() => window.__nexus && window.__nexus.cy.nodes('[group="entity"]').length > 0);
}

// Imports the conference fixture folder, with its annotation overlay.
async function loadExample(page) {
  await page.setInputFiles('#folder-input', EXAMPLE_DIR);
  await waitForGraph(page);
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

// Clicks the element and returns the download the click starts.
async function downloadFrom(page, selector) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  return download;
}

// Picks a format from the Export button's menu and returns its download once
// the menu has closed. A dropdown reopened while its close animation runs
// stays open but hidden.
async function exportFrom(page, format) {
  await page.click('#export-choose');
  const download = await downloadFrom(page, '#export-menu sl-menu-item[value="' + format + '"]');
  await expect(page.locator('#export-menu')).toBeHidden();

  return download;
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

async function createEntity(page, entityType, bundle, label) {
  await page.click('[data-add-entity="' + entityType + '"]');
  await slFill(page, '[data-new-bundle]', bundle);
  await slFill(page, '[data-new-label]', label);
  await page.click('[data-create-entity]');
}

// A new document in edit mode holding a Story content type with 1 field,
// 'field_1', which the inspector has selected.
async function buildStoryWithField(page) {
  await page.click('#new-btn');
  await page.click('#mode-build');
  await createEntity(page, 'node', 'story', 'Story');
  await page.click('.handle--right');
  await page.waitForFunction(() => window.__nexus.cy.getElementById('field:node.story:field_1').nonempty());
}

// The callback returns nothing, since Playwright is slow to serialize the
// collection emit() returns.
function tapNode(page, id) {
  return page.evaluate((nodeId) => {
    window.__nexus.cy.getElementById(nodeId).emit('tap');
  }, id);
}

function captionsOf(page, id) {
  return page.evaluate(
    (nodeId) =>
      [...document.querySelectorAll('#captions .caption')]
        .filter((div) => div.dataset.nodeId === nodeId)
        .map((div) => ({ text: div.textContent, shown: div.style.display === 'block' })),
    id,
  );
}

// Sorted by node id, so the result doesn't depend on the order badges were
// drawn in.
function noteBadges(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#notes .note-badge')]
      .map((badge) => ({ nodeId: badge.dataset.nodeId || '', shown: badge.style.display === 'flex' }))
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
  );
}

const LIGHT_MARK = { ink: ['rgb(51, 62, 67)'], ref: ['rgb(83, 180, 235)'] };
const DARK_MARK = { ink: ['rgb(255, 255, 255)'], ref: ['rgb(83, 180, 235)'] };

// Returns the distinct computed fills of the ink and ref shapes in the Nexus
// mark inside the element the selector matches.
function markFills(page, selector) {
  return page.locator(selector + ' svg.icon--nexus').evaluate((svg) => {
    const fills = (role) => [...new Set([...svg.querySelectorAll('.' + role)].map((shape) => getComputedStyle(shape).fill))];
    return { ink: fills('ink'), ref: fills('ref') };
  });
}

function boxesOf(page, selectors) {
  return Promise.all(selectors.map((selector) => page.locator(selector).boundingBox()));
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function expectInTopRightCorner(outer, box) {
  expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(box.x).toBeGreaterThan(outer.x + outer.width - 100);
  expect(box.y).toBeGreaterThanOrEqual(outer.y);
  expect(box.y).toBeLessThan(outer.y + 50);
}

// Returns the selector of the element drawn on top at the centre of the area
// where all the matched elements overlap, or null when another element is.
function topmostOf(page, selectors) {
  return page.evaluate((list) => {
    const boxes = list.map((selector) => document.querySelector(selector).getBoundingClientRect());
    const left = Math.max(...boxes.map((box) => box.left));
    const right = Math.min(...boxes.map((box) => box.right));
    const top = Math.max(...boxes.map((box) => box.top));
    const bottom = Math.min(...boxes.map((box) => box.bottom));

    if (left >= right || top >= bottom) {
      throw new Error(list.join(' and ') + ' do not overlap');
    }

    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);

    return list.find((selector) => hit.closest(selector)) || null;
  }, selectors);
}

// Returns what is drawn on top where the open list of the select overlaps the
// toolbar: 'list', 'toolbar', or null while they do not overlap.
function listOverToolbar(page, selector) {
  return page.evaluate((selectSelector) => {
    const list = document.querySelector(selectSelector).shadowRoot.querySelector('.select__listbox').getBoundingClientRect();
    const toolbar = document.querySelector('.toolbar').getBoundingClientRect();

    if (list.height === 0 || list.top >= toolbar.bottom) {
      return null;
    }

    const hit = document.elementFromPoint(list.left + list.width / 2, (Math.max(list.top, toolbar.top) + toolbar.bottom) / 2);

    if (hit.closest(selectSelector)) {
      return 'list';
    }

    return hit.closest('.toolbar') ? 'toolbar' : null;
  }, selector);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('draws a config folder with its annotation overlay', async ({ page }) => {
  await expect(page.locator('#landing')).toBeVisible();
  await page.setInputFiles('#folder-input', EXAMPLE_DIR);

  await expect(page.locator('#landing')).toBeHidden();
  await waitForGraph(page);

  expect(await entityCount(page)).toBe(16);
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.event').length)).toBe(1);
  expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="annotation"]').length)).toBe(3);
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
  await loadExample(page);

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
  await loadExample(page);

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
  await loadExample(page);

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
  await loadExample(page);

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
  await loadExample(page);
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
  await loadExample(page);

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
  await loadExample(page);

  await page.click('#entities-toggle');
  await page.click('#entities .panel__pin');
  await expect(page.locator('#entities')).toHaveClass(/is-docked/);
  await page.waitForTimeout(500);

  await page.reload();
  await loadExample(page);

  await expect(page.locator('#entities')).toHaveClass(/is-docked/);
  expect(await page.locator('#entities').evaluate((el) => el.closest('.dock').id)).toBe('dock-left');
});

test('draws a pressed panel above the panel it overlaps', async ({ page }) => {
  await loadExample(page);

  await page.click('#legend-toggle');
  await page.click('#table-toggle');
  await page.click('#settings-toggle');
  await expect.poll(() => topmostOf(page, ['#table', '#settings'])).toBe('#settings');

  await page.locator('#table').dispatchEvent('mousedown');
  await expect.poll(() => topmostOf(page, ['#table', '#settings'])).toBe('#table');

  await page.locator('#settings').dispatchEvent('mousedown');
  await expect.poll(() => topmostOf(page, ['#table', '#settings'])).toBe('#settings');
});

test('keeps a panel clicked many times below the zoom menu and the import screen', async ({ page }) => {
  await loadExample(page);

  const legend = page.locator('#legend');
  const body = await legend.locator('.legend-body').boundingBox();
  await page.mouse.click(body.x + 8, body.y + 8);
  const zIndex = await legend.evaluate((el) => getComputedStyle(el).zIndex);

  for (let i = 0; i < 45; i++) {
    await page.mouse.click(body.x + 8, body.y + 8);
  }
  await expect(legend).toHaveCSS('z-index', zIndex);

  await page.click('#zoom-level');
  await expect(page.locator('#zoom-menu')).toBeVisible();
  await expect.poll(() => topmostOf(page, ['#zoom-menu', '#legend'])).toBe('#zoom-menu');
  await page.keyboard.press('Escape');

  await page.click('#doc-import');
  await expect(page.locator('#landing')).toBeVisible();
  await expect.poll(() => topmostOf(page, ['#landing', '#legend'])).toBe('#landing');
});

// The tooltip ignores the pointer, so a hit test can't find it. It shares the
// root stacking context with the panels, so z-indexes decide the order.
test('draws the canvas tooltip over a panel nobody has raised', async ({ page }) => {
  await loadExample(page);

  const [tooltip, legend] = await page.evaluate(() => ['tooltip', 'legend'].map((id) => Number(getComputedStyle(document.getElementById(id)).zIndex)));

  expect(tooltip).toBeGreaterThan(legend);
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
  await loadExample(page);

  await page.click('#settings-toggle');
  await slFill(page, 'sl-color-picker[data-color="paragraph"]', '#112233');

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')));
  expect(stored.colors.paragraph).toBe('#112233');

  await page.reload();
  await loadExample(page);

  const applied = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="paragraph"]').style('background-color'));
  expect(applied.replace(/\s/g, '')).toBe('rgb(17,34,51)');
});

test('saves and reloads a Nexus diagram document', async ({ page }) => {
  await loadExample(page);
  const before = await entityCount(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  expect(download.suggestedFilename()).toMatch(/\.nexus\.json$/);
  const saved = await download.path();

  await page.goto('/index.html');
  await page.setInputFiles('#doc-open', saved);
  await waitForGraph(page);

  expect(await entityCount(page)).toBe(before);
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.event').length)).toBe(1);
});

test('reopens a saved diagram with every node where it was saved', async ({ page }) => {
  await loadExample(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const saved = await download.path();
  const doc = JSON.parse(readFileSync(saved, 'utf8'));

  await page.goto('/index.html');
  await page.setInputFiles('#doc-open', saved);
  await waitForGraph(page);

  expect(await nodePositions(page)).toEqual(doc.layout);
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
  await loadExample(page);

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

// The layout saved with proxies hidden leaves no room beside the fields, so a
// proxy can land well above or below its field.
test("leaves hidden proxies out of a saved layout and places them in their field's proxy column on open", async ({ page }) => {
  await loadExample(page);
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
  await loadExample(page);

  await page.click('#doc-import');
  await expect(page.locator('#landing')).toBeVisible();
  await expect(page.locator('#landing-cancel')).toBeVisible();

  await page.click('#landing-cancel');
  await expect(page.locator('#landing')).toBeHidden();
  expect(await entityCount(page)).toBeGreaterThan(0);
});

test('scrolls the landing screen to every part of the card in a short window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 460 });
  const card = page.locator('.landing__card');
  expect((await card.boundingBox()).y).toBeGreaterThanOrEqual(0);

  await page.locator('#landing').evaluate((landing) => {
    landing.scrollTop = landing.scrollHeight;
  });
  const box = await card.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(460);
});

test('lays the landing out with your configuration beside the templates', async ({ page }) => {
  const [dropzone, list, open, scratch] = await boxesOf(page, ['#dropzone', '#template-list', '#landing-open', '#new-btn']);

  expect(list.x).toBeGreaterThan(dropzone.x + dropzone.width);
  expect(list.y).toBeCloseTo(dropzone.y, 0);
  expect(scratch.x).toBeGreaterThan(open.x + open.width);
  expect(scratch.y).toBe(open.y);
  expect(scratch.width).toBe(open.width);
});

test('stacks the templates below your configuration in a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const [dropzone, list, open, scratch] = await boxesOf(page, ['#dropzone', '#template-list', '#landing-open', '#new-btn']);

  expect(list.x).toBe(dropzone.x);
  expect(list.width).toBe(dropzone.width);
  expect(list.y).toBeGreaterThan(dropzone.y + dropzone.height);
  expect(scratch.x).toBe(open.x);
  expect(scratch.width).toBe(open.width);
});

test('offers a close button in the corner of the card only while a diagram is open', async ({ page }) => {
  await expect(page.locator('#landing-cancel')).toBeHidden();

  await loadExample(page);
  await page.click('#doc-import');
  await expect(page.locator('#landing-cancel')).toBeVisible();

  const [card, close] = await boxesOf(page, ['.landing__card', '#landing-cancel']);

  expectInTopRightCorner(card, close);
});

test('puts the theme toggle in the corner of the card, beside the close button once a diagram is open', async ({ page }) => {
  const [card, toggle] = await boxesOf(page, ['.landing__card', '#landing-theme']);

  expectInTopRightCorner(card, toggle);

  await loadExample(page);
  await page.click('#doc-import');
  await expect(page.locator('#landing-cancel')).toBeVisible();

  const [cardWithClose, beside, close] = await boxesOf(page, ['.landing__card', '#landing-theme', '#landing-cancel']);

  expectInTopRightCorner(cardWithClose, close);
  expect(beside.x + beside.width).toBeLessThanOrEqual(close.x);
  expect(close.x - (beside.x + beside.width)).toBeLessThan(16);
  expect(beside.y).toBe(close.y);
});

for (const width of dataProviderLandingWidths()) {
  test(`keeps the corner buttons clear of the Nexus mark in a ${width}px window`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await loadExample(page);
    await page.click('#doc-import');
    await expect(page.locator('#landing-cancel')).toBeVisible();

    const [mark, toggle, close] = await boxesOf(page, ['.landing__logo svg.icon--nexus', '#landing-theme', '#landing-cancel']);

    expect(boxesOverlap(mark, toggle)).toBe(false);
    expect(boxesOverlap(mark, close)).toBe(false);
  });
}

function dataProviderLandingWidths() {
  return [375, 320, 280];
}

test('keeps keyboard focus on the landing screen while it is open', async ({ page }) => {
  const focusedId = () => page.evaluate(() => document.activeElement.id);

  // A Shoelace control takes focus only once it renders its inner control.
  await page.waitForFunction(() =>
    ['diagram-title', 'landing-theme', 'folder-btn'].every((id) => document.getElementById(id).shadowRoot?.querySelector('input, button')),
  );
  await page.keyboard.press('Tab');
  expect(await focusedId()).toBe('landing-theme');
  await page.keyboard.press('Tab');
  expect(await focusedId()).toBe('folder-btn');

  await loadExample(page);
  await page.click('#doc-import');
  await page.keyboard.press('Tab');
  expect(await focusedId()).toBe('landing-theme');
  await page.keyboard.press('Tab');
  expect(await focusedId()).toBe('landing-cancel');

  await page.click('#landing-cancel');
  expect(await page.locator('.toolbar').evaluate((toolbar) => toolbar.inert)).toBe(false);
});

test('closes the landing screen with Escape only while a diagram is open', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('#landing')).toBeVisible();

  await loadExample(page);
  await page.click('#doc-import');
  await expect(page.locator('#landing')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#landing')).toBeHidden();
  expect(await entityCount(page)).toBe(16);
});

test('heads the landing screen with the app name above its 2 sections', async ({ page }) => {
  const headings = await page
    .locator('#landing')
    .locator('h1, h2')
    .evaluateAll((elements) => elements.map((element) => element.tagName + ' ' + element.textContent.trim()));

  expect(headings).toEqual(['H1 Nexus', 'H2 Your configuration', 'H2 Start from a template']);
});

test('lists every template with its badge, its counts and a drawn mark', async ({ page }) => {
  const rows = page.locator('.template-row');

  await expect(rows).toHaveCount(2);
  const ids = await rows.evaluateAll((elements) => elements.map((element) => element.id));

  expect(ids).toEqual(['template-drupal-cms', 'template-civictheme']);

  for (const [id, label, badge, counts] of dataProviderTemplateRows()) {
    const row = page.locator('#template-' + id);

    await expect(row.locator('.template-row__name')).toHaveText(label);
    await expect(row.locator('.template-row__badge')).toHaveText(badge);
    await expect(row.locator('.template-row__counts')).toHaveText(counts);
    expect(await row.locator('.template-row__mark svg.icon > *').count()).toBeGreaterThan(0);
  }
});

function dataProviderTemplateRows() {
  return [
    ['civictheme', 'CivicTheme', '1.13.0', '3 content types · 31 paragraph types · 6 media types'],
    ['drupal-cms', 'Drupal CMS', '2.2.2', '2 content types · 5 media types · 1 vocabulary'],
  ];
}

for (const [id, title, entities, entityId] of dataProviderTemplates()) {
  test(`loads the ${title} template`, async ({ page }) => {
    await page.click('#template-' + id);
    await waitForGraph(page);

    expect(await entityCount(page)).toBe(entities);
    expect(await page.evaluate((target) => window.__nexus.cy.getElementById(target).length, entityId)).toBe(1);
    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', title);

    // The document holds no layout, so the app lays the entities out on open.
    const positions = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').map((node) => JSON.stringify(node.position())));

    expect(new Set(positions).size).toBe(entities);
  });
}

function dataProviderTemplates() {
  return [
    ['civictheme', 'CivicTheme 1.13.0', 49, 'paragraph.civictheme_accordion'],
    ['drupal-cms', 'Drupal CMS 2.2.2', 9, 'node.blog'],
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
    await expect(page.locator('#landing-error-text')).toHaveText('Could not load CivicTheme 1.13.0: ' + message);
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
    'Could not load CivicTheme 1.13.0: civictheme.nexus.json could not be downloaded. Check your connection and try again.',
  );
  await expect(page.locator('#landing')).toBeVisible();
});

test('loads a template from the keyboard', async ({ page }) => {
  await page.focus('#template-drupal-cms');
  await page.keyboard.press('Enter');
  await waitForGraph(page);

  await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Drupal CMS 2.2.2');
});

test('renders toolbar icons from the icon set', async ({ page }) => {
  await expect(page.locator('#doc-import svg.icon')).toBeVisible();
  await expect(page.locator('#doc-save svg.icon')).toBeVisible();
  await expect(page.locator('#layout-run svg.icon')).toBeVisible();
  await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: Columns');
  await expect(page.locator('#folder-btn svg.icon')).toBeVisible();
});

test('surfaces an alert when a diagram fails to open', async ({ page }) => {
  await page.setInputFiles('#doc-open', { name: 'broken.nexus.json', mimeType: 'application/json', buffer: Buffer.from('{ not valid json') });
  await expect(page.locator('#landing-error')).toHaveAttribute('open', '');
  await expect(page.locator('#landing-error-text')).toContainText('Could not open');
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

// Whether each element that draws the reference from the field to the target
// is on the canvas and shown.
function referenceView(page, field, target) {
  return page.evaluate(
    ([fieldId, targetId]) => {
      const cy = window.__nexus.cy;
      const shown = (id) => cy.getElementById(id).nonempty() && cy.getElementById(id).visible();
      const entity = cy.getElementById(fieldId).data('entity');
      return {
        ref: shown('ref:' + fieldId + '>' + targetId),
        proxy: shown('proxy:' + fieldId + '>' + targetId),
        proxyEdge: shown('pe:' + fieldId + '>' + targetId),
        collapsed: shown('c:' + entity + '>' + targetId),
      };
    },
    [field, target],
  );
}

const PROXY_VIEW = { ref: false, proxy: true, proxyEdge: true, collapsed: false };

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

  await slSelect(page, '#inspector sl-select[placeholder="Add target…"]', ref.target);
  expect(await refCount(page, ref.field, ref.target)).toBe(1);
  await expect(tags).toHaveCount(1);

  await tags.evaluate((el) => el.dispatchEvent(new Event('sl-remove', { bubbles: true })));
  expect(await refCount(page, ref.field, ref.target)).toBe(0);
  await expect(tags).toHaveCount(0);
  expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).length, 'proxy:' + ref.field + '>' + ref.target)).toBe(0);
});

const TRACK_FIELD = 'field:node.session:field_track';
const TRACKS = 'taxonomy_term.tracks';

// The example in edit mode.
async function editExample(page) {
  await loadExample(page);
  await page.click('#mode-build');
}

// The example in edit mode, with Session's track field selected in the
// inspector. The field references the Tracks vocabulary only.
async function selectTrackField(page) {
  await editExample(page);
  await tapNode(page, TRACK_FIELD);
}

function addTarget(page, target) {
  return slSelect(page, '#inspector sl-select[placeholder="Add target…"]', target);
}

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

  await page.click('#fields-toggle');
  expect(await referenceView(page, TRACK_FIELD, 'node.event')).toEqual({ ref: false, proxy: false, proxyEdge: false, collapsed: true });

  await page.click('#fields-toggle');
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
  await page.click('#fields-toggle');

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

for (const [name, toggle] of dataProviderLayoutToggles()) {
  test(`lays the diagram out as the layout button does after turning ${name} off and on`, async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');
    await page.click('#layout-run');
    const tidied = await nodePositions(page);

    await toggle(page);
    await toggle(page);

    expect(await nodePositions(page)).toEqual(tidied);
  });
}

function dataProviderLayoutToggles() {
  return [
    ['Fields', (page) => page.click('#fields-toggle')],
    ['Proxies', (page) => page.click('#proxy-toggle')],
    ['the Media filter', (page) => page.locator('#type-filters label', { hasText: 'Media' }).locator('input').click()],
  ];
}

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

// Captions and handles are repositioned 1 frame after a Cytoscape redraw, so
// this resolves 2 frames after the redraw the selection causes.
async function selectEvent(page, zoom) {
  await loadExample(page);
  await page.click('#mode-build');
  await page.evaluate(
    (z) =>
      new Promise((resolve) => {
        const cy = window.__nexus.cy;
        const entity = cy.getElementById('node.event');
        cy.one('render', () => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        cy.zoom(z);
        cy.center(entity);
        entity.emit('tap');
      }),
    zoom,
  );
  await expect(page.locator('.handle--bottom')).toBeVisible();
}

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

test('shows the edit palette as a second toolbar row only in edit mode', async ({ page }) => {
  await loadExample(page);

  const palette = page.locator('#build-tools');
  await expect(palette).toBeHidden();
  expect(await palette.evaluate((el) => el.classList.contains('toolbar__palette'))).toBe(true);
  expect(await palette.evaluate((el) => el.parentElement.classList.contains('toolbar'))).toBe(true);

  await page.click('#mode-build');
  await expect(palette).toBeVisible();
});

function paletteSwatches(page) {
  return page
    .locator('#build-tools [data-add-entity]')
    .evaluateAll((buttons) =>
      buttons.map((btn) => ({ type: btn.dataset.addEntity, color: getComputedStyle(btn.querySelector('.palette__swatch')).backgroundColor })),
    );
}

test('paints each palette swatch in the colour of its entity type', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  await page.click('#settings-toggle');

  const types = await page.locator('#settings [data-type-row]').evaluateAll((rows) => rows.map((row) => row.dataset.typeRow));
  const swatches = await paletteSwatches(page);
  expect(swatches.map((swatch) => swatch.type)).toEqual(types);
  expect(swatches.find((swatch) => swatch.type === 'paragraph').color).toBe('rgb(205, 189, 236)');

  await slFill(page, 'sl-color-picker[data-color="paragraph"]', '#112233');
  expect((await paletteSwatches(page)).find((swatch) => swatch.type === 'paragraph').color).toBe('rgb(17, 34, 51)');
});

test('adds an external entity from the palette', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.click('[data-add-entity="external"]');
  await expect(page.locator('[data-new="entity"] .insp__title')).toHaveText('New External entity');
  await expect(page.locator('[data-new="entity"] sl-option[value="external"]')).toHaveCount(1);
  await slFill(page, '[data-new-bundle]', 'crm_contact');
  await slFill(page, '[data-new-label]', 'CRM contact');
  await page.click('[data-create-entity]');

  expect(await page.evaluate(() => window.__nexus.cy.getElementById('external.crm_contact').style('shape'))).toBe('hexagon');
  expect(await captionsOf(page, 'external.crm_contact')).toEqual([
    { text: 'External entity', shown: true },
    { text: 'crm_contact', shown: true },
  ]);
});

test('names entities dropped from the palette after their type', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.dragAndDrop('[data-add-entity="node"]', '#cy', { targetPosition: { x: 200, y: 160 } });
  await page.dragAndDrop('[data-add-entity="external"]', '#cy', { targetPosition: { x: 420, y: 160 } });
  await page.waitForFunction(() => window.__nexus.cy.nodes('[group="entity"]').length === 2);

  const entities = await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').map((node) => node.id() + ' ' + node.data('label')));
  expect(entities.sort()).toEqual(['external.external_entity_1 External Entity 1', 'node.content_type_1 Content Type 1']);
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
  await loadExample(page);
  await page.click('#mode-build');

  await page.click('#add-field');
  await expect(page.locator('[data-new="field"]')).toBeVisible();
  await slSelect(page, '[data-new-entity]', 'node.event');
  await page.fill('[data-new-name]', 'field_tagline');
  await page.click('[data-create-field]');

  expect(await page.evaluate(() => window.__nexus.cy.getElementById('field:node.event:field_tagline').length)).toBe(1);
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
  await loadExample(page);

  expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(false);
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
  await page.click('#theme-toggle');
  expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(true);
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
  expect(await page.evaluate(() => window.localStorage.getItem('nexusTheme'))).toBe('dark');

  await page.reload();
  await loadExample(page);
  expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(true);
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
});

test('switches the theme from the landing screen and keeps it across reloads', async ({ page }) => {
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'));

  await expect(page.locator('#landing-theme')).toBeVisible();
  await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to dark theme');
  expect(await isDark()).toBe(false);

  await page.click('#landing-theme');
  expect(await isDark()).toBe(true);
  expect(await page.evaluate(() => window.localStorage.getItem('nexusTheme'))).toBe('dark');
  expect(await markFills(page, '.landing__logo')).toEqual(DARK_MARK);

  for (const toggle of ['#landing-theme', '#theme-toggle']) {
    await expect(page.locator(toggle)).toHaveAttribute('title', 'Switch to light theme');
  }

  await page.reload();
  await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to light theme');
  expect(await isDark()).toBe(true);

  await page.click('#landing-theme');
  expect(await isDark()).toBe(false);
  await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to dark theme');
});

test('keeps the landing and toolbar theme toggles in step around an open diagram', async ({ page }) => {
  const fieldFill = () => page.evaluate(() => window.__nexus.cy.nodes('[group="field"][kind="single"]').first().style('background-color').replace(/\s/g, ''));

  await loadExample(page);
  await page.click('#theme-toggle');
  expect(await fieldFill()).toBe('rgb(43,48,57)');

  await page.click('#doc-import');
  await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to light theme');

  await page.click('#landing-theme');
  expect(await fieldFill()).toBe('rgb(255,255,255)');

  await page.click('#landing-cancel');
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
});

test('exports the diagram as PNG named after the title', async ({ page }) => {
  await loadExample(page);

  const download = await exportFrom(page, 'png');
  expect(download.suggestedFilename()).toBe('example-content-model.png');
});

test('loads the SVG exporter without a duplicate registration warning', async ({ page }) => {
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') {
      warnings.push(message.text());
    }
  });

  await page.reload();
  await loadExample(page);

  expect(warnings.filter((warning) => warning.includes('Can not register'))).toEqual([]);
});

test('exports the diagram as SVG and honours a renamed title', async ({ page }) => {
  await loadExample(page);

  await slFill(page, '#diagram-title', 'My Model');

  const download = await exportFrom(page, 'svg');
  expect(download.suggestedFilename()).toBe('my-model.svg');
});

for (const [filename, startDownload] of dataProviderUntitledDownloads()) {
  test(`names the ${filename} download after the default title when the title is empty`, async ({ page }) => {
    await loadExample(page);
    await slFill(page, '#diagram-title', '');

    expect((await startDownload(page)).suggestedFilename()).toBe(filename);
  });
}

function dataProviderUntitledDownloads() {
  return [
    ['content-model.png', (page) => exportFrom(page, 'png')],
    ['content-model.svg', (page) => exportFrom(page, 'svg')],
    ['content-model-fields.csv', (page) => exportFrom(page, 'csv')],
    ['content-model.nexus.json', (page) => downloadFrom(page, '#doc-save')],
  ];
}

test('opens the export menu from the Export button until a format is chosen', async ({ page }) => {
  await loadExample(page);

  const downloads = [];
  page.on('download', (download) => downloads.push(download));

  await expect(page.locator('#export-run')).toHaveText('Export');
  await page.click('#export-run');

  await expect(page.locator('#export-menu')).toBeVisible();
  await expect(page.locator('#export-menu sl-menu-item')).toHaveText(['PNG', 'SVG', 'CSV']);
  expect(downloads).toEqual([]);
});

for (const [format, label, filename, title] of dataProviderExportFormats()) {
  test(`repeats ${label} from the Export button once it is chosen from the menu`, async ({ page }) => {
    await loadExample(page);

    expect((await exportFrom(page, format)).suggestedFilename()).toBe(filename);
    await expect(page.locator('#export-run')).toHaveText('Export ' + label);
    await expect(page.locator('#export-run')).toHaveAttribute('title', title);

    expect((await downloadFrom(page, '#export-run')).suggestedFilename()).toBe(filename);
    await expect(page.locator('#export-dropdown')).toHaveJSProperty('open', false);
  });
}

function dataProviderExportFormats() {
  return [
    ['png', 'PNG', 'example-content-model.png', 'Export the diagram as a PNG image'],
    ['svg', 'SVG', 'example-content-model.svg', 'Export the diagram as a scalable SVG'],
    ['csv', 'CSV', 'example-content-model-fields.csv', 'Export the fields table as CSV'],
  ];
}

test('remembers the chosen export format across reloads', async ({ page }) => {
  await loadExample(page);
  await exportFrom(page, 'svg');

  await page.reload();
  await loadExample(page);

  await expect(page.locator('#export-run')).toHaveText('Export SVG');
  expect((await downloadFrom(page, '#export-run')).suggestedFilename()).toBe('example-content-model.svg');
});

for (const [name, stored] of dataProviderUnknownExportFormats()) {
  test(`ignores a stored export format that is ${name}`, async ({ page }) => {
    await page.evaluate((value) => window.localStorage.setItem('nexusExportFormat', value), stored);
    await page.reload();
    await loadExample(page);

    await expect(page.locator('#export-run')).toHaveText('Export');
    await page.click('#export-run');
    await expect(page.locator('#export-menu')).toBeVisible();
  });
}

function dataProviderUnknownExportFormats() {
  return [
    ['unknown', 'pdf'],
    ['in capitals', 'SVG'],
    ['an inherited object property', 'constructor'],
    ['empty', ''],
  ];
}

test('ignores an export menu item that names no format', async ({ page }) => {
  await loadExample(page);

  const errors = [];
  const downloads = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('download', (download) => downloads.push(download));

  await page.evaluate(() => {
    const item = document.createElement('sl-menu-item');
    item.setAttribute('value', 'pdf');
    item.textContent = 'PDF';
    document.getElementById('export-menu').append(item);
  });

  await page.click('#export-choose');
  await page.click('#export-menu sl-menu-item[value="pdf"]');
  await expect(page.locator('#export-menu')).toBeHidden();

  await expect(page.locator('#export-run')).toHaveText('Export');
  expect(await page.evaluate(() => window.localStorage.getItem('nexusExportFormat'))).toBeNull();
  expect(errors).toEqual([]);
  expect(downloads).toEqual([]);
});

test('switches the export format from the menu', async ({ page }) => {
  await loadExample(page);
  await exportFrom(page, 'svg');

  expect((await exportFrom(page, 'csv')).suggestedFilename()).toBe('example-content-model-fields.csv');
  await expect(page.locator('#export-run')).toHaveText('Export CSV');
  expect((await downloadFrom(page, '#export-run')).suggestedFilename()).toBe('example-content-model-fields.csv');
});

test('closes the export menu when the Export button is pressed again', async ({ page }) => {
  await loadExample(page);

  await page.click('#export-run');
  await expect(page.locator('#export-menu')).toBeVisible();

  await page.click('#export-run');
  await expect(page.locator('#export-menu')).toBeHidden();
});

test('exports from the Export button while its menu is open and closes the menu', async ({ page }) => {
  await loadExample(page);
  await exportFrom(page, 'png');

  await page.click('#export-choose');
  await expect(page.locator('#export-menu')).toBeVisible();

  expect((await downloadFrom(page, '#export-run')).suggestedFilename()).toBe('example-content-model.png');
  await expect(page.locator('#export-menu')).toBeHidden();
});

test('opens the export menu and exports from the keyboard', async ({ page }) => {
  await loadExample(page);

  // locator.focus() leaves a Shoelace button unfocused, so this calls the
  // button's own focus().
  await page.locator('#export-run').evaluate((button) => button.focus());
  await expect(page.locator('#export-run')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#export-menu')).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#export-menu sl-menu-item[value="png"]')).toBeFocused();

  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toBe('example-content-model.png');
  await expect(page.locator('#export-run')).toHaveText('Export PNG');
});

test('draws the export menu above a panel under it', async ({ page }) => {
  await loadExample(page);
  await page.click('#entities-toggle');

  const caret = await page.locator('#export-choose').boundingBox();
  const head = await page.locator('#entities .panel__head').boundingBox();
  await page.mouse.move(head.x + 40, head.y + head.height / 2);
  await page.mouse.down();
  await page.mouse.move(caret.x - 40, head.y, { steps: 8 });
  await page.mouse.up();

  await page.click('#export-choose');
  await expect(page.locator('#export-menu')).toBeVisible();
  await expect.poll(() => topmostOf(page, ['#export-menu', '#entities'])).toBe('#export-menu');
});

// A short window leaves the select no room below, so its list opens upward
// across the toolbar.
test('draws a panel select that opens upward over the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await loadExample(page);
  await page.click('#legend-toggle');
  await page.click('#settings-toggle');

  const select = '#settings sl-select[data-symbol="node"]';
  await page.click(select);
  await expect(page.locator(select)).toHaveJSProperty('open', true);

  await expect.poll(() => listOverToolbar(page, select)).toBe('list');
});

test('describes the Export button in the status bar', async ({ page }) => {
  await loadExample(page);

  await page.hover('#export-run');
  await expect(page.locator('#statusbar-hint')).toHaveText('Export the diagram or its fields table');

  await exportFrom(page, 'csv');
  await page.hover('#export-run');
  await expect(page.locator('#statusbar-hint')).toHaveText('Export the fields table as CSV');
});

test('describes a hovered export menu item in the status bar', async ({ page }) => {
  await loadExample(page);

  await page.click('#export-choose');
  await page.hover('#export-menu sl-menu-item[value="png"]');
  await expect(page.locator('#statusbar-hint')).toHaveText('Export the diagram as a PNG image');

  await page.hover('#export-menu sl-menu-item[value="csv"]');
  await expect(page.locator('#statusbar-hint')).toHaveText('Export the fields table as CSV');
});

test('enables proxy declutter by default on render', async ({ page }) => {
  await loadExample(page);
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
  await loadExample(page);

  await page.click('#zoom-level');
  await page.click('sl-menu-item[value="2"]');

  await page.waitForFunction(() => Math.abs(window.__nexus.cy.zoom() - 2) < 0.01);
  await expect(page.locator('#zoom-level')).toHaveText(/200%/);
});

test('labels each entity with its type in the caption layer', async ({ page }) => {
  await loadExample(page);

  const types = await page.locator('#captions .caption--type').allTextContents();
  expect(types.length).toBeGreaterThan(0);
  expect(types).toContain('Content type');
});

test('searches on the button and zooms to the match at 100%', async ({ page }) => {
  await loadExample(page);
  await page.evaluate(() => window.__nexus.cy.zoom(0.2));

  // Typing does not search.
  await slFill(page, '#search', 'session');
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBe(0);

  // The button runs the search: it fades the rest and zooms to 100%.
  await page.click('#search-btn');
  await page.waitForFunction(() => Math.abs(window.__nexus.cy.zoom() - 1) < 0.01);
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBeGreaterThan(0);
});

test('a single docked panel fills the sidebar height', async ({ page }) => {
  await loadExample(page);

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
  await loadExample(page);

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
  await loadExample(page);

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

test('captions an entity created in edit mode the way it captions a loaded one', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');

  await createEntity(page, 'node', 'webinar', 'Webinar');

  expect(await captionsOf(page, 'node.event')).toEqual([
    { text: 'Content type', shown: true },
    { text: 'event', shown: true },
  ]);
  expect(await captionsOf(page, 'node.webinar')).toEqual([
    { text: 'Content type', shown: true },
    { text: 'webinar', shown: true },
  ]);
});

test('captions a field created in edit mode and moves the caption when the field is renamed', async ({ page }) => {
  await buildStoryWithField(page);
  expect(await captionsOf(page, 'field:node.story:field_1')).toEqual([{ text: 'field_1', shown: true }]);

  await slFill(page, '#inspector sl-input[data-machine-name]', 'field_summary');

  expect(await captionsOf(page, 'field:node.story:field_summary')).toEqual([{ text: 'field_summary', shown: true }]);
  expect(await captionsOf(page, 'field:node.story:field_1')).toEqual([]);
});

test('moves the captions of a renamed entity and its fields to their new ids', async ({ page }) => {
  await buildStoryWithField(page);

  await tapNode(page, 'node.story');
  await slFill(page, '#inspector sl-input[data-machine-name]', 'article');

  expect(await captionsOf(page, 'node.article')).toEqual([
    { text: 'Content type', shown: true },
    { text: 'article', shown: true },
  ]);
  expect(await captionsOf(page, 'field:node.article:field_1')).toEqual([{ text: 'field_1', shown: true }]);
  expect(await captionsOf(page, 'node.story')).toEqual([]);
  expect(await captionsOf(page, 'field:node.story:field_1')).toEqual([]);
});

test('removes the captions of a deleted entity and its fields', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  expect(await captionsOf(page, 'node.event')).not.toEqual([]);

  await tapNode(page, 'node.event');
  await page.click('#inspector .insp__delete');

  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.event').empty())).toBe(true);
  const orphans = await page.evaluate(() => {
    const cy = window.__nexus.cy;
    return [...document.querySelectorAll('#captions .caption')].filter((div) => cy.getElementById(div.dataset.nodeId).empty()).length;
  });
  expect(orphans).toBe(0);
});

test('captions a new entity with its type alone while machine names are hidden', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#machine-names');
  await expect(page.locator('#machine-names')).not.toHaveClass(/is-active/);
  await page.click('#mode-build');

  await createEntity(page, 'node', 'story', 'Story');

  expect(await captionsOf(page, 'node.story')).toEqual([{ text: 'Content type', shown: true }]);
});

// Opens a diagram from the conference fixture or a template.
async function openDiagram(page, source) {
  if (source === 'example') {
    await loadExample(page);
    return;
  }

  await page.click('#template-' + source);
  await waitForGraph(page);
}

// Captions are repositioned 1 frame after a Cytoscape redraw, so this
// resolves 2 frames after the zoom.
function zoomTo(page, zoom) {
  return page.evaluate(
    (z) =>
      new Promise((resolve) => {
        window.__nexus.cy.zoom(z);
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
    zoom,
  );
}

// Viewport rectangles of every shown node's box and label, and of its shown
// type and machine-name captions. Cytoscape draws boxes and labels on the
// canvas, so theirs come from its rendered geometry.
function captionLayout(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const origin = cy.container().getBoundingClientRect();
    const shift = (box) => ({ left: origin.left + box.x1, right: origin.left + box.x2, top: origin.top + box.y1, bottom: origin.top + box.y2 });
    const rect = (div) => {
      const box = div.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    const captions = [...document.querySelectorAll('#captions .caption')].filter((div) => div.style.display === 'block');

    return cy.nodes(':visible').map((node) => {
      const position = node.renderedPosition();
      const halfWidth = node.renderedOuterWidth() / 2;
      const halfHeight = node.renderedOuterHeight() / 2;
      const own = captions.filter((div) => div.dataset.nodeId === node.id());
      const type = own.find((div) => div.classList.contains('caption--type'));
      const name = own.find((div) => !div.classList.contains('caption--type'));

      return {
        id: node.id(),
        zoom: cy.zoom(),
        fontSize: node.pstyle('font-size').pfValue * cy.zoom(),
        box: shift({ x1: position.x - halfWidth, x2: position.x + halfWidth, y1: position.y - halfHeight, y2: position.y + halfHeight }),
        label: shift(node.renderedBoundingBox({ includeNodes: false, includeEdges: false, includeOverlays: false })),
        type: type ? rect(type) : null,
        name: name ? rect(name) : null,
      };
    });
  });
}

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// Each machine-name caption that overlaps another node's box or another
// node's machine-name caption, as 'caption owner > other node'.
function captionCollisions(layout) {
  const collisions = [];

  for (const owner of layout.filter((node) => node.name)) {
    for (const other of layout) {
      if (other.id !== owner.id && (overlaps(owner.name, other.box) || (other.name && overlaps(owner.name, other.name)))) {
        collisions.push(owner.id + ' > ' + other.id);
      }
    }
  }

  return collisions;
}

for (const source of dataProviderCaptionDiagrams()) {
  test(`fits each entity's type caption inside its box below its name in the ${source} diagram`, async ({ page }) => {
    await openDiagram(page, source);

    const entities = (await captionLayout(page)).filter((node) => node.type);
    expect(entities.length).toBeGreaterThan(0);

    // The label's rectangle starts at the top of the name's first line, and
    // every name in these diagrams fits on 1 line.
    const misplaced = entities.filter(({ box, label, type, fontSize }) => {
      const inside = type.left >= box.left && type.right <= box.right && type.bottom <= box.bottom;

      return !inside || type.top < label.top + fontSize;
    });
    expect(misplaced.map((node) => node.id)).toEqual([]);
  });
}

function dataProviderCaptionDiagrams() {
  return ['example', 'civictheme'];
}

test('keeps the type caption of each vocabulary inside its tag', async ({ page }) => {
  await openDiagram(page, 'civictheme');

  const outside = await page.evaluate(() => {
    const cy = window.__nexus.cy;
    const origin = cy.container().getBoundingClientRect();
    const captions = [...document.querySelectorAll('#captions .caption--type')];
    const vocabularies = cy.nodes('[group="entity"][entityType="taxonomy_term"]');

    return vocabularies
      .filter((node) => {
        const caption = captions.find((div) => div.dataset.nodeId === node.id()).getBoundingClientRect();
        const x = origin.left + node.renderedPosition('x');
        const y = origin.top + node.renderedPosition('y');
        const halfWidth = (node.width() / 2 + node.padding()) * cy.zoom();
        const halfHeight = (node.height() / 2 + node.padding()) * cy.zoom();
        // The tag's right edge runs from a quarter of its half-width at the
        // top and bottom out to its point at mid-height.
        const edge = (at) => x + halfWidth * (1 - (3 * Math.abs(at - y)) / (4 * halfHeight));

        return caption.right > edge(caption.top) || caption.right > edge(caption.bottom);
      })
      .map((node) => node.id());
  });

  expect(outside).toEqual([]);
});

test('refits entity boxes to their text when their symbol changes', async ({ page }) => {
  await openDiagram(page, 'example');
  const width = () => page.evaluate(() => window.__nexus.cy.getElementById('node.event').outerWidth());
  const rounded = await width();

  await page.click('#settings-toggle');
  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');

  await expect.poll(width).toBeGreaterThan(rounded * 1.5);
});

for (const zoom of dataProviderCaptionZooms()) {
  test(`hangs each machine name a clear gap below its node at ${zoom * 100}% zoom`, async ({ page }) => {
    await openDiagram(page, 'example');
    await zoomTo(page, zoom);

    const named = (await captionLayout(page)).filter((node) => node.name);
    expect(named.length).toBeGreaterThan(0);

    const tight = named.filter(({ box, name }) => name.top - box.bottom < 5 * zoom);
    expect(tight.map((node) => node.id)).toEqual([]);
  });
}

function dataProviderCaptionZooms() {
  return [1, 2];
}

for (const [source, layout, view] of dataProviderCaptionLayouts()) {
  test(`keeps machine names clear of other nodes in the ${layout} ${view} of the ${source} diagram`, async ({ page }) => {
    await openDiagram(page, source);

    if (view === 'overview') {
      await page.click('#fields-toggle');
    }

    await pickLayout(page, layout.toLowerCase());

    expect(captionCollisions(await captionLayout(page))).toEqual([]);
  });
}

function dataProviderCaptionLayouts() {
  return [
    ['example', 'LR', 'field view'],
    ['example', 'TB', 'field view'],
    ['example', 'Columns', 'field view'],
    ['example', 'LR', 'overview'],
    ['example', 'TB', 'overview'],
    ['example', 'Columns', 'overview'],
    ['civictheme', 'TB', 'field view'],
    ['civictheme', 'TB', 'overview'],
    ['civictheme', 'Columns', 'field view'],
  ];
}

test('reserves room below an entity for its machine name only while machine names are shown', async ({ page }) => {
  await openDiagram(page, 'example');

  // Model-space distance from the bottom of Event's box to the bottom of the
  // room Cytoscape gives it in layouts.
  const room = () =>
    page.evaluate(() => {
      const entity = window.__nexus.cy.getElementById('node.event');
      return entity.boundingBox().y2 - (entity.position('y') + entity.outerHeight() / 2);
    });

  expect(await room()).toBeGreaterThan(15);

  await page.click('#machine-names');
  expect(await room()).toBeLessThan(3);

  await page.click('#machine-names');
  expect(await room()).toBeGreaterThan(15);
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

test('resets the singled-out focus when switching modes', async ({ page }) => {
  await loadExample(page);

  await page.evaluate(() => window.__nexus.cy.getElementById('node.session').emit('tap'));
  await page.waitForFunction(() => window.__nexus.cy.elements('.faded').length > 0);

  await page.click('#mode-build');
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded, .trace, .trace-source').length)).toBe(0);
});

test('opens and re-runs the layout at 100% zoom', async ({ page }) => {
  await loadExample(page);
  expect(await page.evaluate(() => window.__nexus.cy.zoom())).toBeCloseTo(1, 2);
  await expect(page.locator('#zoom-level')).toHaveText('100%');

  await page.evaluate(() => {
    window.__nexus.cy.zoom(0.5);
  });
  await page.click('#layout-run');
  expect(await page.evaluate(() => window.__nexus.cy.zoom())).toBeCloseTo(1, 2);
});

async function pickLayout(page, value) {
  await page.click('#layout-choose');
  await page.click('#layout-menu sl-menu-item[value="' + value + '"]');
}

// The zoom at which the visible diagram fits the canvas.
function fitZoom(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const box = cy.elements(':visible').boundingBox();

    return Math.min(cy.width() / box.w, cy.height() / box.h);
  });
}

// How the fields of the Event content type sit around it, and the direction
// its field edges turn.
function eventLayout(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const event = cy.getElementById('node.event');
    const fields = cy.nodes('[group="field"][entity="node.event"]');

    return {
      right: fields.every((field) => field.position('x') > event.position('x')),
      below: fields.every((field) => field.position('y') > event.position('y')),
      turn: event.connectedEdges('[group="has"]').first().pstyle('taxi-direction').strValue,
    };
  });
}

test('stacks the entities in columns that fit the canvas better than 1 left-to-right flow', async ({ page }) => {
  await loadExample(page);
  await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: Columns');
  const columns = await fitZoom(page);

  await pickLayout(page, 'lr');

  expect(columns).toBeGreaterThan(await fitZoom(page));
});

test('stacks the entities in columns in the order of their types, then of their labels', async ({ page }) => {
  await loadExample(page);

  // Column by column, left to right, then top to bottom within a column.
  const order = await page.evaluate(() => {
    const entities = window.__nexus.cy.nodes('[group="entity"]').map((node) => ({ id: node.id(), x: node.boundingBox().x1, y: node.position('y') }));

    return entities.sort((a, b) => (Math.abs(a.x - b.x) < 50 ? a.y - b.y : a.x - b.x)).map((entity) => entity.id);
  });

  expect(order).toEqual([
    'node.event',
    'node.news',
    'node.page',
    'node.session',
    'node.speaker',
    'taxonomy_term.sponsors',
    'taxonomy_term.topics',
    'taxonomy_term.tracks',
    'taxonomy_term.venues',
    'media.document',
    'media.image',
    'media.remote_video',
    'paragraph.gallery',
    'paragraph.quote',
    'paragraph.text',
    'block_content.basic',
  ]);
});

for (const [value, label, expected] of dataProviderLayouts()) {
  test(`lays the diagram out ${label} when it is picked from the layout menu`, async ({ page }) => {
    await loadExample(page);

    await pickLayout(page, value);

    await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: ' + label);
    await expect(page.locator('#layout-menu sl-menu-item[checked]')).toHaveAttribute('value', value);
    expect(await eventLayout(page)).toEqual(expected);
  });
}

function dataProviderLayouts() {
  return [
    ['lr', 'LR', { right: true, below: false, turn: 'horizontal' }],
    ['tb', 'TB', { right: false, below: true, turn: 'vertical' }],
    ['columns', 'Columns', { right: true, below: false, turn: 'horizontal' }],
  ];
}

test('re-runs the picked layout when the layout button is pressed', async ({ page }) => {
  await loadExample(page);
  await pickLayout(page, 'tb');
  const laidOut = await nodePositions(page);

  await page.evaluate(() => {
    window.__nexus.cy.getElementById('node.event').shift({ x: 300, y: 300 });
  });
  await page.click('#layout-run');

  expect(await nodePositions(page)).toEqual(laidOut);
  await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: TB');
});

test('keeps the picked layout ticked when it is picked again', async ({ page }) => {
  await loadExample(page);

  await pickLayout(page, 'columns');

  await expect(page.locator('#layout-menu sl-menu-item[checked]')).toHaveCount(1);
  await expect(page.locator('#layout-menu sl-menu-item[checked]')).toHaveAttribute('value', 'columns');
});

test('remembers the picked layout across reloads', async ({ page }) => {
  await loadExample(page);
  await pickLayout(page, 'lr');

  await page.reload();
  await loadExample(page);

  await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: LR');
  expect(await eventLayout(page)).toEqual({ right: true, below: false, turn: 'horizontal' });
});

for (const [name, button, trigger] of dataProviderDropdownTriggers()) {
  test(`lines the ${name} up with the button beside it`, async ({ page }) => {
    await loadExample(page);

    const [buttonBox, triggerBox] = await page.evaluate(
      (selectors) =>
        selectors.map((selector) => {
          const box = document.querySelector(selector).shadowRoot.querySelector('[part~="base"]').getBoundingClientRect();

          return { top: Math.round(box.top * 10) / 10, bottom: Math.round(box.bottom * 10) / 10 };
        }),
      [button, trigger],
    );

    expect(triggerBox).toEqual(buttonBox);
  });
}

function dataProviderDropdownTriggers() {
  return [
    ['layout menu caret', '#layout-run', '#layout-choose'],
    ['export menu caret', '#export-run', '#export-choose'],
    ['zoom level menu', '#zoom-in', '#zoom-level'],
  ];
}

// The position of every node, rounded to 0.01, so the rounding error of
// moving an island away and back doesn't count.
function roundedPositions(page) {
  return page.evaluate(() => {
    const positions = {};
    window.__nexus.cy.nodes().forEach((node) => {
      positions[node.id()] = { x: Math.round(node.position('x') * 100) / 100, y: Math.round(node.position('y') * 100) / 100 };
    });
    return positions;
  });
}

// Moves the island of shown elements that holds each entity by its offset.
function dragIslands(page, moves) {
  return page.evaluate((list) => {
    const cy = window.__nexus.cy;
    const islands = cy.elements().not('.hidden').components();

    list.forEach(([id, dx, dy]) => {
      const island = islands.find((candidate) => candidate.contains(cy.getElementById(id)));
      island.nodes().shift({ x: dx, y: dy });
    });
  }, moves);
}

test('leaves a fresh layout and the view as they are when tidied', async ({ page }) => {
  await loadExample(page);
  await page.evaluate(() => {
    window.__nexus.cy.zoom(0.5);
  });
  const laidOut = await roundedPositions(page);

  await page.click('#tidy');

  expect(await roundedPositions(page)).toEqual(laidOut);
  expect(await page.evaluate(() => window.__nexus.cy.zoom())).toBeCloseTo(0.5, 2);
});

test('slots an entity dragged a little out of its column back in when tidied', async ({ page }) => {
  await loadExample(page);
  const laidOut = await roundedPositions(page);

  await dragIslands(page, [['node.news', 40, 15]]);
  await page.click('#tidy');

  expect(await roundedPositions(page)).toEqual(laidOut);
});

test('lines dragged entities up in columns that tidying again leaves alone', async ({ page }) => {
  await loadExample(page);
  await dragIslands(page, [
    ['node.event', 900, 400],
    ['media.image', -300, 1200],
    ['paragraph.quote', 150, -200],
  ]);

  await page.click('#tidy');
  const tidied = await roundedPositions(page);
  const overlaps = await page.evaluate(() => {
    const boxes = window.__nexus.cy
      .elements()
      .not('.hidden')
      .components()
      .map((island) => island.boundingBox());
    const overlap = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

    return boxes.filter((box, index) => boxes.some((other, otherIndex) => otherIndex !== index && overlap(box, other))).length;
  });
  await page.click('#tidy');

  expect(overlaps).toBe(0);
  expect(await roundedPositions(page)).toEqual(tidied);
});

test('lines a field added below an entity up with its other fields when tidied', async ({ page }) => {
  await selectEvent(page, 1);
  const count = await page.evaluate(() => window.__nexus.cy.nodes('[group="field"][entity="node.event"]').length);
  await page.click('.handle--bottom');
  await page.waitForFunction((before) => window.__nexus.cy.nodes('[group="field"][entity="node.event"]').length === before + 1, count);

  await page.click('#tidy');

  const xs = await page.evaluate(() => window.__nexus.cy.nodes('[group="field"][entity="node.event"]').map((field) => Math.round(field.position('x'))));
  expect(new Set(xs).size).toBe(1);
});

test('isolates an entity on right-click and moves it with its fields', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');

  const isolated = await page.evaluate(() => {
    const cy = window.__nexus.cy;
    const session = cy.getElementById('node.session');
    session.emit('cxttap');
    return {
      othersFaded: cy.getElementById('node.event').hasClass('faded'),
      groupVisible: !session.hasClass('faded'),
      groupGrabbable: session.grabbable(),
      othersLocked: !cy.getElementById('node.event').grabbable(),
    };
  });
  expect(isolated).toEqual({ othersFaded: true, groupVisible: true, groupGrabbable: true, othersLocked: true });

  const move = await page.evaluate(() => {
    const cy = window.__nexus.cy;
    const session = cy.getElementById('node.session');
    const field = cy.nodes('[group="field"][entity="node.session"]')[0];
    const fb = { x: field.position('x'), y: field.position('y') };
    const eb = { x: session.position('x'), y: session.position('y') };
    session.emit('grab');
    session.position({ x: eb.x + 120, y: eb.y + 40 });
    session.emit('drag');
    session.emit('free');
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
  await loadExample(page);

  const download = await exportFrom(page, 'csv');
  expect(download.suggestedFilename()).toBe('example-content-model-fields.csv');

  const csv = readFileSync(await download.path(), 'utf8');
  const lines = csv.split('\r\n');
  expect(lines[0]).toBe('Entity,Entity type,Field,Machine name,Field type,Cardinality,Required,References');
  expect(lines.some((l) => l.startsWith('Session,Content type,'))).toBe(true);
});

test('quotes CSV cells that hold a comma, a quote or a line break', async ({ page }) => {
  const labels = ['Comma, label', 'Quote "label"', 'Line\nfeed', 'Carriage\rreturn'];
  await openDocument(page, {
    nexus: 1,
    title: 'Special characters',
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'Article',
        fields: labels.map((label, i) => ({ name: 'field_' + i, label: label, fieldType: 'string', kind: 'single' })),
      },
    ],
  });

  const download = await exportFrom(page, 'csv');
  const csv = readFileSync(await download.path(), 'utf8');

  for (const cell of ['"Comma, label"', '"Quote ""label"""', '"Line\nfeed"', '"Carriage\rreturn"']) {
    expect(csv).toContain(',' + cell + ',');
  }
});

test('wraps field types and machine names in the fields table only after an underscore', async ({ page }) => {
  await loadExample(page);
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
  await loadExample(page);
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
  await loadExample(page);
  await page.click('#table-toggle');
  await expect(page.locator('#field-table')).toContainText('field_link_linkedin');

  const before = await fittedIdentifier(page, 'field_link_linkedin');
  expect(before.size).toBeLessThan(before.normal);
  expect(before.lines).toEqual(['field_link_linkedin']);

  // A 1280px window at about 250% zoom lays out as a 520px viewport, which
  // squeezes the panel without a store update to re-render the table.
  await page.setViewportSize({ width: 520, height: 720 });

  await expect.poll(async () => (await fittedIdentifier(page, 'field_link_linkedin')).size).toBe(before.normal);
  expect((await fittedIdentifier(page, 'field_link_linkedin')).lines.length).toBeGreaterThan(1);
  expect(fitViolations(await fittedIdentifiers(page))).toEqual([]);
});

test('refits identifiers when the docked fields panel is resized', async ({ page }) => {
  await loadExample(page);
  await page.click('#table-toggle');
  await page.click('#table .panel__pin');
  await expect(page.locator('#table')).toHaveClass(/is-docked/);

  const narrow = await fittedIdentifier(page, 'field_link_linkedin');
  expect(narrow.size).toBe(narrow.normal);
  expect(narrow.lines.length).toBeGreaterThan(1);

  const handle = await page.locator('#dock-right .dock__resize').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 120);
  await page.mouse.down();
  await page.mouse.move(handle.x - 300, handle.y + 120, { steps: 6 });
  await page.mouse.up();

  await expect.poll(async () => (await fittedIdentifier(page, 'field_link_linkedin')).lines).toEqual(['field_link_linkedin']);
  expect(fitViolations(await fittedIdentifiers(page))).toEqual([]);
});

test('keeps the multi-value cardinality badge legible in both themes', async ({ page }) => {
  await loadExample(page);
  await page.click('#table-toggle');

  const badge = page.locator('#field-table .badge--multi').first();
  expect(await textContrast(badge)).toBeGreaterThanOrEqual(4.5);

  await page.click('#theme-toggle');
  expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(true);
  expect(await textContrast(badge)).toBeGreaterThanOrEqual(4.5);
});

const LAYOUT_HINT = 'Stack the entities in columns that fill the screen';

test('echoes a hovered control description into the status bar', async ({ page }) => {
  await loadExample(page);

  await page.locator('#layout-run').hover();
  await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);
});

test('describes the picked layout when the layout button is hovered', async ({ page }) => {
  await loadExample(page);
  await pickLayout(page, 'tb');

  await page.locator('#layout-run').hover();
  await expect(page.locator('#statusbar-hint')).toHaveText('Lay the diagram out top to bottom');
});

test('describes a hovered layout menu item in the status bar', async ({ page }) => {
  await loadExample(page);

  await page.click('#layout-choose');
  await page.hover('#layout-menu sl-menu-item[value="lr"]');
  await expect(page.locator('#statusbar-hint')).toHaveText('Lay the diagram out left to right');

  await page.hover('#layout-menu sl-menu-item[value="columns"]');
  await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);
});

test('describes the switched theme when the theme toggle is hovered again', async ({ page }) => {
  await loadExample(page);

  await page.click('#theme-toggle');
  await page.locator('#layout-run').hover();
  await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);

  await page.locator('#theme-toggle').hover();
  await expect(page.locator('#statusbar-hint')).toHaveText('Switch to light theme');
});

test('refreshes the status bar hint when the hovered theme toggle is clicked', async ({ page }) => {
  await loadExample(page);

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
  await loadExample(page);

  await page.locator('#layout-run').hover();
  await page.locator('#theme-toggle').evaluate((el) => el.click());
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
  await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);

  await page.locator('#cy').hover();
  await page.locator('#theme-toggle').evaluate((el) => el.click());
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
  await expect(page.locator('#statusbar-hint')).toHaveText('');
});

test('shows interaction tips in the middle of the status bar', async ({ page }) => {
  await expect(page.locator('#statusbar .statusbar__tips')).toContainText('Right-click');
});

// The tips are cut off at the end in a narrow window, so the pointer to the
// shortcuts comes first.
test('leads the status bar tips with the F1 shortcut view', async ({ page }) => {
  await expect(page.locator('#statusbar .statusbar__tips')).toHaveText(/^F1 shows keyboard shortcuts · /);
});

test('renders a non-empty glyph for every toolbar, status bar and landing icon', async ({ page }) => {
  const empty = await page.evaluate(() =>
    [...document.querySelectorAll('.toolbar [data-icon], .statusbar [data-icon], .landing [data-icon]')]
      .filter((el) => {
        const svg = el.querySelector('svg.icon');
        return !svg || svg.children.length === 0;
      })
      .map((el) => el.id || el.getAttribute('data-icon')),
  );
  expect(empty).toEqual([]);
});

test('links the SVG favicon', async ({ page, request }) => {
  const favicon = page.locator('link[rel="icon"]');
  await expect(favicon).toHaveAttribute('href', 'assets/favicon.svg');
  await expect(favicon).toHaveAttribute('type', 'image/svg+xml');

  const response = await request.get(await favicon.evaluate((link) => link.href));
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toBe('image/svg+xml');
});

test('draws the Nexus mark beside the name on the landing screen and in the toolbar', async ({ page }) => {
  for (const brand of [page.locator('.landing__logo'), page.locator('.toolbar__brand')]) {
    await expect(brand).toHaveText('Nexus');
    await expect(brand.locator('svg.icon--nexus')).toBeVisible();
    await expect(brand.locator('svg.icon--nexus')).toHaveAttribute('aria-hidden', 'true');
  }
});

test('colours the Nexus mark for the app theme, not the system one', async ({ page }) => {
  // The app reads the system scheme only at load, so it stays in the light theme.
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await markFills(page, '.landing__logo')).toEqual(LIGHT_MARK);
  expect(await markFills(page, '.toolbar__brand')).toEqual(LIGHT_MARK);

  await loadExample(page);
  await page.click('#theme-toggle');
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await markFills(page, '.toolbar__brand')).toEqual(DARK_MARK);

  await page.click('#doc-import');
  await expect(page.locator('#landing')).toBeVisible();
  expect(await markFills(page, '.landing__logo')).toEqual(DARK_MARK);
});

test('keeps about, settings, theme and github on the brand line', async ({ page }) => {
  await expect(page.locator('.toolbar__brandline #about-toggle')).toHaveCount(1);
  await expect(page.locator('.toolbar__brandline #settings-toggle')).toHaveCount(1);
  await expect(page.locator('.toolbar__brandline #github-link')).toHaveCount(1);
  await expect(page.locator('.toolbar__tools #settings-toggle')).toHaveCount(0);
  await expect(page.locator('#settings-toggle')).toHaveText('');

  const order = await page.evaluate(() => [...document.querySelectorAll('.toolbar__brandline [id]')].map((el) => el.id));
  expect(order.indexOf('about-toggle')).toBeLessThan(order.indexOf('github-link'));
});

// The ids of the buttons and inputs in each section of the tools row.
function toolbarSections(page) {
  return page.evaluate(() => {
    const sections = [...document.querySelectorAll('.toolbar__tools > .toolbar__section')];

    return sections.map((section) => [...section.querySelectorAll('sl-button, sl-input')].map((control) => control.id));
  });
}

// Each section of the tools row with its separator - 'visible', 'hidden' or
// 'none' - and whether it ends a line, the next section starting lower down.
function toolbarSeparators(page) {
  return page.evaluate(() => {
    const sections = [...document.querySelectorAll('.toolbar__tools > .toolbar__section')];

    return sections.map((section, i) => {
      const separator = getComputedStyle(section, '::after');
      const next = sections[i + 1];

      return {
        separator: separator.content === 'none' ? 'none' : separator.visibility,
        lineEnd: !next || next.getBoundingClientRect().top >= section.getBoundingClientRect().bottom,
      };
    });
  });
}

// The sections that show a separator at the end of a line, or hide one
// between 2 sections on the same line.
function misplacedSeparators(sections) {
  return sections.filter((section) => section.separator !== 'none' && section.lineEnd !== (section.separator === 'hidden'));
}

// The indexes of the sections whose separator is hidden.
async function hiddenSeparators(page) {
  const sections = await toolbarSeparators(page);

  return sections.flatMap((section, i) => (section.separator === 'hidden' ? [i] : []));
}

// The index of the section that ends the first line of the tools row.
async function firstLineEnd(page) {
  const sections = await toolbarSeparators(page);

  return sections.findIndex((section) => section.lineEnd);
}

test('groups the toolbar tools into sections in order', async ({ page }) => {
  await expect(page.locator('.toolbar__tools > :not(.toolbar__section)')).toHaveCount(0);

  expect(await toolbarSections(page)).toEqual([
    ['doc-new', 'doc-import', 'doc-open-btn', 'doc-save', 'export-run', 'export-choose'],
    ['undo', 'redo'],
    ['mode-view', 'mode-build'],
    ['fields-toggle', 'proxy-toggle', 'machine-names'],
    ['search', 'search-btn'],
    ['layout-run', 'layout-choose', 'tidy'],
    ['entities-toggle', 'table-toggle', 'legend-toggle', 'history-toggle'],
  ]);
});

test('ends every toolbar section but the last in a separator', async ({ page }) => {
  await page.setViewportSize({ width: 3000, height: 800 });
  await loadExample(page);

  const shown = { separator: 'visible', lineEnd: false };
  await expect.poll(() => toolbarSeparators(page)).toEqual([shown, shown, shown, shown, shown, shown, { separator: 'none', lineEnd: true }]);
});

for (const width of dataProviderWrappedToolbarWidths()) {
  test(`hides the separator that ends each toolbar line ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width: width, height: 800 });
    await loadExample(page);

    await expect.poll(async () => misplacedSeparators(await toolbarSeparators(page))).toEqual([]);
    expect(await toolbarSeparators(page)).toHaveLength(7);
    expect(await hiddenSeparators(page)).not.toEqual([]);
  });
}

function dataProviderWrappedToolbarWidths() {
  return [1440, 1280, 1000, 420];
}

test('hides the toolbar separators that end a line as the window narrows and shows them as it widens', async ({ page }) => {
  await page.setViewportSize({ width: 3000, height: 800 });
  await loadExample(page);
  await expect.poll(() => toolbarSeparators(page)).toHaveLength(7);

  await page.setViewportSize({ width: 1000, height: 800 });
  await expect.poll(() => hiddenSeparators(page)).not.toEqual([]);
  expect(misplacedSeparators(await toolbarSeparators(page))).toEqual([]);

  await page.setViewportSize({ width: 3000, height: 800 });
  await expect.poll(() => hiddenSeparators(page)).toEqual([]);
});

test('moves the hidden toolbar separator when a section grows past the end of its line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await loadExample(page);
  await expect.poll(async () => misplacedSeparators(await toolbarSeparators(page))).toEqual([]);
  const lineEnd = await firstLineEnd(page);

  // Widens the Export button by the room left at the end of the first line,
  // so the last section on that line moves down.
  await page.evaluate((index) => {
    const row = document.querySelector('.toolbar__tools').getBoundingClientRect();
    const last = document.querySelectorAll('.toolbar__tools > .toolbar__section')[index].getBoundingClientRect();

    document.querySelector('#export-run .export-label').style.paddingRight = row.right - last.right + 1 + 'px';
  }, lineEnd);

  await expect.poll(() => firstLineEnd(page)).toBe(lineEnd - 1);
  await expect.poll(async () => misplacedSeparators(await toolbarSeparators(page))).toEqual([]);
});

test('opens an about dialog explaining browser-only storage and the licence', async ({ page }) => {
  const { license } = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8'));

  await loadExample(page);
  await expect(page.locator('#about-dialog')).not.toBeVisible();

  await page.click('#about-toggle');
  await expect(page.locator('#about-dialog')).toBeVisible();
  await expect(page.locator('#about-dialog')).toContainText('content-model visual builder');
  await expect(page.locator('#about-dialog')).toContainText('Press F1 to label every button with its keyboard shortcut');
  await expect(page.locator('#about-dialog')).toContainText('there is no backend');
  await expect(page.locator('#about-dialog')).toContainText('without warranty');
  await expect(page.locator('#about-repo')).toHaveAttribute('href', 'https://github.com/drevops/nexus');
  await expect(page.locator('#about-license')).toHaveAttribute('href', 'https://github.com/drevops/nexus/blob/main/LICENSE');
  await expect(page.locator('#about-license')).toHaveText('GNU General Public License, version 2 or later');
  await expect(page.locator('#about-dialog')).toContainText('(' + license + ')');

  await page.click('#about-close');
  await expect(page.locator('#about-dialog')).not.toBeVisible();
});

test('shows the app version on the landing screen and in the about dialog', async ({ page }) => {
  await expect(page.locator('#landing-version')).toHaveText('dev');

  await loadExample(page);
  await page.click('#about-toggle');
  await expect(page.locator('#about-version')).toHaveText('dev');
});

test('draws entity types with their symbols and a dynamic legend', async ({ page }) => {
  await loadExample(page);

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
  await loadExample(page);
  await page.click('#settings-toggle');

  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
  await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('diamond');

  await page.fill('#settings [data-new-type]', 'widget');
  await page.click('#settings [data-add-type]');
  await expect(page.locator('#settings [data-type-row="widget"]')).toHaveCount(1);
});

test('labels an entity of a custom type with the custom label in the inspector', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#settings-toggle');
  await page.fill('#settings [data-new-type]', 'widget');
  await page.fill('#settings input[placeholder="Label"]', 'Gadget widget');
  await page.click('#settings [data-add-type]');
  await page.click('#settings .panel__close');
  await page.click('#mode-build');

  await page.click('[data-add-entity="node"]');
  await slSelect(page, '[data-new="entity"] sl-select', 'widget');
  await expect(page.locator('[data-new="entity"] .insp__title')).toHaveText('New Gadget widget');
  await slFill(page, '[data-new-bundle]', 'spinner');
  await page.click('[data-create-entity]');

  await expect(page.locator('#inspector .insp__ro')).toHaveText('Gadget widget');
});

test('resets colours and symbols to defaults from settings', async ({ page }) => {
  await loadExample(page);
  await page.click('#settings-toggle');

  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
  await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('diamond');

  await page.click('#settings-reset');

  await expect.poll(() => page.evaluate(() => window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'))).toBe('round-rectangle');
  await expect.poll(() => page.evaluate(() => document.querySelector('#settings sl-select[data-symbol="node"]').value)).toBe('rounded');
});

test('round-trips custom types and symbols through a saved document', async ({ page }) => {
  await loadExample(page);
  await page.click('#settings-toggle');

  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');
  await page.fill('#settings [data-new-type]', 'gadget');
  await page.click('#settings [data-add-type]');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(doc.symbols.node).toBe('diamond');
  expect(doc.customTypes.some((t) => t.type === 'gadget')).toBe(true);
});

/* Undo, redo and the History panel ---------------------------------------- */

// A diagram whose saved layout is nothing like the one Tidy draws.
const SCATTERED_DOC = {
  nexus: 1,
  title: 'Scattered',
  entities: [
    {
      entityType: 'node',
      bundle: 'a',
      label: 'A',
      fields: [{ name: 'field_b', label: 'B', fieldType: 'entity_reference', kind: 'single', targetType: 'node', targetBundles: ['b'] }],
    },
    { entityType: 'node', bundle: 'b', label: 'B', fields: [] },
  ],
  layout: {
    'node.a': { x: 0, y: 0 },
    'field:node.a:field_b': { x: 700, y: 500 },
    'proxy:field:node.a:field_b>node.b': { x: 900, y: 500 },
    'node.b': { x: -600, y: 400 },
  },
};

function hasNode(page, id) {
  return page.evaluate((nodeId) => window.__nexus.cy.getElementById(nodeId).nonempty(), id);
}

function entityIds(page) {
  return page.evaluate(() =>
    window.__nexus.cy
      .nodes('[group="entity"]')
      .map((node) => node.id())
      .sort(),
  );
}

// Every element with its data and, for a node, its position, sorted by id.
function graphState(page) {
  return page.evaluate(() =>
    window.__nexus.cy
      .elements()
      .map((element) => ({ data: { ...element.data() }, position: element.isNode() ? { ...element.position() } : null }))
      .sort((a, b) => a.data.id.localeCompare(b.data.id)),
  );
}

// The point on the page where a node is drawn. Cytoscape caches where its
// container is, and the edit palette moves it, so the cache is refreshed.
function pagePosition(page, id) {
  return page.evaluate((nodeId) => {
    const cy = window.__nexus.cy;
    cy.resize();
    const box = cy.container().getBoundingClientRect();
    const position = cy.getElementById(nodeId).renderedPosition();
    return { x: box.left + position.x, y: box.top + position.y };
  }, id);
}

// The versions listed in the History panel, newest first, each as its label
// and its state: 'current', 'undone' or 'done'.
function historyVersions(page) {
  return page.locator('#history .history__version').evaluateAll((buttons) =>
    buttons.map((button) => {
      const state = button.classList.contains('is-current') ? 'current' : button.classList.contains('is-undone') ? 'undone' : 'done';
      return [button.querySelector('.history__label').textContent, state];
    }),
  );
}

// A new document in edit mode holding 1 entity per bundle, created in order
// from the palette.
async function buildEntities(page, bundles) {
  await page.click('#new-btn');
  await page.click('#mode-build');

  for (const bundle of bundles) {
    await createEntity(page, 'node', bundle, bundle.toUpperCase());
  }
}

test('undoes and redoes an edit from the toolbar', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');
  await expect(page.locator('#undo')).toHaveAttribute('disabled', '');
  await expect(page.locator('#undo')).toHaveAttribute('title', 'Nothing to undo');

  await createEntity(page, 'node', 'story', 'Story');
  await expect(page.locator('#undo')).not.toHaveAttribute('disabled');
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Added entity “Story” \(/);

  await page.click('#undo');
  expect(await hasNode(page, 'node.story')).toBe(false);
  await expect(page.locator('#undo')).toHaveAttribute('disabled', '');
  await expect(page.locator('#redo')).toHaveAttribute('title', /^Redo: Added entity “Story” \(/);

  await page.click('#redo');
  expect(await hasNode(page, 'node.story')).toBe(true);
  await expect(page.locator('#redo')).toHaveAttribute('disabled', '');
  await expect(page.locator('#redo')).toHaveAttribute('title', 'Nothing to redo');
});

// The shortcuts take Cmd or Ctrl on every platform, so each case runs with
// both.
for (const [name, modifier] of dataProviderShortcutModifiers()) {
  test(`undoes with ${name}+Z and redoes with ${name}+Shift+Z`, async ({ page }) => {
    await buildStoryWithField(page);
    const field = 'field:node.story:field_1';
    await page.evaluate(() => document.activeElement.blur());

    await page.keyboard.press(modifier + '+z');
    expect(await hasNode(page, field)).toBe(false);
    expect(await hasNode(page, 'node.story')).toBe(true);

    await page.keyboard.press(modifier + '+Shift+z');
    expect(await hasNode(page, field)).toBe(true);
  });

  test(`leaves ${name}+Z to a text field that has the focus`, async ({ page }) => {
    await buildEntities(page, ['story']);

    await page.locator('#search').click();
    await page.keyboard.press(modifier + '+z');
    expect(await hasNode(page, 'node.story')).toBe(true);

    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press(modifier + '+z');
    expect(await hasNode(page, 'node.story')).toBe(false);
  });

  // A Shoelace select shows its value in a read-only text input, which keeps
  // the focus once an option is picked.
  test(`undoes with ${name}+Z while a dropdown has the focus`, async ({ page }) => {
    await selectTrackField(page);
    const cardinality = page.locator('#inspector sl-select[data-cardinality]');
    await cardinality.click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(cardinality).toHaveJSProperty('value', '2');

    await page.keyboard.press(modifier + '+z');

    await expect(cardinality).toHaveJSProperty('value', '1');
  });
}

function dataProviderShortcutModifiers() {
  return [
    ['Ctrl', 'Control'],
    ['Cmd', 'Meta'],
  ];
}

test('redoes with Ctrl+Y', async ({ page }) => {
  await buildStoryWithField(page);
  const field = 'field:node.story:field_1';
  await page.evaluate(() => document.activeElement.blur());

  await page.keyboard.press('Control+z');
  expect(await hasNode(page, field)).toBe(false);

  await page.keyboard.press('Control+y');
  expect(await hasNode(page, field)).toBe(true);
});

test('restores a deleted entity with its fields, references and proxies where they were', async ({ page }) => {
  await editExample(page);
  const before = await graphState(page);

  await tapNode(page, TRACKS);
  await page.click('#inspector .insp__delete');
  expect(await hasNode(page, TRACKS)).toBe(false);
  const deleted = await graphState(page);

  await page.click('#undo');
  expect(await graphState(page)).toEqual(before);

  await page.click('#redo');
  expect(await graphState(page)).toEqual(deleted);
});

test('undoes a machine-name rename with its fields, references, proxies and captions', async ({ page }) => {
  await editExample(page);
  const before = await graphState(page);
  const captions = await captionsOf(page, 'node.event');

  await tapNode(page, 'node.event');
  await slFill(page, '#inspector sl-input[data-machine-name]', 'gathering');
  expect(await hasNode(page, 'node.gathering')).toBe(true);

  await page.click('#undo');
  expect(await graphState(page)).toEqual(before);
  expect(await captionsOf(page, 'node.event')).toEqual(captions);
  expect(await captionsOf(page, 'node.gathering')).toEqual([]);
});

test('closes the inspector when undo removes the node it shows', async ({ page }) => {
  await buildEntities(page, ['story']);
  await expect(page.locator('#inspector sl-input[data-label]')).toHaveCount(1);

  await page.click('#undo');

  await expect(page.locator('#inspector')).toHaveCount(0);
  await expect(page.locator('.handle')).toHaveCount(0);
});

test('shows an undone change in the open inspector', async ({ page }) => {
  await selectTrackField(page);
  const cardinality = page.locator('#inspector sl-select[data-cardinality]');
  await slSelect(page, '#inspector sl-select[data-cardinality]', '3');

  await page.click('#undo');

  await expect(cardinality).toHaveJSProperty('value', '1');
  expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).data('cardinality'), 'pe:' + TRACK_FIELD + '>' + TRACKS)).toBe('1');
});

test('undoes a reference added in the inspector and redoes it with its proxy where it was', async ({ page }) => {
  await selectTrackField(page);
  await addTarget(page, 'node.event');
  const proxyId = 'proxy:' + TRACK_FIELD + '>node.event';
  const placed = await page.evaluate((id) => ({ ...window.__nexus.cy.getElementById(id).position() }), proxyId);

  await page.click('#undo');
  expect(await referenceView(page, TRACK_FIELD, 'node.event')).toEqual({ ref: false, proxy: false, proxyEdge: false, collapsed: false });

  await page.click('#redo');
  expect(await referenceView(page, TRACK_FIELD, 'node.event')).toEqual(PROXY_VIEW);
  expect(await page.evaluate((id) => ({ ...window.__nexus.cy.getElementById(id).position() }), proxyId)).toEqual(placed);
});

test('undoes a node dragged on the canvas', async ({ page }) => {
  await buildEntities(page, ['story']);
  const before = await nodePositions(page);
  const from = await pagePosition(page, 'node.story');

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 90, from.y + 60, { steps: 6 });
  await page.mouse.up();

  expect(await nodePositions(page)).not.toEqual(before);
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Moved entity “STORY” \(/);

  await page.click('#undo');
  expect(await nodePositions(page)).toEqual(before);
});

test('undoes moving an isolated entity with its fields', async ({ page }) => {
  await editExample(page);
  const before = await nodePositions(page);

  await page.evaluate(() => {
    const session = window.__nexus.cy.getElementById('node.session');
    const start = { ...session.position() };
    session.emit('cxttap');
    session.emit('grab');
    session.position({ x: start.x + 120, y: start.y + 40 });
    session.emit('drag');
    session.emit('free');
    session.emit('dragfree');
  });
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Moved entity “Session” with its fields \(/);

  await page.click('#undo');
  expect(await nodePositions(page)).toEqual(before);
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBe(0);
});

for (const [name, button, label] of dataProviderLayoutSteps()) {
  test(`undoes ${name} back to the saved layout`, async ({ page }) => {
    await openDocument(page, SCATTERED_DOC);
    const saved = await nodePositions(page);

    await page.click(button);
    expect(await nodePositions(page)).not.toEqual(saved);
    await expect(page.locator('#undo')).toHaveAttribute('title', new RegExp('^Undo: ' + label + ' \\('));

    await page.click('#undo');
    expect(await nodePositions(page)).toEqual(saved);
  });
}

function dataProviderLayoutSteps() {
  return [
    ['Tidy', '#tidy', 'Tidied the layout'],
    ['re-running the layout', '#layout-run', 'Re-ran the Columns layout'],
  ];
}

test('records typing into an inspector field as 1 version and shows the field as it was on undo', async ({ page }) => {
  await buildEntities(page, ['story']);

  for (const label of ['S', 'St', 'Stories']) {
    await slFill(page, '#inspector sl-input[data-label]', label);
  }

  await page.click('#history-toggle');
  expect(await historyVersions(page)).toEqual([
    ['Relabelled entity “Stories”', 'current'],
    ['Added entity “STORY”', 'done'],
    ['Started a new content model', 'done'],
  ]);

  await page.click('#undo');
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.story').data('label'))).toBe('STORY');
  await expect(page.locator('#inspector sl-input[data-label]')).toHaveJSProperty('value', 'STORY');
});

test('undoes a note and its badge', async ({ page }) => {
  await buildEntities(page, ['story']);
  await slFill(page, '#inspector sl-textarea[data-note]', 'Draft');
  await expect(page.locator('#notes .note-badge')).toHaveCount(1);

  await page.click('#undo');
  await expect(page.locator('#notes .note-badge')).toHaveCount(0);
  await expect(page.locator('#inspector sl-textarea[data-note]')).toHaveJSProperty('value', '');

  await page.click('#redo');
  await expect(page.locator('#notes .note-badge')).toHaveCount(1);
});

test('undoes and redoes renaming the diagram as 1 version', async ({ page }) => {
  await page.click('#new-btn');
  await slFill(page, '#diagram-title', 'Road');
  await slFill(page, '#diagram-title', 'Roadmap');
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Renamed the diagram \(/);

  await page.click('#undo');
  await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'New content model');
  await expect(page).toHaveTitle('New content model - Nexus');
  await expect(page.locator('#undo')).toHaveAttribute('disabled', '');

  await page.click('#redo');
  await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Roadmap');
  await expect(page).toHaveTitle('Roadmap - Nexus');
});

test('returns to a version picked in the History panel and drops the undone versions on the next edit', async ({ page }) => {
  await buildEntities(page, ['a', 'b', 'c']);
  await page.click('#history-toggle');

  await page.click('#history [data-history-index="1"]');
  expect(await entityIds(page)).toEqual(['node.a']);
  expect(await historyVersions(page)).toEqual([
    ['Added entity “C”', 'undone'],
    ['Added entity “B”', 'undone'],
    ['Added entity “A”', 'current'],
    ['Started a new content model', 'done'],
  ]);

  await page.click('#history [data-history-index="3"]');
  expect(await entityIds(page)).toEqual(['node.a', 'node.b', 'node.c']);

  await page.click('#history [data-history-index="1"]');
  await createEntity(page, 'node', 'd', 'D');
  expect(await historyVersions(page)).toEqual([
    ['Added entity “D”', 'current'],
    ['Added entity “A”', 'done'],
    ['Started a new content model', 'done'],
  ]);
  await expect(page.locator('#redo')).toHaveAttribute('disabled', '');
});

test('leaves display toggles and layout picks out of the history and their layout out of later undos', async ({ page }) => {
  await editExample(page);
  await page.click('#entities-toggle');

  for (const toggle of ['#fields-toggle', '#fields-toggle', '#proxy-toggle', '#proxy-toggle', '#machine-names']) {
    await page.click(toggle);
  }

  await pickLayout(page, 'tb');
  await page.locator('#type-filters input').first().uncheck();
  await page.locator('#type-filters input').first().check();
  await expect(page.locator('#undo')).toHaveAttribute('disabled', '');

  await createEntity(page, 'node', 'campaign', 'Campaign');
  await pickLayout(page, 'lr');
  const laidOut = await nodePositions(page);
  delete laidOut['node.campaign'];

  await page.click('#undo');
  expect(await hasNode(page, 'node.campaign')).toBe(false);
  expect(await nodePositions(page)).toEqual(laidOut);
});

for (const [name, open, origin] of dataProviderHistoryOrigins()) {
  test(`starts the history of ${name} with 1 version`, async ({ page }) => {
    await open(page);
    await page.click('#history-toggle');

    const versions = await historyVersions(page);
    expect(versions).toHaveLength(1);
    expect(versions[0][0]).toMatch(origin);
    expect(versions[0][1]).toBe('current');
    await expect(page.locator('#undo')).toHaveAttribute('disabled', '');
  });
}

function dataProviderHistoryOrigins() {
  return [
    ['an imported config folder', loadExample, /^Imported a config folder$/],
    ['an opened diagram', (page) => openDocument(page, SCATTERED_DOC), /^Opened diagram\.nexus\.json$/],
    ['a new content model', (page) => page.click('#new-btn'), /^Started a new content model$/],
    [
      'a template',
      async (page) => {
        await page.click('#template-drupal-cms');
        await waitForGraph(page);
      },
      /^Loaded the Drupal CMS [\d.]+ template$/,
    ],
  ];
}

test('starts a new history when another diagram is opened', async ({ page }) => {
  await buildEntities(page, ['story']);
  await page.click('#history-toggle');
  expect(await historyVersions(page)).toHaveLength(2);

  await page.click('#doc-new');

  expect(await historyVersions(page)).toEqual([['Started a new content model', 'current']]);
  await expect(page.locator('#undo')).toHaveAttribute('disabled', '');
});

const MAC_LABELS = {
  'doc-save': '⌘S',
  'doc-new': '⌥N',
  redo: '⇧⌘Z',
  'export-choose': '⇧⌘E',
  fit: '⇧1',
  'zoom-in': '+',
  search: '/',
  'fields-toggle': 'F',
};

const PC_LABELS = {
  'doc-save': 'Ctrl+S',
  'doc-new': 'Alt+N',
  redo: 'Ctrl+Shift+Z',
  'export-choose': 'Ctrl+Shift+E',
  fit: 'Shift+1',
  'zoom-in': '+',
  search: '/',
  'fields-toggle': 'F',
};

// Reloads the page as a browser on the given platform, which decides how the
// shortcut labels are written.
async function onPlatform(page, platform) {
  await page.addInitScript((value) => Object.defineProperty(navigator, 'platform', { get: () => value }), platform);
  await page.reload();
}

// The badges the shortcut view draws, each as the id of the control it
// labels and its label.
function shortcutHints(page) {
  return page.locator('#shortcut-hints .shortcut-hint').evaluateAll((badges) => badges.map((badge) => [badge.dataset.for, badge.textContent]));
}

// The ids of the controls with a shortcut that are drawn outside the inert
// regions.
function availableShortcuts(page) {
  return page.evaluate(() => {
    const available = [...document.querySelectorAll('[data-shortcut]')].filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'));

    return available.map((el) => el.id);
  });
}

// Each badge of the shortcut view with its box and the box of its control.
function hintLayout(page) {
  return page.locator('#shortcut-hints .shortcut-hint').evaluateAll((badges) =>
    badges.map((badge) => {
      const control = document.getElementById(badge.dataset.for);

      return { id: badge.dataset.for, badge: badge.getBoundingClientRect().toJSON(), control: control.getBoundingClientRect().toJSON() };
    }),
  );
}

function zoomLevel(page) {
  return page.evaluate(() => window.__nexus.cy.zoom());
}

// Expects the inspector to offer a new entity of the type with this label.
function offersNewEntity(label) {
  return (page) => expect(page.locator('#inspector .insp__title')).toHaveText('New ' + label);
}

// Expects a click on the empty canvas to place a note of this kind.
function placesNote(kind) {
  return async (page) => {
    const box = await page.locator('#cy').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="annotation"]').map((node) => node.data('kind')))).toEqual([kind]);
  };
}

test('labels every control on screen with its shortcut on F1 and hides the labels on F1 again', async ({ page }) => {
  await loadExample(page);
  await expect(page.locator('#shortcut-hints')).toBeHidden();

  await page.keyboard.press('F1');

  await expect(page.locator('#shortcut-hints')).toBeVisible();
  const labelled = (await shortcutHints(page)).map(([id]) => id);
  expect(labelled).toEqual(await availableShortcuts(page));
  expect(labelled).toEqual(expect.arrayContaining(['about-toggle', 'doc-save', 'undo', 'search', 'history-toggle', 'zoom-level']));
  expect(labelled).not.toContain('add-node');

  await page.keyboard.press('F1');

  await expect(page.locator('#shortcut-hints')).toBeHidden();
  await expect(page.locator('#shortcut-hints .shortcut-hint')).toHaveCount(0);
});

for (const [name, platform, labels, undoLabel] of dataProviderShortcutPlatforms()) {
  test(`writes the shortcut labels the way ${name} does`, async ({ page }) => {
    await onPlatform(page, platform);
    await loadExample(page);

    await page.keyboard.press('F1');
    const hints = Object.fromEntries(await shortcutHints(page));

    for (const [id, label] of Object.entries(labels)) {
      expect(hints[id], id).toBe(label);
    }

    await slFill(page, '#diagram-title', 'Roadmap');
    await expect(page.locator('#undo')).toHaveAttribute('title', 'Undo: Renamed the diagram (' + undoLabel + ')');
  });
}

function dataProviderShortcutPlatforms() {
  return [
    ['a Mac', 'MacIntel', MAC_LABELS, '⌘Z'],
    ['an iPad', 'iPad', MAC_LABELS, '⌘Z'],
    ['Windows', 'Win32', PC_LABELS, 'Ctrl+Z'],
    ['Linux', 'Linux x86_64', PC_LABELS, 'Ctrl+Z'],
  ];
}

for (const [name, platform, edit] of dataProviderHintLayouts()) {
  test(`keeps each shortcut label on its control and clear of the others on ${name}`, async ({ page }) => {
    await onPlatform(page, platform);
    await loadExample(page);

    if (edit) {
      await page.click('#mode-build');
    }

    await page.keyboard.press('F1');
    const layout = await hintLayout(page);

    expect(layout.length).toBeGreaterThan(edit ? 35 : 25);

    for (const { id, badge, control } of layout) {
      expect(Math.abs(badge.x + badge.width / 2 - (control.x + control.width / 2)), id).toBeLessThan(1);
      expect(badge.y, id).toBeLessThan(control.y + control.height + 2 * badge.height);
      expect(badge.y + badge.height, id).toBeGreaterThan(control.y - 2 * badge.height);
    }

    const overlapping = layout.filter((hint, i) => layout.slice(i + 1).some((other) => boxesOverlap(hint.badge, other.badge)));
    expect(overlapping.map((hint) => hint.id)).toEqual([]);
  });
}

function dataProviderHintLayouts() {
  return [
    ['a Mac in view mode', 'MacIntel', false],
    ['a Mac in edit mode', 'MacIntel', true],
    ['Windows in view mode', 'Win32', false],
    ['Windows in edit mode', 'Win32', true],
  ];
}

test('dims the label of a control that is disabled', async ({ page }) => {
  await loadExample(page);

  await page.keyboard.press('F1');

  await expect(page.locator('#shortcut-hints [data-for="undo"]')).toHaveClass(/is-disabled/);
  await expect(page.locator('#shortcut-hints [data-for="doc-save"]')).not.toHaveClass(/is-disabled/);
});

for (const [name, close] of dataProviderHintClosers()) {
  test(`hides the shortcut labels on ${name}`, async ({ page }) => {
    await loadExample(page);
    await page.keyboard.press('F1');
    await expect(page.locator('#shortcut-hints')).toBeVisible();

    await close(page);

    await expect(page.locator('#shortcut-hints')).toBeHidden();
  });
}

function dataProviderHintClosers() {
  return [
    ['Escape', (page) => page.keyboard.press('Escape')],
    ['a click', (page) => page.click('.statusbar__tips')],
    ['a shortcut', (page) => page.keyboard.press('m')],
    ['a resize', (page) => page.setViewportSize({ width: 1100, height: 700 })],
    ['a scroll', (page) => page.locator('#legend .panel__body').dispatchEvent('scroll')],
  ];
}

for (const [name, open] of dataProviderHelpKeyScreens()) {
  test(`keeps the browser's help from opening on F1 on ${name}`, async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      window.addEventListener('keydown', (evt) => {
        window.helpPrevented = evt.defaultPrevented;
      });
    });

    await page.keyboard.press('F1');

    expect(await page.evaluate(() => window.helpPrevented)).toBe(true);
  });
}

function dataProviderHelpKeyScreens() {
  return [
    ['the landing screen', () => {}],
    ['a diagram', loadExample],
    [
      'the About box',
      async (page) => {
        await loadExample(page);
        await page.click('#about-toggle');
        await expect(page.locator('#about-dialog')).toBeVisible();
      },
    ],
  ];
}

test('opens the About box with ? and leaves every shortcut off while it is open', async ({ page }) => {
  await loadExample(page);

  await page.keyboard.press('?');
  await expect(page.locator('#about-dialog')).toBeVisible();

  await page.keyboard.press('f');
  await page.keyboard.press('F1');

  await expect(page.locator('#fields-toggle')).toHaveClass(/is-active/);
  await expect(page.locator('#shortcut-hints')).toBeHidden();
});

test("labels the landing screen's controls and none of the toolbar's behind it", async ({ page }) => {
  await onPlatform(page, 'Win32');

  await page.keyboard.press('F1');

  expect(await shortcutHints(page)).toEqual([
    ['landing-theme', 'D'],
    ['folder-btn', 'Alt+I'],
    ['landing-open', 'Ctrl+O'],
    ['new-btn', 'Alt+N'],
    ['template-drupal-cms', '1'],
    ['template-civictheme', '2'],
  ]);
});

test('closes the shortcut labels and then the import screen with Escape', async ({ page }) => {
  await loadExample(page);
  await page.click('#doc-import');

  await page.keyboard.press('F1');
  expect(Object.fromEntries(await shortcutHints(page))['landing-cancel']).toBe('Esc');

  await page.keyboard.press('Escape');
  await expect(page.locator('#shortcut-hints')).toBeHidden();
  await expect(page.locator('#landing')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#landing')).toBeHidden();
});

for (const [name, key, ran] of dataProviderToolbarShortcuts()) {
  test(`runs ${name} with ${key}`, async ({ page }) => {
    await loadExample(page);

    await page.keyboard.press(key);

    await ran(page);
  });
}

function dataProviderToolbarShortcuts() {
  return [
    ['the theme toggle', 'd', (page) => expect(page.locator('html')).toHaveClass(/sl-theme-dark/)],
    ['Settings', ',', (page) => expect(page.locator('#settings')).toBeVisible()],
    ['Import', 'Alt+i', (page) => expect(page.locator('#landing')).toBeVisible()],
    ['Export before a format is chosen', 'Control+e', (page) => expect(page.locator('#export-menu')).toBeVisible()],
    ['the export format menu', 'Control+Shift+E', (page) => expect(page.locator('#export-menu')).toBeVisible()],
    ['Fields', 'f', (page) => expect(page.locator('#fields-toggle')).not.toHaveClass(/is-active/)],
    ['Proxies', 'p', (page) => expect(page.locator('#proxy-toggle')).not.toHaveClass(/is-active/)],
    ['Machine names', 'm', (page) => expect(page.locator('#machine-names')).not.toHaveClass(/is-active/)],
    ['Entities', '1', (page) => expect(page.locator('#entities')).toBeVisible()],
    ['Table', '2', (page) => expect(page.locator('#table')).toBeVisible()],
    ['Legend', '3', (page) => expect(page.locator('#legend')).toHaveCount(0)],
    ['History', '4', (page) => expect(page.locator('#history')).toBeVisible()],
    ['the zoom menu', 'z', (page) => expect(page.locator('#zoom-menu')).toBeVisible()],
  ];
}

test('tidies the layout with T', async ({ page }) => {
  await openDocument(page, SCATTERED_DOC);
  const saved = await nodePositions(page);

  await page.keyboard.press('t');

  expect(await nodePositions(page)).not.toEqual(saved);
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Tidied the layout \(/);
});

test('re-runs the picked layout with L', async ({ page }) => {
  await loadExample(page);
  const laidOut = await nodePositions(page);

  await page.evaluate(() => {
    window.__nexus.cy.getElementById('node.event').shift({ x: 300, y: 300 });
  });
  await page.keyboard.press('l');

  expect(await nodePositions(page)).toEqual(laidOut);
});

test('picks a layout from the keyboard once Shift+L opens the layout menu', async ({ page }) => {
  await loadExample(page);

  await page.keyboard.press('Shift+L');
  await expect(page.locator('#layout-menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#layout-menu sl-menu-item[value="lr"]')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: LR');
});

test('switches between view and edit modes with V and E', async ({ page }) => {
  await loadExample(page);

  await page.keyboard.press('e');
  await expect(page.locator('#mode-build')).toHaveClass(/is-active/);
  await expect(page.locator('#build-tools')).toBeVisible();

  await page.keyboard.press('v');
  await expect(page.locator('#mode-view')).toHaveClass(/is-active/);
  await expect(page.locator('#build-tools')).toBeHidden();
});

test('focuses the search box with / and selects what it holds', async ({ page }) => {
  await loadExample(page);
  await slFill(page, '#search', 'news');

  await page.keyboard.press('/');
  await expect(page.locator('#search')).toBeFocused();
  await page.keyboard.type('session');

  await expect(page.locator('#search')).toHaveJSProperty('value', 'session');
});

test('zooms in with + and =, out with -, back to 100% with 0 and to fit with Shift+1', async ({ page }) => {
  await loadExample(page);

  await page.keyboard.press('0');
  expect(await zoomLevel(page)).toBeCloseTo(1, 5);
  await page.keyboard.press('+');
  expect(await zoomLevel(page)).toBeCloseTo(1.25, 5);
  await page.keyboard.press('=');
  expect(await zoomLevel(page)).toBeCloseTo(1.5625, 5);
  await page.keyboard.press('-');
  expect(await zoomLevel(page)).toBeCloseTo(1.25, 5);

  await page.keyboard.press('Shift+1');
  const fitted = await zoomLevel(page);
  await page.keyboard.press('0');
  await page.click('#fit');
  expect(await zoomLevel(page)).toBeCloseTo(fitted, 5);
});

for (const [name, modifier] of dataProviderShortcutModifiers()) {
  test(`saves the diagram with ${name}+S, from the title box too`, async ({ page }) => {
    await loadExample(page);

    const [saved] = await Promise.all([page.waitForEvent('download'), page.keyboard.press(modifier + '+s')]);
    expect(saved.suggestedFilename()).toBe('example-content-model.nexus.json');

    await page.locator('#diagram-title').click();
    const [renamed] = await Promise.all([page.waitForEvent('download'), page.keyboard.press(modifier + '+s')]);
    expect(renamed.suggestedFilename()).toBe('example-content-model.nexus.json');
  });
}

test('exports the chosen format again with Ctrl+E', async ({ page }) => {
  await loadExample(page);
  await exportFrom(page, 'svg');

  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+e')]);

  expect(download.suggestedFilename()).toBe('example-content-model.svg');
});

test('picks an export format from the keyboard once Ctrl+Shift+E opens the menu', async ({ page }) => {
  await loadExample(page);

  await page.keyboard.press('Control+Shift+E');
  await expect(page.locator('#export-menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#export-menu sl-menu-item[value="png"]')).toBeFocused();

  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toBe('example-content-model.png');
});

for (const [name, key, input, open] of dataProviderFilePickerShortcuts()) {
  test(`opens the ${name} with ${key}`, async ({ page }) => {
    await open(page);
    const chooser = page.waitForEvent('filechooser');

    // Waiting for a file chooser turns on its interception without waiting
    // for it, and a key press can reach the page first, so a round trip to
    // the page comes before the key.
    await page.evaluate(() => {});
    await page.keyboard.press(key);

    expect(await (await chooser).element().evaluate((el) => el.id)).toBe(input);
  });
}

function dataProviderFilePickerShortcuts() {
  return [
    ['saved diagram picker', 'Control+o', 'doc-open', loadExample],
    ['saved diagram picker from the landing screen', 'Control+o', 'doc-open', () => {}],
    ['config folder picker from the landing screen', 'Alt+i', 'folder-input', () => {}],
  ];
}

for (const [name, open] of dataProviderNewShortcutScreens()) {
  test(`starts a new content model with Alt+N from ${name}`, async ({ page }) => {
    await open(page);

    await page.keyboard.press('Alt+n');

    await expect(page.locator('#landing')).toBeHidden();
    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'New content model');
    expect(await entityCount(page)).toBe(0);
  });
}

function dataProviderNewShortcutScreens() {
  return [
    ['a diagram', loadExample],
    ['the landing screen', () => {}],
  ];
}

for (const [key, title] of dataProviderTemplateNumbers()) {
  test(`loads the template numbered ${key} on the landing screen`, async ({ page }) => {
    await page.keyboard.press(key);
    await waitForGraph(page);

    expect(await page.locator('#diagram-title').evaluate((el) => el.value)).toMatch(title);
  });
}

function dataProviderTemplateNumbers() {
  return [
    ['1', /^Drupal CMS /],
    ['2', /^CivicTheme /],
  ];
}

test('switches the theme with D on the landing screen', async ({ page }) => {
  await page.keyboard.press('d');

  await expect(page.locator('html')).toHaveClass(/sl-theme-dark/);
  await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to light theme');
});

for (const [name, key, ran] of dataProviderPaletteShortcuts()) {
  test(`runs the ${name} button of the edit palette with ${key}`, async ({ page }) => {
    await page.click('#new-btn');
    await page.keyboard.press('e');

    await page.keyboard.press(key);

    await ran(page);
  });
}

function dataProviderPaletteShortcuts() {
  return [
    ['Content', 'Shift+C', offersNewEntity('Content type')],
    ['Vocab', 'Shift+V', offersNewEntity('Vocabulary')],
    ['Media', 'Shift+M', offersNewEntity('Media')],
    ['Para', 'Shift+P', offersNewEntity('Paragraph')],
    ['Block', 'Shift+B', offersNewEntity('Block')],
    ['User', 'Shift+U', offersNewEntity('User')],
    ['External', 'Shift+X', offersNewEntity('External entity')],
    ['Field', 'Shift+F', (page) => expect(page.locator('#inspector [data-new="field"]')).toBeVisible()],
    ['Event', 'Shift+E', placesNote('event')],
    ['API', 'Shift+A', placesNote('api')],
    ['Callback', 'Shift+K', placesNote('callback')],
    ['Connect', 'c', (page) => expect(page.locator('#connect-toggle')).toHaveClass(/is-active/)],
  ];
}

for (const [name, key, field] of dataProviderNewItemForms()) {
  test(`types the machine name of a new ${name} straight after ${key} opens its form`, async ({ page }) => {
    await buildEntities(page, ['story']);
    await page.evaluate(() => document.activeElement.blur());

    await page.keyboard.press(key);
    await expect(page.locator(field)).toBeFocused();
    await page.keyboard.type('cf');

    await expect(page.locator(field)).toHaveJSProperty('value', 'cf');
    await expect(page.locator('#connect-toggle')).not.toHaveClass(/is-active/);
    await expect(page.locator('#fields-toggle')).toHaveClass(/is-active/);
  });
}

function dataProviderNewItemForms() {
  return [
    ['content type', 'Shift+C', '#inspector [data-new-bundle]'],
    ['field', 'Shift+F', '#inspector [data-new-name]'],
  ];
}

test('opens the form of the palette type picked last', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');

  await page.click('[data-add-entity="node"]');
  await page.click('[data-add-entity="taxonomy_term"]');

  await expect(page.locator('#inspector .insp__title')).toHaveText('New Vocabulary');
  await expect(page.locator('#inspector [data-new-bundle]')).toBeFocused();
});

test('leaves the focus on the page when an undo redraws an open new field form', async ({ page }) => {
  await buildEntities(page, ['a', 'b']);
  await page.click('#add-field');
  await expect(page.locator('#inspector [data-new-name]')).toBeFocused();
  await page.evaluate(() => document.activeElement.blur());

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');

  expect(await entityIds(page)).toEqual([]);
  await expect(page.locator('#inspector [data-new-name]')).not.toBeFocused();
});

test('types into a text box instead of running the shortcuts of the keys', async ({ page }) => {
  await loadExample(page);
  await page.locator('#search').click();

  await page.keyboard.type('f1?');
  await page.keyboard.press('Alt+n');

  await expect(page.locator('#search')).toHaveJSProperty('value', 'f1?');
  await expect(page.locator('#fields-toggle')).toHaveClass(/is-active/);
  await expect(page.locator('#entities')).toHaveCount(0);
  await expect(page.locator('#about-dialog')).not.toBeVisible();
  expect(await entityCount(page)).toBeGreaterThan(0);
});

test('leaves letter keys to a focused select', async ({ page }) => {
  await selectTrackField(page);
  await page.locator('#inspector sl-select[data-cardinality]').click();

  await page.keyboard.press('m');

  await expect(page.locator('#machine-names')).toHaveClass(/is-active/);
});

test('leaves letter keys to an open menu', async ({ page }) => {
  await loadExample(page);
  await page.keyboard.press('Control+Shift+E');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#export-menu sl-menu-item[value="png"]')).toBeFocused();

  await page.keyboard.press('p');

  await expect(page.locator('#proxy-toggle')).toHaveClass(/is-active/);
  await expect(page.locator('#export-menu')).toBeVisible();
});

test('repeats a held zoom key, but not a held toggle or F1', async ({ page }) => {
  await loadExample(page);
  await page.keyboard.press('0');

  await page.keyboard.down('-');
  await page.keyboard.down('-');
  await page.keyboard.up('-');
  expect(await zoomLevel(page)).toBeCloseTo(0.64, 5);

  await page.keyboard.down('f');
  await page.keyboard.down('f');
  await page.keyboard.up('f');
  await expect(page.locator('#fields-toggle')).not.toHaveClass(/is-active/);

  await page.keyboard.down('F1');
  await page.keyboard.down('F1');
  await page.keyboard.up('F1');
  await expect(page.locator('#shortcut-hints')).toBeVisible();
});

test('undoes 1 step after another while Ctrl+Z is held', async ({ page }) => {
  await buildEntities(page, ['a', 'b']);
  await page.evaluate(() => document.activeElement.blur());

  await page.keyboard.down('Control');
  await page.keyboard.down('z');
  await page.keyboard.down('z');
  await page.keyboard.up('z');
  await page.keyboard.up('Control');

  expect(await entityIds(page)).toEqual([]);
});
