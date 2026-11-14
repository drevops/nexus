import { test, expect } from '@playwright/test';
import { loadExample, openFrom, tapNode, topmostOf } from './helpers.js';

test.describe('Panels', { tag: '@runner-1' }, () => {
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

  test('starts each panel header with a grip handle and an icon before the title', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    for (const id of ['legend', 'entities']) {
      const classes = await page.locator('#' + id + ' .panel__head > *').evaluateAll((children) => children.slice(0, 3).map((child) => child.className));

      expect(classes).toEqual(['panel__grip', 'panel__icon', 'panel__title']);
      await expect(page.locator('#' + id + ' .panel__grip svg')).toBeVisible();
      await expect(page.locator('#' + id + ' .panel__icon svg')).toBeVisible();
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

    await openFrom(page, 'import');
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

  test('sizes a single docked panel to its content', async ({ page }) => {
    await loadExample(page);

    await page.click('#legend .panel__pin');
    await expect(page.locator('#legend.is-docked')).toBeVisible();

    const sizes = await dockedSizes(page, '#legend');

    expect(sizes.panel).toBeLessThan(sizes.dock);
    expect(sizes.bodyScroll).toBeLessThanOrEqual(sizes.bodyClient + 1);
    expect(sizes.content).toBeGreaterThan(sizes.bodyClient - 12);
  });

  // Drags a resize handle of a floating panel by the given distances.
  async function dragPanelHandle(page, selector, handle, dx, dy) {
    const box = await page.locator(selector + ' .panel__resize--' + handle).boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 6 });
    await page.mouse.up();
  }

  // The edges of an element's box.
  async function edgesOf(locator) {
    const box = await locator.boundingBox();

    return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
  }

  function expectEdges(actual, expected) {
    for (const edge of Object.keys(expected)) {
      expect(Math.abs(actual[edge] - expected[edge]), edge).toBeLessThanOrEqual(1);
    }
  }

  for (const [handle, dx, dy, moved] of dataProviderPanelHandles()) {
    test('resizes a floating panel from its ' + handle + ' handle and keeps the other edges in place', async ({ page }) => {
      await loadExample(page);
      await page.click('#table-toggle');

      const panel = page.locator('#table');
      const before = await edgesOf(panel);

      await dragPanelHandle(page, '#table', handle, dx, dy);

      const expected = { ...before };
      moved.forEach((edge) => {
        expected[edge] += edge === 'bottom' ? dy : dx;
      });

      expectEdges(await edgesOf(panel), expected);
    });
  }

  // Each case shrinks the fields panel, which starts at the canvas's right
  // edge, and names the edges that move.
  function dataProviderPanelHandles() {
    return [
      ['left', 120, 30, ['left']],
      ['right', -120, 30, ['right']],
      ['bottom', 30, -100, ['bottom']],
      ['bottom-left', 120, -100, ['left', 'bottom']],
      ['bottom-right', -120, -100, ['right', 'bottom']],
    ];
  }

  test('grows a floating panel from its left edge and its bottom-right corner', async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');

    const panel = page.locator('#table');
    const before = await edgesOf(panel);

    await dragPanelHandle(page, '#table', 'left', -60, 0);
    expectEdges(await edgesOf(panel), { ...before, left: before.left - 60 });

    await dragPanelHandle(page, '#table', 'bottom-right', -160, -120);
    const shrunk = await edgesOf(panel);
    await dragPanelHandle(page, '#table', 'bottom-right', 60, 40);
    expectEdges(await edgesOf(panel), { ...shrunk, right: shrunk.right + 60, bottom: shrunk.bottom + 40 });
  });

  test('keeps a resized panel inside the canvas and above its minimum size', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    const panel = page.locator('#entities');
    const canvas = await edgesOf(page.locator('.stage__canvas'));

    await dragPanelHandle(page, '#entities', 'bottom-right', 3000, 3000);

    const largest = await edgesOf(panel);
    expect(largest.right).toBeLessThanOrEqual(canvas.right);
    expect(largest.bottom).toBeLessThanOrEqual(canvas.bottom);

    await dragPanelHandle(page, '#entities', 'left', -3000, 0);
    expect(Math.abs((await edgesOf(panel)).left - canvas.left)).toBeLessThanOrEqual(1);

    // The panel shrinks with the window, so its handles stay in reach.
    await page.setViewportSize({ width: 760, height: 560 });

    const shrunkCanvas = await edgesOf(page.locator('.stage__canvas'));
    const shrunk = await edgesOf(panel);
    expect(shrunk.right).toBeLessThanOrEqual(shrunkCanvas.right + 1);
    expect(shrunk.bottom).toBeLessThanOrEqual(shrunkCanvas.bottom + 1);

    await dragPanelHandle(page, '#entities', 'bottom-right', -3000, -3000);

    const smallest = await panel.boundingBox();
    expect(Math.round(smallest.width)).toBe(200);
    expect(Math.round(smallest.height)).toBe(90);

    const right = (await edgesOf(panel)).right;
    await dragPanelHandle(page, '#entities', 'left', 3000, 0);
    expect(Math.round((await panel.boundingBox()).width)).toBe(200);
    expect(Math.abs((await edgesOf(panel)).right - right)).toBeLessThanOrEqual(1);
  });

  test('returns a resized panel to the size of its content on a double-click of a handle', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    const panel = page.locator('#entities');
    const natural = await panel.boundingBox();

    for (const handle of ['bottom-right', 'left']) {
      await dragPanelHandle(page, '#entities', 'bottom-right', -60, -80);
      expect((await panel.boundingBox()).height).toBeLessThan(natural.height - 40);

      await page.locator('#entities .panel__resize--' + handle).dblclick();

      const reset = await panel.boundingBox();
      expect(Math.abs(reset.width - natural.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(reset.height - natural.height)).toBeLessThanOrEqual(1);
    }
  });

  test('remembers the size of a resized panel across reloads', async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');
    await dragPanelHandle(page, '#table', 'bottom-left', 100, -150);

    const resized = await page.locator('#table').boundingBox();
    await page.waitForTimeout(500);

    await page.reload();
    await loadExample(page);
    await expect(page.locator('#table')).toBeVisible();

    const restored = await page.locator('#table').boundingBox();
    expect(Math.abs(restored.x - resized.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(restored.width - resized.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(restored.height - resized.height)).toBeLessThanOrEqual(1);
  });

  test('draws the resize handles only on a floating panel, with a matching cursor each', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    const cursors = await page
      .locator('#entities .panel__resize')
      .evaluateAll((handles) => handles.map((handle) => [handle.className.replace('panel__resize panel__resize--', ''), getComputedStyle(handle).cursor]));
    expect(cursors).toEqual([
      ['left', 'ew-resize'],
      ['right', 'ew-resize'],
      ['bottom', 'ns-resize'],
      ['bottom-left', 'nesw-resize'],
      ['bottom-right', 'nwse-resize'],
    ]);

    await page.click('#entities .panel__pin');
    await expect(page.locator('#entities')).toHaveClass(/is-docked/);
    await expect(page.locator('#entities .panel__resize')).toHaveCount(0);
  });

  test('leaves the scrollbars of a floating panel clear of its resize handles', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    // How far each edge handle reaches into the panel body.
    const overlaps = await page.locator('#entities').evaluate((panel) => {
      const body = panel.querySelector('.panel__body').getBoundingClientRect();
      const box = (handle) => panel.querySelector('.panel__resize--' + handle).getBoundingClientRect();

      return { left: box('left').right - body.left, right: body.right - box('right').left, bottom: body.bottom - box('bottom').top };
    });

    expect(overlaps.left).toBeLessThanOrEqual(3);
    expect(overlaps.right).toBeLessThanOrEqual(3);
    expect(overlaps.bottom).toBeLessThanOrEqual(3);
  });
});
