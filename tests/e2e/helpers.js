import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const EXAMPLE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'conference');

export function entityCount(page) {
  return page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').length);
}

// The position of each node the selector matches, or of every node, keyed by
// node id.
export function nodePositions(page, selector) {
  return page.evaluate((nodeSelector) => {
    const positions = {};
    window.__nexus.cy.nodes(nodeSelector).forEach((node) => {
      positions[node.id()] = node.position();
    });
    return positions;
  }, selector);
}

export async function waitForGraph(page) {
  await page.waitForFunction(() => window.__nexus && window.__nexus.cy.nodes('[group="entity"]').length > 0);
}

// Opens the page with Cytoscape held back, so src/app.js, which runs after
// it, waits until the returned function is called. Routing turns off the
// HTTP cache, so the held script is always requested.
export async function openBeforeAppStarts(page) {
  let start;
  const held = new Promise((resolve) => {
    start = resolve;
  });

  await page.route('**/assets/vendor/cytoscape.min.js', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/index.html', { waitUntil: 'commit' });

  return start;
}

// Imports the conference fixture folder, with its annotation overlay.
export async function loadExample(page) {
  await page.setInputFiles('#folder-input', EXAMPLE_DIR);
  await waitForGraph(page);
}

// Shoelace form controls render into shadow DOM, so set the value on the host
// and dispatch the events the component would fire.
export async function slFill(page, selector, value) {
  await page.locator(selector).waitFor({ state: 'attached' });
  await page.locator(selector).evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('sl-input', { bubbles: true }));
    el.dispatchEvent(new Event('sl-change', { bubbles: true }));
  }, value);
}

export async function slSelect(page, selector, value) {
  await page.locator(selector).waitFor({ state: 'attached' });
  await page.locator(selector).evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('sl-change', { bubbles: true }));
  }, value);
}

