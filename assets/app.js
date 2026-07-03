/**
 * Nexus web app entry point.
 *
 * Loads a Drupal config folder entirely in the browser (nothing is uploaded),
 * parses it, and renders the content-model diagram. Also handles the bundled
 * example and PNG/PDF exports.
 */

import { parseConfig } from './parser.js';
import { applyAnnotations } from './annotations.js';
import { render } from './render.js';
import { exportPng, exportPdf } from './export.js';
import { documentFromGraph, documentToModel } from './document.js';

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
  $('landing-error').textContent = message || '';
}

function showDiagram(modelData) {
  render(modelData);
  const title = (modelData.meta && modelData.meta.title) || 'Content model';
  $('diagram-title').textContent = title;
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
    catch (e) {
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

async function loadExample() {
  showError('');
  try {
    const manifest = await fetch(EXAMPLE_BASE + 'manifest.json').then((r) => r.json());
    const map = {};

    await Promise.all(manifest.map(async (name) => {
      const text = await fetch(EXAMPLE_BASE + 'config/' + name).then((r) => r.text());
      try {
        map[name] = window.jsyaml.load(text);
      }
      catch (e) {
        // Skip files that fail to parse.
      }
    }));

    let annotations = null;
    try {
      annotations = window.jsyaml.load(await fetch(EXAMPLE_BASE + 'annotations.yml').then((r) => r.text()));
    }
    catch (e) {
      // Example annotations are optional.
    }

    buildAndShow(map, annotations);
  }
  catch (e) {
    showError('Could not load the example: ' + e.message);
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

  $('folder-input').addEventListener('change', (evt) => loadFromFiles(evt.target.files));
  $('example-btn').addEventListener('click', loadExample);
  $('open-toggle').addEventListener('click', () => { $('landing').hidden = false; });
}

function wireExports() {
  $('export-png').addEventListener('click', () => {
    if (window.__nexus) {
      exportPng(window.__nexus.cy);
    }
  });
  $('export-pdf').addEventListener('click', () => {
    if (window.__nexus) {
      exportPdf(window.__nexus.cy);
    }
  });
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
  const title = $('diagram-title').textContent || 'Content model';
  const doc = documentFromGraph(window.__nexus.cy, { title: title, colors: window.__nexus.colors || {} });
  downloadJson(doc, slug(title) + '.nexus.json');
}

async function openDocument(file) {
  showError('');
  try {
    const doc = documentToModel(JSON.parse(await file.text()));
    render(doc.modelData, { layout: doc.layout, colors: doc.colors });
    const title = (doc.modelData.meta && doc.modelData.meta.title) || 'Content model';
    $('diagram-title').textContent = title;
    document.title = title + ' - Nexus';
    $('landing').hidden = true;
  }
  catch (e) {
    $('landing').hidden = false;
    showError('Could not open that diagram: ' + e.message);
  }
}

function newDocument() {
  render({ meta: { title: 'New content model', entityCount: 0 }, nodes: [], edges: [] });
  $('diagram-title').textContent = 'New content model';
  document.title = 'New content model - Nexus';
  $('landing').hidden = true;
}

function wireDocument() {
  $('doc-save').addEventListener('click', saveDocument);
  $('doc-new').addEventListener('click', newDocument);
  $('doc-open').addEventListener('change', (evt) => {
    if (evt.target.files[0]) {
      openDocument(evt.target.files[0]);
    }
    evt.target.value = '';
  });
}

wireLanding();
wireExports();
wireDocument();
