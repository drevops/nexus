import { test, expect } from '@playwright/test';
import { HOVER_DELAY } from '../../src/hover-highlight.js';
import { hoverNode, openDocument, openSettings, pagePosition, slFill, tapNode } from './helpers.js';

test.describe('Hover highlight', { tag: '@runner-2' }, () => {
  // A references B, B has no fields and C stands apart with 1 field.
  const HOVER_DOC = {
    nexus: 1,
    title: 'Hover',
    entities: [
      {
        entityType: 'node',
        bundle: 'a',
        label: 'A',
        fields: [
          { name: 'field_b', label: 'B ref', fieldType: 'entity_reference', kind: 'single', targetType: 'node', targetBundles: ['b'] },
          { name: 'field_text', label: 'Text', fieldType: 'string', kind: 'single' },
        ],
      },
      { entityType: 'node', bundle: 'b', label: 'B', fields: [] },
      { entityType: 'node', bundle: 'c', label: 'C', fields: [{ name: 'field_title', label: 'Title', fieldType: 'string', kind: 'single' }] },
    ],
    layout: {
      'node.a': { x: 0, y: 0 },
      'field:node.a:field_b': { x: -90, y: 130 },
      'field:node.a:field_text': { x: 90, y: 130 },
      'node.b': { x: 320, y: 0 },
      'node.c': { x: 320, y: 260 },
      'field:node.c:field_title': { x: 500, y: 260 },
    },
  };

  const FIELD_B = 'field:node.a:field_b';
  const FIELD_TEXT = 'field:node.a:field_text';
  const FIELD_TITLE = 'field:node.c:field_title';

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await openDocument(page, HOVER_DOC);
    await page.evaluate(() => {
      window.__nexus.cy.zoom(1);
      window.__nexus.cy.center();
    });
  });

  // The ids of the shown nodes the hover lights and fades, with the opacity
  // each lit node and each faded node draws with.
  function hoverState(page) {
    return page.evaluate(() => {
      const nodes = window.__nexus.cy.nodes().filter((node) => !node.hasClass('hidden'));
      const ids = (cls) =>
        nodes
          .filter((node) => node.hasClass(cls))
          .map((node) => node.id())
          .sort();
      const opacities = (cls) => [...new Set(nodes.filter((node) => node.hasClass(cls)).map((node) => node.numericStyle('opacity')))];

      return { lit: ids('hover-lit'), faded: ids('hover-faded'), litOpacity: opacities('hover-lit'), fadedOpacity: opacities('hover-faded') };
    });
  }

  // The classes of every element, keyed by id.
  function classesOf(page) {
    return page.evaluate(() => Object.fromEntries(window.__nexus.cy.elements().map((element) => [element.id(), element.classes().slice().sort()])));
  }

  function proxyIds(page) {
    return page.evaluate(() => window.__nexus.cy.nodes('[group="proxy"]').map((node) => node.id()));
  }

  // Moves the pointer onto a node and waits for the highlight.
  async function rest(page, id) {
    const point = await pagePosition(page, id);

    await page.mouse.move(point.x, point.y);
    await page.waitForFunction(() => window.__nexus.cy.elements('.hover-lit').length > 0);
  }

  // Moves the pointer to the empty canvas between A and B.
  async function leave(page) {
    const point = await page.evaluate(() => {
      const cy = window.__nexus.cy;
      const box = cy.container().getBoundingClientRect();
      const pan = cy.pan();

      return { x: box.left + pan.x + 160 * cy.zoom(), y: box.top + pan.y };
    });

    await page.mouse.move(point.x, point.y);
  }

  // Waits until the view has held still for 1 frame.
  function settle(page) {
    return page.evaluate(
      () =>
        new Promise((resolve) => {
          const cy = window.__nexus.cy;
          let last = null;
          const check = () => {
            const view = JSON.stringify([cy.pan(), cy.zoom()]);

            if (!cy.animated() && view === last) {
              resolve();
            } else {
              last = view;
              requestAnimationFrame(check);
            }
          };

          check();
        }),
    );
  }

  function noHighlight(page) {
    return page.evaluate(() => window.__nexus.cy.elements('.hover-lit, .hover-faded').length);
  }

  test('highlights an entity, its fields, its references and their targets after a short delay', async ({ page }) => {
    await page.evaluate(() => {
      window.__hoverStart = null;
      window.__nexus.cy.on('mouseover', 'node', () => {
        window.__hoverStart = performance.now();
      });
    });
    const point = await pagePosition(page, 'node.a');

    await page.mouse.move(point.x, point.y);
    const elapsed = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const poll = () => {
            if (window.__nexus.cy.elements('.hover-lit').length) {
              resolve(performance.now() - window.__hoverStart);
            } else {
              requestAnimationFrame(poll);
            }
          };

          poll();
        }),
    );

    expect(elapsed).toBeGreaterThanOrEqual(HOVER_DELAY);
    expect(await hoverState(page)).toEqual({
      lit: [FIELD_B, FIELD_TEXT, 'node.a', 'node.b', ...(await proxyIds(page))].sort(),
      faded: [FIELD_TITLE, 'node.c'],
      litOpacity: [1],
      fadedOpacity: [0.1],
    });

    await leave(page);
    expect(await noHighlight(page)).toBe(0);
  });

  test('highlights a field, its entity and its references', async ({ page }) => {
    await rest(page, FIELD_B);

    expect(await hoverState(page)).toEqual({
      lit: [FIELD_B, 'node.a', 'node.b', ...(await proxyIds(page))].sort(),
      faded: [FIELD_TEXT, FIELD_TITLE, 'node.c'],
      litOpacity: [1],
      fadedOpacity: [0.1],
    });
  });

  test('highlights the entities that reference an entity', async ({ page }) => {
    await rest(page, 'node.b');

    expect((await hoverState(page)).lit).toEqual([FIELD_B, 'node.a', 'node.b', ...(await proxyIds(page))].sort());
  });

  for (const [name, setUp] of dataProviderHoverStates()) {
    test(`restores ${name} when the pointer leaves`, async ({ page }) => {
      await setUp(page);
      await settle(page);
      const before = await classesOf(page);

      await rest(page, 'node.a');
      const during = await hoverState(page);
      expect(during.lit).toContain('node.a');
      expect(during.litOpacity).toEqual([1]);

      await leave(page);
      expect(await classesOf(page)).toEqual(before);
    });
  }

  function dataProviderHoverStates() {
    return [
      [
        'an active focus',
        async (page) => {
          await tapNode(page, 'node.c');
          await page.waitForFunction(() => window.__nexus.cy.getElementById('node.a').hasClass('faded'));
        },
      ],
      [
        'an isolation',
        async (page) => {
          await page.click('#mode-build');
          await page.evaluate(() => {
            window.__nexus.cy.getElementById('node.c').emit('cxttap');
          });
          await page.waitForFunction(() => window.__nexus.cy.getElementById('node.a').hasClass('faded'));
        },
      ],
      [
        'a search',
        async (page) => {
          await slFill(page, '#search', 'C');
          await page.click('#search-btn');
          await page.waitForFunction(() => window.__nexus.cy.getElementById('node.a').hasClass('faded'));
        },
      ],
    ];
  }

  test('draws no highlight while a mouse button is held', async ({ page }) => {
    await leave(page);
    await page.mouse.down();
    const point = await pagePosition(page, 'node.a');
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.waitForTimeout(HOVER_DELAY * 2);

    expect(await noHighlight(page)).toBe(0);
    await page.mouse.up();
  });

  test('draws no highlight while a node is dragged across another', async ({ page }) => {
    await page.click('#mode-build');
    const from = await pagePosition(page, 'node.b');
    const to = await pagePosition(page, 'node.a');

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.waitForTimeout(HOVER_DELAY * 2);

    expect(await noHighlight(page)).toBe(0);
    await page.mouse.up();
  });

  test('clears the highlight when the pointer leaves the canvas', async ({ page }) => {
    await rest(page, 'node.a');
    await page.locator('#mode-view').hover();

    expect(await noHighlight(page)).toBe(0);
  });

  test('clears the highlight when the view zooms', async ({ page }) => {
    await rest(page, 'node.a');
    await page.evaluate(() => {
      window.__nexus.cy.zoom(0.9);
    });

    expect(await noHighlight(page)).toBe(0);
  });

  // The Settings dialog covers the diagram, so the pointer's arrival on a node
  // is emitted rather than moved.
  test('turns the highlight off from Settings and back on with Reset to defaults', async ({ page }) => {
    await openSettings(page, 'hover');
    await hoverNode(page, 'node.a');
    await page.waitForFunction(() => window.__nexus.cy.elements('.hover-lit').length > 0);
    await page.evaluate(() => {
      window.__nexus.cy.getElementById('node.a').emit('mouseout');
    });

    await page.click('#hover-toggle [part~="control"]');
    await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem('nexusSettings')).hover)).toEqual({ enabled: false });
    await hoverNode(page, 'node.a');
    await page.waitForTimeout(HOVER_DELAY * 2);
    expect(await noHighlight(page)).toBe(0);

    await page.click('#settings-reset');
    await expect.poll(() => page.evaluate(() => document.getElementById('hover-toggle').checked)).toBe(true);
    await hoverNode(page, 'node.a');
    await page.waitForFunction(() => window.__nexus.cy.elements('.hover-lit').length > 0);
  });
});
