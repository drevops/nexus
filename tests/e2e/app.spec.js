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

// Heights of a docked panel, its body and the first element in its body, and
// the height of the dock that holds it.
function dockedSizes(page, selector) {
  return page.locator(selector).evaluate((panel) => {
    const bodyEl = panel.querySelector('.panel__body');

    return {
      panel: panel.getBoundingClientRect().height,
      dock: panel.closest('.dock__scroll').clientHeight,
      bodyClient: bodyEl.clientHeight,
      bodyScroll: bodyEl.scrollHeight,
      content: bodyEl.firstElementChild.getBoundingClientRect().height,
    };
  });
}

// The height of the Inspector's form that its body scrolls out of view.
async function hiddenInspectorHeight(page) {
  const sizes = await dockedSizes(page, '#inspector');

  return sizes.bodyScroll - sizes.bodyClient;
}

// Drags the height handle of a docked panel by the given distance.
async function dragPanelEdge(page, selector, distance) {
  const handle = await page.locator(selector + ' .panel__vresize').boundingBox();
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + distance, { steps: 6 });
  await page.mouse.up();
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

  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
  await expect(page.locator('#machine-names')).toHaveJSProperty('checked', true);
  expect(await page.locator('#captions .caption').count()).toBeGreaterThan(0);
  const detailed = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);

  await page.click('#fields-toggle');
  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', false);
  const overview = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);
  expect(overview).toBeLessThan(detailed);

  await page.click('#entities-toggle');
  await expect(page.locator('#entity-list .entity-row').first()).toBeVisible();

  await page.click('#table-toggle');
  await expect(page.locator('#field-table')).toContainText('References');
  await expect(page.locator('#field-table')).toContainText('field_media');
});

// A reference field of the conference fixture to 2 media types, so it has 2
// proxies.
const EVENT_MEDIA = 'field:node.event:field_media';
const MEDIA_SHOWN = { field: true, proxies: [true, true] };
const MEDIA_HIDDEN = { field: false, proxies: [false, false] };

function visibilityButton(page, id) {
  return page.locator('[data-field-visibility="' + id + '"]');
}

function goToButton(page, id) {
  return page.locator('[data-field-go-to="' + id + '"]');
}

// Whether a field and each of its proxies are drawn on the canvas.
function fieldOnCanvas(page, id) {
  return page.evaluate((fieldId) => {
    const cy = window.__nexus.cy;
    const proxies = cy.nodes('[group="proxy"]').filter((proxy) => proxy.data('field') === fieldId);

    return { field: !cy.getElementById(fieldId).hasClass('hidden'), proxies: proxies.map((proxy) => !proxy.hasClass('hidden')) };
  }, id);
}

// The position of a field relative to its entity.
function offsetFromEntity(page, id) {
  return page.evaluate((fieldId) => {
    const field = window.__nexus.cy.getElementById(fieldId);
    const entity = window.__nexus.cy.getElementById(field.data('entity'));

    return { x: field.position('x') - entity.position('x'), y: field.position('y') - entity.position('y') };
  }, id);
}

function isTraced(page, id) {
  return page.evaluate((fieldId) => window.__nexus.cy.getElementById(fieldId).hasClass('trace-source'), id);
}

async function hideEventMedia(page) {
  await loadExample(page);
  await page.click('#table-toggle');
  await visibilityButton(page, EVENT_MEDIA).click();
  await expect(visibilityButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Show Media on the canvas');
}

test('hides a field with its proxies from the Fields table and shows it again', async ({ page }) => {
  await loadExample(page);
  await page.click('#table-toggle');

  await expect(page.locator('#field-table thead th')).toHaveCount(7);
  await expect(visibilityButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Hide Media on the canvas');
  expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_SHOWN);

  await visibilityButton(page, EVENT_MEDIA).click();
  expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_HIDDEN);
  await expect(visibilityButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Show Media on the canvas');
  await expect(page.locator('#field-table tr.is-hidden-field')).toHaveCount(1);

  await visibilityButton(page, EVENT_MEDIA).click();
  expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_SHOWN);
  await expect(page.locator('#field-table tr.is-hidden-field')).toHaveCount(0);
});

test('goes to a field from the Fields table', async ({ page }) => {
  await loadExample(page);
  await page.click('#table-toggle');

  await expect(goToButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Go to Media on the canvas');
  await goToButton(page, EVENT_MEDIA).click();

  expect(await isTraced(page, EVENT_MEDIA)).toBe(true);
});

for (const [name, takeOff, title] of dataProviderFieldOffCanvas()) {
  test(`offers no go-to for a field off the canvas because of ${name}`, async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');
    await takeOff(page);

    await expect(goToButton(page, EVENT_MEDIA)).toHaveAttribute('title', title);
    await expect(goToButton(page, EVENT_MEDIA)).toHaveAttribute('aria-disabled', 'true');
    // Playwright refuses to click an aria-disabled button, so the click is
    // dispatched.
    await goToButton(page, EVENT_MEDIA).dispatchEvent('click');
    expect(await isTraced(page, EVENT_MEDIA)).toBe(false);
  });
}

function dataProviderFieldOffCanvas() {
  return [
    ['its own eye', (page) => visibilityButton(page, EVENT_MEDIA).click(), 'Show this field to go to it'],
    ['the Fields switch', (page) => page.click('#fields-toggle'), 'Turn on Fields to go to this field'],
    [
      'its entity type filter',
      async (page) => {
        await page.click('#entities-toggle');
        await page.locator('#type-filters label', { hasText: 'Content type' }).locator('input').uncheck();
      },
      'Show its entity type to go to this field',
    ],
  ];
}

test('keeps a hidden field hidden when the Fields switch turns back on', async ({ page }) => {
  await hideEventMedia(page);

  await page.click('#fields-toggle');
  await page.click('#fields-toggle');

  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
  expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_HIDDEN);
});

test('keeps a hidden field beside its entity through a layout run', async ({ page }) => {
  await hideEventMedia(page);
  const before = await offsetFromEntity(page, EVENT_MEDIA);

  await page.click('#layout-run');

  expect(await offsetFromEntity(page, EVENT_MEDIA)).toEqual(before);
});

test('undoes and redoes hiding a field', async ({ page }) => {
  await hideEventMedia(page);
  await expect(page.locator('#undo')).toHaveAttribute('title', /Hid field “Media”/);

  await page.click('#undo');
  expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_SHOWN);
  await expect(visibilityButton(page, EVENT_MEDIA)).toHaveAttribute('title', 'Hide Media on the canvas');

  await page.click('#redo');
  expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_HIDDEN);
});

test('saves a hidden field and reopens it hidden', async ({ page }) => {
  await hideEventMedia(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const saved = await download.path();
  const doc = JSON.parse(readFileSync(saved, 'utf8'));
  const fields = doc.entities.flatMap((entity) =>
    entity.fields.map((field) => ({ id: 'field:' + entity.entityType + '.' + entity.bundle + ':' + field.name, hidden: field.hidden })),
  );
  expect(fields.filter((field) => field.hidden).map((field) => field.id)).toEqual([EVENT_MEDIA]);

  await page.goto('/index.html');
  await page.setInputFiles('#doc-open', saved);
  await waitForGraph(page);

  expect(await fieldOnCanvas(page, EVENT_MEDIA)).toEqual(MEDIA_HIDDEN);
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

test('shares a dock equally between panels taller than their share', async ({ page }) => {
  await loadExample(page);

  await page.click('#legend .panel__pin');
  await page.click('#table-toggle');
  await page.click('#table .panel__pin');

  const table = await dockedSizes(page, '#table');
  const legend = await dockedSizes(page, '#legend');
  expect(legend.bodyScroll).toBeGreaterThan(legend.bodyClient);
  expect(Math.abs(table.panel - legend.panel)).toBeLessThanOrEqual(1);
});

test('stops a docked panel growing past its content', async ({ page }) => {
  await loadExample(page);

  await page.click('#legend .panel__pin');
  const full = (await dockedSizes(page, '#legend')).panel;

  await dragPanelEdge(page, '#legend', -120);
  const shrunk = await dockedSizes(page, '#legend');
  expect(shrunk.panel).toBeLessThan(full - 100);
  expect(shrunk.bodyScroll).toBeGreaterThan(shrunk.bodyClient);

  await dragPanelEdge(page, '#legend', 400);
  expect(Math.abs((await dockedSizes(page, '#legend')).panel - full)).toBeLessThanOrEqual(1);
});

test('gives the docked Inspector its full height beside the other docked panels', async ({ page }) => {
  // The entity form is taller than the dock of a 720px window.
  await page.setViewportSize({ width: 1280, height: 1200 });
  await loadExample(page);

  await page.click('#legend .panel__pin');
  await page.click('#table-toggle');
  await page.click('#table .panel__pin');
  await page.click('#mode-build');
  await tapNode(page, 'node.event');
  await page.click('#inspector .panel__pin');
  await expect(page.locator('#dock-right #inspector')).toBeVisible();

  const ids = await page.locator('#dock-right .panel').evaluateAll((panels) => panels.map((panel) => panel.id));
  expect(ids).toEqual(['table', 'legend', 'inspector']);

  const sizes = await dockedSizes(page, '#inspector');
  expect(sizes.bodyScroll).toBeLessThanOrEqual(sizes.bodyClient + 1);
  await expect(page.locator('#inspector .panel__vresize')).toHaveCount(0);

  const table = await dockedSizes(page, '#table');
  expect(table.bodyScroll).toBeGreaterThan(table.bodyClient);
});

test('scrolls the docked Inspector when its form is taller than the dock', async ({ page }) => {
  await loadExample(page);

  await page.click('#mode-build');
  await tapNode(page, 'node.event');
  await page.click('#inspector .panel__pin');
  await expect(page.locator('#dock-right #inspector')).toBeVisible();

  const sizes = await dockedSizes(page, '#inspector');
  expect(sizes.panel).toBeLessThanOrEqual(sizes.dock);
  expect(sizes.bodyScroll).toBeGreaterThan(sizes.bodyClient);
});

test('shows the whole docked Inspector form again after the window grows', async ({ page }) => {
  await loadExample(page);

  await page.click('#mode-build');
  await tapNode(page, 'node.event');
  await page.click('#inspector .panel__pin');
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect.poll(() => hiddenInspectorHeight(page)).toBeGreaterThan(1);

  await page.setViewportSize({ width: 1280, height: 1200 });
  await expect.poll(() => hiddenInspectorHeight(page)).toBeLessThanOrEqual(1);
  expect(await page.locator('#inspector .panel__body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
});

test('remembers the panel layout across reloads', async ({ page }) => {
  await loadExample(page);

  await page.click('#entities-toggle');
  await page.click('#entities .panel__pin');
  await expect(page.locator('#entities')).toHaveClass(/is-docked/);
  const docked = (await dockedSizes(page, '#entities')).panel;
  await page.waitForTimeout(500);

  await page.reload();
  await loadExample(page);

  await expect(page.locator('#entities')).toHaveClass(/is-docked/);
  expect(await page.locator('#entities').evaluate((el) => el.closest('.dock').id)).toBe('dock-left');
  expect(Math.abs((await dockedSizes(page, '#entities')).panel - docked)).toBeLessThanOrEqual(1);
});

// The ids of the panels in a side rail, top to bottom.
function railOf(page, side) {
  const ids = (panels) => panels.map((panel) => panel.id);

  return page.locator('#dock-' + side + ' > .dock__scroll > .panel').evaluateAll(ids);
}

// Presses a panel's grip, moves the pointer to the point and releases it.
async function dragGrip(page, id, x, y) {
  const grip = await page.locator('#' + id + ' .panel__grip').boundingBox();

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

// Pins the fields table and the legend to the right rail, table first.
async function pinTableAndLegend(page) {
  await page.click('#legend .panel__pin');
  await page.click('#table-toggle');
  await page.click('#table .panel__pin');
  await expect.poll(() => railOf(page, 'right')).toEqual(['table', 'legend']);
}

test('tilts the pin of a floating panel and stands it upright in the accent colour when pinned', async ({ page }) => {
  await loadExample(page);

  const pin = page.locator('#legend .panel__pin');
  const accent = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();

    return color;
  });
  const muted = await page.locator('#legend .panel__close').evaluate((el) => getComputedStyle(el).color);

  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await expect(pin.locator('svg')).toHaveCSS('transform', 'matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)');
  await expect(pin).toHaveCSS('color', muted);

  await pin.click();
  await expect(page.locator('#legend')).toHaveClass(/is-docked/);
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(pin.locator('svg')).toHaveCSS('transform', 'none');
  await expect(pin).toHaveCSS('color', accent);
  expect(accent).not.toBe(muted);
});

test('starts each panel header with a grip handle before the title', async ({ page }) => {
  await loadExample(page);
  await page.click('#entities-toggle');

  for (const id of ['legend', 'entities']) {
    const classes = await page.locator('#' + id + ' .panel__head > *').evaluateAll((children) => children.slice(0, 2).map((child) => child.className));

    expect(classes).toEqual(['panel__grip', 'panel__title']);
    await expect(page.locator('#' + id + ' .panel__grip svg')).toBeVisible();
  }
});

test('names what dragging the grip and the header does in their titles', async ({ page }) => {
  await loadExample(page);

  const head = page.locator('#legend .panel__head');
  const grip = page.locator('#legend .panel__grip');

  await expect(head).toHaveAttribute('title', 'Drag to move, drop at an edge to dock');
  await expect(grip).toHaveAttribute('title', 'Drag to move, drop at an edge to dock');

  await page.click('#legend .panel__pin');
  await expect(head).toHaveAttribute('title', 'Drag to undock and move, drop at an edge to dock');
  await expect(grip).toHaveAttribute('title', 'Drag to move up or down, or to the other side');
});

test('moves a pinned panel up and down its rail by its grip', async ({ page }) => {
  await loadExample(page);
  await pinTableAndLegend(page);

  const table = await page.locator('#table').boundingBox();
  const grip = await page.locator('#legend .panel__grip').boundingBox();

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, table.y + 10, { steps: 8 });
  await expect(page.locator('#legend')).toHaveClass(/is-dragging/);
  await expect.poll(() => railOf(page, 'right')).toEqual(['legend', 'table']);
  await page.mouse.up();
  await expect(page.locator('#legend')).not.toHaveClass(/is-dragging/);

  const legend = await page.locator('#legend').boundingBox();
  const moved = await page.locator('#table').boundingBox();
  await dragGrip(page, 'legend', legend.x + 20, moved.y + moved.height - 10);

  await expect.poll(() => railOf(page, 'right')).toEqual(['table', 'legend']);
  await expect(page.locator('#legend')).toHaveClass(/is-docked/);
});

test('moves a pinned panel to the other rail by its grip and keeps it docked', async ({ page }) => {
  await loadExample(page);
  await pinTableAndLegend(page);

  const stage = await page.locator('#stage-root').boundingBox();
  await dragGrip(page, 'legend', stage.x + 20, stage.y + stage.height / 2);

  await expect.poll(() => railOf(page, 'left')).toEqual(['legend']);
  await expect.poll(() => railOf(page, 'right')).toEqual(['table']);
  await expect(page.locator('#legend')).toHaveClass(/is-docked/);
});

test('keeps a pinned panel in its rail when its grip is dropped on the canvas', async ({ page }) => {
  await loadExample(page);
  await pinTableAndLegend(page);

  const canvas = await page.locator('.stage__canvas').boundingBox();
  await dragGrip(page, 'legend', canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);

  await expect(page.locator('#legend')).toHaveClass(/is-docked/);
  await expect.poll(() => railOf(page, 'right')).toEqual(['table', 'legend']);
});

test('undocks a pinned panel dragged by its header but not one clicked there', async ({ page }) => {
  await loadExample(page);
  await page.click('#entities-toggle');
  await page.click('#entities .panel__pin');
  await expect(page.locator('#entities')).toHaveClass(/is-docked/);

  await page.click('#entities .panel__title');
  await expect(page.locator('#entities')).toHaveClass(/is-docked/);

  const head = await page.locator('#entities .panel__title').boundingBox();
  const canvas = await page.locator('.stage__canvas').boundingBox();
  await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator('#entities')).not.toHaveClass(/is-docked/);
  expect(await page.locator('#entities').evaluate((el) => el.parentElement.classList.contains('stage__canvas'))).toBe(true);
});

test('moves a floating panel by its grip', async ({ page }) => {
  await loadExample(page);
  await page.click('#entities-toggle');

  const grip = await page.locator('#entities .panel__grip').boundingBox();
  await dragGrip(page, 'entities', grip.x + 260, grip.y + 200);

  const pos = await page.locator('#entities').evaluate((el) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) }));
  expect(pos.left).toBeGreaterThan(120);
  expect(pos.top).toBeGreaterThan(120);
  await expect(page.locator('#entities')).not.toHaveClass(/is-docked/);
});

