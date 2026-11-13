import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadExample, openDocument, saveFrom, slFill } from './helpers.js';

test.describe('Fields table', { tag: '@runner-2' }, () => {
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

  test('exports the fields table as CSV', async ({ page }) => {
    await loadExample(page);

    const download = await saveFrom(page, 'csv');
    expect(download.suggestedFilename()).toBe('example-content-model-fields.csv');

    const csv = readFileSync(await download.path(), 'utf8');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Entity,Entity type,Field,Machine name,Field type,Cardinality,Required,References,Used in,Help text,Default,Allowed values,Translatable');
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

    const download = await saveFrom(page, 'csv');
    const csv = readFileSync(await download.path(), 'utf8');

    for (const cell of ['"Comma, label"', '"Quote ""label"""', '"Line\nfeed"', '"Carriage\rreturn"']) {
      expect(csv).toContain(',' + cell + ',');
    }
  });

  test('wraps field types and machine names in the fields table only after an underscore', async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');
    await expect(page.locator('#field-table')).toContainText('entity_reference_revisions');

    const types = await renderedLines(page.locator('#field-table tbody td:nth-child(3)'));
    const names = await renderedLines(page.locator('#field-table tbody td:nth-child(2) code'));
    const midWord = [...types, ...names].filter((lines) => lines.slice(0, -1).some((line) => !line.endsWith('_')));
    expect(midWord).toEqual([]);

    // entity_reference_revisions is far wider than its column, so its cell must
    // wrap.
    const revisions = page.locator('#field-table tbody td:nth-child(3)', { hasText: 'entity_reference_revisions' }).first();
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

  // Returns the place, label, machine name and type of each field row of the
  // first entity in the fields table, top to bottom.
  function firstGroupRows(page) {
    return page.locator('#field-table tbody').evaluate((tbody) => {
      const rows = [];
      let groups = 0;

      for (const row of tbody.rows) {
        if (row.classList.contains('is-group')) {
          groups++;
          continue;
        }

        if (groups > 1) {
          break;
        }

        rows.push({
          position: Number(row.cells[0].textContent),
          label: row.cells[1].firstChild.textContent.trim(),
          name: row.cells[1].querySelector('code').textContent,
          type: row.cells[2].textContent,
        });
      }

      return rows;
    });
  }

  function sortedColumn(page) {
    return page.locator('#field-table th[aria-sort]').evaluateAll((headers) => headers.map((th) => [th.className, th.getAttribute('aria-sort')]));
  }

  function inOrder(values, direction) {
    const sorted = [...values].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));

    return direction === 'descending' ? sorted.reverse() : sorted;
  }

  // A diagram with 1 entity of 40 fields, 1 of which has help text, so the
  // table shows the settings columns and is taller than the panel.
  const MANY_FIELDS_DOC = {
    nexus: 1,
    title: 'Many fields',
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'Article',
        fields: Array.from({ length: 40 }, (_, i) => ({
          name: 'field_item_' + i,
          label: 'Item ' + i,
          fieldType: 'string',
          kind: 'single',
          ...(i ? {} : { description: 'The first item.' }),
        })),
      },
    ],
  };

  test('numbers the fields of each entity and sorts them by a column header', async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');

    const initial = await firstGroupRows(page);
    expect(initial.map((r) => r.position)).toEqual(initial.map((r, i) => i + 1));
    expect(await sortedColumn(page)).toEqual([['field-table__col--position', 'ascending']]);

    const field = page.locator('#field-table [data-sort="field"]');
    await expect(field).toHaveAttribute('title', 'Sort by field, ascending');

    for (const direction of ['ascending', 'descending']) {
      await field.click();
      expect(await sortedColumn(page)).toEqual([['field-table__col--field', direction]]);
      // aria-sort names the direction, so the arrow stays out of the name.
      await expect(field).toHaveAccessibleName('Field');

      const rows = await firstGroupRows(page);
      expect(rows.map((r) => r.label)).toEqual(
        inOrder(
          rows.map((r) => r.label),
          direction,
        ),
      );
      // Each field keeps its place in its entity under any sort.
      expect(rows.map((r) => [r.name, r.position]).sort()).toEqual(initial.map((r) => [r.name, r.position]).sort());
    }

    await expect(field).toHaveAttribute('title', 'Sort by position, as the diagram lists the fields');
    await field.click();
    expect(await sortedColumn(page)).toEqual([['field-table__col--position', 'ascending']]);
    expect(await firstGroupRows(page)).toEqual(initial);

    await page.click('#field-table [data-sort="position"]');
    expect(await sortedColumn(page)).toEqual([['field-table__col--position', 'descending']]);
    expect((await firstGroupRows(page)).map((r) => r.position)).toEqual(initial.map((r) => r.position).reverse());
  });

  // Sorts by each column in turn and returns the columns whose label runs into
  // the right padding of its header cell, where the sort arrow is drawn.
  async function crowdedHeaders(page) {
    const crowded = [];

    for (const column of await page.locator('#field-table [data-sort]').evaluateAll((buttons) => buttons.map((b) => b.dataset.sort))) {
      const button = page.locator('#field-table [data-sort="' + column + '"]');

      if ((await button.locator('xpath=..').getAttribute('aria-sort')) !== 'ascending') {
        await button.click();
      }

      const fits = await button.evaluate((b) => {
        const cell = b.closest('th');
        const padding = parseFloat(getComputedStyle(cell).paddingRight);

        return b.getBoundingClientRect().right <= cell.getBoundingClientRect().right - padding + 1;
      });

      if (!fits) {
        crowded.push(column);
      }
    }

    return crowded;
  }

  test('fits each header label and its sort arrow in its column', async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');
    await expect(page.locator('#field-table')).not.toHaveClass(/has-settings/);
    expect(await crowdedHeaders(page)).toEqual([]);

    await openDocument(page, MANY_FIELDS_DOC);
    await expect(page.locator('#field-table')).toHaveClass(/has-settings/);
    expect(await crowdedHeaders(page)).toEqual([]);
  });

  test('keeps the search and the sort when the fields panel is docked', async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');
    await page.click('#field-table [data-sort="type"]');

    await slFill(page, '#table-search', 'field_');
    await page.click('#table .panel__pin');
    await expect(page.locator('#table')).toHaveClass(/is-docked/);

    expect(await page.locator('#table-search').evaluate((input) => input.value)).toBe('field_');
    expect(await sortedColumn(page)).toEqual([['field-table__col--type', 'ascending']]);

    const rows = await firstGroupRows(page);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((r) => r.name.startsWith('field_'))).toBe(true);
    expect(rows.map((r) => r.type)).toEqual(
      inOrder(
        rows.map((r) => r.type),
        'ascending',
      ),
    );
  });

  test('scrolls the fields panel body both ways with the toolbar and header in view', async ({ page }) => {
    await openDocument(page, MANY_FIELDS_DOC);
    await page.click('#table-toggle');
    await expect(page.locator('#field-table')).toHaveClass(/has-settings/);

    const scroll = await page.locator('#table .panel__body').evaluate((body) => {
      const table = body.querySelector('#field-table');
      const overflows = { wide: body.scrollWidth > body.clientWidth, tall: body.scrollHeight > body.clientHeight };

      body.scrollLeft = 200;
      body.scrollTop = 300;

      const rect = (selector) => body.querySelector(selector).getBoundingClientRect();

      return {
        ...overflows,
        parent: table.parentElement === body,
        bodyLeft: body.getBoundingClientRect().left,
        bodyTop: body.getBoundingClientRect().top,
        toolbarLeft: rect('.panel__toolbar').left,
        tableLeft: table.getBoundingClientRect().left,
        headerTop: rect('#field-table th').top,
      };
    });

    expect(scroll).toMatchObject({ wide: true, tall: true, parent: true });
    expect(Math.abs(scroll.toolbarLeft - scroll.bodyLeft)).toBeLessThanOrEqual(1);
    expect(scroll.tableLeft).toBeLessThan(scroll.bodyLeft - 150);
    expect(Math.abs(scroll.headerTop - scroll.bodyTop)).toBeLessThanOrEqual(1);
  });
});