export async function openDocument(page, doc) {
  await page.setInputFiles('#doc-open', { name: 'diagram.nexus.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await waitForGraph(page);
}

// Pastes text into the Create with AI dialog, opened from the landing screen,
// and presses Open diagram.
export async function pasteDiagram(page, text) {
  await page.click('#landing-ai');
  await expect(page.locator('#ai-paste')).toBeVisible();
  await slFill(page, '#ai-paste', text);
  await page.click('#ai-open');
}

// Clicks the element and returns the download the click starts.
export async function downloadFrom(page, selector) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  return download;
}

// Picks a format from the Save button's menu, through its submenu when it has
// one, and returns its download once the menu has closed. A dropdown reopened
// while its close animation runs stays open but hidden.
export async function saveFrom(page, format) {
  const item = '#save-menu sl-menu-item[value="' + format + '"]';

  await page.click('#save-choose');
  await openSaveSubmenu(page, format);
  const download = await downloadFrom(page, item);
  await expect(page.locator('#save-menu')).toBeHidden();

  return download;
}

// Hovers the Save menu item whose submenu holds the format, if any, and waits
// for the format to show.
export async function openSaveSubmenu(page, format) {
  const item = 'sl-menu-item[value="' + format + '"]';
  const parent = page.locator('#save-menu > sl-menu-item').filter({ has: page.locator(item) });

  if ((await parent.count()) === 0) {
    return;
  }

  await parent.hover();
  await expect(page.locator('#save-menu ' + item)).toBeVisible();
}

// A link to the page that carries the document, built by the app's own
// module in the browser.
export function linkTo(page, doc, focus) {
  return page.evaluate(
    async ([linkedDoc, linkedFocus]) => {
      const { documentLink, encodeDocument } = await import('./src/doc-link.js');

      return documentLink(window.location.href, await encodeDocument(linkedDoc), linkedFocus);
    },
    [doc, focus || null],
  );
}

// Picks Copy link from the Save button's menu and waits for its dialog.
export async function copyLink(page) {
  await page.click('#save-choose');
  await page.click('#save-menu sl-menu-item[value="link"]');
  await expect(page.locator('#save-menu')).toBeHidden();
  await expect(page.locator('#link-dialog')).toHaveAttribute('open', '');
}

// Picks an item, by its value, from the Open button's menu and waits for the
// menu to close.
export async function openFrom(page, item) {
  await page.click('#open-choose');
  await page.click('#open-menu sl-menu-item[value="' + item + '"]');
  await expect(page.locator('#open-menu')).toBeHidden();
}

export async function createEntity(page, entityType, bundle, label) {
  await page.click('[data-add-entity="' + entityType + '"]');
  await slFill(page, '[data-new-bundle]', bundle);
  await slFill(page, '[data-new-label]', label);
  await page.click('[data-create-entity]');
}

// A new document in edit mode holding a Story content type with 1 field,
// 'field_1', which the inspector has selected.
export async function buildStoryWithField(page) {
  await page.click('#new-btn');
  await page.click('#mode-build');
  await createEntity(page, 'node', 'story', 'Story');
  await page.click('.handle--right');
  await page.waitForFunction(() => window.__nexus.cy.getElementById('field:node.story:field_1').nonempty());
}

// The callback returns nothing, since Playwright is slow to serialize the
// collection emit() returns.
// Shows the tooltip of a node, as a pointer over it does.
export function hoverNode(page, id) {
  return page.evaluate((nodeId) => {
    window.__nexus.cy.getElementById(nodeId).emit('mouseover');
  }, id);
}

export function tapNode(page, id) {
  return page.evaluate((nodeId) => {
    window.__nexus.cy.getElementById(nodeId).emit('tap');
  }, id);
}

// Right-clicks the entity, which opens the entity menu at it.
export async function openEntityMenu(page, id) {
  await page.evaluate((nodeId) => {
    window.__nexus.cy.getElementById(nodeId).emit('cxttap');
  }, id);
  await expect(page.locator('#entity-menu')).toBeVisible();
}

// Starts an explore view from the entity through its right-click menu.
export async function exploreFrom(page, id) {
  await openEntityMenu(page, id);
  await page.click('#entity-menu [data-explore]');
  await expect(page.locator('#explore-bar')).toBeVisible();
}

export function captionsOf(page, id) {
  return page.evaluate(
    (nodeId) =>
      [...document.querySelectorAll('#captions .caption')]
        .filter((div) => div.dataset.nodeId === nodeId)
        .map((div) => ({ text: div.textContent, shown: div.style.display === 'block' })),
    id,
  );
}

export const DARK_MARK = { ink: ['rgb(255, 255, 255)'], ref: ['rgb(83, 180, 235)'] };

// Returns the distinct computed fills of the ink and ref shapes in the Nexus
// mark inside the element the selector matches.
export function markFills(page, selector) {
  return page.locator(selector + ' svg.icon--nexus').evaluate((svg) => {
    const fills = (role) => [...new Set([...svg.querySelectorAll('.' + role)].map((shape) => getComputedStyle(shape).fill))];
    return { ink: fills('ink'), ref: fills('ref') };
  });
}

export function boxesOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// Returns the selector of the element drawn on top at the centre of the area
// where all the matched elements overlap, or null when another element is.
export function topmostOf(page, selectors) {
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

// Whether each element that draws the reference from the field to the target
// is on the canvas and shown.
export function referenceView(page, field, target) {
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

export const PROXY_VIEW = { ref: false, proxy: true, proxyEdge: true, collapsed: false };

export const TRACK_FIELD = 'field:node.session:field_track';

export const TRACKS = 'taxonomy_term.tracks';

// The example in edit mode.
export async function editExample(page) {
  await loadExample(page);
  await page.click('#mode-build');
}

// The example in edit mode, with Session's track field selected in the
// inspector. The field references the Tracks vocabulary only.
export async function selectTrackField(page) {
  await editExample(page);
  await tapNode(page, TRACK_FIELD);
}

export function addTarget(page, target) {
  return slSelect(page, '#inspector sl-select[data-add-target]', target);
}

// Captions and handles are repositioned 1 frame after a Cytoscape redraw, so
// this resolves 2 frames after the redraw the selection causes.
export async function selectEvent(page, zoom) {
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

// Opens a diagram from the conference fixture or a template.
export async function openDiagram(page, source) {
  if (source === 'example') {
    await loadExample(page);
    return;
  }

  await page.click('#template-' + source);
  await waitForGraph(page);
}

export async function pickLayout(page, value) {
  await page.click('#layout-choose');
  await page.click('#layout-menu sl-menu-item[value="' + value + '"]');
}

// Picks a detail level from the status bar's icon buttons.
export async function pickLevel(page, value) {
  const button = page.locator('#detail-levels [data-level="' + value + '"]');

  await button.click();
  await expect(button).toHaveClass(/is-active/);
}

// How the fields of the Event content type sit around it, and the direction
// its field edges turn.
export function eventLayout(page) {
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

export function selectedNodes(page) {
  return page.evaluate(() =>
    window.__nexus.cy
      .nodes(':selected')
      .map((node) => node.id())
      .sort(),
  );
}

// A diagram whose saved layout is nothing like the one Tidy draws.
export const SCATTERED_DOC = {
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

// A diagram with 1 problem of each level the Checks panel lists: a reference
// field with no target, a list with no allowed values and a paragraph type no
// field references.
export const CHECKS_DOC = {
  nexus: 1,
  title: 'Checks',
  entities: [
    {
      entityType: 'node',
      bundle: 'article',
      label: 'Article',
      fields: [
        { name: 'field_tags', label: 'Tags', fieldType: 'entity_reference', kind: 'multi', cardinality: -1 },
        { name: 'field_size', label: 'Size', fieldType: 'list_string', kind: 'single' },
      ],
    },
    { entityType: 'paragraph', bundle: 'hero', label: 'Hero', fields: [{ name: 'field_heading', label: 'Heading', fieldType: 'string', kind: 'single' }] },
  ],
};

export function hasNode(page, id) {
  return page.evaluate((nodeId) => window.__nexus.cy.getElementById(nodeId).nonempty(), id);
}

export function entityIds(page) {
  return page.evaluate(() =>
    window.__nexus.cy
      .nodes('[group="entity"]')
      .map((node) => node.id())
      .sort(),
  );
}

// The point on the page where a node is drawn. Cytoscape caches where its
// container is, and the edit palette moves it, so the cache is refreshed.
export function pagePosition(page, id) {
  return page.evaluate((nodeId) => {
    const cy = window.__nexus.cy;
    cy.resize();
    const box = cy.container().getBoundingClientRect();
    const position = cy.getElementById(nodeId).renderedPosition();
    return { x: box.left + position.x, y: box.top + position.y };
  }, id);
}

// A new document in edit mode holding 1 entity per bundle, created in order
// from the palette.
export async function buildEntities(page, bundles) {
  await page.click('#new-btn');
  await page.click('#mode-build');

  for (const bundle of bundles) {
    await createEntity(page, 'node', bundle, bundle.toUpperCase());
  }
}

export function dataProviderShortcutModifiers() {
  return [
    ['Ctrl', 'Control'],
    ['Cmd', 'Meta'],
  ];
}