test('docks a floating panel between the pinned panels it is dropped on', async ({ page }) => {
  await loadExample(page);
  await pinTableAndLegend(page);
  await page.click('#entities-toggle');

  const legend = await page.locator('#legend').boundingBox();
  await dragGrip(page, 'entities', legend.x + legend.width / 2, legend.y + 5);

  await expect.poll(() => railOf(page, 'right')).toEqual(['table', 'entities', 'legend']);
});

test('remembers the order of a rail across reloads', async ({ page }) => {
  await loadExample(page);
  await pinTableAndLegend(page);

  const table = await page.locator('#table').boundingBox();
  await dragGrip(page, 'legend', table.x + 20, table.y + 10);
  await expect.poll(() => railOf(page, 'right')).toEqual(['legend', 'table']);
  await page.waitForTimeout(500);

  await page.reload();
  await loadExample(page);

  await expect.poll(() => railOf(page, 'right')).toEqual(['legend', 'table']);
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

  await expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', true);
  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);

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

test('links the landing note to the annotation overlay documentation in a new tab', async ({ page }) => {
  const link = page.locator('.landing__note').getByRole('link', { name: 'annotations.yml' });

  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://github.com/drevops/nexus#annotation-overlay');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener');
  expect(await link.evaluate((element) => getComputedStyle(element).color)).toBe(
    await page.locator('.landing__more a').evaluate((element) => getComputedStyle(element).color),
  );
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

// The fields of an entity, each as its machine name, label, type,
// cardinality, required flag and reference targets, sorted by name.
function fieldDefinitions(page, entityId) {
  return page.evaluate(
    (id) =>
      window.__nexus.cy
        .nodes('[group="field"][entity="' + id + '"]')
        .map((field) => ({
          name: field.data('name'),
          label: field.data('label'),
          fieldType: field.data('fieldType'),
          cardinality: field.data('cardinality'),
          required: field.data('required'),
          targets: field
            .outgoers('edge[group="ref"]')
            .map((edge) => edge.target().id())
            .sort(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    entityId,
  );
}

// A new document in edit mode holding a Tags vocabulary and an Article, with
// the bulk fields form open on the Article.
async function openBulkFields(page) {
  await page.click('#new-btn');
  await page.click('#mode-build');
  await createEntity(page, 'taxonomy_term', 'tags', 'Tags');
  await createEntity(page, 'node', 'article', 'Article');
  await page.click('#inspector [data-bulk-fields]');
  await expect(page.locator('#inspector [data-new="bulk-fields"]')).toBeVisible();
}

test('adds several fields to an entity in 1 step', async ({ page }) => {
  await openBulkFields(page);
  await expect(page.getByRole('textbox', { name: 'Fields, 1 per line' })).toBeFocused();
  await expect(page.locator('#inspector [data-create-fields]')).toHaveAttribute('disabled', '');

  await slFill(
    page,
    '#inspector [data-bulk-text]',
    'Body, text_with_summary\nfield_tags, entity_reference, unlimited, taxonomy_term.tags\nSubtitle (field_sub), required',
  );
  await expect(page.locator('#inspector .insp__bulkline')).toHaveCount(3);
  await expect(page.locator('#inspector [data-create-fields]')).toContainText('Add 3 fields');
  await page.click('#inspector [data-create-fields]');

  expect(await fieldDefinitions(page, 'node.article')).toEqual([
    { name: 'field_body', label: 'Body', fieldType: 'text_with_summary', cardinality: 1, required: false, targets: [] },
    { name: 'field_sub', label: 'Subtitle', fieldType: 'string', cardinality: 1, required: true, targets: [] },
    { name: 'field_tags', label: 'Tags', fieldType: 'entity_reference', cardinality: -1, required: false, targets: ['taxonomy_term.tags'] },
  ]);
  expect(await hasNode(page, 'proxy:field:node.article:field_tags>taxonomy_term.tags')).toBe(true);
  await expect(page.locator('#inspector .insp__field')).toHaveCount(3);
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Added 3 fields to entity “Article” \(/);

  await page.click('#undo');
  expect(await fieldDefinitions(page, 'node.article')).toEqual([]);
  expect(await hasNode(page, 'node.article')).toBe(true);
});

test('stacks fields added together in a column beside their entity', async ({ page }) => {
  await openBulkFields(page);
  await slFill(page, '#inspector [data-bulk-text]', 'One\nTwo\nThree');
  await page.click('#inspector [data-create-fields]');

  const positions = await nodePositions(page, '[group="field"]');
  const entity = (await nodePositions(page, '[id="node.article"]'))['node.article'];
  const column = ['field_one', 'field_two', 'field_three'].map((name) => positions['field:node.article:' + name]);

  expect(new Set(column.map((position) => position.x)).size).toBe(1);
  expect(column[0].x).toBeGreaterThan(entity.x);
  expect(column[0].y).toBeLessThan(column[1].y);
  expect(column[1].y).toBeLessThan(column[2].y);
  expect(column[1].y).toBe(entity.y);
});

test('lists why a bulk field line cannot be added and adds nothing', async ({ page }) => {
  await openBulkFields(page);
  await slFill(page, '#inspector [data-bulk-text]', 'Body\nTeaser, strnig\nbody (field_body)');

  const errors = page.locator('#inspector .insp__bulkline.is-error');
  await expect(errors).toHaveText([/^Line 2: “strnig” is not a field type/, 'Line 3: “field_body” is on an earlier line']);
  await expect(page.locator('#inspector [data-create-fields]')).toHaveAttribute('disabled', '');
  await expect(page.locator('#inspector [data-create-fields]')).toContainText('Fix 2 lines');

  await page.locator('#inspector [data-create-fields]').click({ force: true });
  expect(await fieldDefinitions(page, 'node.article')).toEqual([]);
});

test('copies the fields of another entity into the bulk fields form', async ({ page }) => {
  await openBulkFields(page);
  await slFill(page, '#inspector [data-bulk-text]', 'Body, text_long, required\nfield_tags, entity_reference, 3, taxonomy_term.tags\nfield_image, image');
  await page.click('#inspector [data-create-fields]');

  await createEntity(page, 'node', 'page', 'Page');
  await page.click('#inspector [data-add-field]');
  await page.fill('[data-new-name]', 'field_image');
  await page.click('[data-create-field]');
  await tapNode(page, 'node.page');
  await page.click('#inspector [data-bulk-fields]');

  // The Article is the only other entity with fields to copy.
  await expect(page.locator('#inspector [data-copy-from] sl-option')).toHaveText(['Article (3)']);
  await slSelect(page, '#inspector [data-copy-from]', 'node.article');
  await expect(page.locator('#inspector [data-bulk-text]')).toHaveJSProperty(
    'value',
    'Body (field_body), text_long, 1, required\nTags (field_tags), entity_reference, 3, taxonomy_term.tags',
  );
  await expect(page.locator('#inspector [data-copied]')).toHaveText('Copied 2 fields from Article, skipped 1 already listed or on this entity.');
  await page.click('#inspector [data-create-fields]');

  const copied = await fieldDefinitions(page, 'node.page');
  const article = await fieldDefinitions(page, 'node.article');
  expect(copied.filter((field) => field.name !== 'field_image')).toEqual(article.filter((field) => field.name !== 'field_image'));
  expect(copied.map((field) => field.name)).toEqual(['field_body', 'field_image', 'field_tags']);
});

test('copies fields after the lines already in the bulk fields form', async ({ page }) => {
  await openBulkFields(page);
  await slFill(page, '#inspector [data-bulk-text]', 'Body');
  await page.click('#inspector [data-create-fields]');
  await createEntity(page, 'node', 'page', 'Page');
  await page.click('#inspector [data-bulk-fields]');

  await slFill(page, '#inspector [data-bulk-text]', 'Intro\n');
  await slSelect(page, '#inspector [data-copy-from]', 'node.article');
  await expect(page.locator('#inspector [data-bulk-text]')).toHaveJSProperty('value', 'Intro\nBody (field_body), string, 1');

  // Copying again adds nothing, since the form already lists every field.
  await slSelect(page, '#inspector [data-copy-from]', 'node.article');
  await expect(page.locator('#inspector [data-bulk-text]')).toHaveJSProperty('value', 'Intro\nBody (field_body), string, 1');
  await expect(page.locator('#inspector [data-copied]')).toHaveText('Copied 0 fields from Article, skipped 1 already listed or on this entity.');
});

test('leaves base fields out when copying fields from another entity', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');

  const fields = await page.evaluate(() => {
    const kinds = (kind) =>
      window.__nexus.cy
        .nodes('[group="field"][entity="node.session"]')
        .filter((field) => (field.data('kind') === 'system') === (kind === 'system'))
        .map((field) => field.data('name'));

    return { base: kinds('system'), other: kinds('other') };
  });
  expect(fields.base.length).toBeGreaterThan(0);
  expect(fields.other.length).toBeGreaterThan(0);

  await tapNode(page, 'taxonomy_term.tracks');
  await page.click('#inspector [data-bulk-fields]');
  await expect(page.locator('#inspector [data-copy-from] sl-option[value="node.session"]')).toContainText('(' + fields.other.length + ')');
  await slSelect(page, '#inspector [data-copy-from]', 'node.session');

  const copied = await page.locator('#inspector [data-bulk-text]').evaluate((el) => el.value.split('\n').map((line) => line.match(/\(([a-z0-9_]+)\),/)[1]));
  expect(copied.sort()).toEqual([...fields.other].sort());
});

test('closes the bulk fields form when an undo removes its entity', async ({ page }) => {
  await openBulkFields(page);

  await page.evaluate(() => document.activeElement.blur());
  await page.click('#undo');

  expect(await hasNode(page, 'node.article')).toBe(false);
  await expect(page.locator('#inspector [data-new="bulk-fields"]')).toHaveCount(0);
});

function crumbs(page) {
  return page.locator('#inspector .insp__crumbs li').allTextContents();
}

for (const [name, open, expected] of dataProviderEntityScreens()) {
  test(`leads ${name} back to its entity`, async ({ page }) => {
    await buildStoryWithField(page);
    await open(page);
    await expect(page.locator('#inspector .insp__crumbs li')).toHaveText(expected);
    await expect(page.locator('#inspector .insp__crumbs li[aria-current="page"]')).toHaveText(expected[1]);

    await page.click('#inspector [data-crumb="node.story"]');

    await expect(page.locator('#inspector .insp__title')).toHaveText('Entity');
    await expect(page.locator('#inspector [data-machine-name]')).toHaveJSProperty('value', 'story');
    await expect(page.locator('#inspector .insp__crumbs')).toHaveCount(0);
    await expect(page.locator('#handles .handle')).toHaveCount(4);
  });
}

function dataProviderEntityScreens() {
  return [
    ['a field’s inspector', async () => {}, ['Story', 'Field 1']],
    ['a new field opened from an entity', (page) => tapNode(page, 'node.story').then(() => page.click('#inspector [data-add-field]')), ['Story', 'New field']],
    ['the bulk fields form', (page) => tapNode(page, 'node.story').then(() => page.click('#inspector [data-bulk-fields]')), ['Story', 'Add fields']],
  ];
}

test('moves the focus into the entity form a crumb opens from the keyboard', async ({ page }) => {
  await buildStoryWithField(page);
  await page.locator('#inspector [data-crumb="node.story"]').focus();

  await page.keyboard.press('Enter');

  await expect(page.locator('#inspector .insp__title')).toHaveText('Entity');
  await expect(page.locator('#inspector .insp')).toBeFocused();
});

test('shows no breadcrumb on a screen with nothing above it', async ({ page }) => {
  await buildStoryWithField(page);

  await tapNode(page, 'node.story');
  await expect(page.locator('#inspector .insp__title')).toHaveText('Entity');
  expect(await crumbs(page)).toEqual([]);

  await page.click('#add-field');
  await expect(page.locator('#inspector [data-new="field"]')).toBeVisible();
  expect(await crumbs(page)).toEqual([]);

  await page.click('[data-add-entity="node"]');
  await expect(page.locator('#inspector [data-new="entity"]')).toBeVisible();
  expect(await crumbs(page)).toEqual([]);
});

test('relabels the breadcrumb with the field it shows', async ({ page }) => {
  await buildStoryWithField(page);

  await slFill(page, '#inspector sl-input:not([data-machine-name])', 'Subtitle');

  await expect(page.locator('#inspector .insp__crumbs li')).toHaveText(['Story', 'Subtitle']);
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

// The symbol each palette type button draws: its symbol key, the tag of the
// shape and the colour the shape is filled with.
function paletteSymbols(page) {
  const read = (buttons) =>
    buttons.map((btn) => {
      const span = btn.querySelector('.palette__symbol');
      const shape = span.querySelector('svg > *');

      return { type: btn.dataset.addEntity, symbol: span.dataset.symbol, shape: shape.tagName, fill: shape.getAttribute('fill') };
    });

  return page.locator('#build-tools [data-add-entity]').evaluateAll(read);
}

// The symbol and colour each Settings type row has picked, in row order.
function settingsSymbols(page) {
  const read = (rows) =>
    rows.map((row) => ({
      type: row.dataset.typeRow,
      symbol: row.querySelector('sl-select[data-symbol]').value,
      fill: row.querySelector('sl-color-picker[data-color]').value,
    }));

  return page.locator('#settings [data-type-row]').evaluateAll(read);
}

async function paletteSymbolOf(page, type) {
  return (await paletteSymbols(page)).find((entry) => entry.type === type);
}

test('draws each palette type button with the symbol and colour Settings picked for its type', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  await page.click('#settings-toggle');

  const symbols = (await paletteSymbols(page)).map(({ type, symbol, fill }) => ({ type, symbol, fill }));

  // Shoelace defines the Settings controls after the panel renders, and an
  // undefined control has no value yet.
  await expect.poll(() => settingsSymbols(page)).toEqual(symbols);
  expect(await paletteSymbolOf(page, 'paragraph')).toEqual({ type: 'paragraph', symbol: 'cut', shape: 'polygon', fill: '#cdbdec' });
  expect(await paletteSymbolOf(page, 'user')).toEqual({ type: 'user', symbol: 'ellipse', shape: 'ellipse', fill: '#ea9999' });
  await expect(page.locator('#add-paragraph .palette__symbol svg')).toBeVisible();
});

test('redraws a palette type button when Settings changes its colour or symbol and when they are reset', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  await page.click('#settings-toggle');

  await slFill(page, 'sl-color-picker[data-color="paragraph"]', '#112233');
  await expect.poll(() => paletteSymbolOf(page, 'paragraph')).toEqual({ type: 'paragraph', symbol: 'cut', shape: 'polygon', fill: '#112233' });

  await slSelect(page, 'sl-select[data-symbol="paragraph"]', 'ellipse');
  await expect.poll(() => paletteSymbolOf(page, 'paragraph')).toEqual({ type: 'paragraph', symbol: 'ellipse', shape: 'ellipse', fill: '#112233' });

  await page.click('#settings-reset');
  await expect.poll(() => paletteSymbolOf(page, 'paragraph')).toEqual({ type: 'paragraph', symbol: 'cut', shape: 'polygon', fill: '#cdbdec' });
});

test('draws the shape of each note on its palette button', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');

  for (const id of ['#add-event', '#add-api', '#add-callback']) {
    await expect(page.locator(id + ' svg.icon')).toBeVisible();
    expect(await page.locator(id + ' svg.icon').evaluate((svg) => svg.childElementCount)).toBeGreaterThan(0);
  }
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

  // A hexagon is drawn as a 6-cornered polygon, so its ends keep their size.
  const shape = await page.evaluate(() => {
    const node = window.__nexus.cy.getElementById('external.crm_contact');

    return node.style('shape') + ' ' + node.style('shape-polygon-points').split(' ').length / 2;
  });
  expect(shape).toBe('polygon 6');
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
  await expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', true);
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

// The outline boxes of the Find entity field and its search button, with
// their border colours and their inner corner radii.
function findControl(page) {
  return page.evaluate(() => {
    const part = (id) => document.getElementById(id).shadowRoot.querySelector('[part~="base"]');
    const box = (element) => {
      const rect = element.getBoundingClientRect();

      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const field = getComputedStyle(part('search'));
    const button = getComputedStyle(part('search-btn'));

    return {
      field: box(part('search')),
      button: box(part('search-btn')),
      fieldBorder: field.borderTopColor,
      buttonBorder: button.borderTopColor,
      innerRadii: [field.borderTopRightRadius, field.borderBottomRightRadius, button.borderTopLeftRadius, button.borderBottomLeftRadius],
      group: document.getElementById('search').parentElement.getAttribute('role'),
    };
  });
}

for (const theme of dataProviderFindThemes()) {
  test(`joins the Find entity field and its search button into 1 control in the ${theme} theme`, async ({ page }) => {
    await loadExample(page);

    if (theme === 'dark') {
      await page.click('#theme-toggle');
      await expect(page.locator('html')).toHaveClass(/sl-theme-dark/);
    }

    // Shoelace animates border colours, so they match only once the theme
    // change has finished.
    await expect
      .poll(async () => {
        const borders = await findControl(page);

        return borders.buttonBorder === borders.fieldBorder;
      })
      .toBe(true);
    const control = await findControl(page);

    expect(control.group).toBe('search');
    expect(control.button.left).toBeCloseTo(control.field.right - 1, 1);
    expect(control.button.top).toBeCloseTo(control.field.top, 1);
    expect(control.button.bottom).toBeCloseTo(control.field.bottom, 1);
    expect(control.innerRadii).toEqual(['0px', '0px', '0px', '0px']);
  });
}

function dataProviderFindThemes() {
  return ['light', 'dark'];
}

test('keeps the Find entity field and its search button on 1 line when the toolbar wraps', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await loadExample(page);

  const control = await findControl(page);

  expect(control.button.top).toBeCloseTo(control.field.top, 1);
  expect(control.button.left).toBeCloseTo(control.field.right - 1, 1);
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

const MAP = 'paragraph.civictheme_map';

// Where an entity with its visible fields sits once the view stops moving:
// whether it overlaps an open floating panel, whether it stays inside the
// canvas, and how far its centre is from the canvas centre.
function placement(page, id) {
  return page.evaluate((entityId) => {
    const cy = window.__nexus.cy;
    const canvas = cy.container().getBoundingClientRect();
    const fields = cy.nodes('[group="field"]').filter((field) => field.data('entity') === entityId);
    const rendered = cy.getElementById(entityId).union(fields).filter(':visible').renderedBoundingBox();
    const box = { x1: canvas.left + rendered.x1, y1: canvas.top + rendered.y1, x2: canvas.left + rendered.x2, y2: canvas.top + rendered.y2 };
    const panels = [...document.querySelectorAll('.stage__canvas > .panel')].map((panel) => panel.getBoundingClientRect());
    const overlaps = (rect) => box.x1 < rect.right && rect.left < box.x2 && box.y1 < rect.bottom && rect.top < box.y2;

    return {
      animating: cy.animated(),
      underPanel: panels.some(overlaps),
      inCanvas: box.x1 >= canvas.left && box.x2 <= canvas.right && box.y1 >= canvas.top && box.y2 <= canvas.bottom,
      offCentre: Math.round(Math.hypot((box.x1 + box.x2) / 2 - (canvas.left + canvas.right) / 2, (box.y1 + box.y2) / 2 - (canvas.top + canvas.bottom) / 2)),
    };
  }, id);
}

async function findEntity(page, term) {
  await slFill(page, '#search', term);
  await page.click('#search-btn');
}

test('centres the match of Find entity and its fields in the area the open panels leave free', async ({ page }) => {
  await openDiagram(page, 'civictheme');
  await page.click('#entities-toggle');
  await page.click('#table-toggle');
  await expect(page.locator('#table')).toBeVisible();

  await findEntity(page, 'civictheme_map');

  await expect
    .poll(async () => ({ ...(await placement(page, MAP)), offCentre: null }))
    .toEqual({ animating: false, underPanel: false, inCanvas: true, offCentre: null });
});

test('centres an entity focused from the Entities panel in the area the open panels leave free', async ({ page }) => {
  await openDiagram(page, 'civictheme');
  await page.click('#entities-toggle');
  await page.click('#table-toggle');
  await expect(page.locator('#table')).toBeVisible();

  await page.locator('#entity-list .entity-row__name', { hasText: /^Map/ }).click();

  await expect
    .poll(async () => ({ ...(await placement(page, MAP)), offCentre: null }))
    .toEqual({ animating: false, underPanel: false, inCanvas: true, offCentre: null });
});

test('centres the match of Find entity and its fields in the canvas when no panel is open', async ({ page }) => {
  await openDiagram(page, 'civictheme');
  await page.click('#legend-toggle');
  await expect(page.locator('.stage__canvas > .panel')).toHaveCount(0);

  await findEntity(page, 'civictheme_map');

  await expect.poll(() => placement(page, MAP)).toEqual({ animating: false, underPanel: false, inCanvas: true, offCentre: 0 });
});

test('sizes a single docked panel to its content', async ({ page }) => {
  await loadExample(page);

  await page.click('#legend .panel__pin');
  await expect(page.locator('#legend.is-docked')).toBeVisible();

  const sizes = await dockedSizes(page, '#legend');

  expect(sizes.panel).toBeLessThan(sizes.dock);
  expect(sizes.bodyScroll).toBeLessThanOrEqual(sizes.bodyClient + 1);
  expect(sizes.content).toBeGreaterThan(sizes.bodyClient - 12);
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
  await expect(page.locator('#machine-names')).toHaveJSProperty('checked', false);
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

// Draws the node canvas on the path Cytoscape takes for its first draw, then
// again with each element drawn straight onto the canvas, which Cytoscape
// falls back to when it has no layered textures. Returns the field labels
// whose pixels differ by more than anti-aliasing between the 2 draws.
function firstDrawDifferences(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const renderer = cy.renderer();
    const context = renderer.data.contexts[renderer.NODE];
    const { width, height } = context.canvas;
    const ratio = renderer.getPixelRatio();
    const draw = () => {
      renderer.redrawHint('eles', true);
      renderer.render();

      return context.getImageData(0, 0, width, height).data;
    };

    const cache = renderer.data.lyrTxrCache;
    const getLayers = cache.getLayers;

    cache.firstGet = true;
    const first = draw();
    cache.getLayers = () => null;
    const direct = draw();
    cache.getLayers = getLayers;

    return cy
      .nodes('[group="field"]')
      .filter((field) => {
        const box = field.renderedBoundingBox({ includeLabels: false });
        const x1 = Math.max(0, Math.floor(box.x1 * ratio));
        const y1 = Math.max(0, Math.floor(box.y1 * ratio));
        const x2 = Math.min(width, Math.ceil(box.x2 * ratio));
        const y2 = Math.min(height, Math.ceil(box.y2 * ratio));

        for (let y = y1; y < y2; y++) {
          for (let x = x1; x < x2; x++) {
            const i = (y * width + x) * 4;

            if (Math.abs(first[i] - direct[i]) + Math.abs(first[i + 1] - direct[i + 1]) + Math.abs(first[i + 2] - direct[i + 2]) > 60) {
              return true;
            }
          }
        }

        return false;
      })
      .map((field) => field.data('label'));
  });
}

for (const ratio of dataProviderPixelRatios()) {
  test.describe(`on a ${ratio}x display`, () => {
    test.use({ deviceScaleFactor: ratio });

    test('draws the field labels on the first draw as sharp as Cytoscape draws them one by one at 100%', async ({ page }) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      await openDiagram(page, 'civictheme');

      expect(await page.evaluate(() => [window.devicePixelRatio, window.__nexus.cy.zoom()])).toEqual([ratio, 1]);
      expect(await firstDrawDifferences(page)).toEqual([]);
    });
  });
}

function dataProviderPixelRatios() {
  return [1, 2];
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
        // The tag's point narrows by 3 for every 4 it runs from mid-height
        // towards the top or bottom, whatever the width of the tag.
        const edge = (at) => x + halfWidth - (3 * Math.abs(at - y)) / 4;

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

// The label of an entity, as its offset from the box centre in fractions of
// the shape's half-size, and its type caption, as its offset in rendered
// pixels from the centre of the label.
function labelPlacement(page, id) {
  return page.evaluate((nodeId) => {
    const cy = window.__nexus.cy;
    const node = cy.getElementById(nodeId);
    const zoom = cy.zoom();
    const origin = cy.container().getBoundingClientRect();
    const position = node.renderedPosition();
    const label = node.renderedBoundingBox({ includeNodes: false, includeEdges: false, includeOverlays: false });
    const caption = document.querySelector(`#captions .caption--type[data-node-id="${nodeId}"]`).getBoundingClientRect();

    return {
      labelX: (label.x1 + label.x2 - 2 * position.x) / 2 / ((node.width() / 2 + node.padding()) * zoom),
      labelY: (label.y1 + label.y2 - 2 * position.y) / 2 / ((node.height() / 2 + node.padding()) * zoom),
      captionX: Math.round((caption.left + caption.right - label.x1 - label.x2) / 2 - origin.left),
      captionY: Math.round((caption.top + caption.bottom - label.y1 - label.y2) / 2 - origin.top),
    };
  }, id);
}

for (const [symbol, centre] of dataProviderLabelCentres()) {
  test(`centres an entity's label and type caption on the centre point of the ${symbol} symbol`, async ({ page }) => {
    await openDiagram(page, 'example');
    const rounded = await labelPlacement(page, 'node.event');

    expect(rounded.labelX).toBeCloseTo(0, 2);
    expect(rounded.labelY).toBeCloseTo(0, 2);

    await page.click('#settings-toggle');
    await slSelect(page, '#settings sl-select[data-symbol="node"]', symbol);

    // Captions follow the label 1 frame after Cytoscape redraws, so the
    // label and caption are polled together. The type caption keeps its
    // place in the label.
    await expect
      .poll(async () => {
        const placement = await labelPlacement(page, 'node.event');

        return {
          labelX: placement.labelX > centre.x[0] - 0.005 && placement.labelX < centre.x[1] + 0.005,
          labelY: Math.abs(placement.labelY - centre.y) < 0.005,
          captionX: Math.abs(placement.captionX - rounded.captionX) <= 1,
          captionY: Math.abs(placement.captionY - rounded.captionY) <= 1,
        };
      })
      .toEqual({ labelX: true, labelY: true, captionX: true, captionY: true });
  });
}

// The range of the label's x and its y, as fractions of the shape's half-size.
// A tag's label sits at or left of the box centre, towards the tag's body.
function dataProviderLabelCentres() {
  return [
    ['tag', { x: [-0.2, 0], y: 0 }],
    ['pentagon', { x: [0, 0], y: 1 - 2 / Math.sqrt(5) }],
    ['diamond', { x: [0, 0], y: 0 }],
    ['hexagon', { x: [0, 0], y: 0 }],
  ];
}

for (const [symbol, end] of dataProviderFixedEnds()) {
  test(`keeps the ends of the ${symbol} symbol the same size when its name gets longer`, async ({ page }) => {
    await openDiagram(page, 'example');
    await page.click('#settings-toggle');
    await slSelect(page, '#settings sl-select[data-symbol="node"]', symbol);

    // The size of the shape's end in model pixels, and the size the shape
    // gives its end, as a fraction of the half-height.
    const ends = (label) =>
      page.evaluate(
        ([nodeId, text, endIndex]) => {
          const node = window.__nexus.cy.getElementById(nodeId);
          if (text) {
            node.data('label', text);
          }
          const points = node.style('shape-polygon-points').split(' ').map(Number);
          const halfWidth = node.width() / 2 + node.padding();
          const halfHeight = node.height() / 2 + node.padding();

          return { width: node.width(), end: ((points[endIndex[1]] - points[endIndex[0]]) * halfWidth) / halfHeight };
        },
        ['node.event', label, end.points],
      );

    // Points are rounded to 3 places of the half-width, so the end is
    // compared to 1 place.
    await expect.poll(async () => (await ends(null)).end).toBeCloseTo(end.size, 1);
    const short = await ends(null);
    await ends('An event with a much longer name');

    await expect.poll(async () => (await ends(null)).width).toBeGreaterThan(short.width * 1.5);
    expect((await ends(null)).end).toBeCloseTo(end.size, 1);
  });
}

// Each shape's end, as the indexes of 2 x values in its polygon points, and
// the size the shape gives it as a fraction of the half-height.
function dataProviderFixedEnds() {
  return [
    ['tag', { points: [2, 4], size: 0.75 }],
    ['hexagon', { points: [0, 2], size: 0.5 }],
    ['octagon', { points: [2, 4], size: 2 - Math.SQRT2 }],
    ['rhomboid', { points: [2, 4], size: 0.667 }],
  ];
}

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

test('opens the next diagram in the default layout, not the one last picked from the menu', async ({ page }) => {
  await loadExample(page);
  await pickLayout(page, 'lr');

  await page.reload();
  await loadExample(page);

  await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: Columns');
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')))).toBeNull();
});

async function openSettings(page) {
  if (!(await page.locator('#settings').isVisible())) {
    await page.click('#settings-toggle');
  }

  await expect(page.locator('#settings [data-default="layout"]')).toBeVisible();
}

// Turns a new diagram switch in the Settings panel on or off.
async function setDefaultSwitch(page, key, checked) {
  const control = page.locator('#settings [data-default="' + key + '"]');

  if ((await control.evaluate((el) => el.checked)) !== checked) {
    await control.click();
  }

  await expect(control).toHaveJSProperty('checked', checked);
}

// Each case sets 1 new diagram setting, then checks a diagram drawn after a
// reload.
for (const [name, set, check] of dataProviderDiagramDefaults()) {
  test(`opens the next diagram with ${name} from the Settings panel`, async ({ page }) => {
    await loadExample(page);
    await openSettings(page);
    await set(page);

    await page.reload();
    await loadExample(page);

    await check(page);
  });
}

function dataProviderDiagramDefaults() {
  return [
    [
      'the LR layout',
      (page) => slSelect(page, '#settings [data-default="layout"]', 'lr'),
      async (page) => {
        await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: LR');
        expect(await eventLayout(page)).toEqual({ right: true, below: false, turn: 'horizontal' });
      },
    ],
    [
      'Fields off',
      (page) => setDefaultSwitch(page, 'fields', false),
      async (page) => {
        await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', false);
        expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="field"]:visible').length)).toBe(0);
      },
    ],
    [
      'Proxies off',
      (page) => setDefaultSwitch(page, 'proxies', false),
      async (page) => {
        await expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', false);
        expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="proxy"]:visible').length)).toBe(0);
      },
    ],
    [
      'Machine names off',
      (page) => setDefaultSwitch(page, 'machineNames', false),
      async (page) => {
        await expect(page.locator('#machine-names')).toHaveJSProperty('checked', false);
        await expect(page.locator('#captions .caption:not(.caption--type)')).toHaveCount(0);
      },
    ],
    [
      'Edit mode',
      (page) => slSelect(page, '#settings [data-default="mode"]', 'edit'),
      async (page) => {
        await expect(page.locator('#mode-build')).toHaveClass(/is-active/);
        await expect(page.locator('#build-tools')).toBeVisible();
      },
    ],
  ];
}

test('opens each new diagram in the default mode, whatever mode the last one was in', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  await expect(page.locator('#mode-build')).toHaveClass(/is-active/);

  await page.click('#doc-new');

  await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'New content model');
  await expect(page.locator('#mode-view')).toHaveClass(/is-active/);
  await expect(page.locator('#build-tools')).toBeHidden();
});

test('opens the next diagram with Fields on when it opens in Edit mode', async ({ page }) => {
  await loadExample(page);
  await openSettings(page);
  await setDefaultSwitch(page, 'fields', false);
  await slSelect(page, '#settings [data-default="mode"]', 'edit');

  await page.reload();
  await loadExample(page);

  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
});

test('opens a saved diagram where it was saved, with the display settings for new diagrams', async ({ page }) => {
  await loadExample(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#doc-save')]);
  const saved = await download.path();
  const doc = JSON.parse(readFileSync(saved, 'utf8'));
  await openSettings(page);
  await setDefaultSwitch(page, 'fields', false);

  await page.goto('/index.html');
  await page.setInputFiles('#doc-open', saved);
  await waitForGraph(page);

  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', false);
  const positions = await nodePositions(page, '[group="entity"]');
  expect(Object.keys(positions).length).toBeGreaterThan(0);
  expect(positions).toEqual(Object.fromEntries(Object.keys(positions).map((id) => [id, doc.layout[id]])));
});

test('restores the new diagram settings with Reset to defaults', async ({ page }) => {
  await loadExample(page);
  await openSettings(page);
  await slSelect(page, '#settings [data-default="layout"]', 'tb');
  await setDefaultSwitch(page, 'fields', false);

  await page.click('#settings-reset');

  await expect(page.locator('#settings [data-default="layout"]')).toHaveJSProperty('value', 'columns');
  await expect(page.locator('#settings [data-default="fields"]')).toHaveJSProperty('checked', true);

  await page.reload();
  await loadExample(page);

  await expect(page.locator('#layout-run .layout-label')).toHaveText('Layout: Columns');
  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
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

// The ids of an entity's shown fields, in order along `axis`.
function fieldOrder(page, entity, axis) {
  return page.evaluate(
    ([id, along]) =>
      window.__nexus.cy
        .nodes('[group="field"]')
        .not('.hidden')
        .filter((field) => field.data('entity') === id)
        .sort((a, b) => a.position(along) - b.position(along))
        .map((field) => field.id()),
    [entity, axis],
  );
}

// Swaps the first and last of an entity's shown fields along `axis`, each
// with its proxies, the way a user drags them into a new order.
function swapEndFields(page, entity, axis) {
  return page.evaluate(
    ([id, along]) => {
      const cy = window.__nexus.cy;
      const fields = cy
        .nodes('[group="field"]')
        .not('.hidden')
        .filter((field) => field.data('entity') === id)
        .sort((a, b) => a.position(along) - b.position(along));
      const unit = (field) => field.union(cy.nodes('[group="proxy"]').filter((proxy) => proxy.data('field') === field.id()));
      const first = fields.first();
      const last = fields.last();
      const distance = last.position(along) - first.position(along);

      unit(first).shift(along, distance);
      unit(last).shift(along, -distance);
    },
    [entity, axis],
  );
}

// The number of overlapping pairs among an entity's shown fields and proxies.
function fieldOverlaps(page, entity) {
  return page.evaluate((id) => {
    const boxes = window.__nexus.cy
      .nodes('[group="field"], [group="proxy"]')
      .not('.hidden')
      .filter((node) => node.data('entity') === id)
      .map((node) => node.boundingBox({ includeLabels: false }));
    const overlap = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

    return boxes.filter((box, index) => boxes.some((other, otherIndex) => otherIndex > index && overlap(box, other))).length;
  }, entity);
}

for (const [layout, axis] of dataProviderFieldOrderLayouts()) {
  test(`keeps the order of an entity's fields when tidied in the ${layout} layout`, async ({ page }) => {
    await loadExample(page);

    if (layout !== 'columns') {
      await pickLayout(page, layout);
    }

    const laidOut = await fieldOrder(page, 'node.event', axis);
    await swapEndFields(page, 'node.event', axis);
    const wanted = await fieldOrder(page, 'node.event', axis);

    await page.click('#tidy');

    expect(wanted).not.toEqual(laidOut);
    expect(await fieldOrder(page, 'node.event', axis)).toEqual(wanted);
    expect(await fieldOverlaps(page, 'node.event')).toBe(0);
  });
}

function dataProviderFieldOrderLayouts() {
  return [
    ['columns', 'y'],
    ['lr', 'y'],
    ['tb', 'x'],
  ];
}

// The first shown proxy and field of node.event.
function eventMembers(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const first = (group) =>
      cy
        .nodes('[group="' + group + '"]')
        .not('.hidden')
        .filter((node) => node.data('entity') === 'node.event')
        .first()
        .id();

    return { field: first('field'), proxy: first('proxy') };
  });
}

for (const [name, mode, member] of dataProviderTidySelections()) {
  test(`tidies only the entity of ${name}`, async ({ page }) => {
    await loadExample(page);
    const members = await eventMembers(page);

    if (mode === 'edit') {
      await page.click('#mode-build');
    }

    // Pulls 1 of Event's fields out of its column and moves another island
    // away, so a whole-diagram Tidy would move both back.
    await page.evaluate((field) => window.__nexus.cy.getElementById(field).shift({ x: 70, y: 0 }), members.field);
    await dragIslands(page, [['node.news', 600, 300]]);
    await tapNode(page, member === 'entity' ? 'node.event' : members[member]);
    await expect(page.locator('#tidy')).toHaveAttribute('title', /^Tidy up Event: /);
    const before = await roundedPositions(page);
    const group = await page.evaluate(() =>
      window.__nexus.cy
        .nodes()
        .filter((node) => node.id() === 'node.event' || node.data('entity') === 'node.event')
        .map((node) => node.id()),
    );

    await page.click('#tidy');

    const after = await roundedPositions(page);
    const moved = Object.keys(before).filter((id) => before[id].x !== after[id].x || before[id].y !== after[id].y);
    const xs = await page.evaluate(() =>
      window.__nexus.cy
        .nodes('[group="field"]')
        .filter((field) => field.data('entity') === 'node.event')
        .map((field) => Math.round(field.position('x'))),
    );

    expect(moved.length).toBeGreaterThan(0);
    expect(moved.filter((id) => !group.includes(id))).toEqual([]);
    expect(new Set(xs).size).toBe(1);
    await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Tidied Event \(/);
  });
}

function dataProviderTidySelections() {
  return [
    ['a focused entity', 'view', 'entity'],
    ['a focused field', 'view', 'field'],
    ['a focused proxy', 'view', 'proxy'],
    ['an entity open in the Inspector', 'edit', 'entity'],
    ['a field open in the Inspector', 'edit', 'field'],
  ];
}

test('names the entity Tidy will work on in its title until the selection clears', async ({ page }) => {
  await loadExample(page);
  const tidy = page.locator('#tidy');
  const whole = /^Tidy up: straighten each entity/;
  await expect(tidy).toHaveAttribute('title', whole);

  await tapNode(page, 'node.event');
  await expect(tidy).toHaveAttribute('title', /^Tidy up Event: /);

  await page.evaluate(() => window.__nexus.cy.emit('tap'));
  await expect(tidy).toHaveAttribute('title', whole);

  await page.click('#mode-build');
  await tapNode(page, 'node.event');
  await expect(tidy).toHaveAttribute('title', /^Tidy up Event: /);

  await page.click('#mode-view');
  await expect(tidy).toHaveAttribute('title', whole);
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
    session.emit('grabon');
    session.position({ x: eb.x + 120, y: eb.y + 40 });
    session.emit('drag');
    session.emit('dragfreeon');
    return { fieldDx: Math.round(field.position('x') - fb.x), fieldDy: Math.round(field.position('y') - fb.y) };
  });
  expect(move).toEqual({ fieldDx: 120, fieldDy: 40 });

  // A tap on the empty canvas releases the isolation.
  await page.evaluate(() => window.__nexus.cy.emit('tap', [{ target: window.__nexus.cy }]));
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBe(0);
});

// A diagram that fits the canvas at 100%: entity A with 1 field, beside
// entity B.
const MOVE_DOC = {
  nexus: 1,
  title: 'Move',
  entities: [
    { entityType: 'node', bundle: 'a', label: 'A', fields: [{ name: 'field_text', label: 'Text', fieldType: 'string', kind: 'single' }] },
    { entityType: 'node', bundle: 'b', label: 'B', fields: [] },
  ],
  layout: { 'node.a': { x: 0, y: 0 }, 'field:node.a:field_text': { x: 0, y: 150 }, 'node.b': { x: 300, y: 0 } },
};

// Presses a mouse button at a page point, drags by the offset in page pixels
// and releases it.
async function dragFrom(page, from, dx, dy, button = 'left') {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await page.mouse.up({ button });
}

// The page point of a model position on the canvas.
function pagePoint(page, position) {
  return page.evaluate((model) => {
    const cy = window.__nexus.cy;
    const box = cy.container().getBoundingClientRect();
    const pan = cy.pan();
    const zoom = cy.zoom();

    return { x: box.left + pan.x + model.x * zoom, y: box.top + pan.y + model.y * zoom };
  }, position);
}

function panOf(page) {
  return page.evaluate(() => ({ ...window.__nexus.cy.pan() }));
}

function selectedNodes(page) {
  return page.evaluate(() =>
    window.__nexus.cy
      .nodes(':selected')
      .map((node) => node.id())
      .sort(),
  );
}

// An empty spot of MOVE_DOC's canvas, below entity B.
const EMPTY_SPOT = { x: 300, y: 200 };

// How far each node moved from 1 set of positions to another, rounded to
// whole pixels.
function offsets(before, after) {
  const offset = (id) => ({ x: Math.round(after[id].x - before[id].x), y: Math.round(after[id].y - before[id].y) });

  return Object.fromEntries(Object.keys(before).map((id) => [id, offset(id)]));
}

function fadedNodes(page) {
  return page.evaluate(() =>
    window.__nexus.cy
      .nodes('.faded')
      .map((node) => node.id())
      .sort(),
  );
}

for (const [mode, buttons] of dataProviderModes()) {
  test(`pans the canvas dragged with the right mouse button in ${mode} mode`, async ({ page }) => {
    await openDocument(page, MOVE_DOC);
    for (const button of buttons) {
      await page.click(button);
    }
    const before = await nodePositions(page);
    const undo = await page.locator('#undo').getAttribute('title');
    const start = await panOf(page);

    await dragFrom(page, await pagePosition(page, 'node.a'), 90, 60, 'right');
    await dragFrom(page, await pagePoint(page, EMPTY_SPOT), -30, 20, 'right');

    expect(await panOf(page)).toEqual({ x: start.x + 60, y: start.y + 80 });
    expect(await nodePositions(page)).toEqual(before);
    expect(await fadedNodes(page)).toEqual([]);
    await expect(page.locator('#undo')).toHaveAttribute('title', undo);
    await expect(page.locator('#cy')).not.toHaveClass(/is-panning/);
  });

  test(`keeps the canvas still on a left-drag over the empty canvas in ${mode} mode`, async ({ page }) => {
    await openDocument(page, MOVE_DOC);
    for (const button of buttons) {
      await page.click(button);
    }
    const start = await panOf(page);

    await dragFrom(page, await pagePoint(page, EMPTY_SPOT), 90, 60);

    expect(await panOf(page)).toEqual(start);
  });
}

function dataProviderModes() {
  return [
    ['View', ['#mode-view']],
    ['Edit', ['#mode-build']],
    ['Connect', ['#mode-build', '#connect-toggle']],
  ];
}

test('keeps every node in place on a left-drag in View mode', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  const before = await nodePositions(page);

  await dragFrom(page, await pagePosition(page, 'node.a'), 90, 60);

  expect(await nodePositions(page)).toEqual(before);
  expect(await selectedNodes(page)).toEqual([]);
});

test('selects the nodes inside a box dragged on the canvas in Edit mode and moves them together', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  await page.click('#mode-build');
  const before = await nodePositions(page);

  // Cytoscape selects every node the box overlaps, so the box crosses the top
  // halves of A and B and stays clear of A's field.
  const corner = await pagePoint(page, { x: -150, y: -80 });
  const far = await pagePoint(page, { x: 450, y: -5 });
  await dragFrom(page, corner, far.x - corner.x, far.y - corner.y);

  expect(await selectedNodes(page)).toEqual(['node.a', 'node.b']);
  expect(await nodePositions(page)).toEqual(before);

  await dragFrom(page, await pagePosition(page, 'node.a'), 90, 60);

  expect(offsets(before, await nodePositions(page))).toEqual({
    'node.a': { x: 90, y: 60 },
    'field:node.a:field_text': { x: 0, y: 0 },
    'node.b': { x: 90, y: 60 },
  });
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Moved 2 nodes \(/);

  await page.click('#undo');
  expect(await nodePositions(page)).toEqual(before);
});

test('moves a node dragged with the left mouse button in Edit mode as 1 step', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  await page.click('#mode-build');
  const before = await nodePositions(page);

  await dragFrom(page, await pagePosition(page, 'node.b'), 90, 60);

  expect(offsets(before, await nodePositions(page))).toEqual({
    'node.a': { x: 0, y: 0 },
    'field:node.a:field_text': { x: 0, y: 0 },
    'node.b': { x: 90, y: 60 },
  });
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Moved entity “B” \(/);
});

test('isolates an entity on a right-click in View mode and keeps the group locked', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  const before = await nodePositions(page);
  const entity = await pagePosition(page, 'node.a');

  await page.mouse.click(entity.x, entity.y, { button: 'right' });
  expect(await fadedNodes(page)).toEqual(['node.b']);

  await dragFrom(page, await pagePosition(page, 'field:node.a:field_text'), 90, 60);
  expect(await nodePositions(page)).toEqual(before);
  expect(await fadedNodes(page)).toEqual(['node.b']);
});

