import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadExample, openDocument, saveFrom, slFill, tapNode } from './helpers.js';

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
    expect(lines[0]).toBe(
      'Entity,Entity type,Field,Machine name,Field type,Cardinality,Required,References,Used in,Help text,Default,Allowed values,Translatable',
    );
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

    const types = await renderedLines(page.locator('#field-table tbody td[data-column="type"]'));
    const names = await renderedLines(page.locator('#field-table tbody td[data-column="name"] code'));
    const midWord = [...types, ...names].filter((lines) => lines.slice(0, -1).some((line) => !line.endsWith('_')));
    expect(midWord).toEqual([]);

    // entity_reference_revisions is far wider than its column, so its cell must
    // wrap.
    const revisions = page.locator('#field-table tbody td[data-column="type"]', { hasText: 'entity_reference_revisions' }).first();
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

        const cell = (column) => row.querySelector('td[data-column="' + column + '"]');

        rows.push({
          position: Number(cell('position').textContent),
          label: cell('field').textContent.trim(),
          name: cell('name').querySelector('code').textContent,
          type: cell('type').textContent.trim(),
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

  // A diagram with no field settings: a text field, a reference field, a
  // list field and a system field on Article, and 2 entities to reference.
  const EDIT_DOC = {
    nexus: 1,
    title: 'Editing',
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'Article',
        fields: [
          { name: 'title', label: 'Title', fieldType: 'string', kind: 'system' },
          { name: 'field_summary', label: 'Summary', fieldType: 'string', kind: 'single' },
          {
            name: 'field_tags',
            label: 'Tags',
            fieldType: 'entity_reference',
            kind: 'multi',
            cardinality: -1,
            targetType: 'taxonomy_term',
            targetBundles: ['tags'],
          },
          { name: 'field_layout', label: 'Layout', fieldType: 'list_string', kind: 'single' },
        ],
      },
      { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', fields: [] },
      { entityType: 'node', bundle: 'page', label: 'Page', fields: [] },
    ],
  };

  const SUMMARY = 'field:node.article:field_summary';
  const TAGS = 'field:node.article:field_tags';

  function editCell(page, id, column) {
    return page.locator('#field-table [data-edit-cell="' + id + '|' + column + '"]');
  }

  function tableEditor(page) {
    return page.locator('#field-table .field-table__editor');
  }

  function fieldData(page, id, key) {
    return page.evaluate(([fieldId, dataKey]) => window.__nexus.cy.getElementById(fieldId).data(dataKey), [id, key]);
  }

  function undoTitle(page) {
    return page.locator('#undo').getAttribute('title');
  }

  // Opens the editor of a text cell and replaces its text, which the editor
  // selects once it has the focus.
  async function typeInCell(page, id, column, text) {
    await editCell(page, id, column).click();
    await expect(tableEditor(page)).toBeFocused();
    await page.keyboard.type(text);
  }

  // Opens the editor of a select cell and picks an option.
  async function pickInCell(page, id, column, value) {
    await editCell(page, id, column).click();
    await page.locator('#field-table .field-table__editor sl-option[value="' + value + '"]').click();
  }

  async function editDiagram(page) {
    await openDocument(page, EDIT_DOC);
    await page.click('#table-toggle');
    await page.click('#mode-build');
  }

  test('puts the go-to and show columns first, unsorted, and the machine name in a column of its own', async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');

    expect(await page.locator('#field-table thead th').allTextContents()).toEqual([
      'Go to',
      'Show',
      '#',
      'Field',
      'Machine name',
      'Type',
      'Card.',
      'Req',
      'Refs',
    ]);
    await expect(page.locator('#field-table thead th').nth(0).locator('[data-sort]')).toHaveCount(0);
    await expect(page.locator('#field-table thead th').nth(1).locator('[data-sort]')).toHaveCount(0);

    const row = page.locator('#field-table tbody tr:not(.is-group)').first();
    await expect(row.locator('td').nth(0).locator('[data-field-go-to]')).toHaveCount(1);
    await expect(row.locator('td').nth(1).locator('[data-field-visibility]')).toHaveCount(1);
  });

  test('sorts the fields by machine name', async ({ page }) => {
    await openDocument(page, EDIT_DOC);
    await page.click('#table-toggle');
    await page.click('#field-table [data-sort="name"]');

    expect((await firstGroupRows(page)).map((r) => r.name)).toEqual(['field_layout', 'field_summary', 'field_tags', 'title']);
  });

  test('edits cells only in Edit mode, where it shows the settings columns', async ({ page }) => {
    await openDocument(page, EDIT_DOC);
    await page.click('#table-toggle');

    await expect(page.locator('#field-table')).not.toHaveClass(/has-settings/);
    await expect(page.locator('#field-table [data-edit-cell]')).toHaveCount(0);

    await page.click('#mode-build');
    await expect(page.locator('#field-table')).toHaveClass(/has-settings/);
    await expect(editCell(page, SUMMARY, 'description')).toHaveAttribute('title', 'Edit the help text of Summary');

    await editCell(page, SUMMARY, 'field').click();
    await expect(tableEditor(page)).toBeVisible();

    await page.click('#mode-view');
    await expect(tableEditor(page)).toHaveCount(0);
    await expect(page.locator('#field-table [data-edit-cell]')).toHaveCount(0);
    await expect(page.locator('#field-table')).not.toHaveClass(/has-settings/);
  });

  test('edits a label in place, saves it with Enter and cancels with Escape', async ({ page }) => {
    await editDiagram(page);

    await typeInCell(page, SUMMARY, 'field', 'Teaser');
    await page.keyboard.press('Enter');

    await expect(tableEditor(page)).toHaveCount(0);
    expect(await fieldData(page, SUMMARY, 'label')).toBe('Teaser');
    expect(await undoTitle(page)).toMatch(/^Undo: Relabelled field “Teaser”/);
    await expect(editCell(page, SUMMARY, 'field')).toBeFocused();

    await typeInCell(page, SUMMARY, 'field', 'Discarded');
    await page.keyboard.press('Escape');

    await expect(tableEditor(page)).toHaveCount(0);
    expect(await fieldData(page, SUMMARY, 'label')).toBe('Teaser');
    await expect(editCell(page, SUMMARY, 'field')).toHaveText('Teaser');

    // A blank label is no label, so it changes nothing.
    await typeInCell(page, SUMMARY, 'field', '   ');
    await page.keyboard.press('Enter');
    expect(await fieldData(page, SUMMARY, 'label')).toBe('Teaser');
  });

  test('saves a text cell when the focus leaves it', async ({ page }) => {
    await editDiagram(page);

    await typeInCell(page, SUMMARY, 'defaultValue', 'Read on');
    await page.locator('#table-search').click();

    await expect(tableEditor(page)).toHaveCount(0);
    expect(await fieldData(page, SUMMARY, 'defaultValue')).toBe('Read on');
    await expect(editCell(page, SUMMARY, 'defaultValue')).toHaveText('Read on');
  });

  test('edits help text and allowed values over several lines', async ({ page }) => {
    await editDiagram(page);

    await typeInCell(page, SUMMARY, 'description', 'Line one');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Line two');
    await page.keyboard.press('Enter');

    expect(await fieldData(page, SUMMARY, 'description')).toBe('Line one\nLine two');
    expect(await undoTitle(page)).toMatch(/^Undo: Edited the help text of field “Summary”/);

    const layout = 'field:node.article:field_layout';
    await typeInCell(page, layout, 'allowedValues', 'wide|Wide');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('narrow');
    await page.keyboard.press('Enter');

    expect(await fieldData(page, layout, 'allowedValues')).toEqual([
      { value: 'wide', label: 'Wide' },
      { value: 'narrow', label: 'narrow' },
    ]);
    await expect(editCell(page, layout, 'allowedValues')).toHaveText('Wide (wide), narrow');

    // Clearing the text removes the setting rather than storing a blank.
    await typeInCell(page, SUMMARY, 'description', ' ');
    await page.keyboard.press('Enter');
    expect(await fieldData(page, SUMMARY, 'description')).toBeUndefined();
    await expect(editCell(page, SUMMARY, 'description')).toHaveText('');
  });

  test('renames a machine name from the table without opening the Inspector', async ({ page }) => {
    await editDiagram(page);

    await typeInCell(page, SUMMARY, 'name', 'field_teaser');
    await page.keyboard.press('Enter');

    const renamed = 'field:node.article:field_teaser';
    expect(
      await page.evaluate(
        ([from, to]) => [window.__nexus.cy.getElementById(from).empty(), window.__nexus.cy.getElementById(to).nonempty()],
        [SUMMARY, renamed],
      ),
    ).toEqual([true, true]);
    await expect(editCell(page, renamed, 'name')).toBeFocused();
    await expect(page.locator('#inspector')).toHaveCount(0);

    // A name another field has is refused.
    await typeInCell(page, renamed, 'name', 'field_tags');
    await page.keyboard.press('Enter');
    await expect(editCell(page, renamed, 'name')).toHaveText('field_teaser');
  });

  test('picks a type, a cardinality and a translatability from a list', async ({ page }) => {
    await editDiagram(page);

    await pickInCell(page, SUMMARY, 'type', 'text_long');
    await expect(tableEditor(page)).toHaveCount(0);
    expect(await fieldData(page, SUMMARY, 'fieldType')).toBe('text_long');
    await expect(editCell(page, SUMMARY, 'type')).toBeFocused();

    await pickInCell(page, SUMMARY, 'cardinality', '3');
    expect(
      await page.evaluate((id) => [window.__nexus.cy.getElementById(id).data('cardinality'), window.__nexus.cy.getElementById(id).data('kind')], SUMMARY),
    ).toEqual([3, 'multi']);
    await expect(editCell(page, SUMMARY, 'cardinality')).toHaveText('1..3');

    await pickInCell(page, SUMMARY, 'translatable', 'no');
    expect(await fieldData(page, SUMMARY, 'translatable')).toBe(false);
    await expect(editCell(page, SUMMARY, 'translatable').locator('span')).toHaveAttribute('title', /^Not translatable/);

    // Escape closes a list without a change.
    await editCell(page, SUMMARY, 'type').click();
    await expect(tableEditor(page)).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');
    await expect(tableEditor(page)).toHaveCount(0);
    expect(await fieldData(page, SUMMARY, 'fieldType')).toBe('text_long');
  });

  test('makes a field required and optional with its checkbox', async ({ page }) => {
    await editDiagram(page);

    const checkbox = editCell(page, SUMMARY, 'required');
    await expect(checkbox).toHaveAttribute('title', 'Make Summary required');

    await checkbox.check();
    expect(await fieldData(page, SUMMARY, 'required')).toBe(true);
    expect(await undoTitle(page)).toMatch(/^Undo: Made field “Summary” required/);
    await expect(checkbox).toHaveAttribute('title', 'Make Summary optional');

    await checkbox.uncheck();
    expect(await fieldData(page, SUMMARY, 'required')).toBe(false);
  });

  test('adds and removes the references of a field from a list', async ({ page }) => {
    await editDiagram(page);

    await editCell(page, TAGS, 'references').click();
    await page.locator('#field-table .field-table__editor sl-option[value="node.page"]').click();
    await page.locator('#field-table .field-table__editor sl-option[value="taxonomy_term.tags"]').click();
    await page.keyboard.press('Escape');

    await expect(tableEditor(page)).toHaveCount(0);
    expect(
      await page.evaluate(
        (id) =>
          window.__nexus.cy
            .getElementById(id)
            .connectedEdges('[group="ref"]')
            .map((e) => e.target().id()),
        TAGS,
      ),
    ).toEqual(['node.page']);
    await expect(editCell(page, TAGS, 'references').locator('xpath=..')).toHaveText('Page');
    expect(await undoTitle(page)).toMatch(/^Undo: Removed the reference from field “Tags” to entity “Tags”/);
  });

  test('leaves cells that a field cannot change as they are', async ({ page }) => {
    await editDiagram(page);

    // A system field keeps its badge, references edit only on reference
    // fields and allowed values only on list fields.
    await expect(editCell(page, 'field:node.article:title', 'cardinality')).toHaveCount(0);
    await expect(editCell(page, SUMMARY, 'references')).toHaveCount(0);
    await expect(editCell(page, SUMMARY, 'allowedValues')).toHaveCount(0);
    await expect(editCell(page, SUMMARY, 'cardinality')).toHaveCount(1);
    await expect(editCell(page, TAGS, 'references')).toHaveCount(1);
    await expect(editCell(page, 'field:node.article:field_layout', 'allowedValues')).toHaveCount(1);
  });

  test('records each table edit as its own history step', async ({ page }) => {
    await editDiagram(page);

    await typeInCell(page, SUMMARY, 'field', 'First');
    await page.keyboard.press('Enter');
    await typeInCell(page, SUMMARY, 'field', 'Second');
    await page.keyboard.press('Enter');

    await page.click('#undo');
    expect(await fieldData(page, SUMMARY, 'label')).toBe('First');
    await expect(editCell(page, SUMMARY, 'field')).toHaveText('First');

    await page.click('#undo');
    expect(await fieldData(page, SUMMARY, 'label')).toBe('Summary');
  });

  test('refreshes the Inspector when the table edits the field it shows', async ({ page }) => {
    await editDiagram(page);
    await tapNode(page, SUMMARY);
    await expect(page.locator('#inspector [data-label]')).toHaveJSProperty('value', 'Summary');

    await typeInCell(page, SUMMARY, 'field', 'Teaser');
    await page.keyboard.press('Enter');
    await expect(page.locator('#inspector [data-label]')).toHaveJSProperty('value', 'Teaser');

    await typeInCell(page, SUMMARY, 'name', 'field_teaser');
    await page.keyboard.press('Enter');
    await expect(page.locator('#inspector [data-machine-name]')).toHaveJSProperty('value', 'field_teaser');
  });
});
