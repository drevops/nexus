/**
 * Nexus web app entry point.
 *
 * Loads a Drupal config folder entirely in the browser (nothing is uploaded),
 * parses it, and renders the content-model diagram. Also handles the bundled
 * templates, the Open and Save buttons, links that carry a diagram, the
 * comparisons the Open menu starts and the loading overlay, and starts a
 * history for each diagram it draws.
 */

import { isModelConfig, parseConfig } from './parser.js';
import { ANNOTATION_FILES, applyAnnotations } from './annotations.js';
import { render } from './render.js';
import { exportPng, exportSvg, exportCsv, exportCsvTemplate, exportMermaid, exportDot, exportDocument, exportHtml, exportMarkdown } from './export.js';
import { csvDocument, csvErrorLines, csvTitle, fieldsCsv } from './fields-csv.js';
import { documentMarkdown, includesDiagram } from './markdown.js';
import { documentHtml } from './html-report.js';
import { bundlesCsv, referencesCsv } from './csv.js';
import { SAVE_MENU, findSaveFormat } from './save-formats.js';
import { documentFromGraph, documentToModel } from './document.js';
import { initBuilder, attachBuilder } from './builder.js';
import { initUI } from './ui.js';
import { initExploreBar } from './explore-bar.js';
import { initUndo, resetHistory, checkpoint } from './undo.js';
import { initShortcuts } from './keyboard.js';
import { initCompare, startComparison } from './compare.js';
import { initAiDialog, showAiDialog } from './ai-dialog.js';
import { initLinkDialog, showLinkDialog } from './link-dialog.js';
import { decodeDocument, documentLink, encodeDocument, linkParams } from './doc-link.js';
import { initIcons, icon } from './icons.js';
import { DEFAULT_TITLE } from './model.js';
import { exportLayout, importLayout, getController } from './store.js';
import { templateTitle } from './templates.js';
import { rowTemplate, templateText } from './template-list.js';
import { $ } from './dom.js';

const THEME_TOGGLES = '[data-theme-toggle]';

const SAVERS = {
  json: saveDocument,
  png: (controller, title) => exportPng(controller.cy, title),
  svg: (controller, title) => exportSvg(controller.cy, title),
  csv: (controller, title) => exportCsv(fieldsCsv(controller.records(), controller.typeLabel, controller.entities()), title, 'fields'),
  'bundles-csv': (controller, title) => exportCsv(bundlesCsv(currentDocument(controller, title)), title, 'bundles'),
  'references-csv': (controller, title) => exportCsv(referencesCsv(currentDocument(controller, title)), title, 'references'),
  md: saveMarkdown,
  html: (controller, title) => exportHtml(documentHtml(currentDocument(controller, title)), title),
  mermaid: (controller, title) => exportMermaid(controller.canvasGraph(), title),
  dot: (controller, title) => exportDot(controller.canvasGraph(), title),
};

const OPENERS = {
  document: () => $('doc-open').click(),
  import: showLanding,
  csv: () => $('csv-open').click(),
  'csv-template': exportCsvTemplate,
  ai: showAiDialog,
  'compare-document': () => $('compare-doc').click(),
  'compare-folder': () => $('compare-folder').click(),
};

const NO_ENTITIES =
  "No content types, vocabularies, media, paragraphs or blocks were found. Point at a Drupal config directory (or a module's config/install).";

function basename(path) {
  const parts = String(path).split('/');
  return parts[parts.length - 1];
}

function isYaml(name) {
  return /\.ya?ml$/i.test(name);
}

function isCsv(name) {
  return /\.csv$/i.test(name);
}

function showError(message) {
  const alert = $('landing-error');
  if (message) {
    const text = $('landing-error-text');
    // The alert sits below the templates, out of view in a short window. A
    // closed alert has no box to scroll to until it has shown.
    const reveal = () => text.scrollIntoView({ block: 'nearest' });

    text.textContent = message;

    if (alert.open) {
      reveal();
    } else {
      alert.addEventListener('sl-after-show', reveal, { once: true });
      alert.open = true;
    }
  } else {
    alert.open = false;
  }
}