test('isolates an entity on a right-click in Edit mode and moves the group dragged with the left mouse button', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  await page.click('#mode-build');
  const before = await nodePositions(page);
  const entity = await pagePosition(page, 'node.a');

  await page.mouse.click(entity.x, entity.y, { button: 'right' });
  expect(await fadedNodes(page)).toEqual(['node.b']);
  expect(await nodePositions(page)).toEqual(before);

  await dragFrom(page, await pagePosition(page, 'field:node.a:field_text'), 90, 60);
  const grouped = await nodePositions(page);
  expect(offsets(before, grouped)).toEqual({
    'node.a': { x: 90, y: 60 },
    'field:node.a:field_text': { x: 90, y: 60 },
    'node.b': { x: 0, y: 0 },
  });
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Moved entity “A” with its fields \(/);

  // A node the isolation fades stays where it is, and the isolation holds.
  await dragFrom(page, await pagePosition(page, 'node.b'), 90, 60);
  expect(await nodePositions(page)).toEqual(grouped);
  expect(await fadedNodes(page)).toEqual(['node.b']);
});

test('switches to Edit mode with a node selected when it is double-clicked in View mode', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  const entity = await pagePosition(page, 'node.b');

  await page.mouse.dblclick(entity.x, entity.y);

  await expect(page.locator('#mode-build')).toHaveClass(/is-active/);
  await expect(page.locator('#build-tools')).toBeVisible();
  await expect(page.locator('#inspector')).toBeVisible();
  expect(await selectedNodes(page)).toEqual(['node.b']);
  expect(await fadedNodes(page)).toEqual([]);
});

