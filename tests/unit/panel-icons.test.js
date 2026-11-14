import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PANEL_ICONS } from '../../src/panel-icons.js';
import { PANEL_ORDER } from '../../src/store.js';
import { hasIcon } from '../../src/icons.js';

const INDEX = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');

// Returns the data-icon of the 1 element whose opening tag carries the given
// attribute, such as 'id="about-toggle"' or 'value="link"'. A menu item
// carries its icon on the prefix span that starts its content.
function iconOf(attribute) {
  const tags = [...INDEX.matchAll(/<[a-z-]+\b[^>]*>(?:<span slot="prefix"[^>]*>)?/g)].map((match) => match[0]).filter((tag) => tag.includes(' ' + attribute));

  assert.equal(tags.length, 1, attribute);

  return tags[0].match(/data-icon="([^"]+)"/)?.[1];
}

function dialogIcon(id) {
  const dialog = INDEX.match(new RegExp('<sl-dialog id="' + id + '"[^>]*>\\s*(<span slot="label"[^>]*>)'));

  assert.ok(dialog, id);

  return dialog[1].match(/data-icon="([^"]+)"/)?.[1];
}

test('gives every panel an icon the icon set draws', () => {
  assert.deepEqual(Object.keys(PANEL_ICONS), PANEL_ORDER);

  for (const [panel, name] of Object.entries(PANEL_ICONS)) {
    assert.ok(hasIcon(name), panel);
  }
});

test('gives each panel the icon of the button that opens it', async (t) => {
  for (const [panel, opener] of dataProviderPanelOpeners()) {
    await t.test(panel, () => {
      assert.equal(PANEL_ICONS[panel], iconOf(opener));
    });
  }
});

function dataProviderPanelOpeners() {
  return [
    ['entities', 'id="entities-toggle"'],
    ['table', 'id="table-toggle"'],
    ['legend', 'id="legend-toggle"'],
    ['history', 'id="history-toggle"'],
    ['checks', 'id="checks-toggle"'],
    ['changes', 'id="changes-toggle"'],
    ['inspector', 'id="mode-build"'],
  ];
}

test('gives each dialog the icon of every control that opens it', async (t) => {
  for (const [dialog, opener] of dataProviderDialogOpeners()) {
    await t.test(dialog + ' from ' + opener, () => {
      const name = dialogIcon(dialog);

      assert.ok(hasIcon(name), dialog);
      assert.equal(name, iconOf(opener));
    });
  }
});

function dataProviderDialogOpeners() {
  return [
    ['about-dialog', 'id="about-toggle"'],
    ['ai-dialog', 'id="landing-ai"'],
    ['ai-dialog', 'value="ai"'],
    ['settings', 'id="settings-toggle"'],
    ['link-dialog', 'value="link"'],
  ];
}

test('labels every dialog in its header slot', () => {
  const dialogs = [...INDEX.matchAll(/<sl-dialog id="([^"]+)"([^>]*)>/g)];

  assert.deepEqual(
    dialogs.map((match) => match[1]),
    ['about-dialog', 'ai-dialog', 'settings', 'link-dialog'],
  );

  for (const [, id, attributes] of dialogs) {
    assert.doesNotMatch(attributes, /\blabel=/, id);
    assert.match(dialogIcon(id), /\S/, id);
  }
});
