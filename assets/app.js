/**
 * Nexus web app entry point.
 *
 * Loads a Drupal config folder entirely in the browser (nothing is uploaded),
 * parses it, and renders the content-model diagram. Also handles the bundled
 * example, PNG/SVG exports and the loading overlay.
 */

import { parseConfig } from './parser.js';
import { applyAnnotations } from './annotations.js';
import { render } from './render.js';
import { exportPng, exportSvg } from './export.js';
import { documentFromGraph, documentToModel } from './document.js';
import { initBuilder, attachBuilder } from './builder.js';
import { initUI } from './ui.js';
import { initIcons, icon } from './icons.js';
import { VERSION } from './version.js';
import { cardinalityLabel } from './model.js';
import { exportLayout, importLayout, getController } from './store.js';

const EXAMPLE_BASE = 'examples/example/';

function $(id) {
  return document.getElementById(id);
}

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
  }
  else {
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

function showDiagram(modelData, options) {
  render(modelData, options || {});
  attachBuilder(window.__nexus.cy);
  const title = (modelData.meta && modelData.meta.title) || 'Content model';
  $('diagram-title').value = title;
  document.title = title + ' - Nexus';
  $('landing').hidden = true;
}

function buildAndShow(map, annotations) {
  if (!Object.keys(map).length) {
    showError('No YAML configuration files were found in that folder.');
    return;
  }

  const model = parseConfig(map);
  if (annotations) {
    applyAnnotations(model, annotations);
  }

  const data = model.toArray();
  if (!data.meta.entityCount) {
    showError('No content types, vocabularies, media, paragraphs or blocks were found. Point at a Drupal config directory (or a module\'s config/install).');
    return;
  }

  showError('');
  showDiagram(data);
}

async function loadFromFiles(fileList) {
  showError('');
  showLoader('Reading configuration…');
  try {
    const map = {};
    let annotations = null;

    for (const file of fileList) {
      const name = basename(file.webkitRelativePath || file.name);
      if (!isYaml(name)) {
        continue;
      }

      let data;
      try {
        data = window.jsyaml.load(await file.text());
      }
      catch {
        continue;
      }

      if (name === 'annotations.yml' || name === 'nexus.annotations.yml') {
        annotations = data;
      }
      else if (data && typeof data === 'object') {
        map[name] = data;
      }
    }

    buildAndShow(map, annotations);
  }
  finally {
    hideLoader();
  }
}

async function loadExample() {
  showError('');
  showLoader('Loading the example…');
  try {
    const manifest = await fetch(EXAMPLE_BASE + 'manifest.json').then((r) => r.json());
    const map = {};

    await Promise.all(manifest.map(async (name) => {
      const text = await fetch(EXAMPLE_BASE + 'config/' + name).then((r) => r.text());
      try {
        map[name] = window.jsyaml.load(text);
      }
      catch {
        // Skip files that fail to parse.
      }
    }));

    let annotations = null;
    try {
      annotations = window.jsyaml.load(await fetch(EXAMPLE_BASE + 'annotations.yml').then((r) => r.text()));
    }
    catch {
      // Example annotations are optional.
    }

    buildAndShow(map, annotations);
  }
  catch (e) {
    showError('Could not load the example: ' + e.message);
  }
  finally {
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
      entry.file((file) => {
        files.push(file);
        resolve();
      }, () => resolve());
    }
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => {
        reader.readEntries((entries) => {
          if (!entries.length) {
            resolve();
            return;
          }
          Promise.all(entries.map((child) => walkEntry(child, files))).then(readBatch);
        }, () => resolve());
      };
      readBatch();
    }
    else {
      resolve();
    }
  });
}

function wireLanding() {
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
    }
    else {
      loadFromFiles(evt.dataTransfer.files);
    }
  });

  $('folder-btn').addEventListener('click', () => $('folder-input').click());
  $('folder-input').addEventListener('change', (evt) => loadFromFiles(evt.target.files));
  $('landing-open').addEventListener('click', () => $('doc-open').click());
  $('example-btn').addEventListener('click', loadExample);
  $('new-btn').addEventListener('click', newDocument);
  $('doc-import').addEventListener('click', showLanding);
  $('landing-cancel').addEventListener('click', () => { $('landing').hidden = true; });
}

// Reopening the import screen over a loaded diagram offers a way back; on first
// load there is nothing to preserve, so the cancel affordance stays hidden.
function showLanding() {
  showError('');
  $('landing-cancel').hidden = !window.__nexus;
  $('landing').hidden = false;
}

