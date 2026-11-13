import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hoverNode, loadExample, saveFrom, slFill, slSelect, tapNode, waitForGraph } from './helpers.js';

test.describe('Descriptions and field settings', { tag: '@runner-2' }, () => {
  const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'config-min');
  const SUMMARY = 'field:node.article:field_summary';
  const LAYOUT = 'field:node.page:field_layout';
  const TAGS = 'field:node.article:field_tags';
  const SETTING_KEYS = ['description', 'defaultValue', 'allowedValues', 'translatable'];
  const LAYOUT_VALUES = [
    { value: 'wide', label: 'Wide' },
    { value: 'narrow', label: 'Narrow' },
  ];

  async function importFixture(page) {
    await page.setInputFiles('#folder-input', FIXTURE_DIR);
    await waitForGraph(page);
  }

  // The description and field setting keys of a node's data.
  function settingsOf(page, id) {
    return page.evaluate(
      ([nodeId, keys]) => {
        const data = window.__nexus.cy.getElementById(nodeId).data();
        return Object.fromEntries(keys.filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]]));
      },
      [id, SETTING_KEYS],
    );
  }

  // The labels of the versions in the History panel, newest first.
  async function historyLabels(page) {
    await page.click('#history-toggle');
    const labels = await page.locator('#history .history__label').allTextContents();
    await page.click('#history-toggle');

    return labels;
  }

  function setting(page, key) {
    return page.locator('#inspector [data-setting="' + key + '"]');
  }

  function tableRow(page, name) {
    return page.locator('#field-table tbody tr', { has: page.locator('code', { hasText: new RegExp('^' + name + '$') }) });
  }

  function cell(row, column) {
    return row.locator('td[data-column="' + column + '"]');
  }

  async function editField(page, id) {
    await importFixture(page);
    await page.click('#mode-build');
    await tapNode(page, id);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('reads the descriptions and field settings of an imported config folder', async ({ page }) => {
    await importFixture(page);

    expect(await settingsOf(page, 'node.article')).toEqual({ description: 'An article.' });
    expect(await settingsOf(page, SUMMARY)).toEqual({ description: 'A short <b>summary</b> of the article.', defaultValue: 'Read on', translatable: false });
    expect(await settingsOf(page, LAYOUT)).toEqual({
      description: 'How wide the page is drawn.',
      defaultValue: 'wide',
      allowedValues: LAYOUT_VALUES,
      translatable: true,
    });
    expect(await settingsOf(page, TAGS)).toEqual({});
  });

  test('draws the markup of help text and bundle descriptions in the tooltip', async ({ page }) => {
    await importFixture(page);

    await hoverNode(page, SUMMARY);
    await expect(page.locator('#tooltip .tooltip__text')).toHaveText('A short summary of the article.');
    await expect(page.locator('#tooltip .tooltip__text b')).toHaveText('summary');

    await hoverNode(page, 'node.article');
    await expect(page.locator('#tooltip .tooltip__text')).toHaveText('An article.');

    await hoverNode(page, TAGS);
    await expect(page.locator('#tooltip .tooltip__name')).toHaveText('Tags');
    await expect(page.locator('#tooltip .tooltip__text')).toHaveCount(0);
  });

  test('lists the field settings in the Fields table', async ({ page }) => {
    await importFixture(page);
    await page.click('#table-toggle');

    await expect(page.locator('#field-table')).toHaveClass(/has-settings/);
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
      'Used in',
      'Help text',
      'Default',
      'Allowed values',
      'Transl.',
    ]);

    const layout = tableRow(page, 'field_layout');
    await expect(cell(layout, 'description')).toHaveText('How wide the page is drawn.');
    await expect(cell(layout, 'defaultValue')).toHaveText('wide');
    await expect(cell(layout, 'allowedValues')).toHaveText('Wide (wide), Narrow (narrow)');
    await expect(cell(layout, 'translatable').locator('span')).toHaveAttribute('title', /^Translatable/);

    const summary = tableRow(page, 'field_summary');
    await expect(cell(summary, 'description')).toHaveText('A short summary of the article.');
    await expect(cell(summary, 'translatable').locator('span')).toHaveAttribute('title', /^Not translatable/);
    await expect(cell(summary, 'description').locator('b')).toHaveText('summary');

    await expect(cell(tableRow(page, 'field_tags'), 'translatable')).toHaveText('');
    await expect(page.locator('#field-table .is-group', { hasText: /^\s*Article ·/ }).locator('.field-table__description')).toHaveText('An article.');
  });

  test('filters the Fields table by help text', async ({ page }) => {
    await importFixture(page);
    await page.click('#table-toggle');
    await slFill(page, '#table-search', 'how wide');

    await expect(page.locator('#field-table tbody code')).toHaveText(['field_layout']);
  });

  test('leaves the settings columns out of the Fields table of a diagram without field settings', async ({ page }) => {
    await loadExample(page);
    await page.click('#table-toggle');

    await expect(page.locator('#field-table')).not.toHaveClass(/has-settings/);
    await expect(page.locator('#field-table thead th')).toHaveCount(9);
    await expect(page.locator('#field-table .is-group', { hasText: /^\s*Event ·/ }).locator('.field-table__description')).toHaveText(
      'A conference or meetup with its sessions, venue and sponsors.',
    );
  });

  test('exports the field settings in the CSV', async ({ page }) => {
    await importFixture(page);

    const download = await saveFrom(page, 'csv');
    const lines = readFileSync(await download.path(), 'utf8').split('\r\n');

    expect(lines[0]).toBe(
      'Entity,Entity type,Field,Machine name,Field type,Cardinality,Required,References,Used in,Help text,Default,Allowed values,Translatable',
    );
    expect(lines).toContain('Page,Content type,Layout,field_layout,list_string,1,no,,1,How wide the page is drawn.,wide,Wide (wide); Narrow (narrow),yes');
    expect(lines).toContain('Article,Content type,Summary,field_summary,string,1,yes,,1,A short <b>summary</b> of the article.,Read on,,no');
    expect(lines.find((line) => line.startsWith('Article,Content type,Tags,'))).toMatch(/,,,,$/);
  });

  test('edits the description of an entity in the Inspector with 1 history step', async ({ page }) => {
    await editField(page, 'node.article');
    await expect(setting(page, 'description')).toHaveJSProperty('value', 'An article.');

    await slFill(page, '#inspector [data-setting="description"]', 'Long-form news.');
    await slFill(page, '#inspector [data-setting="description"]', 'Long-form news and features.');

    expect(await settingsOf(page, 'node.article')).toEqual({ description: 'Long-form news and features.' });
    expect((await historyLabels(page)).filter((label) => label === 'Edited the description of entity “Article”')).toHaveLength(1);

    await slFill(page, '#inspector [data-setting="description"]', '');
    expect(await settingsOf(page, 'node.article')).toEqual({});
  });

  test('edits the help text, default value, allowed values and translatability of a field', async ({ page }) => {
    await editField(page, LAYOUT);

    await expect(setting(page, 'description')).toHaveJSProperty('value', 'How wide the page is drawn.');
    await expect(setting(page, 'defaultValue')).toHaveJSProperty('value', 'wide');
    await expect(setting(page, 'allowedValues')).toHaveJSProperty('value', 'wide|Wide\nnarrow|Narrow');
    await expect(setting(page, 'translatable')).toHaveJSProperty('value', 'yes');

    await slFill(page, '#inspector [data-setting="description"]', 'Pick');
    await slFill(page, '#inspector [data-setting="description"]', 'Pick a width.');
    await slFill(page, '#inspector [data-setting="defaultValue"]', 'narrow');
    await slFill(page, '#inspector [data-setting="allowedValues"]', 'wide|Wide\nnarrow|Narrow\nfull');
    await slSelect(page, '#inspector [data-setting="translatable"]', 'no');

    expect(await settingsOf(page, LAYOUT)).toEqual({
      description: 'Pick a width.',
      defaultValue: 'narrow',
      allowedValues: [...LAYOUT_VALUES, { value: 'full', label: 'full' }],
      translatable: false,
    });
    expect((await historyLabels(page)).slice(0, 4)).toEqual([
      'Made field “Layout” not translatable',
      'Changed the allowed values of field “Layout”',
      'Changed the default value of field “Layout”',
      'Edited the help text of field “Layout”',
    ]);
  });

  test('clears each field setting by emptying its control, and undo brings it back', async ({ page }) => {
    await editField(page, LAYOUT);

    await slFill(page, '#inspector [data-setting="description"]', '');
    await slFill(page, '#inspector [data-setting="defaultValue"]', ' ');
    await slFill(page, '#inspector [data-setting="allowedValues"]', '\n|Wide\n');
    await slSelect(page, '#inspector [data-setting="translatable"]', '');

    expect(await settingsOf(page, LAYOUT)).toEqual({});
    await expect(setting(page, 'allowedValues')).toHaveCount(1);
    expect((await historyLabels(page))[0]).toBe('Cleared whether field “Layout” is translatable');

    await page.click('#undo');
    expect(await settingsOf(page, LAYOUT)).toEqual({ translatable: true });
  });

  test('offers allowed values only on a list field or a field that has them', async ({ page }) => {
    await editField(page, SUMMARY);
    await expect(setting(page, 'description')).toBeVisible();
    await expect(setting(page, 'allowedValues')).toHaveCount(0);
    await expect(setting(page, 'translatable')).toHaveJSProperty('value', 'no');

    await tapNode(page, LAYOUT);
    await expect(setting(page, 'allowedValues')).toBeVisible();
  });

  test('saves the edited settings in the document', async ({ page }) => {
    await editField(page, LAYOUT);
    await slFill(page, '#inspector [data-setting="description"]', 'Pick a width.');

    const download = await saveFrom(page, 'json');
    const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
    const pageEntity = doc.entities.find((entity) => entity.bundle === 'page');
    const layout = pageEntity.fields.find((field) => field.name === 'field_layout');
    const components = pageEntity.fields.find((field) => field.name === 'field_components');

    expect(pageEntity.description).toBe('A page.');
    expect(layout).toMatchObject({ description: 'Pick a width.', defaultValue: 'wide', allowedValues: LAYOUT_VALUES, translatable: true });
    expect(SETTING_KEYS.filter((key) => Object.hasOwn(components, key))).toEqual([]);
  });
});
