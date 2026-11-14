import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  closeSettings,
  loadExample,
  openDocument,
  openSaveSubmenu,
  openSettings,
  slFill,
  slSelect,
  downloadFrom,
  saveFrom,
  topmostOf,
  stepLevel,
} from './helpers.js';

async function savedText(page, format) {
  return readFile(await (await saveFrom(page, format)).path(), 'utf8');
}

test.describe('Save', { tag: '@runner-1' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('saves the diagram as PNG named after the title', async ({ page }) => {
    await loadExample(page);

    const download = await saveFrom(page, 'png');
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

  test('saves the diagram as SVG and honours a renamed title', async ({ page }) => {
    await loadExample(page);

    await slFill(page, '#diagram-title', 'My Model');

    const download = await saveFrom(page, 'svg');
    expect(download.suggestedFilename()).toBe('my-model.svg');
  });

  for (const [name, filename, startDownload] of dataProviderUntitledDownloads()) {
    test(`names the ${name} after the default title when the title is empty`, async ({ page }) => {
      await loadExample(page);
      await slFill(page, '#diagram-title', '');

      expect((await startDownload(page)).suggestedFilename()).toBe(filename);
    });
  }

  function dataProviderUntitledDownloads() {
    return [
      ['PNG', 'content-model.png', (page) => saveFrom(page, 'png')],
      ['SVG', 'content-model.svg', (page) => saveFrom(page, 'svg')],
      ['fields CSV', 'content-model-fields.csv', (page) => saveFrom(page, 'csv')],
      ['bundles CSV', 'content-model-bundles.csv', (page) => saveFrom(page, 'bundles-csv')],
      ['references CSV', 'content-model-references.csv', (page) => saveFrom(page, 'references-csv')],
      ['Markdown', 'content-model.md', (page) => saveFrom(page, 'md')],
      ['HTML', 'content-model.html', (page) => saveFrom(page, 'html')],
      ['Mermaid', 'content-model.mmd', (page) => saveFrom(page, 'mermaid')],
      ['DOT', 'content-model.dot', (page) => saveFrom(page, 'dot')],
      ['JSON from the Save as menu', 'content-model.nexus.json', (page) => saveFrom(page, 'json')],
      ['JSON from the Save button', 'content-model.nexus.json', (page) => downloadFrom(page, '#doc-save')],
    ];
  }

  test('lists every format under Save as, then Copy link', async ({ page }) => {
    await loadExample(page);

    await page.click('#save-choose');

    await expect(page.locator('#save-menu')).toBeVisible();
    await expect(page.locator('#save-menu sl-menu-label')).toHaveText('Save as');
    // The CSV item's text includes its submenu's.
    await expect(page.locator('#save-menu > sl-menu-item')).toHaveText([
      /^CSV/,
      'Graphviz DOT',
      'HTML',
      'JSON',
      'Markdown',
      'Mermaid',
      'PNG',
      'SVG',
      'Copy link',
    ]);
    await expect(page.locator('#save-menu > sl-menu-item').nth(0).locator('> sl-menu[slot="submenu"] > sl-menu-item')).toHaveText([
      'Bundles',
      'Fields',
      'References',
    ]);
    await expect(page.locator('#save-menu > sl-menu-item[value="svg"] + sl-divider + sl-menu-item[value="link"]')).toHaveCount(1);
  });

  for (const [format, filename] of dataProviderSaveFormats()) {
    test(`keeps the Save button on the document after saving as ${format}`, async ({ page }) => {
      await loadExample(page);

      expect((await saveFrom(page, format)).suggestedFilename()).toBe(filename);

      await expect(page.locator('#doc-save')).toHaveText('Save');
      await expect(page.locator('#doc-save')).toHaveAttribute('title', 'Save this diagram as a Nexus document (.nexus.json)');
      expect((await downloadFrom(page, '#doc-save')).suggestedFilename()).toBe('example-content-model.nexus.json');
    });
  }

  function dataProviderSaveFormats() {
    return [
      ['png', 'example-content-model.png'],
      ['svg', 'example-content-model.svg'],
      ['csv', 'example-content-model-fields.csv'],
      ['bundles-csv', 'example-content-model-bundles.csv'],
      ['references-csv', 'example-content-model-references.csv'],
      ['md', 'example-content-model.md'],
      ['html', 'example-content-model.html'],
      ['mermaid', 'example-content-model.mmd'],
      ['dot', 'example-content-model.dot'],
    ];
  }

  for (const [format, text] of dataProviderTextFormats()) {
    test(`saves ${format} text of the graph the canvas shows`, async ({ page }) => {
      await loadExample(page);

      const full = await savedText(page, format);
      expect(full).toContain(text.event);
      expect(full).toContain(text.venues);
      expect(full).toContain(text.field);
      expect(full).toContain(text.has);
      expect(full).toContain(text.proxy);
      expect(full).not.toContain(text.ref);

      await page.click('#proxy-toggle');
      const direct = await savedText(page, format);
      expect(direct).toContain(text.ref);
      expect(direct).not.toContain(text.proxy);

      await page.click('#table-toggle');
      await page.click('[data-field-visibility="field:node.event:field_venue"]');
      expect(await savedText(page, format)).not.toContain(text.field);

      await stepLevel(page);
      await page.click('#entities-toggle');
      await page.locator('#type-filters label', { hasText: 'Vocabulary' }).locator('input').uncheck();

      const overview = await savedText(page, format);
      expect(overview).toContain(text.event);
      expect(overview).not.toContain(text.venues);
      expect(overview).not.toContain('field_node_event');
    });
  }

  function dataProviderTextFormats() {
    return [
      [
        'mermaid',
        {
          event: '\n  node_event@{ shape: ',
          venues: '\n  taxonomy_term_venues@{ shape: ',
          field: '\n  field_node_event_field_venue@{ shape: stadium, label: "Venue<br><small>field_venue</small>" }',
          has: '\n  node_event --- field_node_event_field_venue\n',
          proxy: '\n  field_node_event_field_venue -.->|"1"| proxy_field_node_event_field_venue_taxonomy_term_venues\n',
          ref: '\n  field_node_event_field_venue -->|"1"| taxonomy_term_venues\n',
        },
      ],
      [
        'dot',
        {
          event: '\n  "node_event" [label=',
          venues: '\n  "taxonomy_term_venues" [label=',
          field: '\n  "field_node_event_field_venue" [label=<Venue<BR/><FONT POINT-SIZE="9" COLOR="#6b7280">field_venue</FONT>>',
          has: '\n  "node_event" -> "field_node_event_field_venue" [dir=none];\n',
          proxy:
            '\n  "field_node_event_field_venue" -> "proxy_field_node_event_field_venue_taxonomy_term_venues" [style=dashed, color="#c2c8d0", label="1"];\n',
          ref: '\n  "field_node_event_field_venue" -> "taxonomy_term_venues" [color="#8a94a3", label="1"];\n',
        },
      ],
    ];
  }

  test('pins each node of the DOT graph at its canvas position', async ({ page }) => {
    await loadExample(page);

    const positions = await page.evaluate(() => {
      const cy = window.__nexus.cy;

      return ['node.event', 'field:node.event:field_venue'].map((id) => ({ ...cy.getElementById(id).position() }));
    });
    const dot = await savedText(page, 'dot');

    for (const [name, position] of [
      ['node_event', positions[0]],
      ['field_node_event_field_venue', positions[1]],
    ]) {
      expect(dot).toContain('\n  "' + name + '" [');
      expect(dot).toMatch(new RegExp('\\n  "' + name + '" \\[[^\\n]*, pos="' + Math.round(position.x) + ',' + -Math.round(position.y) + '!"'));
    }
  });

  async function savedMarkdown(page) {
    return readFileSync(await (await saveFrom(page, 'md')).path(), 'utf8');
  }

  test('saves the model as Markdown with its diagram and a section per bundle', async ({ page }) => {
    await loadExample(page);

    const markdown = await savedMarkdown(page);

    expect(markdown).toMatch(/^# Example content model\n\n## Contents\n\n- \[Diagram\]\(#diagram\)\n- \[Content types\]\(#content-types\)\n/);
    expect(markdown).toContain('\n```mermaid\nflowchart LR\n');
    expect(markdown).toContain('\n### Session\n\nMachine name: `session`\n');
    expect(markdown).toContain('\n| Speakers | `field_speakers` | `entity_reference` | 1..n | No | [Speaker](#speaker) |  |\n');
    expect(markdown).toContain('\nReferenced by: Sessions on [Event](#event).\n');
  });

  test('leaves the diagram out of the Markdown when the setting says Never, across reloads', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'markdown');
    await slSelect(page, '#settings [data-markdown="diagram"]', 'never');
    await closeSettings(page);

    expect(await savedMarkdown(page)).not.toContain('```mermaid');

    await page.reload();
    await loadExample(page);
    await openSettings(page, 'markdown');

    await expect(page.locator('#settings [data-markdown="diagram"]')).toHaveJSProperty('value', 'never');
    await closeSettings(page);
    expect(await savedMarkdown(page)).not.toContain('```mermaid');
  });

  test('puts the diagram back in the Markdown with Reset to defaults', async ({ page }) => {
    await loadExample(page);
    await openSettings(page, 'markdown');
    await slSelect(page, '#settings [data-markdown="diagram"]', 'never');

    await page.click('#settings-reset');

    await expect(page.locator('#settings [data-markdown="diagram"]')).toHaveJSProperty('value', 'auto');
    await closeSettings(page);
    expect(await savedMarkdown(page)).toContain('```mermaid');
  });

  test('saves the model as an HTML report with a section per bundle', async ({ page }) => {
    await loadExample(page);

    const html = readFileSync(await (await saveFrom(page, 'html')).path(), 'utf8');

    expect(html).toMatch(/^<!DOCTYPE html>\n/);
    expect(html).toContain('<title>Example content model</title>');
    expect(html).toContain('<li><a href="#content-types">Content types</a>');
    expect(html).toContain('<h3 id="session">Session</h3>\n<p>Machine name: <code>session</code></p>');
    expect(html).toContain(
      '<tr><td>Speakers</td><td><code>field_speakers</code></td><td><code>entity_reference</code></td><td>1..n</td><td>No</td><td><a href="#speaker">Speaker</a></td><td></td></tr>',
    );
    expect(html).toContain('<p>Referenced by: Sessions on <a href="#event">Event</a>.</p>');
    expect(html).not.toMatch(/<script/i);
  });

  test('opens a saved HTML report with its styles and no blocked resource', async ({ page, browser }) => {
    await loadExample(page);

    const html = readFileSync(await (await saveFrom(page, 'html')).path(), 'utf8');
    const report = await browser.newPage();
    const problems = [];

    report.on('console', (message) => problems.push(message.text()));
    report.on('pageerror', (error) => problems.push(error.message));
    await report.setContent(html);

    await expect(report.locator('h1')).toHaveText('Example content model');
    await expect(report.locator('table').first()).toHaveCSS('border-collapse', 'collapse');
    expect(await report.locator('a[href^="#"]').evaluateAll((links) => links.filter((link) => !document.getElementById(link.hash.slice(1))).length)).toBe(0);
    expect(problems).toEqual([]);

    await report.close();
  });

  test('ignores a save menu item that names no format', async ({ page }) => {
    await loadExample(page);

    const errors = [];
    const downloads = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('download', (download) => downloads.push(download));

    await page.evaluate(() => {
      const item = document.createElement('sl-menu-item');
      item.setAttribute('value', 'pdf');
      item.textContent = 'PDF';
      document.getElementById('save-menu').append(item);
    });

    await page.click('#save-choose');
    await page.click('#save-menu sl-menu-item[value="pdf"]');
    await expect(page.locator('#save-menu')).toBeHidden();

    expect(errors).toEqual([]);
    expect(downloads).toEqual([]);
  });

  test('saves the document from the Save button while its menu is open and closes the menu', async ({ page }) => {
    await loadExample(page);

    await page.click('#save-choose');
    await expect(page.locator('#save-menu')).toBeVisible();

    expect((await downloadFrom(page, '#doc-save')).suggestedFilename()).toBe('example-content-model.nexus.json');
    await expect(page.locator('#save-menu')).toBeHidden();
  });

  test('draws the save menu above a panel under it', async ({ page }) => {
    await loadExample(page);
    await page.click('#entities-toggle');

    const caret = await page.locator('#save-choose').boundingBox();
    const head = await page.locator('#entities .panel__head').boundingBox();
    await page.mouse.move(head.x + 40, head.y + head.height / 2);
    await page.mouse.down();
    await page.mouse.move(caret.x - 40, head.y, { steps: 8 });
    await page.mouse.up();

    await page.click('#save-choose');
    await expect(page.locator('#save-menu')).toBeVisible();
    await expect.poll(() => topmostOf(page, ['#save-menu', '#entities'])).toBe('#save-menu');
  });

  for (const [name, target] of dataProviderCsvItemClicks()) {
    test(`keeps the Save as menu open and shows the CSV submenu on a click on the CSV item's ${name}`, async ({ page }) => {
      await loadExample(page);
      await page.click('#save-choose');

      await page.click('#save-menu > sl-menu-item:has(sl-menu-item[value="csv"])' + target);

      await expect(page.locator('#save-menu')).toBeVisible();
      await expect(page.locator('#save-menu sl-menu-item[value="bundles-csv"]')).toBeVisible();
    });
  }

  function dataProviderCsvItemClicks() {
    return [
      ['label', ''],
      ['icon', ' > [slot="prefix"]'],
    ];
  }

  test('describes a hovered save menu item in the status bar', async ({ page }) => {
    await loadExample(page);

    await page.click('#save-choose');
    await page.hover('#save-menu sl-menu-item[value="png"]');
    await expect(page.locator('#statusbar-hint')).toHaveText('Save the diagram as a PNG image');

    await page.hover('#save-menu > sl-menu-item:has(sl-menu-item[value="csv"])');
    await expect(page.locator('#statusbar-hint')).toHaveText('Save the fields, bundles or references as CSV');

    await openSaveSubmenu(page, 'csv');
    await page.hover('#save-menu sl-menu-item[value="csv"]');
    await expect(page.locator('#statusbar-hint')).toHaveText('Save the fields table as CSV');

    await page.hover('#save-menu sl-menu-item[value="bundles-csv"]');
    await expect(page.locator('#statusbar-hint')).toHaveText('Save the bundles as CSV, 1 row per bundle');
  });

  const CSV_DOCUMENT = {
    nexus: 1,
    title: 'Spec sheet',
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'Article, "news"',
        description: 'Daily news.',
        note: 'Keep short.',
        fields: [
          {
            name: 'field_tags',
            label: 'Tags',
            fieldType: 'entity_reference',
            kind: 'multi',
            cardinality: -1,
            required: true,
            targetType: 'taxonomy_term',
            targetBundles: ['tags', 'topics'],
          },
          {
            name: 'field_media',
            label: 'Media',
            fieldType: 'entity_reference',
            kind: 'single',
            cardinality: 1,
            targetType: 'media',
            targetBundles: [],
            hidden: true,
          },
        ],
      },
      { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', fields: [] },
      { entityType: 'taxonomy_term', bundle: 'topics', label: 'Topics', fields: [] },
      { entityType: 'media', bundle: '*', label: 'Any Media', fields: [] },
    ],
  };

  async function savedCsv(page, format) {
    const download = await saveFrom(page, format);

    return { filename: download.suggestedFilename(), lines: readFileSync(await download.path(), 'utf8').split('\r\n') };
  }

  test('saves 1 row per bundle as the bundles CSV, counting hidden fields', async ({ page }) => {
    await openDocument(page, CSV_DOCUMENT);

    expect(await savedCsv(page, 'bundles-csv')).toEqual({
      filename: 'spec-sheet-bundles.csv',
      lines: [
        'entity_type,bundle,label,description,fields,referenced_by,note',
        'node,article,"Article, ""news""",Daily news.,2,0,Keep short.',
        'taxonomy_term,tags,Tags,,0,1,',
        'taxonomy_term,topics,Topics,,0,1,',
      ],
    });
  });

  test('saves 1 row per reference target as the references CSV, including hidden fields', async ({ page }) => {
    await openDocument(page, CSV_DOCUMENT);

    expect(await savedCsv(page, 'references-csv')).toEqual({
      filename: 'spec-sheet-references.csv',
      lines: [
        'source_entity_type,source_bundle,field,field_label,target_entity_type,target_bundle,cardinality,required',
        'node,article,field_tags,Tags,taxonomy_term,tags,1..n,yes',
        'node,article,field_tags,Tags,taxonomy_term,topics,1..n,yes',
        'node,article,field_media,Media,media,*,1,no',
      ],
    });
  });
});