// The first click focuses the node and animates the view to it, so the
// second click of a quick double-click can land beside the node.
test('opens the node the first click of a double-click hit when the second click lands beside it', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  const entity = await pagePosition(page, 'node.b');
  const empty = await pagePoint(page, EMPTY_SPOT);

  await page.mouse.click(entity.x, entity.y);
  await page.mouse.click(empty.x, empty.y);

  await expect(page.locator('#mode-build')).toHaveClass(/is-active/);
  await expect(page.locator('#inspector')).toBeVisible();
  await expect.poll(() => selectedNodes(page)).toEqual(['node.b']);
});

// Centres a node in the view, so no panel covers it, and clicks it.
async function clickNode(page, id, modifiers = []) {
  await page.evaluate((nodeId) => {
    window.__nexus.cy.center(window.__nexus.cy.getElementById(nodeId));
  }, id);
  const point = await pagePosition(page, id);

  await page.mouse.move(point.x, point.y);
  for (const key of modifiers) {
    await page.keyboard.down(key);
  }
  await page.mouse.down();
  await page.mouse.up();
  for (const key of modifiers) {
    await page.keyboard.up(key);
  }
}

// A page point on the canvas clear of every element and every panel.
function emptyCanvasPoint(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;
    const box = cy.container().getBoundingClientRect();
    const canvas = cy.container().querySelector('canvas');

    for (let x = 20; x < box.width; x += 23) {
      for (let y = 20; y < box.height; y += 23) {
        const hit = cy.elements(':visible').some((ele) => {
          const bounds = ele.renderedBoundingBox();
          return x > bounds.x1 - 6 && x < bounds.x2 + 6 && y > bounds.y1 - 6 && y < bounds.y2 + 6;
        });
        const top = document.elementFromPoint(box.left + x, box.top + y);

        if (!hit && top && top.closest('canvas') && cy.container().contains(top) && canvas) {
          return { x: box.left + x, y: box.top + y };
        }
      }
    }

    return null;
  });
}

