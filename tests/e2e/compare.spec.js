import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES, templatePath } from '../../src/templates.js';
import { EXAMPLE_DIR, activeLevel, exploreFrom, loadExample, openDocument, pickLevel, waitForGraph } from './helpers.js';

const ROOT = join(import.meta.dirname, '..', '..');

// The spec a site was built from: an Article with a title, tags and a
// summary, the Tags vocabulary and a Page.
const SPEC = {
  nexus: 1,
  title: 'Spec',
  entities: [
    {
      entityType: 'node',
      bundle: 'article',
      label: 'Article',
      fields: [
        { name: 'field_title', label: 'Title', fieldType: 'string', kind: 'single', required: true },
        {
          name: 'field_tags',
          label: 'Tags',
          fieldType: 'entity_reference',
          kind: 'multi',
          cardinality: -1,
          targetType: 'taxonomy_term',
          targetBundles: ['tags'],
        },
        { name: 'field_summary', label: 'Summary', fieldType: 'string_long', kind: 'single' },
      ],
    },
    { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', fields: [] },
    { entityType: 'node', bundle: 'page', label: 'Page', fields: [{ name: 'field_body', label: 'Body', fieldType: 'text_long', kind: 'single' }] },
  ],
};

// The site as built: the title is optional, the summary is gone, a date and
// a Topics target were added, the Page is gone and an Event was added.
const SITE = {
  nexus: 1,
  title: 'Site',
  entities: [
    {
      entityType: 'node',
      bundle: 'article',
      label: 'Article',
      fields: [
        { name: 'field_title', label: 'Title', fieldType: 'string', kind: 'single', required: false },
        {
          name: 'field_tags',
          label: 'Tags',
          fieldType: 'entity_reference',
          kind: 'multi',
          cardinality: -1,
          targetType: 'taxonomy_term',
          targetBundles: ['tags', 'topics'],
        },
        { name: 'field_date', label: 'Date', fieldType: 'datetime', kind: 'single' },
      ],
    },
    { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', fields: [] },
    { entityType: 'taxonomy_term', bundle: 'topics', label: 'Topics', fields: [] },
    { entityType: 'node', bundle: 'event', label: 'Event', fields: [{ name: 'field_when', label: 'When', fieldType: 'datetime', kind: 'single' }] },
  ],
};

const TITLE_FIELD = 'field:node.article:field_title';
const TOPICS_REF = 'ref:field:node.article:field_tags>taxonomy_term.topics';

function jsonFile(name, doc) {
  return { name, mimeType: 'application/json', buffer: Buffer.from(typeof doc === 'string' ? doc : JSON.stringify(doc)) };
}

async function compareWith(page, doc, name = 'site.nexus.json') {
  await page.setInputFiles('#compare-doc', jsonFile(name, doc));
  await expect(page.locator('#changes')).toBeVisible();
}

// The comparison fits the view a frame after it starts, and a menu on the
// canvas closes when the view moves, so this waits for the fit to end.
async function waitForFit(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => page.evaluate(() => window.__nexus.cy.animated())).toBe(false);
}

// The rows of the Changes panel, in order, as [bundle heading, change, id].
function listedChanges(page) {
  return page
    .locator('#changes .changes__group')
    .evaluateAll((groups) =>
      groups.flatMap((group) =>
        [...group.querySelectorAll('.changes__item')].map((item) => [group.dataset.entity, item.dataset.change, item.dataset.changeId]),
      ),
    );
}

// The diff class each element carries, keyed by id, for every marked element.
function canvasMarks(page) {
  return page.evaluate(() => {
    const marks = {};

    window.__nexus.cy.elements().forEach((element) => {
      const mark = ['added', 'removed', 'changed'].find((kind) => element.hasClass('diff-' + kind));

      if (mark) {
        marks[element.id()] = mark;
      }
    });

    return marks;
  });
}

// Everything a comparison must leave as it found: each element's data and
// position, the classes on the canvas, the detail level, the display switches
// and the history.
function diagramState(page) {
  return page.evaluate(() => {
    const cy = window.__nexus.cy;

    return {
      elements: cy
        .elements()
        .map((element) => ({ data: element.data(), position: element.isNode() ? element.position() : null, classes: element.classes() }))
        .sort((a, b) => a.data.id.localeCompare(b.data.id)),
      zoom: cy.zoom(),
      pan: cy.pan(),
      level: document.querySelector('#detail-levels [aria-pressed="true"]').dataset.level,
      switches: ['proxy-toggle', 'machine-names'].map((id) => document.getElementById(id).checked),
      history: [...document.querySelectorAll('#history .history__label')].map((label) => label.textContent),
      undo: [document.getElementById('undo').disabled, document.getElementById('undo').getAttribute('title')],
    };
  });
}

test.describe('Compare', { tag: '@runner-1' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('offers a saved diagram and a config folder in the Open menu', async ({ page }) => {
    await openDocument(page, SPEC);

    for (const [item, input] of [
      ['compare-document', '#compare-doc'],
      ['compare-folder', '#compare-folder'],
    ]) {
      await page.click('#open-choose');
      await page.locator('#compare-with').hover();
      await expect(page.locator('#open-menu sl-menu-item[value="' + item + '"]')).toBeVisible();

      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#open-menu sl-menu-item[value="' + item + '"]')]);

      expect(await chooser.element().evaluate((el) => '#' + el.id)).toBe(input);
      await expect(page.locator('#open-menu')).toBeHidden();
    }
  });

  test('lists each added, removed and changed bundle, field and reference, grouped by bundle', async ({ page }) => {
    await openDocument(page, SPEC);
    await compareWith(page, SITE);

    expect(await listedChanges(page)).toEqual([
      ['node.article', 'changed', TITLE_FIELD],
      ['node.article', 'removed', 'field:node.article:field_summary'],
      ['node.article', 'added', 'field:node.article:field_date'],
      ['node.article', 'added', TOPICS_REF],
      ['node.page', 'removed', 'node.page'],
      ['node.page', 'removed', 'field:node.page:field_body'],
      ['taxonomy_term.topics', 'added', 'taxonomy_term.topics'],
      ['node.event', 'added', 'node.event'],
      ['node.event', 'added', 'field:node.event:field_when'],
    ]);
    await expect(page.locator('#changes .changes__source')).toHaveText('Compared with site.nexus.json');
    await expect(page.locator('#changes .changes__count')).toHaveText(['5 added', '3 removed', '1 changed']);
    await expect(page.locator('#changes [data-entity="node.article"] .changes__heading')).toHaveText('Article · Content type');
    await expect(page.locator('#changes-toggle')).toBeVisible();
    await expect(page.locator('#changes-toggle .changes-badge')).toHaveText('9');
  });

  test('shows the old and new value of each changed property', async ({ page }) => {
    await openDocument(page, SPEC);
    await compareWith(page, SITE);

    const row = page.locator('#changes li').filter({ has: page.locator('[data-change-id="' + TITLE_FIELD + '"]') });

    await expect(row.locator('.changes__label')).toHaveText('field Title');
    await expect(row.locator('.changes__name')).toHaveText('field_title');
    await expect(row.locator('[data-property="required"]')).toHaveText(/Required:\s+Yes\s+→\s+No/);
  });

  test('marks each kind of change on the canvas and explains the colours in the Legend', async ({ page }) => {
    await openDocument(page, SPEC);
    await compareWith(page, SITE);

    expect(await canvasMarks(page)).toEqual({
      'node.page': 'removed',
      'field:node.page:field_body': 'removed',
      'has:field:node.page:field_body': 'removed',
      [TITLE_FIELD]: 'changed',
      'field:node.article:field_summary': 'removed',
      'has:field:node.article:field_summary': 'removed',
      'field:node.article:field_date': 'added',
      'has:field:node.article:field_date': 'added',
      [TOPICS_REF]: 'added',
      'proxy:field:node.article:field_tags>taxonomy_term.topics': 'added',
      'pe:field:node.article:field_tags>taxonomy_term.topics': 'added',
      'c:node.article>taxonomy_term.topics': 'added',
      'taxonomy_term.topics': 'added',
      'node.event': 'added',
      'field:node.event:field_when': 'added',
      'has:field:node.event:field_when': 'added',
    });

    const visible = await page.evaluate(() =>
      ['node.page', 'node.event', 'field:node.article:field_date', 'field:node.article:field_summary'].map((id) =>
        window.__nexus.cy.getElementById(id).visible(),
      ),
    );

    expect(visible).toEqual([true, true, true, true]);

    await expect(page.locator('#legend .legend__item[data-change]')).toHaveText(['Added', 'Removed', 'Changed']);
  });

  test('places added entities and their fields clear of every other node', async ({ page }) => {
    await openDocument(page, SPEC);
    await compareWith(page, SITE);

    const overlapping = await page.evaluate(() => {
      const cy = window.__nexus.cy;
      const nodes = cy.nodes('[group="entity"], [group="field"]');
      const box = (node) => node.boundingBox({ includeLabels: false });
      const overlaps = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

      return nodes
        .filter('.diff-added')
        .flatMap((node) => nodes.filter((other) => other !== node && overlaps(box(node), box(other))).map((other) => node.id() + ' and ' + other.id()));
    });

    expect(overlapping).toEqual([]);
  });

  test('focuses the element of a change when it is clicked', async ({ page }) => {
    await openDocument(page, SPEC);
    await compareWith(page, SITE);

    await page.click('[data-change-id="' + TITLE_FIELD + '"]');
    await expect.poll(() => page.evaluate((id) => window.__nexus.cy.getElementById(id).hasClass('trace-source'), TITLE_FIELD)).toBe(true);

    await page.click('[data-change-id="' + TOPICS_REF + '"]');
    await expect.poll(() => page.evaluate(() => window.__nexus.cy.getElementById('field:node.article:field_tags').hasClass('trace-source'))).toBe(true);

    await page.click('[data-change-id="node.event"]');
    await expect
      .poll(() => page.evaluate(() => ['node.event', 'node.page'].map((id) => window.__nexus.cy.getElementById(id).hasClass('faded'))))
      .toEqual([false, true]);
  });

  test('restores the diagram exactly as it was and leaves the history alone', async ({ page }) => {
    await openDocument(page, SPEC);
    await page.click('#history-toggle');
    await pickLevel(page, 'references');
    await page.click('#layout-run');

    const before = await diagramState(page);

    await compareWith(page, SITE);
    await expect(activeLevel(page)).toHaveAttribute('data-level', 'all');
    await page.locator('#proxy-toggle').click();
    await page.click('#tidy');
    await page.click('#layout-run');
    await page.click('#compare-stop');

    await expect(page.locator('#changes-toggle')).toBeHidden();
    await expect(page.locator('#changes')).toBeHidden();
    expect(await diagramState(page)).toEqual(before);
  });

  test('ends an explore view before it compares and after it stops, leaving the diagram as it was', async ({ page }) => {
    await openDocument(page, SPEC);
    await page.click('#history-toggle');

    const before = await diagramState(page);

    await exploreFrom(page, 'node.page');
    await compareWith(page, SITE);
    await expect(page.locator('#explore-bar')).toBeHidden();

    await waitForFit(page);
    await exploreFrom(page, 'node.article');
    await page.click('#compare-stop');

    await expect(page.locator('#explore-bar')).toBeHidden();
    expect(await diagramState(page)).toEqual(before);
  });

  test('turns editing, saving, undo and history jumps off until the comparison stops', async ({ page }) => {
    await openDocument(page, SPEC);
    await page.click('#mode-build');
    await page.click('#table-toggle');
    await expect(page.locator('#field-table [data-edit-cell]').first()).toBeVisible();
    await page.click('#history-toggle');

    await compareWith(page, SITE);

    for (const id of ['mode-build', 'doc-save', 'save-choose', 'undo', 'redo']) {
      await expect(page.locator('#' + id)).toHaveAttribute('disabled', '');
    }

    await expect(page.locator('#mode-view')).toHaveClass(/is-active/);
    await expect(page.locator('#undo')).toHaveAttribute('title', 'Undo is off while comparing');
    await expect(page.locator('#diagram-title')).toHaveAttribute('readonly', '');
    await expect(page.locator('#field-table [data-edit-cell]')).toHaveCount(0);
    await expect(page.locator('#field-table [data-field-visibility]').first()).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#history .history__version').first()).toHaveAttribute('aria-disabled', 'true');

    await page.keyboard.press('e');
    await page.evaluate(() => window.__nexus.cy.getElementById('node.article').emit('dbltap'));
    await expect(page.locator('#mode-view')).toHaveClass(/is-active/);

    await page.click('#compare-stop');

    for (const id of ['mode-build', 'doc-save', 'save-choose']) {
      await expect(page.locator('#' + id)).not.toHaveAttribute('disabled', '');
    }

    await expect(page.locator('#diagram-title')).not.toHaveAttribute('readonly', '');
    await expect(page.locator('#field-table [data-edit-cell]').first()).toBeVisible();
  });

  test('reports no changes for a template compared with itself', async ({ page }) => {
    const template = TEMPLATES[0];
    const doc = readFileSync(join(ROOT, templatePath(template)), 'utf8');

    await page.click('#template-' + template.id);
    await waitForGraph(page);
    await compareWith(page, doc, template.id + '.nexus.json');

    await expect(page.locator('#changes .changes-empty')).toHaveText('No changes. Both models have the same bundles, fields and references.');
    await expect(page.locator('#changes .changes-note')).toHaveText("The open diagram can't be edited or saved until you stop comparing.");
    await expect(page.locator('#changes .changes__count')).toHaveText(['0 added', '0 removed', '0 changed']);
    expect(await canvasMarks(page)).toEqual({});
  });

  test('compares with a config folder, parsed as an import', async ({ page }) => {
    await loadExample(page);
    await page.setInputFiles('#compare-folder', EXAMPLE_DIR);
    await expect(page.locator('#changes')).toBeVisible();

    await expect(page.locator('#changes .changes__source')).toHaveText('Compared with conference');
    await expect(page.locator('#changes .changes-empty')).toBeVisible();
  });

  test('compares again with another file, ending the first comparison', async ({ page }) => {
    await openDocument(page, SPEC);
    await compareWith(page, SITE);
    await compareWith(page, SPEC, 'spec.nexus.json');

    await expect(page.locator('#changes .changes__source')).toHaveText('Compared with spec.nexus.json');
    await expect(page.locator('#changes .changes-empty')).toBeVisible();
    expect(await canvasMarks(page)).toEqual({});
    expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.event').empty())).toBe(true);
  });

  test('ends the comparison when another diagram opens', async ({ page }) => {
    await openDocument(page, SPEC);
    await compareWith(page, SITE);
    await page.click('#doc-new');

    await expect(page.locator('#changes-toggle')).toBeHidden();
    await expect(page.locator('#mode-build')).not.toHaveAttribute('disabled', '');
    await expect(page.locator('#changes')).toBeHidden();
  });

  test('shows the reason when the compared file is not a diagram', async ({ page }) => {
    await openDocument(page, SPEC);
    await page.setInputFiles('#compare-doc', jsonFile('broken.nexus.json', '{"entities": 3}'));

    await expect(page.locator('#landing-error-text')).toHaveText('Could not compare with broken.nexus.json: Not a valid Nexus document.');
    await page.click('#landing-cancel');
    await expect(page.locator('#changes-toggle')).toBeHidden();
    expect(await page.evaluate(() => window.__nexus.cy.nodes('[group="entity"]').length)).toBe(3);
  });
});
