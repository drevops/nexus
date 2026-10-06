/**
 * Nexus web app entry point.
 *
 * Loads a Drupal config folder entirely in the browser (nothing is uploaded),
 * parses it, and renders the content-model diagram. Also handles the bundled
 * templates, the Export button and the loading overlay, and starts a history
 * for each diagram it draws.
 */

import { isModelConfig, parseConfig } from './parser.js';
import { applyAnnotations } from './annotations.js';
import { render } from './render.js';
import { exportPng, exportSvg, exportCsv, exportDocument } from './export.js';
import { EXPORT_FORMATS, findExportFormat, loadExportFormat, saveExportFormat } from './export-formats.js';
import { documentFromGraph, documentToModel } from './document.js';
import { initBuilder, attachBuilder } from './builder.js';
import { initUI } from './ui.js';
import { initUndo, resetHistory, checkpoint } from './undo.js';
import { initIcons, icon } from './icons.js';
import { VERSION } from './version.js';
import { DEFAULT_TITLE } from './model.js';
import { exportLayout, importLayout, getController } from './store.js';
import { TEMPLATES, summaryCounts, templatePath, templateTitle } from './templates.js';
import { formatCount } from './entity-types.js';
import { $ } from './dom.js';

const ANNOTATION_FILES = ['annotations.yml', 'nexus.annotations.yml'];
const THEME_TOGGLES = '[data-theme-toggle]';

const EXPORTERS = {
  png: (controller, title) => exportPng(controller.cy, title),
  svg: (controller, title) => exportSvg(controller.cy, title),
  csv: (controller, title) => exportCsv(controller.records(), controller.typeLabel, title),
};

// The format the Export button repeats, or null until 1 is chosen from its
// menu.
let exportFormat = null;

function basename(path) {
  const parts = String(path).split('/');
  return parts[parts.length - 1];
}

function isYaml(name) {
  return /\.ya?ml$/i.test(name);
}

function showError(message) {
  const alert = $('landing-error');
  if (message) {
    $('landing-error-text').textContent = message;
    alert.open = true;
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
  attachBuilder(controller.cy);
  showTitle((modelData.meta && modelData.meta.title) || DEFAULT_TITLE);
  setLandingOpen(false);
  resetHistory(origin);
}

function buildAndShow(map, annotations) {
  const model = parseConfig(map);

  if (annotations) {
    applyAnnotations(model, annotations);
  }

  const data = model.toArray();
  if (!data.meta.entityCount) {
    showError("No content types, vocabularies, media, paragraphs or blocks were found. Point at a Drupal config directory (or a module's config/install).");
    return;
  }

  showError('');
  showDiagram(data, {}, 'Imported a config folder');
}

async function loadFromFiles(fileList) {
  showError('');
  showLoader('Reading configuration…');
  try {
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
      showError('No YAML configuration files were found in that folder.');
      return;
    }

    buildAndShow(map, annotations);
  } finally {
    hideLoader();
  }
}

