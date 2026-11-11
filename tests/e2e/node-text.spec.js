import { test, expect } from '@playwright/test';
import { loadExample, slFill, slSelect, createEntity, buildStoryWithField, tapNode, captionsOf, openDiagram, pickLayout } from './helpers.js';

test.describe('Node text', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('labels each entity with its type in the caption layer', async ({ page }) => {
    await loadExample(page);

    const types = await page.locator('#captions .caption--type').allTextContents();
    expect(types.length).toBeGreaterThan(0);
    expect(types).toContain('Content type');
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
});