function showLoader(message) {
  $('loader-text').textContent = message || 'Loading…';
  $('loader').hidden = false;
}

function hideLoader() {
  $('loader').hidden = true;
}

// The landing covers the toolbar, the canvas and the status bar, so they
// leave the tab order and the accessibility tree while it is open.
function setLandingOpen(open) {
  $('landing').hidden = !open;

  for (const region of [document.querySelector('.toolbar'), $('stage-root'), $('statusbar')]) {
    region.inert = open;
  }
}

function pageTitle(title) {
  return (title || 'Untitled') + ' - Nexus';
}

function showTitle(title) {
  $('diagram-title').value = title;
  document.title = pageTitle(title);
}

// `origin` labels the first version in the diagram's history.
function showDiagram(modelData, options, origin) {
  const controller = render(modelData, options);
  attachBuilder(controller.cy, controller.diagramDefaults().mode === 'edit');
  showTitle((modelData.meta && modelData.meta.title) || DEFAULT_TITLE);
  setLandingOpen(false);
  resetHistory(origin);
}

// Reads the model config and the annotation overlay of a folder's files into
// model data. Throws when the folder holds no YAML or no entity.
async function readConfigFolder(fileList) {
  const map = {};
  let annotations = null;
  let foundYaml = false;

  for (const file of fileList) {
    const name = basename(file.webkitRelativePath || file.name);
    const isAnnotations = ANNOTATION_FILES.includes(name);

    if (!isYaml(name)) {
      continue;
    }

    foundYaml = true;

    if (!isAnnotations && !isModelConfig(name)) {
      continue;
    }

    let data;
    try {
      data = window.jsyaml.load(await file.text());
    } catch {
      continue;
    }

    if (isAnnotations) {
      annotations = data;
    } else if (data && typeof data === 'object') {
      map[name] = data;
    }
  }

  if (!foundYaml) {
    throw new Error('No YAML configuration files were found in that folder.');
  }

  const model = parseConfig(map);

  if (annotations) {
    applyAnnotations(model, annotations);
  }

  const data = model.toArray();

  if (!data.meta.entityCount) {
    throw new Error(NO_ENTITIES);
  }

  return data;
}

async function loadFromFiles(fileList) {
  showError('');
  showLoader('Reading configuration…');
  try {
    showDiagram(await readConfigFolder(fileList), {}, 'Imported a config folder');
  } catch (e) {
    showError(e.message);
  } finally {
    hideLoader();
  }
}

// The name of the folder a folder picker's files came from.
function folderName(fileList) {
  const first = fileList[0];
  const path = first ? first.webkitRelativePath || '' : '';

  return path.split('/')[0] || 'a config folder';
}

// Compares the open diagram with a saved diagram or a config folder. A file
// that can't be read shows its reason on the landing screen, whose close
// button returns to the diagram unchanged.
async function compareWith(name, read) {
  showError('');
  showLoader('Comparing with ' + name + '…');
  try {
    startComparison(await read(), name);
  } catch (e) {
    showLanding();
    showError('Could not compare with ' + name + ': ' + e.message);
  } finally {
    hideLoader();
  }
}

function compareDocument(file) {
  return compareWith(file.name, async () => documentToModel(JSON.parse(await file.text())).modelData);
}

function compareFolder(fileList) {
  return compareWith(folderName(fileList), () => readConfigFolder(fileList));
}

async function loadTemplate(template) {
  const title = templateTitle(template);

  showError('');
  showLoader('Loading ' + title + '…');
  try {
    showDocument(JSON.parse(await templateText(template)), 'Loaded the ' + title + ' template');
  } catch (e) {
    showError('Could not load ' + title + ': ' + e.message);
  } finally {
    hideLoader();
  }
}

function collectDroppedEntries(items) {
  const roots = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) {
      roots.push(entry);
    }
  }

  const files = [];
  return Promise.all(roots.map((entry) => walkEntry(entry, files))).then(() => files);
}

