/**
 * Build mode: turn the viewer into an editor.
 *
 * Adds entities, fields, references and annotation nodes to the live Cytoscape
 * graph, edits them through an inspector panel, deletes them and drags them
 * around. Machine names and entity types are immutable after creation (as in
 * Drupal), so element ids never change and there is no cascade to manage. The
 * graph is the source of truth; save/load reads it via document.js.
 */

import { openPanel, closePanel } from './panels.js';

const ENTITY_TYPES = [
  ['node', 'Content type'],
  ['taxonomy_term', 'Vocabulary'],
  ['media', 'Media'],
  ['paragraph', 'Paragraph'],
  ['block_content', 'Block'],
  ['user', 'User'],
];

const FIELD_TYPES = [
  'string', 'string_long', 'text_long', 'text_with_summary', 'boolean', 'integer', 'decimal',
  'datetime', 'link', 'email', 'list_string', 'image', 'file', 'entity_reference', 'entity_reference_revisions',
];

const REFERENCE_TYPES = ['entity_reference', 'entity_reference_revisions'];

const ANNOTATION_KINDS = [['event', 'Event'], ['api', 'API'], ['callback', 'Callback']];

const TYPE_LABELS = Object.fromEntries(ENTITY_TYPES);

let cy = null;
let buildMode = false;
let connectMode = false;
let connectSource = null;
let counter = 0;
let handleEntityId = null;
let handleRaf = false;

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"]/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function viewportCenter() {
  const extent = cy.extent();
  return { x: Math.round((extent.x1 + extent.x2) / 2), y: Math.round((extent.y1 + extent.y2) / 2) };
}

function options(list, selected) {
  return list.map((item) => {
    const value = Array.isArray(item) ? item[0] : item;
    const label = Array.isArray(item) ? item[1] : item;
    return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }).join('');
}

export function initBuilder() {
  $('mode-view').addEventListener('click', () => setMode(false));
  $('mode-build').addEventListener('click', () => setMode(true));
  $('add-entity').addEventListener('click', () => openEntityForm());
  $('add-annotation').addEventListener('click', () => openAnnotationForm());
  $('connect-toggle').addEventListener('click', () => {
    connectMode = !connectMode;
    applyConnect();
  });
  $('inspector-body').addEventListener('input', onInspectorInput);
  $('inspector-body').addEventListener('change', onInspectorInput);
  $('inspector-body').addEventListener('click', onInspectorClick);
  $('handles').addEventListener('click', (evt) => {
    const btn = evt.target.closest('.handle');
    if (btn && handleEntityId) {
      openFieldForm(handleEntityId, btn.getAttribute('data-side'));
    }
  });
}

export function attachBuilder(instance) {
  cy = instance;
  connectSource = null;
  cy.on('tap', 'node', (evt) => {
    if (buildMode) {
      selectNode(evt.target.id());
    }
  });
  cy.on('tapstart', 'node[group="field"]', (evt) => startConnect(evt.target, evt.position));
  cy.on('tapdrag', (evt) => moveGhost(evt.position));
  cy.on('tapend', (evt) => endConnect(evt.target));
  cy.on('render', () => {
    if (handleRaf) {
      return;
    }
    handleRaf = true;
    requestAnimationFrame(() => {
      handleRaf = false;
      positionHandles();
    });
  });
  applyMode();
}

function setMode(build) {
  buildMode = build;
  applyMode();
}

function applyMode() {
  window.__nexusBuild = buildMode;
  if (!buildMode) {
    connectMode = false;
  }
  if (!cy) {
    return;
  }
  $('build-tools').hidden = !buildMode;
  $('mode-view').classList.toggle('is-active', !buildMode);
  $('mode-build').classList.toggle('is-active', buildMode);
  $('connect-toggle').classList.toggle('is-active', connectMode);
  updateInteraction();

  if (buildMode) {
    const fields = $('fields-toggle');
    if (!fields.classList.contains('is-active')) {
      fields.click();
    }
  }
  else {
    closeInspector();
    cleanupGhost();
  }
}