function wireExports() {
  $('export-png').addEventListener('click', () => {
    if (window.__nexus) {
      exportPng(window.__nexus.cy, $('diagram-title').value);
    }
  });
  $('export-svg').addEventListener('click', () => {
    if (window.__nexus) {
      exportSvg(window.__nexus.cy, $('diagram-title').value);
    }
  });
  $('export-csv').addEventListener('click', () => {
    const ctrl = getController();
    if (ctrl) {
      downloadText(recordsToCsv(ctrl.records(), ctrl.typeLabel), slug($('diagram-title').value) + '-fields.csv', 'text/csv');
    }
  });
}

function downloadText(text, filename, type) {
  const blob = new Blob([text], { type: type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// The Fields table, one row per field, as CSV.
function recordsToCsv(records, typeLabel) {
  const esc = (value) => {
    const s = String(value == null ? '' : value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const headers = ['Entity', 'Entity type', 'Field', 'Machine name', 'Field type', 'Cardinality', 'Required', 'References'];
  const rows = records.map((r) => [r.entity, typeLabel(r.entityType), r.field, r.name, r.type, cardinalityLabel(r.cardinality), r.required ? 'yes' : 'no', r.refs.map((x) => x.label).join('; ')].map(esc).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'content-model';
}

function saveDocument() {
  if (!window.__nexus) {
    return;
  }
  const title = $('diagram-title').value || 'Content model';
  const types = getController() ? getController().typeSettings() : { colors: window.__nexus.colors || {} };
  const doc = documentFromGraph(window.__nexus.cy, { title: title, colors: types.colors, symbols: types.symbols, customTypes: types.customTypes, ui: exportLayout() });
  downloadJson(doc, slug(title) + '.nexus.json');
}

async function openDocument(file) {
  showError('');
  showLoader('Opening diagram…');
  try {
    const doc = documentToModel(JSON.parse(await file.text()));
    showDiagram(doc.modelData, { layout: doc.layout, colors: doc.colors, symbols: doc.symbols, customTypes: doc.customTypes });
    if (doc.ui) {
      importLayout(doc.ui);
    }
  }
  catch (e) {
    $('landing').hidden = false;
    showError('Could not open that diagram: ' + e.message);
  }
  finally {
    hideLoader();
  }
}

function newDocument() {
  showDiagram({ meta: { title: 'New content model', entityCount: 0 }, nodes: [], edges: [] });
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
    document.title = ($('diagram-title').value || 'Untitled') + ' - Nexus';
  });
}

function applyTheme(dark) {
  document.documentElement.classList.toggle('sl-theme-dark', dark);
  const btn = $('theme-toggle');
  if (btn) {
    btn.innerHTML = icon(dark ? 'sun' : 'moon');
    btn.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  }
  if (window.__nexus && window.__nexus.applyTheme) {
    window.__nexus.applyTheme();
  }
  try {
    window.localStorage.setItem('nexusTheme', dark ? 'dark' : 'light');
  }
  catch {
    // Storage may be unavailable; the theme still applies for this session.
  }
}

function initTheme() {
  let dark = false;
  try {
    const saved = window.localStorage.getItem('nexusTheme');
    dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  catch {
    dark = false;
  }
  applyTheme(dark);
  $('theme-toggle').addEventListener('click', () => applyTheme(!document.documentElement.classList.contains('sl-theme-dark')));
}

// Echo a hovered control's title into the status bar immediately, so the
// description appears without waiting for the native tooltip.
function initStatusbar() {
  const hint = $('statusbar-hint');
  document.querySelectorAll('.toolbar, .statusbar').forEach((zone) => {
    zone.addEventListener('mouseover', (evt) => {
      const el = evt.target.closest('[title]');
      hint.textContent = el && zone.contains(el) ? el.getAttribute('title') : '';
    });
    zone.addEventListener('mouseleave', () => { hint.textContent = ''; });
  });
}

function initAbout() {
  const dialog = $('about-dialog');
  $('about-toggle').addEventListener('click', () => dialog.show());
  $('about-close').addEventListener('click', () => dialog.hide());
}

function initVersion() {
  document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = VERSION; });
}

wireLanding();
wireExports();
wireDocument();
initUI();
initBuilder();
initIcons();
initTheme();
initStatusbar();
initAbout();
initVersion();