async function fetchText(url) {
  let response;
  let text;

  try {
    response = await fetch(url);
    text = await response.text();
  } catch {
    throw new Error(basename(url) + ' could not be downloaded. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error(basename(url) + ' returned ' + response.status);
  }

  return text;
}

async function loadTemplate(template) {
  const title = templateTitle(template);

  showError('');
  showLoader('Loading ' + title + '…');
  try {
    showDocument(await fetchText(templatePath(template)), 'Loaded the ' + title + ' template');
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

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

function templateRow(template) {
  const row = element('button', 'template-row');
  row.type = 'button';
  row.id = 'template-' + template.id;
  row.title = 'Load the ' + templateTitle(template) + ' content model';
  row.addEventListener('click', () => loadTemplate(template));

  const mark = element('span', 'template-row__mark');
  mark.style.setProperty('--template-color', template.color);
  mark.innerHTML = icon(template.icon);

  const head = element('span', 'template-row__head');
  head.append(element('span', 'template-row__name', template.label), element('span', 'template-row__badge', template.version));

  const counts = summaryCounts(template).map(({ type, count }) => formatCount(type, count));
  const body = element('span', 'template-row__body');
  body.append(head, element('span', 'template-row__summary', template.summary), element('span', 'template-row__counts', counts.join(' · ')));

  const go = element('span', 'template-row__go');
  go.innerHTML = icon('chevron-right');

  row.append(mark, body, go);

  return row;
}

function wireLanding() {
  $('template-list').append(...TEMPLATES.map(templateRow));

  const zone = $('dropzone');

  zone.addEventListener('dragover', (evt) => {
    evt.preventDefault();
    zone.classList.add('is-drag');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-drag'));
  zone.addEventListener('drop', (evt) => {
    evt.preventDefault();
    zone.classList.remove('is-drag');

    const items = evt.dataTransfer.items;
    if (items && items.length && items[0].webkitGetAsEntry) {
      collectDroppedEntries(items).then((files) => loadFromFiles(files));
    } else {
      loadFromFiles(evt.dataTransfer.files);
    }
  });

  $('folder-btn').addEventListener('click', () => $('folder-input').click());
  $('folder-input').addEventListener('change', (evt) => loadFromFiles(evt.target.files));
  $('landing-open').addEventListener('click', () => $('doc-open').click());
  $('new-btn').addEventListener('click', newDocument);
  $('doc-import').addEventListener('click', showLanding);
  $('landing-cancel').addEventListener('click', () => setLandingOpen(false));

  // Ignored while loading, as a failed load reports its error on the landing.
  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && !$('landing').hidden && !$('landing-cancel').hidden && $('loader').hidden) {
      setLandingOpen(false);
    }
  });

  setLandingOpen(!$('landing').hidden);
}

// The close button returns to a loaded diagram, so it stays hidden until one
// exists.
function showLanding() {
  showError('');
  $('landing-cancel').hidden = !getController();
  setLandingOpen(true);
}

function runExport(format) {
  const controller = getController();

  if (controller) {
    EXPORTERS[format.id](controller, $('diagram-title').value);
  }
}

function setExportFormat(format) {
  const button = $('export-run');

  exportFormat = format;
  button.querySelector('.export-label').textContent = 'Export ' + format.label;
  button.setAttribute('title', format.title);
}

function exportMenuItem(format) {
  const item = document.createElement('sl-menu-item');
  const glyph = document.createElement('span');

  glyph.slot = 'prefix';
  glyph.innerHTML = icon(format.icon);
  item.append(glyph, format.label);
  item.setAttribute('value', format.id);
  item.setAttribute('title', format.title);

  return item;
}

function wireExports() {
  const dropdown = $('export-dropdown');
  const saved = loadExportFormat(window);

  $('export-menu').append(...EXPORT_FORMATS.map(exportMenuItem));

  if (saved) {
    setExportFormat(saved);
  }

  // Clicks on the main button count as inside the dropdown, so the button can
  // close the menu it opened.
  customElements.whenDefined('sl-dropdown').then(() => {
    dropdown.containingElement = $('export-group');
  });

  $('export-run').addEventListener('click', () => {
    // Until a format is chosen, the main button opens the menu as the caret
    // does.
    if (!exportFormat) {
      $('export-choose').click();
      return;
    }

    dropdown.hide();
    runExport(exportFormat);
  });

  $('export-menu').addEventListener('sl-select', (evt) => {
    const format = findExportFormat(evt.detail.item.value);

    if (!format) {
      return;
    }

    setExportFormat(format);
    saveExportFormat(window, format);
    runExport(format);
  });
}

function saveDocument() {
  const controller = getController();

  if (!controller) {
    return;
  }

  const title = $('diagram-title').value || DEFAULT_TITLE;
  const types = controller.typeSettings();
  const doc = documentFromGraph(controller.cy, {
    title: title,
    colors: types.colors,
    symbols: types.symbols,
    customTypes: types.customTypes,
    ui: exportLayout(),
  });

  exportDocument(doc, title);
}

function showDocument(text, origin) {
  const doc = documentToModel(JSON.parse(text));
  showDiagram(doc.modelData, { layout: doc.layout, colors: doc.colors, symbols: doc.symbols, customTypes: doc.customTypes }, origin);
  if (doc.ui) {
    importLayout(doc.ui);
  }
}

async function openDocument(file) {
  showError('');
  showLoader('Opening diagram…');
  try {
    showDocument(await file.text(), 'Opened ' + file.name);
  } catch (e) {
    showLanding();
    showError('Could not open that diagram: ' + e.message);
  } finally {
    hideLoader();
  }
}

function newDocument() {
  showDiagram({ meta: { title: 'New content model', entityCount: 0 }, nodes: [], edges: [] }, {}, 'Started a new content model');
}

function wireDocument() {
  $('doc-save').addEventListener('click', saveDocument);
  $('doc-new').addEventListener('click', newDocument);
  $('doc-open-btn').addEventListener('click', () => $('doc-open').click());
  $('doc-open').addEventListener('change', (evt) => {
    if (evt.target.files[0]) {
      openDocument(evt.target.files[0]);
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

function initTheme() {
  let dark = false;
  try {
    const saved = window.localStorage.getItem('nexusTheme');
    dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    dark = false;
  }
  applyTheme(dark);

  for (const btn of document.querySelectorAll(THEME_TOGGLES)) {
    btn.addEventListener('click', () => applyTheme(!document.documentElement.classList.contains('sl-theme-dark')));
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

function initAbout() {
  const dialog = $('about-dialog');
  $('about-toggle').addEventListener('click', () => dialog.show());
  $('about-close').addEventListener('click', () => dialog.hide());
}

function initVersion() {
  document.querySelectorAll('[data-version]').forEach((el) => {
    el.textContent = VERSION;
  });
}

wireLanding();
wireExports();
wireDocument();
initUI();
initBuilder();
initUndo(showTitle);
initIcons();
initTheme();
initStatusbar();
initAbout();
initVersion();