test('keeps a field clicked in Edit mode selected while the Inspector shows it', async ({ page }) => {
  await editExample(page);

  await clickNode(page, TRACK_FIELD);

  await expect(page.locator('#inspector .insp__title')).toHaveText('Field');
  await expect.poll(() => selectedNodes(page)).toEqual([TRACK_FIELD]);
  await page.waitForTimeout(300);
  expect(await selectedNodes(page)).toEqual([TRACK_FIELD]);
});

// Drags a selection box around a node from just outside its top left corner,
// holding the given keys.
async function boxSelect(page, id, modifiers = []) {
  const box = await page.evaluate((nodeId) => {
    const cy = window.__nexus.cy;
    cy.center(cy.getElementById(nodeId));
    const origin = cy.container().getBoundingClientRect();
    const bounds = cy.getElementById(nodeId).renderedBoundingBox();

    return { x1: origin.left + bounds.x1 - 12, y1: origin.top + bounds.y1 - 12, x2: origin.left + bounds.x2 + 12, y2: origin.top + bounds.y2 + 12 };
  }, id);

  await page.mouse.move(box.x1, box.y1);
  for (const key of modifiers) {
    await page.keyboard.down(key);
  }
  await page.mouse.down();
  await page.mouse.move(box.x2, box.y2, { steps: 8 });
  await page.mouse.up();
  for (const key of modifiers) {
    await page.keyboard.up(key);
  }
}

