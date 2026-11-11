import { test, expect } from '@playwright/test';
import {
  nodePositions,
  waitForGraph,
  loadExample,
  slFill,
  slSelect,
  openDocument,
  createEntity,
  buildStoryWithField,
  tapNode,
  captionsOf,
  referenceView,
  PROXY_VIEW,
  TRACK_FIELD,
  TRACKS,
  editExample,
  selectTrackField,
  addTarget,
  pickLayout,
  SCATTERED_DOC,
  hasNode,
  entityIds,
  pagePosition,
  buildEntities,
  dataProviderShortcutModifiers,
} from './helpers.js';

// Every element with its data and, for a node, its position, sorted by id.
function graphState(page) {
  return page.evaluate(() =>
    window.__nexus.cy
      .elements()
      .map((element) => ({ data: { ...element.data() }, position: element.isNode() ? { ...element.position() } : null }))
      .sort((a, b) => a.data.id.localeCompare(b.data.id)),
  );
}

// The versions listed in the History panel, newest first, each as its label
// and its state: 'current', 'undone' or 'done'.
function historyVersions(page) {
  return page.locator('#history .history__version').evaluateAll((buttons) =>
    buttons.map((button) => {
      const state = button.classList.contains('is-current') ? 'current' : button.classList.contains('is-undone') ? 'undone' : 'done';
      return [button.querySelector('.history__label').textContent, state];
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('undoes and redoes an edit from the toolbar', async ({ page }) => {
  await page.click('#new-btn');
  await page.click('#mode-build');
  await expect(page.locator('#undo')).toHaveAttribute('disabled', '');
  await expect(page.locator('#undo')).toHaveAttribute('title', 'Nothing to undo');

  await createEntity(page, 'node', 'story', 'Story');
  await expect(page.locator('#undo')).not.toHaveAttribute('disabled');
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Added entity “Story” \(/);

  await page.click('#undo');
  expect(await hasNode(page, 'node.story')).toBe(false);
  await expect(page.locator('#undo')).toHaveAttribute('disabled', '');
  await expect(page.locator('#redo')).toHaveAttribute('title', /^Redo: Added entity “Story” \(/);

  await page.click('#redo');
  expect(await hasNode(page, 'node.story')).toBe(true);
  await expect(page.locator('#redo')).toHaveAttribute('disabled', '');
  await expect(page.locator('#redo')).toHaveAttribute('title', 'Nothing to redo');
});

// The shortcuts take Cmd or Ctrl on every platform, so each case runs with
// both.
for (const [name, modifier] of dataProviderShortcutModifiers()) {
  test(`undoes with ${name}+Z and redoes with ${name}+Shift+Z`, async ({ page }) => {
    await buildStoryWithField(page);
    const field = 'field:node.story:field_1';
    await page.evaluate(() => document.activeElement.blur());

    await page.keyboard.press(modifier + '+z');
    expect(await hasNode(page, field)).toBe(false);
    expect(await hasNode(page, 'node.story')).toBe(true);

    await page.keyboard.press(modifier + '+Shift+z');
    expect(await hasNode(page, field)).toBe(true);
  });

  test(`leaves ${name}+Z to a text field that has the focus`, async ({ page }) => {
    await buildEntities(page, ['story']);

    await page.locator('#search').click();
    await page.keyboard.press(modifier + '+z');
    expect(await hasNode(page, 'node.story')).toBe(true);

    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press(modifier + '+z');
    expect(await hasNode(page, 'node.story')).toBe(false);
  });

  // A Shoelace select shows its value in a read-only text input, which keeps
  // the focus once an option is picked.
  test(`undoes with ${name}+Z while a dropdown has the focus`, async ({ page }) => {
    await selectTrackField(page);
    const cardinality = page.locator('#inspector sl-select[data-cardinality]');
    await cardinality.click();
    // The list takes the arrow keys only once it has opened.
    await expect(cardinality).toHaveAttribute('open', '');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(cardinality).toHaveJSProperty('value', '2');

    await page.keyboard.press(modifier + '+z');

    await expect(cardinality).toHaveJSProperty('value', '1');
  });
}

test('redoes with Ctrl+Y', async ({ page }) => {
  await buildStoryWithField(page);
  const field = 'field:node.story:field_1';
  await page.evaluate(() => document.activeElement.blur());

  await page.keyboard.press('Control+z');
  expect(await hasNode(page, field)).toBe(false);

  await page.keyboard.press('Control+y');
  expect(await hasNode(page, field)).toBe(true);
});

test('restores a deleted entity with its fields, references and proxies where they were', async ({ page }) => {
  await editExample(page);
  const before = await graphState(page);

  await tapNode(page, TRACKS);
  await page.click('#inspector .insp__delete');
  expect(await hasNode(page, TRACKS)).toBe(false);
  const deleted = await graphState(page);

  await page.click('#undo');
  expect(await graphState(page)).toEqual(before);

  await page.click('#redo');
  expect(await graphState(page)).toEqual(deleted);
});

test('undoes a machine-name rename with its fields, references, proxies and captions', async ({ page }) => {
  await editExample(page);
  const before = await graphState(page);
  const captions = await captionsOf(page, 'node.event');

  await tapNode(page, 'node.event');
  await slFill(page, '#inspector sl-input[data-machine-name]', 'gathering');
  expect(await hasNode(page, 'node.gathering')).toBe(true);

  await page.click('#undo');
  expect(await graphState(page)).toEqual(before);
  expect(await captionsOf(page, 'node.event')).toEqual(captions);
  expect(await captionsOf(page, 'node.gathering')).toEqual([]);
});

test('closes the inspector when undo removes the node it shows', async ({ page }) => {
  await buildEntities(page, ['story']);
  await expect(page.locator('#inspector sl-input[data-label]')).toHaveCount(1);

  await page.click('#undo');

  await expect(page.locator('#inspector')).toHaveCount(0);
  await expect(page.locator('.handle')).toHaveCount(0);
});

test('shows an undone change in the open inspector', async ({ page }) => {
  await selectTrackField(page);
  const cardinality = page.locator('#inspector sl-select[data-cardinality]');
  await slSelect(page, '#inspector sl-select[data-cardinality]', '3');

  await page.click('#undo');

  await expect(cardinality).toHaveJSProperty('value', '1');
  expect(await page.evaluate((id) => window.__nexus.cy.getElementById(id).data('cardinality'), 'pe:' + TRACK_FIELD + '>' + TRACKS)).toBe('1');
});

test('undoes a reference added in the inspector and redoes it with its proxy where it was', async ({ page }) => {
  await selectTrackField(page);
  await addTarget(page, 'node.event');
  const proxyId = 'proxy:' + TRACK_FIELD + '>node.event';
  const placed = await page.evaluate((id) => ({ ...window.__nexus.cy.getElementById(id).position() }), proxyId);

  await page.click('#undo');
  expect(await referenceView(page, TRACK_FIELD, 'node.event')).toEqual({ ref: false, proxy: false, proxyEdge: false, collapsed: false });

  await page.click('#redo');
  expect(await referenceView(page, TRACK_FIELD, 'node.event')).toEqual(PROXY_VIEW);
  expect(await page.evaluate((id) => ({ ...window.__nexus.cy.getElementById(id).position() }), proxyId)).toEqual(placed);
});

test('undoes a node dragged on the canvas', async ({ page }) => {
  await buildEntities(page, ['story']);
  const before = await nodePositions(page);
  const from = await pagePosition(page, 'node.story');

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 90, from.y + 60, { steps: 6 });
  await page.mouse.up();

  expect(await nodePositions(page)).not.toEqual(before);
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Moved entity “STORY” \(/);

  await page.click('#undo');
  expect(await nodePositions(page)).toEqual(before);
});

test('undoes moving an isolated entity with its fields', async ({ page }) => {
  await editExample(page);
  const before = await nodePositions(page);

  await page.evaluate(() => {
    const session = window.__nexus.cy.getElementById('node.session');
    const start = { ...session.position() };
    session.emit('cxttap');
    session.emit('grabon');
    session.position({ x: start.x + 120, y: start.y + 40 });
    session.emit('drag');
    session.emit('dragfreeon');
  });
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Moved entity “Session” with its fields \(/);

  await page.click('#undo');
  expect(await nodePositions(page)).toEqual(before);
  expect(await page.evaluate(() => window.__nexus.cy.elements('.faded').length)).toBe(0);
});

for (const [name, button, label] of dataProviderLayoutSteps()) {
  test(`undoes ${name} back to the saved layout`, async ({ page }) => {
    await openDocument(page, SCATTERED_DOC);
    const saved = await nodePositions(page);

    await page.click(button);
    expect(await nodePositions(page)).not.toEqual(saved);
    await expect(page.locator('#undo')).toHaveAttribute('title', new RegExp('^Undo: ' + label + ' \\('));

    await page.click('#undo');
    expect(await nodePositions(page)).toEqual(saved);
  });
}

function dataProviderLayoutSteps() {
  return [
    ['Tidy', '#tidy', 'Tidied the layout'],
    ['re-running the layout', '#layout-run', 'Re-ran the Columns layout'],
  ];
}

test('records typing into an inspector field as 1 version and shows the field as it was on undo', async ({ page }) => {
  await buildEntities(page, ['story']);

  for (const label of ['S', 'St', 'Stories']) {
    await slFill(page, '#inspector sl-input[data-label]', label);
  }

  await page.click('#history-toggle');
  expect(await historyVersions(page)).toEqual([
    ['Relabelled entity “Stories”', 'current'],
    ['Added entity “STORY”', 'done'],
    ['Started a new content model', 'done'],
  ]);

  await page.click('#undo');
  expect(await page.evaluate(() => window.__nexus.cy.getElementById('node.story').data('label'))).toBe('STORY');
  await expect(page.locator('#inspector sl-input[data-label]')).toHaveJSProperty('value', 'STORY');
});

test('undoes a note and its badge', async ({ page }) => {
  await buildEntities(page, ['story']);
  await slFill(page, '#inspector sl-textarea[data-note]', 'Draft');
  await expect(page.locator('#notes .note-badge')).toHaveCount(1);

  await page.click('#undo');
  await expect(page.locator('#notes .note-badge')).toHaveCount(0);
  await expect(page.locator('#inspector sl-textarea[data-note]')).toHaveJSProperty('value', '');

  await page.click('#redo');
  await expect(page.locator('#notes .note-badge')).toHaveCount(1);
});

test('undoes and redoes renaming the diagram as 1 version', async ({ page }) => {
  await page.click('#new-btn');
  await slFill(page, '#diagram-title', 'Road');
  await slFill(page, '#diagram-title', 'Roadmap');
  await expect(page.locator('#undo')).toHaveAttribute('title', /^Undo: Renamed the diagram \(/);

  await page.click('#undo');
  await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'New content model');
  await expect(page).toHaveTitle('New content model - Nexus');
  await expect(page.locator('#undo')).toHaveAttribute('disabled', '');

  await page.click('#redo');
  await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Roadmap');
  await expect(page).toHaveTitle('Roadmap - Nexus');
});

test('returns to a version picked in the History panel and drops the undone versions on the next edit', async ({ page }) => {
  await buildEntities(page, ['a', 'b', 'c']);
  await page.click('#history-toggle');

  await page.click('#history [data-history-index="1"]');
  expect(await entityIds(page)).toEqual(['node.a']);
  expect(await historyVersions(page)).toEqual([
    ['Added entity “C”', 'undone'],
    ['Added entity “B”', 'undone'],
    ['Added entity “A”', 'current'],
    ['Started a new content model', 'done'],
  ]);

  await page.click('#history [data-history-index="3"]');
  expect(await entityIds(page)).toEqual(['node.a', 'node.b', 'node.c']);

  await page.click('#history [data-history-index="1"]');
  await createEntity(page, 'node', 'd', 'D');
  expect(await historyVersions(page)).toEqual([
    ['Added entity “D”', 'current'],
    ['Added entity “A”', 'done'],
    ['Started a new content model', 'done'],
  ]);
  await expect(page.locator('#redo')).toHaveAttribute('disabled', '');
});

test('leaves display toggles and layout picks out of the history and their layout out of later undos', async ({ page }) => {
  await editExample(page);
  await page.click('#entities-toggle');

  for (const toggle of ['#fields-toggle', '#fields-toggle', '#proxy-toggle', '#proxy-toggle', '#machine-names']) {
    await page.click(toggle);
  }

  await pickLayout(page, 'tb');
  await page.locator('#type-filters input').first().uncheck();
  await page.locator('#type-filters input').first().check();
  await expect(page.locator('#undo')).toHaveAttribute('disabled', '');

  await createEntity(page, 'node', 'campaign', 'Campaign');
  await pickLayout(page, 'lr');
  const laidOut = await nodePositions(page);
  delete laidOut['node.campaign'];

  await page.click('#undo');
  expect(await hasNode(page, 'node.campaign')).toBe(false);
  expect(await nodePositions(page)).toEqual(laidOut);
});

for (const [name, open, origin] of dataProviderHistoryOrigins()) {
  test(`starts the history of ${name} with 1 version`, async ({ page }) => {
    await open(page);
    await page.click('#history-toggle');

    const versions = await historyVersions(page);
    expect(versions).toHaveLength(1);
    expect(versions[0][0]).toMatch(origin);
    expect(versions[0][1]).toBe('current');
    await expect(page.locator('#undo')).toHaveAttribute('disabled', '');
  });
}

function dataProviderHistoryOrigins() {
  return [
    ['an imported config folder', loadExample, /^Imported a config folder$/],
    ['an opened diagram', (page) => openDocument(page, SCATTERED_DOC), /^Opened diagram\.nexus\.json$/],
    ['a new content model', (page) => page.click('#new-btn'), /^Started a new content model$/],
    [
      'a template',
      async (page) => {
        await page.click('#template-drupal-cms');
        await waitForGraph(page);
      },
      /^Loaded the Drupal CMS [\d.]+ template$/,
    ],
  ];
}

test('starts a new history when another diagram is opened', async ({ page }) => {
  await buildEntities(page, ['story']);
  await page.click('#history-toggle');
  expect(await historyVersions(page)).toHaveLength(2);

  await page.click('#doc-new');

  expect(await historyVersions(page)).toEqual([['Started a new content model', 'current']]);
  await expect(page.locator('#undo')).toHaveAttribute('disabled', '');
});
