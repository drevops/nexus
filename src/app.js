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
import { exportPng, exportSvg, exportCsv, exportDocument } from './export.js';
import { documentFromGraph, documentToModel } from './document.js';
import { initBuilder, attachBuilder } from './builder.js';
import { initUI } from './ui.js';
import { initIcons, icon } from './icons.js';
import { VERSION } from './version.js';
import { DEFAULT_TITLE } from './model.js';
import { exportLayout, importLayout, getController } from './store.js';
import { $ } from './dom.js';

const EXAMPLE_BASE = 'templates/radio-station/';

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

function showDiagram(modelData, options) {
  const controller = render(modelData, options || {});
  attachBuilder(controller.cy);
  const title = (modelData.meta && modelData.meta.title) || DEFAULT_TITLE;
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
    showError("No content types, vocabularies, media, paragraphs or blocks were found. Point at a Drupal config directory (or a module's config/install).");
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
      } catch {
        continue;
      }

      if (name === 'annotations.yml' || name === 'nexus.annotations.yml') {
        annotations = data;
      } else if (data && typeof data === 'object') {
        map[name] = data;
      }
    }

    buildAndShow(map, annotations);
  } finally {
    hideLoader();
  }
}

async function loadExample() {
  showError('');
  showLoader('Loading the example…');
  try {
    const manifest = await fetch(EXAMPLE_BASE + 'manifest.json').then((r) => r.json());
    const map = {};

    await Promise.all(
      manifest.map(async (name) => {
        const text = await fetch(EXAMPLE_BASE + 'config/' + name).then((r) => r.text());
        try {
          map[name] = window.jsyaml.load(text);
        } catch {
          // Skip files that fail to parse.
        }
      }),
    );

    let annotations = null;
    try {
      annotations = window.jsyaml.load(await fetch(EXAMPLE_BASE + 'annotations.yml').then((r) => r.text()));
    } catch {
      // Example annotations are optional.
    }

    buildAndShow(map, annotations);
  } catch (e) {
    showError('Could not load the example: ' + e.message);
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
  $('example-btn').addEventListener('click', loadExample);
  $('new-btn').addEventListener('click', newDocument);
  $('doc-import').addEventListener('click', showLanding);
  $('landing-cancel').addEventListener('click', () => {
    $('landing').hidden = true;
  });
}

// Cancel returns to a loaded diagram, so it stays hidden until one exists.
function showLanding() {
  showError('');
  $('landing-cancel').hidden = !getController();
  $('landing').hidden = false;
}

function wireExports() {
  $('export-png').addEventListener('click', () => {
    const controller = getController();

    if (controller) {
      exportPng(controller.cy, $('diagram-title').value);
    }
  });
  $('export-svg').addEventListener('click', () => {
    const controller = getController();

    if (controller) {
      exportSvg(controller.cy, $('diagram-title').value);
    }
  });
  $('export-csv').addEventListener('click', () => {
    const controller = getController();

    if (controller) {
      exportCsv(controller.records(), controller.typeLabel, $('diagram-title').value);
    }
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

async function openDocument(file) {
  showError('');
  showLoader('Opening diagram…');
  try {
    const doc = documentToModel(JSON.parse(await file.text()));
    showDiagram(doc.modelData, { layout: doc.layout, colors: doc.colors, symbols: doc.symbols, customTypes: doc.customTypes });
    if (doc.ui) {
      importLayout(doc.ui);
    }
  } catch (e) {
    $('landing').hidden = false;
    showError('Could not open that diagram: ' + e.message);
  } finally {
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
  $('theme-toggle').addEventListener('click', () => applyTheme(!document.documentElement.classList.contains('sl-theme-dark')));
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
    zone.addEventListener('mouseover', (evt) => {
      const el = evt.target.closest('[title]');
      echo(el && zone.contains(el) ? el : null);
    });
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
initIcons();
initTheme();
initStatusbar();
initAbout();
initVersion();