test('closes the Inspector when a box selection leaves its node out', async ({ page }) => {
  await editExample(page);
  await clickNode(page, TRACK_FIELD);
  await expect(page.locator('#inspector')).toBeVisible();

  await boxSelect(page, 'node.speaker');

  await expect(page.locator('#inspector')).toBeHidden();
  await expect(page.locator('#handles .handle')).toHaveCount(0);
  expect(await selectedNodes(page)).toEqual(['node.speaker']);
});

test('keeps the Inspector when a shift box selection adds to its node', async ({ page }) => {
  await editExample(page);
  await clickNode(page, TRACK_FIELD);

  await boxSelect(page, 'node.speaker', ['Shift']);

  await expect.poll(() => selectedNodes(page)).toEqual([TRACK_FIELD, 'node.speaker']);
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#inspector .insp__title')).toHaveText('Field');
});

test('shows the + handles only around an entity the Inspector shows', async ({ page }) => {
  await editExample(page);
  await clickNode(page, TRACK_FIELD);
  await expect(page.locator('#handles .handle')).toHaveCount(0);

  await page.click('#inspector [data-crumb="node.session"]');
  await expect(page.locator('#handles .handle')).toHaveCount(4);

  await page.locator('#inspector .insp__field', { hasText: 'field_speakers' }).click();
  await expect(page.locator('#inspector .insp__title')).toHaveText('Field');
  await expect(page.locator('#handles .handle')).toHaveCount(0);
});

for (const [name, act, expected] of dataProviderInspectorSelections()) {
  test(`selects on the canvas the node the Inspector shows after ${name}`, async ({ page }) => {
    await editExample(page);
    await clickNode(page, TRACK_FIELD);
    await expect.poll(() => selectedNodes(page)).toEqual([TRACK_FIELD]);

    await act(page);

    await expect.poll(() => selectedNodes(page)).toEqual(expected);
  });
}

function dataProviderInspectorSelections() {
  return [
    ['its breadcrumb opens the entity', (page) => page.click('#inspector [data-crumb="node.session"]'), ['node.session']],
    [
      'the entity form opens another of its fields',
      async (page) => {
        await page.click('#inspector [data-crumb="node.session"]');
        await page.locator('#inspector .insp__field', { hasText: 'field_speakers' }).click();
      },
      ['field:node.session:field_speakers'],
    ],
    ['a click on a proxy opens its entity', (page) => clickNode(page, 'proxy:' + TRACK_FIELD + '>' + TRACKS), [TRACKS]],
    [
      'a click on the empty canvas',
      async (page) => {
        const point = await emptyCanvasPoint(page);
        await page.mouse.click(point.x, point.y);
      },
      [TRACK_FIELD],
    ],
    [
      'a relabel is undone and redone',
      async (page) => {
        await slFill(page, '#inspector sl-input:not([data-machine-name])', 'Stream');
        await page.click('#undo');
        await page.click('#redo');
      },
      [TRACK_FIELD],
    ],
    [
      'a shift-click adds another field',
      (page) => clickNode(page, 'field:node.session:field_speakers', ['Shift']),
      ['field:node.session:field_speakers', TRACK_FIELD],
    ],
  ];
}