function walkEntry(entry, files) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file(
        (file) => {
          files.push(file);
          resolve();
        },
        () => resolve(),
      );

      return;
    }

    if (!entry.isDirectory) {
      resolve();
      return;
    }

    const reader = entry.createReader();
    const readBatch = () => {
      reader.readEntries(
        (entries) => {
          if (!entries.length) {
            resolve();
            return;
          }

          Promise.all(entries.map((child) => walkEntry(child, files))).then(readBatch);
        },
        () => resolve(),
      );
    };

    readBatch();
  });
}

function wireLanding() {
  $('template-list').addEventListener('click', (evt) => {
    const row = evt.target.closest('.template-row');

    if (row) {
      loadTemplate(rowTemplate(row));
    }
  });

  const zone = $('dropzone');

  zone.addEventListener('dragover', (evt) => {
    evt.preventDefault();
    zone.classList.add('is-drag');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-drag'));
  zone.addEventListener('drop', (evt) => {
    evt.preventDefault();
    zone.classList.remove('is-drag');

    const files = evt.dataTransfer.files;

    if (files.length === 1 && isCsv(files[0].name)) {
      importCsv(files[0]);
      return;
    }

    const items = evt.dataTransfer.items;
    if (items && items.length && items[0].webkitGetAsEntry) {
      collectDroppedEntries(items).then((files) => loadFromFiles(files));
    } else {
      loadFromFiles(files);
    }
  });

  $('folder-btn').addEventListener('click', () => $('folder-input').click());
  $('folder-input').addEventListener('change', (evt) => loadFromFiles(evt.target.files));
  $('landing-open').addEventListener('click', () => $('doc-open').click());
  $('new-btn').addEventListener('click', newDocument);
  $('landing-cancel').addEventListener('click', () => setLandingOpen(false));

  setLandingOpen(!$('landing').hidden);
}

// The close button returns to a loaded diagram, so it stays hidden until one
// exists.
function showLanding() {
  showError('');
  $('landing-cancel').hidden = !getController();
  setLandingOpen(true);
}

function saveAs(format) {
  const controller = getController();

  if (controller) {
    SAVERS[format.id](controller, $('diagram-title').value || DEFAULT_TITLE);
  }
}

function saveMenuItem(entry) {
  const item = document.createElement('sl-menu-item');
  const glyph = document.createElement('span');

  glyph.slot = 'prefix';
  glyph.innerHTML = icon(entry.icon);
  item.append(glyph, entry.label);
  item.setAttribute('title', entry.title);

  if (!entry.formats) {
    item.setAttribute('value', entry.id);

    return item;
  }

  const submenu = document.createElement('sl-menu');
  submenu.slot = 'submenu';
  submenu.append(...entry.formats.map(saveMenuItem));
  item.append(submenu);

  return item;
}

function wireOpenAndSave() {
  $('save-divider').before(...SAVE_MENU.map(saveMenuItem));

  $('open-menu').addEventListener('sl-select', (evt) => {
    if (evt.detail.item.querySelector(':scope > sl-menu')) {
      evt.stopPropagation();

      return;
    }

    const value = evt.detail.item.value;

    if (Object.hasOwn(OPENERS, value)) {
      OPENERS[value]();
    }
  });

  $('save-menu').addEventListener('sl-select', (evt) => {
    // A click on the icon of a submenu's own item selects that item, and the
    // dropdown closes on any select that reaches it.
    if (evt.detail.item.querySelector(':scope > sl-menu')) {
      evt.stopPropagation();

      return;
    }

    const value = evt.detail.item.value;
    const format = findSaveFormat(value);

    if (format) {
      saveAs(format);
    } else if (value === 'link') {
      copyLink();
    }
  });
}

function currentDocument(controller, title) {
  const types = controller.typeSettings();
  const meta = { title: title, colors: types.colors, symbols: types.symbols, customTypes: types.customTypes, ui: exportLayout() };

  return controller.withoutExplore(() => documentFromGraph(controller.cy, meta));
}

function saveDocument(controller, title) {
  exportDocument(currentDocument(controller, title), title);
}

function saveMarkdown(controller, title) {
  const doc = currentDocument(controller, title);
  const diagram = includesDiagram(controller.markdownSettings(), doc.entities.length);

  exportMarkdown(documentMarkdown(doc, { diagram: diagram }), title);
}

function showDocument(data, origin) {
  const doc = documentToModel(data);
  showDiagram(doc.modelData, { layout: doc.layout, colors: doc.colors, symbols: doc.symbols, customTypes: doc.customTypes }, origin);
  if (doc.ui) {
    importLayout(doc.ui);
  }
}

// The link leaves out the panel layout, so the receiver keeps their own
// panels. It names the entity of the focused or inspected node.
async function copyLink() {
  const controller = getController();

  if (!controller) {
    return;
  }

  const title = $('diagram-title').value || DEFAULT_TITLE;
  const doc = { ...currentDocument(controller, title), ui: null };
  const target = controller.tidyTarget();
  const page = window.location.href;
  const link = documentLink(page, await encodeDocument(doc), target.nonempty() ? target.id() : null);

  showLinkDialog(link, () => saveDocument(controller, title));
}

function focusLinkedEntity(id) {
  const controller = getController();

  if (id && controller.cy.getElementById(id).data('group') === 'entity') {
    controller.focusEntity(id);
  }
}

// Opens the document the page's fragment carries, if any.
async function openLink() {
  const params = linkParams(window.location.hash);

  if (!params) {
    return;
  }

  showError('');
  showLoader('Opening diagram…');
  try {
    showDocument(await decodeDocument(params.encoded), 'Opened a link');
    focusLinkedEntity(params.focus);
  } catch (e) {
    showLanding();
    showError('Could not open that diagram: ' + e.message);
  } finally {
    hideLoader();
  }
}

async function openDocument(file) {
  showError('');
  showLoader('Opening diagram…');
  try {
    showDocument(JSON.parse(await file.text()), 'Opened ' + file.name);
  } catch (e) {
    showLanding();
    showError('Could not open that diagram: ' + e.message);
  } finally {
    hideLoader();
  }
}

async function importCsv(file) {
  showError('');
  showLoader('Reading ' + file.name + '…');
  try {
    const result = csvDocument(await file.text(), csvTitle(file.name) || DEFAULT_TITLE);

    if (result.errors.length) {
      showLanding();
      showError(['Could not import ' + file.name + ':', ...csvErrorLines(result.errors)].join('\n'));
      return;
    }

    showDocument(result.document, 'Imported ' + file.name);
  } catch (e) {
    showLanding();
    showError('Could not import ' + file.name + ': ' + e.message);
  } finally {
    hideLoader();
  }
}

function newDocument() {
  showDiagram({ meta: { title: 'New content model', entityCount: 0 }, nodes: [], edges: [] }, {}, 'Started a new content model');
}

function wireDocument() {
  $('doc-save').addEventListener('click', () => saveAs(findSaveFormat('json')));
  $('doc-new').addEventListener('click', newDocument);
  $('doc-open-btn').addEventListener('click', () => $('doc-open').click());
  $('doc-open').addEventListener('change', (evt) => {
    if (evt.target.files[0]) {
      openDocument(evt.target.files[0]);
    }
    evt.target.value = '';
  });
  $('csv-open').addEventListener('change', (evt) => {
    if (evt.target.files[0]) {
      importCsv(evt.target.files[0]);
    }
    evt.target.value = '';
  });
  $('compare-doc').addEventListener('change', (evt) => {
    if (evt.target.files[0]) {
      compareDocument(evt.target.files[0]);
    }
    evt.target.value = '';
  });
  $('compare-folder').addEventListener('change', (evt) => {
    const files = [...evt.target.files];

    if (files.length) {
      compareFolder(files);
    }
    evt.target.value = '';
  });
  $('diagram-title').addEventListener('sl-input', () => {
    document.title = pageTitle($('diagram-title').value);
    checkpoint('Renamed the diagram', 'title');
  });
}

function applyTheme(dark) {
  document.documentElement.classList.toggle('sl-theme-dark', dark);

  for (const btn of document.querySelectorAll(THEME_TOGGLES)) {
    btn.innerHTML = icon(dark ? 'sun' : 'moon');
    // SlButton does not reflect its title property, so set the attribute.
    btn.setAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  const controller = getController();

  if (controller) {
    controller.applyTheme();
  }

  try {
    window.localStorage.setItem('nexusTheme', dark ? 'dark' : 'light');
  } catch {
    // Storage may be unavailable; the theme still applies for this session.
  }
}

function isDark() {
  return document.documentElement.classList.contains('sl-theme-dark');
}

// The inline script in index.html has already picked the theme.
function initTheme() {
  applyTheme(isDark());

  for (const btn of document.querySelectorAll(THEME_TOGGLES)) {
    btn.addEventListener('click', () => applyTheme(!isDark()));
  }
}

// Echo a hovered control's title into the status bar immediately, so the
// description appears without waiting for the native tooltip.
function initStatusbar() {
  const hint = $('statusbar-hint');
  let hovered = null;

  const echo = (el) => {
    hovered = el;
    hint.textContent = el ? el.getAttribute('title') || '' : '';
  };

  // A title change under a still pointer fires no mouseover, so watch the
  // attribute too.
  const observer = new MutationObserver(() => echo(hovered));

  document.querySelectorAll('.toolbar, .statusbar').forEach((zone) => {
    const echoTarget = (evt) => {
      const el = evt.target.closest('[title]');
      echo(el && zone.contains(el) ? el : null);
    };

    // Captured, because a Shoelace menu item stops its mouseover from
    // bubbling.
    zone.addEventListener('mouseover', echoTarget, true);
    zone.addEventListener('mouseleave', () => echo(null));
    observer.observe(zone, { attributes: true, attributeFilter: ['title'], subtree: true });
  });
}

// Marks each tool section that ends a wrapped line, so its separator hides.
function initToolbarSeparators() {
  const row = document.querySelector('.toolbar__tools');
  const sections = [...row.children];

  const markLineEnds = () => {
    sections.forEach((section, i) => {
      const next = sections[i + 1];

      // Sections on 1 line differ in height, so a new line starts at or below
      // the bottom of the section before it.
      section.classList.toggle('is-line-end', !next || next.offsetTop >= section.offsetTop + section.offsetHeight);
    });
  };

  const observer = new ResizeObserver(markLineEnds);

  // A label change can move a line break without resizing the row, so each
  // section is observed too.
  [row, ...sections].forEach((el) => observer.observe(el));
}

// A pinch reaches the page as a wheel event with ctrlKey set, or as gesture
// events in Safari, and zooms the page wherever Cytoscape does not take it.
function initPageZoomGuard() {
  document.addEventListener(
    'wheel',
    (evt) => {
      if (evt.ctrlKey) {
        evt.preventDefault();
      }
    },
    { passive: false },
  );

  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, (evt) => evt.preventDefault());
  }
}

function initAbout() {
  const dialog = $('about-dialog');
  $('about-toggle').addEventListener('click', () => dialog.show());
  $('about-close').addEventListener('click', () => dialog.hide());
}

function enableLanding() {
  const landing = $('landing');
  landing.inert = false;
  landing.removeAttribute('aria-busy');
}

wireLanding();
wireOpenAndSave();
wireDocument();
initUI();
initBuilder();
initUndo(showTitle);
initExploreBar();
initCompare();
initShortcuts();
initIcons();
initTheme();
initStatusbar();
initToolbarSeparators();
initPageZoomGuard();
initAbout();
initAiDialog(showDocument);
initLinkDialog();
enableLanding();
openLink();
window.addEventListener('hashchange', openLink);
