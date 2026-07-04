/**
 * Build mode: turn the viewer into an editor.
 *
 * Adds entities, fields, references and annotation nodes to the live Cytoscape
 * graph, edits them through the Preact inspector, deletes them and drags them
 * around. Machine names and entity types are immutable after creation (as in
 * Drupal), so element ids never change and there is no cascade to manage. The
 * graph is the source of truth; save/load reads it via document.js. This module
 * owns the graph mutations and the on-canvas affordances (drag-to-connect, the
 * four "+" field handles); the inspector forms live in inspector.js and reach
 * these mutations through the builder controller on the store.
 */

import { openInspector, closeInspector, setBuilder, bump } from './store.js';

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

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function viewportCenter() {
  const extent = cy.extent();
  return { x: Math.round((extent.x1 + extent.x2) / 2), y: Math.round((extent.y1 + extent.y2) / 2) };
}

export function initBuilder() {
  $('mode-view').addEventListener('click', () => setMode(false));
  $('mode-build').addEventListener('click', () => setMode(true));
  $('add-entity').addEventListener('click', () => openInspector({ kind: 'new-entity' }));
  $('add-annotation').addEventListener('click', () => openInspector({ kind: 'new-annotation' }));
  $('connect-toggle').addEventListener('click', () => {
    connectMode = !connectMode;
    applyConnect();
  });
  $('handles').addEventListener('click', (evt) => {
    const btn = evt.target.closest('.handle');
    if (btn && handleEntityId) {
      openInspector({ kind: 'new-field', entityId: handleEntityId, side: btn.getAttribute('data-side') });
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
  setBuilder({ createEntity, createField, createAnnotation, addReference, removeReference, deleteNode });
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
    hideHandles();
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
  openInspector({ kind: group, id: id });
  if (group === 'entity') {
    showHandles(id);
  }
  else {
    hideHandles();
  }
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

function removeReference(fieldId, targetId) {
  cy.getElementById('ref:' + fieldId + '>' + targetId).remove();
}

function deleteNode(id) {
  const node = cy.getElementById(id);
  if (node.data('group') === 'entity') {
    cy.nodes('[group="field"][entity="' + id + '"]').remove();
  }
  node.remove();
  closeInspector();
  hideHandles();
  bump();
}

/* Builder controller (used by the Preact inspector forms) ----------------- */

function createEntity(form) {
  const bundle = slug(form.bundle);
  if (!bundle) {
    return;
  }
  const label = (form.label || '').trim() || bundle;
  const id = addEntity(form.entityType, bundle, label);
  if (id) {
    selectNode(id);
    bump();
  }
}

function createField(entityId, form, side) {
  const name = slug(form.name);
  if (!name) {
    return;
  }
  const label = (form.label || '').trim() || name;
  const id = addField(entityId, name, label, form.fieldType, form.kind, side);
  if (id) {
    selectNode(id);
    bump();
  }
}

function createAnnotation(form) {
  const label = (form.label || '').trim() || 'Note';
  const id = addAnnotation(form.kind, label, (form.method || '').trim());
  selectNode(id);
  bump();
}