test('keeps View mode when the canvas is double-clicked', async ({ page }) => {
  await openDocument(page, MOVE_DOC);
  const empty = await pagePoint(page, EMPTY_SPOT);

  await page.mouse.dblclick(empty.x, empty.y);

  await expect(page.locator('#mode-view')).toHaveClass(/is-active/);
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

test('shows a hovered control description in place of the status bar tips', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loadExample(page);

  await page.locator('#layout-run').hover();
  await expect(page.locator('#statusbar-hint')).toHaveText(LAYOUT_HINT);
  await expect(page.locator('#statusbar-hint')).toBeVisible();
  await expect(page.locator('#statusbar .statusbar__tips')).toBeHidden();
  expect((await page.locator('#statusbar-hint').boundingBox()).width).toBeGreaterThan(200);

  await page.locator('#cy').hover();
  await expect(page.locator('#statusbar-hint')).toHaveText('');
  await expect(page.locator('#statusbar .statusbar__tips')).toBeVisible();
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

test('puts the display switches at the left end of the status bar', async ({ page }) => {
  await loadExample(page);

  const parts = await page.evaluate(() => [...document.querySelector('#statusbar').children].map((el) => el.id || el.className));
  expect(parts).toEqual(['statusbar__display', 'statusbar-hint', 'statusbar__tips', 'statusbar__zoom']);

  const switches = await page.evaluate(() =>
    [...document.querySelectorAll('.statusbar__display > *')].map((el) => [el.tagName.toLowerCase(), el.id, el.textContent, el.dataset.shortcut]),
  );
  expect(switches).toEqual([
    ['sl-switch', 'fields-toggle', 'Fields', 'F'],
    ['sl-switch', 'proxy-toggle', 'Proxies', 'P'],
    ['sl-switch', 'machine-names', 'Machine names', 'M'],
  ]);
  await expect(page.locator('.toolbar sl-switch, .toolbar #fields-toggle, .toolbar #proxy-toggle, .toolbar #machine-names')).toHaveCount(0);
});

for (const side of dataProviderSwitchClickSides()) {
  test(`turns a display switch off and on again with a click on its ${side}`, async ({ page }) => {
    await loadExample(page);
    const fields = page.locator('#fields-toggle');
    const box = await fields.boundingBox();
    const position = { x: side === 'track' ? 4 : box.width - 4, y: box.height / 2 };
    const detailed = await page.evaluate(() => window.__nexus.cy.nodes(':visible').length);

    await fields.click({ position: position });
    await expect(fields).toHaveJSProperty('checked', false);
    expect(await page.evaluate(() => window.__nexus.cy.nodes(':visible').length)).toBeLessThan(detailed);

    await fields.click({ position: position });
    await expect(fields).toHaveJSProperty('checked', true);
    expect(await page.evaluate(() => window.__nexus.cy.nodes(':visible').length)).toBe(detailed);
  });
}

function dataProviderSwitchClickSides() {
  return ['track', 'label'];
}

test('turns a focused display switch off with Space', async ({ page }) => {
  await loadExample(page);

  await page.locator('#machine-names').evaluate((el) => el.focus());
  await page.keyboard.press('Space');

  await expect(page.locator('#machine-names')).toHaveJSProperty('checked', false);
  await expect(page.locator('#captions .caption:not(.caption--type)')).toHaveCount(0);
});

test('echoes a hovered display switch description into the status bar', async ({ page }) => {
  await loadExample(page);

  await page.locator('#proxy-toggle').hover();
  await expect(page.locator('#statusbar-hint')).toHaveText('Show references as semi-opaque proxies instead of long edges');
});

for (const width of dataProviderStatusbarWidths()) {
  test(`keeps the display switches and the zoom controls in the window and clear of each other ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width: width, height: 800 });
    await loadExample(page);

    const box = (selector) => page.locator(selector).boundingBox();
    const [display, zoom, statusbar, stage] = await Promise.all(['.statusbar__display', '.statusbar__zoom', '#statusbar', '#stage-root'].map(box));
    const apart = display.x + display.width <= zoom.x || display.y + display.height <= zoom.y;

    expect(apart).toBe(true);
    expect(Math.max(display.x + display.width, zoom.x + zoom.width)).toBeLessThanOrEqual(width);
    expect(Math.min(display.x, zoom.x)).toBeGreaterThanOrEqual(0);
    expect(stage.y + stage.height).toBeLessThanOrEqual(statusbar.y);
    expect(statusbar.y + statusbar.height).toBeLessThanOrEqual(800);
  });
}

function dataProviderStatusbarWidths() {
  return [360, 420, 640, 641, 1280];
}

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

// The space below the lowest control of each section of the tools row, in
// whole pixels.
function toolbarSectionSlack(page) {
  return page.evaluate(() => {
    const sections = [...document.querySelectorAll('.toolbar__tools > .toolbar__section')];

    return sections.map((section) => {
      const bottom = Math.max(...[...section.children].map((control) => control.getBoundingClientRect().bottom));

      return Math.round(section.getBoundingClientRect().bottom - bottom);
    });
  });
}

test('groups the toolbar tools into sections in order', async ({ page }) => {
  await expect(page.locator('.toolbar__tools > :not(.toolbar__section)')).toHaveCount(0);

  expect(await toolbarSections(page)).toEqual([
    ['doc-new', 'doc-import', 'doc-open-btn', 'doc-save', 'export-run', 'export-choose'],
    ['undo', 'redo'],
    ['mode-view', 'mode-build'],
    ['search', 'search-btn'],
    ['layout-run', 'layout-choose', 'tidy'],
    ['entities-toggle', 'table-toggle', 'legend-toggle', 'history-toggle'],
  ]);
});

test('ends every toolbar section but the last in a separator', async ({ page }) => {
  await page.setViewportSize({ width: 3000, height: 800 });
  await loadExample(page);

  const shown = { separator: 'visible', lineEnd: false };
  await expect.poll(() => toolbarSeparators(page)).toEqual([shown, shown, shown, shown, shown, { separator: 'none', lineEnd: true }]);
});

for (const width of dataProviderWrappedToolbarWidths()) {
  test(`hides the separator that ends each toolbar line ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width: width, height: 800 });
    await loadExample(page);

    await expect.poll(async () => misplacedSeparators(await toolbarSeparators(page))).toEqual([]);
    expect(await toolbarSeparators(page)).toHaveLength(6);
    expect(await hiddenSeparators(page)).not.toEqual([]);
  });
}

function dataProviderWrappedToolbarWidths() {
  return [1440, 1280, 1000, 420];
}

test('hides the toolbar separators that end a line as the window narrows and shows them as it widens', async ({ page }) => {
  await page.setViewportSize({ width: 3000, height: 800 });
  await loadExample(page);
  await expect.poll(() => toolbarSeparators(page)).toHaveLength(6);

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

test('keeps each toolbar section as tall as its controls when its separator no longer fits beside them', async ({ page }) => {
  await page.setViewportSize({ width: 3000, height: 800 });
  await loadExample(page);

  // A window that leaves the row 8px wider than the first section's controls,
  // too narrow for the separator after them.
  const width = await page.evaluate(() => {
    const row = document.querySelector('.toolbar__tools').getBoundingClientRect();
    const section = document.querySelector('.toolbar__tools > .toolbar__section');
    const controls = section.lastElementChild.getBoundingClientRect().right - section.getBoundingClientRect().left;

    return Math.ceil(controls + 8 + window.innerWidth - row.width);
  });

  await page.setViewportSize({ width: width, height: 800 });
  await expect.poll(() => toolbarSectionSlack(page)).toEqual([0, 0, 0, 0, 0, 0]);
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

  const shapes = await page.evaluate(() => {
    const vocab = window.__nexus.cy.nodes('[group="entity"][entityType="taxonomy_term"]').first();

    return {
      node: window.__nexus.cy.nodes('[group="entity"][entityType="node"]').first().style('shape'),
      vocab: vocab.style('shape'),
      vocabCorners: vocab.style('shape-polygon-points').split(' ').length / 2,
    };
  });
  expect(shapes.node).toBe('round-rectangle');
  // A tag is drawn as a 5-cornered polygon, so its point keeps its size.
  expect(shapes.vocab).toBe('polygon');
  expect(shapes.vocabCorners).toBe(5);

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

// How the mode frame draws: its display, border width and colour, and
// whether it takes pointer events.
function modeFrame(page) {
  return page.locator('#mode-frame').evaluate((el) => {
    const style = getComputedStyle(el);

    return { display: style.display, width: style.borderTopWidth, color: style.borderTopColor, pointerEvents: style.pointerEvents };
  });
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const AMBER = 'rgb(245, 158, 11)';

test('frames the canvas in the colour of the mode', async ({ page }) => {
  await loadExample(page);
  expect(await modeFrame(page)).toEqual({ display: 'block', width: '5px', color: TRANSPARENT, pointerEvents: 'none' });

  await page.click('#mode-build');
  expect(await modeFrame(page)).toEqual({ display: 'block', width: '5px', color: AMBER, pointerEvents: 'none' });

  await page.click('#mode-view');
  expect((await modeFrame(page)).color).toBe(TRANSPARENT);
});

test('keeps the mode frame inside the canvas, off the docked panels and out of the way of the pointer', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  await page.click('#legend .panel__pin');
  await expect(page.locator('#legend')).toHaveClass(/is-docked/);

  const frame = await page.locator('#mode-frame').boundingBox();
  const canvas = await page.locator('.stage__canvas').boundingBox();
  const rail = await page.locator('#dock-right').boundingBox();
  expect(frame).toEqual(canvas);
  expect(frame.x + frame.width).toBeLessThanOrEqual(rail.x);

  // A point in the frame's band reaches the canvas under it.
  const hit = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y).closest('#cy')), { x: frame.x + 2, y: frame.y + frame.height / 2 });
  expect(hit).toBe(true);
});

test('sets the mode frame from Settings and keeps it across reloads', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  await page.click('#settings-toggle');

  await slFill(page, '#settings sl-color-picker[data-frame-color="edit"]', '#112233');
  await expect.poll(async () => (await modeFrame(page)).color).toBe('rgb(17, 34, 51)');

  await slFill(page, '#settings sl-color-picker[data-frame-color="view"]', '#445566');
  await page.click('#mode-view');
  await expect.poll(async () => (await modeFrame(page)).color).toBe('rgb(68, 85, 102)');

  await page.click('#frame-toggle');
  await expect.poll(async () => (await modeFrame(page)).display).toBe('none');
  await expect(page.locator('#settings sl-color-picker[data-frame-color="view"]')).toHaveAttribute('disabled', '');

  // The panel layout is saved after a short delay, so the reload waits for
  // it to keep Settings open.
  await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('nexusLayout') || '{}').panels?.settings?.open === true);
  await page.reload();
  await loadExample(page);
  expect((await modeFrame(page)).display).toBe('none');

  // The reload keeps the open panels but not their stack, so Settings is
  // raised over the Legend.
  await page.click('#settings .panel__title');
  await page.click('#frame-toggle');
  await expect.poll(() => modeFrame(page)).toEqual({ display: 'block', width: '5px', color: 'rgb(68, 85, 102)', pointerEvents: 'none' });
  await page.click('#mode-build');
  expect((await modeFrame(page)).color).toBe('rgb(17, 34, 51)');
});

test('leaves the mode frame out of an SVG export', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  expect((await modeFrame(page)).color).toBe(AMBER);

  const svg = readFileSync(await (await exportFrom(page, 'svg')).path(), 'utf8');

  expect(svg).toContain('<svg');
  expect(svg.toLowerCase()).not.toContain('#f59e0b');
  expect(svg).not.toContain(AMBER);
});

