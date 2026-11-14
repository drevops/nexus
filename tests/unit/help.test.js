import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HELP_TARGETS, adjacentPages, findHelpPage, helpTarget, searchManual } from '../../src/help.js';
import { MANUAL_PAGES, MANUAL_SECTIONS } from '../../src/manual.js';
import { PANEL_ORDER } from '../../src/store.js';

const INDEX = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');

const PAGES = [
  { id: 'start', title: 'Getting started', summary: 'Open a diagram.', text: 'Drop a config folder on the dropzone.' },
  { id: 'table', title: 'Fields table', summary: 'Every field in 1 table.', text: 'Sort by a header. Edit a cell in place.' },
  { id: 'keys', title: 'Keyboard shortcuts', summary: 'Every key.', text: 'Press F1 to show the badges.' },
];

function anchorsOf(page) {
  return [...page.html.matchAll(/<h[2-4] id="([^"]+)"/g)].map((match) => match[1]);
}

test('opens a manual page and section that exist for each target', () => {
  for (const [id, target] of Object.entries(HELP_TARGETS)) {
    const page = findHelpPage(MANUAL_PAGES, target.page);

    assert.ok(page, id + ' opens ' + target.page + ', which is not in the manual');

    if (target.anchor) {
      assert.ok(anchorsOf(page).includes(target.anchor), id + ' opens ' + target.page + '#' + target.anchor + ', which does not exist');
    }
  }
});

test('gives every panel but Help a help target', () => {
  assert.deepEqual(
    PANEL_ORDER.filter((id) => !helpTarget(id)),
    ['help'],
  );
});

test('gives every dialog with a help button a help target', () => {
  const dialogs = [...INDEX.matchAll(/<sl-dialog id="([^"]+)"[^>]*>\s*<span slot="label"[^>]*>[^<]*<\/span>\s*(<button class="dialog__help")?/g)];

  assert.deepEqual(
    dialogs.filter((match) => match[2]).map((match) => match[1]),
    ['ai-dialog', 'settings', 'link-dialog'],
  );

  dialogs.forEach(([, id, button]) => assert.equal(!!helpTarget(id), !!button, id));
});

test('links every data-help-page in index.html to a page and section that exist', () => {
  const links = [...INDEX.matchAll(/data-help-page="([^"]+)"(?: data-help-anchor="([^"]+)")?/g)];

  assert.equal(links.length, 2);

  for (const [, pageId, anchor] of links) {
    const page = findHelpPage(MANUAL_PAGES, pageId);

    assert.ok(page, pageId);
    assert.ok(!anchor || anchorsOf(page).includes(anchor), pageId + '#' + anchor);
  }
});

test('finds no target for an unknown or inherited id', async (t) => {
  for (const id of ['help', 'about-dialog', 'toString', '__proto__', 'constructor', '']) {
    await t.test(id || '(empty)', () => {
      assert.equal(helpTarget(id), null);
    });
  }
});

test('finds a page by its id', () => {
  assert.equal(findHelpPage(PAGES, 'table'), PAGES[1]);
  assert.equal(findHelpPage(PAGES, 'gone'), null);
  assert.equal(findHelpPage(PAGES, null), null);
});

test('searches the title, summary and text for every word', async (t) => {
  for (const [query, expected] of dataProviderSearches()) {
    await t.test(JSON.stringify(query), () => {
      assert.deepEqual(
        searchManual(PAGES, query).map((page) => page.id),
        expected,
      );
    });
  }
});

function dataProviderSearches() {
  return [
    ['', ['start', 'table', 'keys']],
    ['   ', ['start', 'table', 'keys']],
    ['field', ['table']],
    ['FIELD', ['table']],
    ['every', ['table', 'keys']],
    ['every key', ['keys']],
    ['  every   key  ', ['keys']],
    ['dropzone', ['start']],
    ['f1 badges', ['keys']],
    ['in', ['start', 'table']],
    ['every dropzone', []],
    ['nothing', []],
  ];
}

test('finds the pages before and after a page', async (t) => {
  for (const [id, previous, next] of dataProviderAdjacent()) {
    await t.test(String(id), () => {
      const pages = adjacentPages(PAGES, id);

      assert.equal(pages.previous?.id ?? null, previous);
      assert.equal(pages.next?.id ?? null, next);
    });
  }
});

function dataProviderAdjacent() {
  return [
    ['start', null, 'table'],
    ['table', 'start', 'keys'],
    ['keys', 'table', null],
    ['gone', null, null],
    [null, null, null],
  ];
}

test('puts every page of the manual in a section the manual lists', () => {
  assert.ok(MANUAL_PAGES.length > 0);

  for (const page of MANUAL_PAGES) {
    assert.ok(MANUAL_SECTIONS.includes(page.section), page.id);
    assert.ok(page.summary, page.id + ' has no summary');
  }
});