function applyConnect() {
  $('connect-toggle').classList.toggle('is-active', connectMode);
  if (!connectMode) {
    cleanupGhost();
  }
  updateInteraction();
}

function updateInteraction() {
  if (!cy) {
    return;
  }
  cy.autoungrabify(!buildMode || connectMode);
  cy.userPanningEnabled(!connectMode);
  cy.boxSelectionEnabled(false);
}

/* Drag-to-connect ------------------------------------------------------- */

function startConnect(field, position) {
  if (!connectMode) {
    return;
  }
  cleanupGhost();
  connectSource = field.id();
  cy.add([
    { group: 'nodes', data: { id: '__ghost__' }, position: { x: position.x, y: position.y }, grabbable: false, selectable: false },
    { group: 'edges', data: { id: '__ghostedge__', source: connectSource, target: '__ghost__' } },
  ]);
  cy.getElementById('__ghost__').style({ width: 1, height: 1, opacity: 0, events: 'no' });
  cy.getElementById('__ghostedge__').style({ 'line-color': '#2f6db3', 'line-style': 'dashed', width: 2, 'curve-style': 'straight', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#2f6db3', events: 'no' });
}

function moveGhost(position) {
  if (connectSource) {
    cy.getElementById('__ghost__').position({ x: position.x, y: position.y });
  }
}

function endConnect(target) {
  if (!connectSource) {
    return;
  }
  const source = connectSource;
  connectSource = null;
  cleanupGhost();

  if (target && target !== cy && typeof target.isNode === 'function' && target.isNode() && target.data('group') === 'entity') {
    addReference(source, target.id());
    selectNode(source);
  }
}

function cleanupGhost() {
  if (!cy) {
    return;
  }
  cy.getElementById('__ghostedge__').remove();
  cy.getElementById('__ghost__').remove();
}

function closeInspector() {
  closePanel('inspector');
  hideHandles();
}

function openInspector(html) {
  $('inspector-body').innerHTML = html;
  openPanel('inspector');
}

/* Field handles: four "+" buttons around a selected entity. --------------- */

const HANDLE_SIDES = ['top', 'right', 'bottom', 'left'];

function showHandles(entityId) {
  handleEntityId = entityId;
  const overlay = $('handles');
  overlay.innerHTML = HANDLE_SIDES.map((side) => {
    return '<button class="handle handle--' + side + '" type="button" data-side="' + side + '" title="Add a field">+</button>';
  }).join('');
  positionHandles();
}

function hideHandles() {
  handleEntityId = null;
  const overlay = $('handles');
  if (overlay) {
    overlay.innerHTML = '';
    overlay.hidden = true;
  }
}

function positionHandles() {
  const overlay = $('handles');
  if (!overlay || !handleEntityId || !cy) {
    return;
  }
  const node = cy.getElementById(handleEntityId);
  if (node.empty() || node.hasClass('hidden') || !buildMode) {
    overlay.hidden = true;
    return;
  }

  overlay.hidden = false;
  const pos = node.renderedPosition();
  const halfW = node.renderedOuterWidth() / 2;
  const halfH = node.renderedOuterHeight() / 2;
  const gap = 15;
  const place = {
    top: [pos.x, pos.y - halfH - gap],
    right: [pos.x + halfW + gap, pos.y],
    bottom: [pos.x, pos.y + halfH + gap],
    left: [pos.x - halfW - gap, pos.y],
  };
  Array.prototype.forEach.call(overlay.children, (btn) => {
    const point = place[btn.getAttribute('data-side')];
    btn.style.left = point[0] + 'px';
    btn.style.top = point[1] + 'px';
  });
}

/* Selection ------------------------------------------------------------- */

function selectNode(id) {
  const node = cy.getElementById(id);
  if (node.empty()) {
    return;
  }
  const group = node.data('group');
  if (group === 'entity') {
    openInspector(entityForm(node));
    showHandles(id);
  }
  else if (group === 'field') {
    openInspector(fieldForm(node));
    hideHandles();
  }
  else if (group === 'annotation') {
    openInspector(annotationForm(node));
    hideHandles();
  }
}

/* Forms ----------------------------------------------------------------- */

function entityForm(node) {
  const id = node.id();
  const fields = cy.nodes('[group="field"][entity="' + id + '"]').map((f) => {
    return '<button class="insp__field" data-select="' + esc(f.id()) + '">' + esc(f.data('label')) + ' <code>' + esc(f.data('name')) + '</code></button>';
  }).join('') || '<p class="insp__empty">No fields yet.</p>';

  return '<div class="insp" data-id="' + esc(id) + '">' +
    header('Entity') +
    row('Label', '<input class="insp__input" data-edit="label" value="' + esc(node.data('label')) + '">') +
    row('Type', '<span class="insp__ro">' + esc(TYPE_LABELS[node.data('entityType')] || node.data('entityType')) + '</span>') +
    row('Machine name', '<code>' + esc(node.data('bundle')) + '</code>') +
    '<div class="insp__section"><div class="insp__sectionhead"><span>Fields</span><button class="insp__btn" data-add-field>+ Field</button></div>' + fields + '</div>' +
    '<button class="insp__delete" data-delete>Delete entity</button></div>';
}

function fieldForm(node) {
  const id = node.id();
  const isRef = REFERENCE_TYPES.includes(node.data('fieldType'));
  const targets = cy.getElementById(id).connectedEdges('[group="ref"]').map((e) => e.target().id());
  const entityOptions = cy.nodes('[group="entity"]').map((e) => '<option value="' + esc(e.id()) + '">' + esc(e.data('label')) + '</option>').join('');

  let refs = '';
  if (isRef) {
    const list = targets.map((t) => {
      const target = cy.getElementById(t);
      const label = target.nonempty() ? target.data('label') : t;
      return '<div class="insp__ref">' + esc(label) + '<button class="insp__x" data-unref="' + esc(t) + '">&times;</button></div>';
    }).join('') || '<p class="insp__empty">No references.</p>';
    refs = '<div class="insp__section"><div class="insp__sectionhead"><span>References</span></div>' + list +
      '<div class="insp__row"><select class="insp__input" data-ref-target><option value="">Add target…</option>' + entityOptions + '</select></div></div>';
  }

  return '<div class="insp" data-id="' + esc(id) + '">' +
    header('Field') +
    row('Label', '<input class="insp__input" data-edit="label" value="' + esc(node.data('label')) + '">') +
    row('Machine name', '<code>' + esc(node.data('name')) + '</code>') +
    row('Type', '<select class="insp__input" data-edit="fieldType">' + options(FIELD_TYPES, node.data('fieldType')) + '</select>') +
    row('Cardinality', '<select class="insp__input" data-edit="kind"><option value="single"' + (node.data('kind') === 'single' ? ' selected' : '') + '>Single</option><option value="multi"' + (node.data('kind') === 'multi' ? ' selected' : '') + '>Multiple</option></select>') +
    row('Required', '<input type="checkbox" data-edit="required"' + (node.data('required') ? ' checked' : '') + '>') +
    refs +
    '<button class="insp__delete" data-delete>Delete field</button></div>';
}

function annotationForm(node) {
  return '<div class="insp" data-id="' + esc(node.id()) + '">' +
    header('Annotation') +
    row('Label', '<input class="insp__input" data-edit="label" value="' + esc(node.data('label')) + '">') +
    row('Kind', '<select class="insp__input" data-edit="kind">' + options(ANNOTATION_KINDS, node.data('kind')) + '</select>') +
    row('Method', '<input class="insp__input" data-edit="method" value="' + esc(node.data('method') || '') + '" placeholder="POST, GET…">') +
    '<button class="insp__delete" data-delete>Delete</button></div>';
}

function header(title) {
  return '<p class="insp__title">' + esc(title) + '</p>';
}

function row(label, control) {
  return '<div class="insp__row"><label>' + esc(label) + '</label>' + control + '</div>';
}

/* Creation -------------------------------------------------------------- */

function openEntityForm() {
  openInspector('<div class="insp" data-new="entity">' + header('New entity') +
    row('Type', '<select class="insp__input" data-new-type>' + options(ENTITY_TYPES) + '</select>') +
    row('Machine name', '<input class="insp__input" data-new-bundle placeholder="e.g. article">') +
    row('Label', '<input class="insp__input" data-new-label placeholder="e.g. Article">') +
    '<button class="insp__create" data-create-entity>Create entity</button></div>');
}

function openAnnotationForm() {
  openInspector('<div class="insp" data-new="annotation">' + header('New annotation') +
    row('Kind', '<select class="insp__input" data-new-kind>' + options(ANNOTATION_KINDS) + '</select>') +
    row('Label', '<input class="insp__input" data-new-label placeholder="e.g. Sync API">') +
    row('Method', '<input class="insp__input" data-new-method placeholder="POST, GET…">') +
    '<button class="insp__create" data-create-annotation>Create annotation</button></div>');
}

function existingFields() {
  const byName = {};
  cy.nodes('[group="field"]').forEach((f) => {
    const name = f.data('name');
    if (name && !byName[name]) {
      byName[name] = { name: name, label: f.data('label'), fieldType: f.data('fieldType'), kind: f.data('kind') };
    }
  });
  return Object.keys(byName).sort().map((name) => byName[name]);
}

function openFieldForm(entityId, side) {
  const datalist = '<datalist id="existing-field-list">' + existingFields().map((f) => {
    return '<option value="' + esc(f.name) + '">' + esc(f.label) + ' (' + esc(f.fieldType) + ')</option>';
  }).join('') + '</datalist>';

  openInspector('<div class="insp" data-new="field" data-entity="' + esc(entityId) + '"' + (side ? ' data-side="' + esc(side) + '"' : '') + '>' + header('New field') +
    row('Machine name', '<input class="insp__input" data-new-name list="existing-field-list" placeholder="e.g. field_body" autocomplete="off">') +
    row('Label', '<input class="insp__input" data-new-label placeholder="e.g. Body">') +
    row('Type', '<select class="insp__input" data-new-fieldtype>' + options(FIELD_TYPES) + '</select>') +
    row('Cardinality', '<select class="insp__input" data-new-kind><option value="single">Single</option><option value="multi">Multiple</option></select>') +
    datalist +
    '<p class="insp__hint">Type a new name, or pick an existing field to reuse its definition.</p>' +
    '<button class="insp__create" data-create-field>Create field</button></div>');
}

/* Mutations ------------------------------------------------------------- */

function addEntity(entityType, bundle, label) {
  const id = entityType + '.' + bundle;
  if (cy.getElementById(id).nonempty()) {
    return null;
  }
  cy.add({ group: 'nodes', data: { id: id, group: 'entity', entityType: entityType, bundle: bundle, label: label }, position: viewportCenter() });
  return id;
}

function fieldPlacement(anchor, side) {
  const distance = 200;
  const spread = (counter++ % 6) * 44 - 110;
  if (side === 'left') {
    return { x: anchor.x - distance, y: anchor.y + spread };
  }
  if (side === 'top') {
    return { x: anchor.x + spread, y: anchor.y - distance };
  }
  if (side === 'bottom') {
    return { x: anchor.x + spread, y: anchor.y + distance };
  }
  return { x: anchor.x + distance, y: anchor.y + spread };
}

function addField(entityId, name, label, fieldType, kind, side) {
  const fieldId = 'field:' + entityId + ':' + name;
  if (cy.getElementById(fieldId).nonempty()) {
    return null;
  }
  const anchor = cy.getElementById(entityId).position();
  cy.add({ group: 'nodes', data: { id: fieldId, group: 'field', name: name, label: label, fieldType: fieldType, kind: kind, required: false, entity: entityId }, position: fieldPlacement(anchor, side) });
  cy.add({ group: 'edges', data: { id: 'has:' + fieldId, source: entityId, target: fieldId, group: 'has' } });
  return fieldId;
}

function addAnnotation(kind, label, method) {
  const id = 'note-' + (++counter);
  const data = { id: id, group: 'annotation', kind: kind, label: label };
  if (method) {
    data.method = method;
  }
  cy.add({ group: 'nodes', data: data, position: viewportCenter() });
  return id;
}

function addReference(fieldId, targetId) {
  const id = 'ref:' + fieldId + '>' + targetId;
  if (cy.getElementById(id).nonempty() || cy.getElementById(targetId).empty()) {
    return;
  }
  const card = cy.getElementById(fieldId).data('kind') === 'multi' ? '1..n' : '1';
  cy.add({ group: 'edges', data: { id: id, source: fieldId, target: targetId, group: 'ref', cardinality: card } });
}

function deleteNode(id) {
  const node = cy.getElementById(id);
  if (node.data('group') === 'entity') {
    cy.nodes('[group="field"][entity="' + id + '"]').remove();
  }
  node.remove();
  closeInspector();
}

/* Inspector events ------------------------------------------------------ */

function onInspectorInput(evt) {
  const insp = evt.target.closest('.insp');
  if (!insp) {
    return;
  }
  const id = insp.getAttribute('data-id');
  const edit = evt.target.getAttribute('data-edit');

  if (id && edit) {
    const node = cy.getElementById(id);
    const value = evt.target.type === 'checkbox' ? evt.target.checked : evt.target.value;
    node.data(edit, value);
    if (edit === 'kind') {
      node.connectedEdges('[group="ref"]').data('cardinality', value === 'multi' ? '1..n' : '1');
    }
    if (edit === 'fieldType') {
      selectNode(id);
    }
    return;
  }

  if (evt.target.hasAttribute('data-new-name')) {
    const match = existingFields().find((f) => f.name === evt.target.value);
    if (match) {
      insp.querySelector('[data-new-label]').value = match.label;
      insp.querySelector('[data-new-fieldtype]').value = match.fieldType;
      insp.querySelector('[data-new-kind]').value = match.kind;
    }
    return;
  }

  if (evt.target.hasAttribute('data-ref-target') && evt.target.value) {
    addReference(id, evt.target.value);
    selectNode(id);
  }
}

function onInspectorClick(evt) {
  const insp = evt.target.closest('.insp');
  if (!insp) {
    return;
  }
  const id = insp.getAttribute('data-id');

  if (evt.target.closest('[data-delete]')) {
    deleteNode(id);
  }
  else if (evt.target.closest('[data-add-field]')) {
    openFieldForm(id);
  }
  else if (evt.target.closest('[data-select]')) {
    selectNode(evt.target.closest('[data-select]').getAttribute('data-select'));
  }
  else if (evt.target.closest('[data-unref]')) {
    const target = evt.target.closest('[data-unref]').getAttribute('data-unref');
    cy.getElementById('ref:' + id + '>' + target).remove();
    selectNode(id);
  }
  else if (evt.target.closest('[data-create-entity]')) {
    createEntity(insp);
  }
  else if (evt.target.closest('[data-create-field]')) {
    createField(insp);
  }
  else if (evt.target.closest('[data-create-annotation]')) {
    createAnnotation(insp);
  }
}

function createEntity(insp) {
  const entityType = insp.querySelector('[data-new-type]').value;
  const bundle = slug(insp.querySelector('[data-new-bundle]').value);
  const label = insp.querySelector('[data-new-label]').value.trim() || bundle;
  if (!bundle) {
    return;
  }
  const id = addEntity(entityType, bundle, label);
  if (id) {
    selectNode(id);
  }
}

function createField(insp) {
  const entityId = insp.getAttribute('data-entity');
  const side = insp.getAttribute('data-side');
  const name = slug(insp.querySelector('[data-new-name]').value);
  const label = insp.querySelector('[data-new-label]').value.trim() || name;
  const fieldType = insp.querySelector('[data-new-fieldtype]').value;
  const kind = insp.querySelector('[data-new-kind]').value;
  if (!name) {
    return;
  }
  const id = addField(entityId, name, label, fieldType, kind, side);
  if (id) {
    selectNode(id);
  }
}

function createAnnotation(insp) {
  const kind = insp.querySelector('[data-new-kind]').value;
  const label = insp.querySelector('[data-new-label]').value.trim() || 'Note';
  const method = insp.querySelector('[data-new-method]').value.trim();
  const id = addAnnotation(kind, label, method);
  selectNode(id);
}