test('restores the mode frame with Reset to defaults', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  await page.click('#settings-toggle');

  await slFill(page, '#settings sl-color-picker[data-frame-color="edit"]', '#112233');
  await page.click('#frame-toggle');
  await expect.poll(async () => (await modeFrame(page)).display).toBe('none');

  await page.click('#settings-reset');

  await expect.poll(() => modeFrame(page)).toEqual({ display: 'block', width: '5px', color: AMBER, pointerEvents: 'none' });
  await expect.poll(() => page.evaluate(() => document.getElementById('frame-toggle').checked)).toBe(true);
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

// Opens Settings with a custom type, then docks it in the right rail when
// asked, narrowed to the rail's minimum width when asked.
async function openTypeSettings(page, placement) {
  await loadExample(page);
  await page.click('#settings-toggle');
  await page.fill('#settings [data-new-type]', 'widget');
  await page.click('#settings [data-add-type]');

  if (placement === 'floating') {
    return;
  }

  await page.click('#settings .panel__pin');
  await expect(page.locator('#dock-right #settings')).toHaveCount(1);

  if (placement === 'narrowest rail') {
    const handle = await page.locator('#dock-right .dock__resize').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 120);
    await page.mouse.down();
    await page.mouse.move(handle.x + 400, handle.y + 120, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await page.locator('#dock-right').boundingBox()).width).toBe(220);
  }
}

// Each type row and the add row as the number of lines its cells take, the
// left edge of its color, symbol and +/- cells, and whether a cell crosses
// the right edge of the settings body.
function typeRowLayout(page) {
  return page.evaluate(() => {
    const body = document.querySelector('#settings .settings-body').getBoundingClientRect();

    return [...document.querySelectorAll('#settings .type-row')].map((row) => {
      const cells = [...row.children].map((cell) => cell.getBoundingClientRect()).sort((a, b) => a.top - b.top);
      const left = (selector) => (row.querySelector(selector) ? Math.round(row.querySelector(selector).getBoundingClientRect().left) : null);
      let lines = 0;
      let bottom = -Infinity;

      for (const cell of cells) {
        if (cell.top >= bottom - 1) {
          lines++;
        }

        bottom = Math.max(bottom, cell.bottom);
      }

      return {
        lines: lines,
        color: left('sl-color-picker'),
        symbol: left('sl-select'),
        action: left('sl-button'),
        overflow: cells.some((cell) => cell.right > body.right + 0.5),
      };
    });
  });
}

// The value every row shares for a key, or the distinct values when the
// rows differ.
function shared(rows, key) {
  const values = [...new Set(rows.map((row) => row[key]).filter((value) => value !== null))];

  return values.length === 1 ? values[0] : values;
}

for (const placement of dataProviderOneLineTypeSettings()) {
  test(`lays out each entity type and the add form on 1 line in columns in a ${placement}`, async ({ page }) => {
    await openTypeSettings(page, placement);

    const rows = await typeRowLayout(page);

    expect(rows.length).toBe(9);
    expect(rows.map((row) => row.lines)).toEqual(Array(9).fill(1));
    expect(rows.some((row) => row.overflow)).toBe(false);
    expect(typeof shared(rows, 'color')).toBe('number');
    expect(typeof shared(rows, 'symbol')).toBe('number');
    expect(typeof shared(rows, 'action')).toBe('number');
    await expect(page.locator('#settings .settings-body')).not.toHaveClass(/is-narrow/);
  });
}

function dataProviderOneLineTypeSettings() {
  return ['floating panel', 'side rail'];
}

test('puts each entity type label and the new type names above their controls in the narrowest side rail', async ({ page }) => {
  await openTypeSettings(page, 'narrowest rail');
  await expect(page.locator('#settings .settings-body')).toHaveClass(/is-narrow/);

  const rows = await typeRowLayout(page);

  expect(rows.map((row) => row.lines)).toEqual(Array(9).fill(2));
  expect(rows.some((row) => row.overflow)).toBe(false);
  expect(typeof shared(rows, 'color')).toBe('number');
  expect(typeof shared(rows, 'symbol')).toBe('number');
  expect(typeof shared(rows, 'action')).toBe('number');
});

test('removes a custom type with its minus button and offers none on the built-in types', async ({ page }) => {
  await openTypeSettings(page, 'floating panel');

  await expect(page.locator('#settings [data-remove-type]')).toHaveCount(1);
  const remove = page.locator('#settings [data-type-row="widget"] [data-remove-type="widget"]');
  await expect(remove).toHaveAttribute('aria-label', 'Remove Widget');
  await expect(remove.locator('svg.icon')).toHaveCount(1);

  await remove.click();

  await expect(page.locator('#settings [data-type-row="widget"]')).toHaveCount(0);
  await expect(page.locator('#settings [data-new-type]')).toBeFocused();
  await expect(page.locator('#settings [data-remove-type]')).toHaveCount(0);
});

test('adds a custom type with the plus button and empties the new type names', async ({ page }) => {
  await loadExample(page);
  await page.click('#settings-toggle');
  await expect(page.locator('#settings [data-add-type]')).toHaveAttribute('aria-label', 'Add a custom entity type');
  await expect(page.locator('#settings [data-add-type]')).toHaveText('');

  await page.fill('#settings [data-new-type]', 'gadget');
  await page.fill('#settings input[placeholder="Label"]', 'Gadget part');
  await page.click('#settings [data-add-type]');

  await expect(page.locator('#settings [data-type-row="gadget"] .type-row__label')).toHaveText('Gadget part');
  await expect(page.locator('#settings [data-new-type]')).toHaveValue('');
  await expect(page.locator('#settings input[placeholder="Label"]')).toHaveValue('');
});

test('draws the picked symbol in its select and names it in the title', async ({ page }) => {
  await loadExample(page);
  await page.click('#settings-toggle');
  const select = page.locator('#settings sl-select[data-symbol="node"]');
  await expect(select).toHaveAttribute('title', 'Symbol: Rounded rectangle');
  await expect(select.locator(':scope > .type-row__preview rect')).toHaveCount(1);

  await slSelect(page, '#settings sl-select[data-symbol="node"]', 'diamond');

  await expect(select).toHaveAttribute('title', 'Symbol: Diamond');
  await expect(select.locator(':scope > .type-row__preview polygon')).toHaveCount(1);
});

for (const placement of dataProviderSymbolListPlacements()) {
  test(`opens the symbol list inside the window in a ${placement}`, async ({ page }) => {
    await openTypeSettings(page, placement);
    const select = page.locator('#settings sl-select[data-symbol="node"]');

    await select.click();
    await expect(select).toHaveJSProperty('open', true);

    const box = await select.evaluate((el) => el.shadowRoot.querySelector('[part~="listbox"]').getBoundingClientRect().toJSON());
    const width = await page.evaluate(() => document.documentElement.clientWidth);

    expect(box.width).toBeGreaterThan(150);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(width);
  });
}

function dataProviderSymbolListPlacements() {
  return ['floating panel', 'narrowest rail'];
}

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
    session.emit('grabon');
    session.position({ x: start.x + 120, y: start.y + 40 });
    session.emit('drag');
    session.emit('dragfreeon');
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

// Records each key pressed with a modifier that the page keeps from the
// browser. The listener runs last, after the shortcut listener.
function recordKeptKeys(page) {
  return page.evaluate(() => {
    window.keptKeys = [];
    window.addEventListener('keydown', (evt) => {
      if ((evt.ctrlKey || evt.metaKey) && evt.defaultPrevented && !['Control', 'Meta', 'Shift'].includes(evt.key)) {
        window.keptKeys.push(evt.key);
      }
    });
  });
}

function keptKeys(page) {
  return page.evaluate(() => window.keptKeys);
}

// The ids of the visible nodes whose boxes overlap the box of a node.
function overlapsOf(page, id) {
  return page.evaluate((nodeId) => {
    const cy = window.__nexus.cy;
    const node = cy.getElementById(nodeId);
    const box = node.boundingBox();
    const overlapping = cy
      .nodes(':visible')
      .not(node)
      .filter((other) => {
        const o = other.boundingBox();

        return o.x1 < box.x2 && box.x1 < o.x2 && o.y1 < box.y2 && box.y1 < o.y2;
      });

    return overlapping.map((other) => other.id());
  }, id);
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

  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
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
    ['Fields', 'f', (page) => expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', false)],
    ['Proxies', 'p', (page) => expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', false)],
    ['Machine names', 'm', (page) => expect(page.locator('#machine-names')).toHaveJSProperty('checked', false)],
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
  test(`zooms the diagram instead of the page with ${name} and =, - and 0`, async ({ page }) => {
    await loadExample(page);
    await page.keyboard.press('0');
    await recordKeptKeys(page);

    await page.keyboard.press(modifier + '+=');
    expect(await zoomLevel(page)).toBeCloseTo(1.25, 5);
    await page.keyboard.press(modifier + '++');
    expect(await zoomLevel(page)).toBeCloseTo(1.5625, 5);
    await page.keyboard.press(modifier + '+-');
    expect(await zoomLevel(page)).toBeCloseTo(1.25, 5);
    await page.keyboard.press(modifier + '+0');
    expect(await zoomLevel(page)).toBeCloseTo(1, 5);

    expect(await keptKeys(page)).toEqual(['=', '+', '-', '0']);
  });
}

test('keeps the browser zoom keys from the page on the landing screen and under a dialog', async ({ page }) => {
  await recordKeptKeys(page);
  await page.keyboard.press('Control+=');
  await page.keyboard.press('Control+-');

  await page.click('#new-btn');
  await page.click('#about-toggle');
  await expect(page.locator('#about-dialog')).toHaveAttribute('open', '');
  await page.keyboard.press('Control+0');
  await page.keyboard.press('Control+_');

  expect(await keptKeys(page)).toEqual(['=', '-', '0', '_']);
});

test('keeps a pinch outside the canvas from zooming the page and zooms the diagram with a pinch on it', async ({ page }) => {
  await loadExample(page);

  const kept = await page.evaluate(() =>
    ['.toolbar', '#statusbar'].map((selector) => {
      const target = document.querySelector(selector);
      const wheel = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
      const gesture = new Event('gesturechange', { bubbles: true, cancelable: true });

      return [!target.dispatchEvent(wheel), !target.dispatchEvent(gesture)];
    }),
  );
  expect(kept).toEqual([
    [true, true],
    [true, true],
  ]);

  await page.keyboard.press('0');
  const box = await page.locator('#cy').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');

  await expect.poll(() => zoomLevel(page)).toBeGreaterThan(1);
});

test('places an entity created from a palette button clear of the entity at the centre of the view', async ({ page }) => {
  await loadExample(page);
  await page.click('#mode-build');
  await page.evaluate(() => window.__nexus.cy.center(window.__nexus.cy.getElementById('node.event')));

  await page.click('[data-add-entity="media"]');
  await slFill(page, '[data-new-bundle]', 'photo');
  await page.click('[data-create-entity]');

  expect(await overlapsOf(page, 'media.photo')).toEqual([]);
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('media.photo').visible())).toBe(true);
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
    await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
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
  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', true);
  await expect(page.locator('#entities')).toHaveCount(0);
  await expect(page.locator('#about-dialog')).not.toBeVisible();
  expect(await entityCount(page)).toBeGreaterThan(0);
});

test('leaves letter keys to a focused select', async ({ page }) => {
  await selectTrackField(page);
  await page.locator('#inspector sl-select[data-cardinality]').click();

  await page.keyboard.press('m');

  await expect(page.locator('#machine-names')).toHaveJSProperty('checked', true);
});

test('leaves letter keys to an open menu', async ({ page }) => {
  await loadExample(page);
  await page.keyboard.press('Control+Shift+E');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#export-menu sl-menu-item[value="png"]')).toBeFocused();

  await page.keyboard.press('p');

  await expect(page.locator('#proxy-toggle')).toHaveJSProperty('checked', true);
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
  await expect(page.locator('#fields-toggle')).toHaveJSProperty('checked', false);

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
