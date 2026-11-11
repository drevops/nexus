/**
 * Build mode: turn the viewer into an editor.
 *
 * Adds entities, fields, references and annotation nodes to the live Cytoscape
 * graph, edits them through the Preact inspector, deletes them and drags them
 * around.
 *
 * An entity's type is fixed after creation, while bundle and field machine
 * names can be renamed. Graph ids contain machine names, so a rename re-ids
 * the node along with its fields and edges.
 *
 * The graph is the source of truth. This module holds the graph mutations and
 * the on-canvas controls: drag-to-connect and the 4 "+" field handles.
 *
 * Each user action records 1 history step once it is done, so the helpers it
 * calls record nothing themselves.
 */

import { cardinalityLabel, kindForCardinality, entityNodeId, fieldNodeId, hasEdgeId, refEdgeId } from './model.js';
import { ANNOTATION_KINDS } from './annotations.js';
import { findEntityType } from './entity-types.js';
import { describeNode } from './history.js';
import { humanize, machineName } from './names.js';
import { clearSpot } from './packing.js';
import { checkpoint } from './undo.js';
import { openInspector, closeInspector, setBuilder, bump, getController, getState, subscribe } from './store.js';
import { $ } from './dom.js';

let cy = null;
let buildMode = false;
let connectMode = false;
let connectSource = null;
let counter = 0;
let handleEntityId = null;
let handleRaf = false;
let placeKind = null;
let isolatedEntity = null;
let isolatedIds = new Set();
let drag = null;
let pan = null;
let taps = [null, null];
let pressContainer = null;

// How far a new field is placed from its entity, and how far apart fields
// added together are stacked.
const FIELD_DISTANCE = 200;
const FIELD_SPACING = 56;

// Screen pixels kept between a node placed without a position and the nodes
// around it.
const CLEARANCE = 24;

function startPlaceNote(kind) {
  connectMode = false;
  applyConnect();
  placeKind = kind;
  if (cy) {
    cy.container().style.cursor = 'crosshair';
  }
}

function cancelPlace() {
  placeKind = null;
  if (cy) {
    cy.container().style.cursor = '';
  }
}

/* Drag palette items onto the canvas ------------------------------------- */

function makeDraggable(btn, payload) {
  btn.draggable = true;
  btn.addEventListener('dragstart', (evt) => {
    evt.dataTransfer.setData('text/nexus', payload);
    evt.dataTransfer.effectAllowed = 'copy';
  });
}

function positionFromEvent(evt) {
  const rect = cy.container().getBoundingClientRect();
  const pan = cy.pan();
  const zoom = cy.zoom();
  return { x: (evt.clientX - rect.left - pan.x) / zoom, y: (evt.clientY - rect.top - pan.y) / zoom };
}

function entityAt(position) {
  let found = null;
  cy.nodes('[group="entity"]').forEach((node) => {
    const box = node.boundingBox();
    if (position.x >= box.x1 && position.x <= box.x2 && position.y >= box.y1 && position.y <= box.y2) {
      found = node.id();
    }
  });
  return found;
}

function onCanvasDragOver(evt) {
  if (Array.prototype.indexOf.call(evt.dataTransfer.types, 'text/nexus') !== -1) {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy';
  }
}

function onCanvasDrop(evt) {
  const data = evt.dataTransfer.getData('text/nexus');
  if (!data || !cy || !buildMode) {
    return;
  }
  evt.preventDefault();
  const position = positionFromEvent(evt);

  // Dropped items are created immediately and opened in the inspector, so
  // their name and other properties are edited on the real node.
  if (data.indexOf('entity:') === 0) {
    const entityType = data.slice(7);
    const bundle = uniqueBundle(entityType);
    const id = addEntity(entityType, bundle, humanize(bundle), position);
    if (id) {
      selectCreated(id);
    }
  } else if (data === 'field') {
    const entityId = entityAt(position) || nearestEntity(position);
    if (entityId) {
      const name = uniqueFieldName(entityId);
      const id = addField(entityId, name, humanize(name), 'string', 1, null, position);
      if (id) {
        selectCreated(id);
      }
    }
  } else if (data.indexOf('note:') === 0) {
    const kind = data.slice(5);
    selectCreated(addAnnotation(kind, noteLabel(kind), '', position));
  }
}

function noteLabel(kind) {
  const entry = ANNOTATION_KINDS.find((candidate) => candidate.kind === kind);

  return entry ? entry.label : 'Note';
}

// The store updates on every panel drag move, so a symbol is redrawn only
// when its type's symbol or colour changed.
function paintPaletteSymbols() {
  const controller = getController();

  if (!controller) {
    return;
  }

  document.querySelectorAll('[data-add-entity]').forEach((btn) => {
    const type = btn.getAttribute('data-add-entity');
    const symbol = controller.symbolFor(type);
    const color = controller.colorFor(type);
    const span = btn.querySelector('.palette__symbol');

    if (span.dataset.symbol === symbol && span.dataset.color === color) {
      return;
    }

    span.dataset.symbol = symbol;
    span.dataset.color = color;
    span.innerHTML = controller.symbolSvg(symbol, color);
  });
}

function viewportCenter() {
  const extent = cy.extent();
  return { x: Math.round((extent.x1 + extent.x2) / 2), y: Math.round((extent.y1 + extent.y2) / 2) };
}

export function initBuilder() {
  $('mode-view').addEventListener('click', () => setMode(false));
  $('mode-build').addEventListener('click', () => setMode(true));

  Array.prototype.forEach.call(document.querySelectorAll('[data-add-entity]'), (btn) => {
    const type = btn.getAttribute('data-add-entity');
    btn.addEventListener('click', () => openInspector({ kind: 'new-entity', entityType: type }));
    makeDraggable(btn, 'entity:' + type);
  });
  $('add-field').addEventListener('click', () => openInspector({ kind: 'new-field' }));
  makeDraggable($('add-field'), 'field');
  Array.prototype.forEach.call(document.querySelectorAll('[data-add-note]'), (btn) => {
    const kind = btn.getAttribute('data-add-note');
    btn.addEventListener('click', () => startPlaceNote(kind));
    makeDraggable(btn, 'note:' + kind);
  });

  const canvas = document.querySelector('.stage__canvas');
  if (canvas) {
    canvas.addEventListener('dragover', onCanvasDragOver);
    canvas.addEventListener('drop', onCanvasDrop);
  }

  $('connect-toggle').addEventListener('click', () => {
    connectMode = !connectMode;
    applyConnect();
  });
  $('handles').addEventListener('click', (evt) => {
    const btn = evt.target.closest('.handle');

    if (!btn || !handleEntityId) {
      return;
    }

    const name = uniqueFieldName(handleEntityId);
    const id = addField(handleEntityId, name, humanize(name), 'string', 1, btn.getAttribute('data-side'));

    if (id) {
      selectCreated(id);
    }
  });

  subscribe(paintPaletteSymbols);
}

// Attaches the builder to a newly drawn diagram, which opens in Edit mode
// when `build` is true and in View mode otherwise.
export function attachBuilder(instance, build = false) {
  cy = instance;
  buildMode = build;
  connectSource = null;
  taps = [null, null];
  cy.on('tap', (evt) => {
    if (evt.target === cy && placeKind) {
      const kind = placeKind;
      cancelPlace();
      selectCreated(addAnnotation(kind, noteLabel(kind), '', evt.position));
    }
  });
  cy.on('tap', 'node', (evt) => {
    if (!buildMode) {
      return;
    }

    // A proxy has no inspector form, so a tap on one selects the entity it
    // stands in for.
    const node = evt.target;
    selectNode(node.data('group') === 'proxy' ? node.data('target') : node.id());
  });

  // A right-click on an entity isolates it and its fields; a tap on the empty
  // canvas releases the isolation. The native context menu is suppressed, so
  // a right-click only isolates.
  cy.on('cxttap', 'node[group="entity"]', (evt) => isolateEntity(evt.target.id()));
  cy.container().addEventListener('contextmenu', (evt) => evt.preventDefault());

  // Cytoscape zooms on the wheel only while user panning is on, so panning
  // stays on and the left button turns it off for the length of a press. The
  // capture listener runs before Cytoscape's own mousedown handler.
  if (pressContainer !== cy.container()) {
    pressContainer = cy.container();
    pressContainer.addEventListener('mousedown', holdPanning, true);
  }
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      clearIsolation();
    }
  });

  // Cytoscape drags every selected node when a selected node is grabbed, and
  // fires drag on each of them, so the group drag follows only the node under
  // the pointer and shifts the members Cytoscape leaves behind.
  cy.on('grabon', 'node', (evt) => {
    const node = evt.target;
    const moving = node.selected() ? cy.nodes(':selected').filter((other) => other.grabbable()) : node;

    drag = { node, moving, last: { ...node.position() } };
  });
  cy.on('drag', 'node', (evt) => {
    if (!drag || evt.target !== drag.node) {
      return;
    }

    const position = evt.target.position();

    dragGroup(drag.node)
      .difference(drag.moving)
      .shift({ x: position.x - drag.last.x, y: position.y - drag.last.y });
    drag.last = { ...position };
  });
  // Cytoscape fires freeon before dragfreeon, so the drag ends here.
  cy.on('dragfreeon', 'node', () => {
    if (drag) {
      checkpoint('Moved ' + describeMove(drag.node, drag.moving.union(dragGroup(drag.node))));
      drag = null;
    }
  });

  // Cytoscape pans with the left button only, and updateInteraction() turns
  // that off, so a right-drag pans here. Cytoscape fires no cxttap once the
  // pointer passes its tap threshold, so the drag does not also isolate.
  cy.on('cxttapstart', (evt) => {
    pan = { x: evt.originalEvent.clientX, y: evt.originalEvent.clientY };
  });
  cy.on('cxtdrag', (evt) => {
    if (!pan) {
      return;
    }

    const point = { x: evt.originalEvent.clientX, y: evt.originalEvent.clientY };

    cy.panBy({ x: point.x - pan.x, y: point.y - pan.y });
    cy.container().classList.add('is-panning');
    pan = point;
  });
  cy.on('cxttapend', () => {
    pan = null;
    cy.container().classList.remove('is-panning');
  });

  // A tap on a node in View mode animates the view to it, so the second click
  // of a double-click can land beside the node. Cytoscape fires dbltap on
  // whatever the second click hits, so the double-click opens the node the
  // first click hit.
  cy.on('tap', (evt) => {
    taps = [taps[1], evt.target];
  });
  cy.on('dbltap', () => {
    const node = taps[0];

    if (buildMode || !node || node === cy || !node.isNode()) {
      return;
    }

    const id = node.data('group') === 'proxy' ? node.data('target') : node.id();

    setMode(true);
    selectNode(id);

    // A second click on the canvas makes Cytoscape unselect everything after
    // dbltap, so the node is selected once its handler has run.
    setTimeout(() => cy.getElementById(id).select());
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
  cy.on('captions', positionHandles);
  setBuilder({
    select: selectNode,
    createEntity,
    createField,
    createFields,
    createAnnotation,
    createReference,
    removeReference,
    deleteNode,
    renameEntity,
    renameField,
    refreshSelection,
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

  // A mode switch clears focus and isolation, so no trace, fade or grab state
  // remains from the previous mode.
  clearIsolation();
  const controller = getController();
  if (controller) {
    controller.clearFocus();
  }

  if (buildMode) {
    const fields = $('fields-toggle');
    if (!fields.checked) {
      fields.click();
    }
  } else {
    closeInspector();
    hideHandles();
    cleanupGhost();
    cancelPlace();
  }
}

function applyConnect() {
  $('connect-toggle').classList.toggle('is-active', connectMode);
  if (!connectMode) {
    cleanupGhost();
  }
  updateInteraction();
}

// Turns Cytoscape's left-button panning off until the button is released.
// Cytoscape reads the setting during the drag, so it comes back on after its
// own mouseup handler has run.
function holdPanning(evt) {
  if (evt.button !== 0 || !cy) {
    return;
  }

  cy.userPanningEnabled(false);
  window.addEventListener('mouseup', () => setTimeout(() => cy.userPanningEnabled(true)), { once: true });
}

// The left button selects and moves nodes in Edit mode and does nothing else
// on the canvas; a right-drag pans in every mode.
function updateInteraction() {
  if (!cy) {
    return;
  }

  const editing = buildMode && !connectMode;

  if (!editing) {
    cy.nodes(':selected').unselect();
  }

  cy.userPanningEnabled(true);
  cy.autoungrabify(!editing);
  cy.autounselectify(!editing);
  cy.boxSelectionEnabled(editing);
}

// Isolates an entity, its fields and their proxies. Everything else is faded
// and only the group is grabbable, so in Edit mode dragging any member moves
// the whole group (see dragGroup()).
function isolateEntity(entityId) {
  const entity = cy.getElementById(entityId);
  if (entity.empty() || entity.data('group') !== 'entity') {
    return;
  }
  const fields = cy.nodes('[group="field"][entity="' + entityId + '"]');
  const proxies = fields.connectedEdges('[group="proxyedge"]').targets().filter('[group="proxy"]');
  const group = entity.union(fields).union(proxies);

  cy.elements().addClass('faded');
  group.removeClass('faded');
  group.edgesWith(group).removeClass('faded');

  cy.nodes().ungrabify();
  group.grabify();
  isolatedEntity = entityId;
  isolatedIds = new Set(group.map((node) => node.id()));
}

function clearIsolation() {
  if (!isolatedIds.size) {
    return;
  }
  cy.elements().removeClass('faded');
  isolatedEntity = null;
  isolatedIds = new Set();
  drag = null;
  cy.nodes().grabify();
}

// The nodes a drag of the node moves: its isolated group, nothing when an
// isolation leaves the node out, or otherwise the node alone.
function dragGroup(node) {
  if (!isolatedIds.size) {
    return node;
  }

  return isolatedIds.has(node.id()) ? cy.nodes().filter((other) => isolatedIds.has(other.id())) : cy.collection();
}

// Names what a drag of the node moved: the node itself, an isolated entity
// with its fields, or a count of the nodes.
function describeMove(node, moved) {
  if (moved.length === 1) {
    return describeNode(node);
  }

  const group = cy.nodes().filter((other) => isolatedIds.has(other.id()));

  if (group.length && moved.same(group)) {
    return describeNode(cy.getElementById(isolatedEntity)) + ' with its fields';
  }

  return moved.length + ' nodes';
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
  cy.getElementById('__ghostedge__').style({
    'line-color': '#2f6db3',
    'line-style': 'dashed',
    width: 2,
    'curve-style': 'straight',
    'target-arrow-shape': 'triangle',
    'target-arrow-color': '#2f6db3',
    events: 'no',
  });
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
    checkpoint('Added a ' + describeReference(source, target.id()));
  }
}

function cleanupGhost() {
  if (!cy) {
    return;
  }
  cy.getElementById('__ghostedge__').remove();
  cy.getElementById('__ghost__').remove();
}

/* Field handles: 4 "+" buttons around a selected entity. ---------------- */

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
  const bottom = getController().renderedBottom(handleEntityId);
  const gap = 15;
  const place = {
    top: [pos.x, pos.y - halfH - gap],
    right: [pos.x + halfW + gap, pos.y],
    bottom: [pos.x, bottom + gap],
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
  } else {
    hideHandles();
  }
}

// Selects a node the user just created and records its creation.
function selectCreated(id) {
  selectNode(id);
  bump();
  checkpoint('Added ' + describeNode(cy.getElementById(id)));
}

// Brings the edit state in line with a graph the history changed: releases an
// isolation, drops a connection being dragged and closes the inspector when
// the node it shows is gone.
function refreshSelection() {
  clearIsolation();
  connectSource = null;
  cleanupGhost();

  const selected = getState().selected;
  const id = selected && (selected.kind === 'new-field' || selected.kind === 'bulk-fields' ? selected.entityId : selected.id);

  if (id && cy.getElementById(id).empty()) {
    closeInspector();
    hideHandles();
  }
}

/* Auto-naming for items created directly on the canvas ------------------- */

function uniqueBundle(entityType) {
  const builtIn = findEntityType(entityType);
  const base = builtIn ? builtIn.bundleBase : 'entity';
  let n = 1;
  while (cy.getElementById(entityNodeId(entityType, base + '_' + n)).nonempty()) {
    n += 1;
  }
  return base + '_' + n;
}

function uniqueFieldName(entityId) {
  let n = 1;
  while (cy.getElementById(fieldNodeId(entityId, 'field_' + n)).nonempty()) {
    n += 1;
  }
  return 'field_' + n;
}

function nearestEntity(position) {
  let best = null;
  let bestDistance = Infinity;
  cy.nodes('[group="entity"]').forEach((node) => {
    const p = node.position();
    const distance = (p.x - position.x) * (p.x - position.x) + (p.y - position.y) * (p.y - position.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node.id();
    }
  });
  return best;
}

/* Renaming a machine name re-ids the node with its has, ref and annotation
   edges. The proxies are derived from the ref edges, so syncReferences() gets
   the renames to keep each renamed proxy where it was. */

function moveAnnotationEdges(oldId, newId) {
  const edges = cy.getElementById(oldId).connectedEdges('[group="annotation"]');

  // Each copy keeps its edge's id, so the original is removed first.
  edges.forEach((edge) => {
    const data = { ...edge.data() };
    edge.remove();
    cy.add({ group: 'edges', data: { ...data, source: data.source === oldId ? newId : data.source, target: data.target === oldId ? newId : data.target } });
  });
}

function reidField(field, entityId, name) {
  const newId = fieldNodeId(entityId, name);
  cy.add({ group: 'nodes', data: { ...field.data(), id: newId, entity: entityId, name: name }, position: { ...field.position() } });
  cy.add({ group: 'edges', data: { id: hasEdgeId(newId), source: entityId, target: newId, group: 'has' } });
  field.connectedEdges('[group="ref"]').forEach((edge) => {
    if (edge.source().id() === field.id()) {
      const target = edge.target().id();
      cy.add({ group: 'edges', data: { ...edge.data(), id: refEdgeId(newId, target), source: newId, target: target } });
    }
  });
  moveAnnotationEdges(field.id(), newId);
  field.remove();

  return newId;
}

function renameEntity(oldId, newBundleRaw) {
  const node = cy.getElementById(oldId);
  if (node.empty() || node.data('group') !== 'entity') {
    return;
  }
  const entityType = node.data('entityType');
  const newBundle = machineName(newBundleRaw);
  const newId = entityNodeId(entityType, newBundle);
  if (!newBundle || newId === oldId || cy.getElementById(newId).nonempty()) {
    selectNode(oldId);
    return;
  }

  const change = 'Renamed entity “' + node.data('bundle') + '” to “' + newBundle + '”';
  cy.add({ group: 'nodes', data: { ...node.data(), id: newId, bundle: newBundle }, position: { ...node.position() } });
  moveAnnotationEdges(oldId, newId);
  cy.edges('[group="ref"]').forEach((edge) => {
    if (edge.target().id() === oldId) {
      const source = edge.source().id();
      cy.add({ group: 'edges', data: { ...edge.data(), id: refEdgeId(source, newId), source: source, target: newId } });
    }
  });

  const renames = { [oldId]: newId };
  cy.nodes('[group="field"][entity="' + oldId + '"]').forEach((field) => {
    renames[field.id()] = reidField(field, newId, field.data('name'));
  });
  node.remove();
  getController().syncReferences(renames);
  selectNode(newId);
  bump();
  checkpoint(change);
}

function renameField(oldId, newNameRaw) {
  const field = cy.getElementById(oldId);
  if (field.empty() || field.data('group') !== 'field') {
    return;
  }
  const entityId = field.data('entity');
  const newName = machineName(newNameRaw);
  const newId = fieldNodeId(entityId, newName);
  if (!newName || newId === oldId || cy.getElementById(newId).nonempty()) {
    selectNode(oldId);
    return;
  }

  const change = 'Renamed field “' + field.data('name') + '” to “' + newName + '”';
  reidField(field, entityId, newName);
  getController().syncReferences({ [oldId]: newId });
  selectNode(newId);
  bump();
  checkpoint(change);
}

/* Mutations ------------------------------------------------------------- */

// A node without a position starts at the view's centre, where another node
// can already sit, so it moves to the nearest clear spot in view.
function addNode(data, position) {
  const node = cy.add({ group: 'nodes', data: data, position: position || viewportCenter() });

  if (position) {
    return;
  }

  const others = cy.nodes(':visible').not(node);
  const obstacles = others.map((other) => other.boundingBox());

  node.shift(clearSpot(node.boundingBox(), obstacles, cy.extent(), CLEARANCE / cy.zoom()));
}

function addEntity(entityType, bundle, label, position) {
  const id = entityNodeId(entityType, bundle);
  if (cy.getElementById(id).nonempty()) {
    return null;
  }
  addNode({ id: id, group: 'entity', entityType: entityType, bundle: bundle, label: label }, position);
  return id;
}

function fieldPlacement(anchor, side) {
  const spread = (counter++ % 6) * 44 - 110;
  if (side === 'left') {
    return { x: anchor.x - FIELD_DISTANCE, y: anchor.y + spread };
  }
  if (side === 'top') {
    return { x: anchor.x + spread, y: anchor.y - FIELD_DISTANCE };
  }
  if (side === 'bottom') {
    return { x: anchor.x + spread, y: anchor.y + FIELD_DISTANCE };
  }
  return { x: anchor.x + FIELD_DISTANCE, y: anchor.y + spread };
}

function addField(entityId, name, label, fieldType, cardinality, side, position) {
  const fieldId = fieldNodeId(entityId, name);
  if (cy.getElementById(fieldId).nonempty()) {
    return null;
  }
  const kind = kindForCardinality(cardinality);
  const anchor = cy.getElementById(entityId).position();
  cy.add({
    group: 'nodes',
    data: {
      id: fieldId,
      group: 'field',
      name: name,
      label: label,
      fieldType: fieldType,
      kind: kind,
      cardinality: cardinality,
      required: false,
      entity: entityId,
    },
    position: position || fieldPlacement(anchor, side),
  });
  cy.add({ group: 'edges', data: { id: hasEdgeId(fieldId), source: entityId, target: fieldId, group: 'has' } });
  return fieldId;
}

function addAnnotation(kind, label, method, position) {
  const id = 'note-' + ++counter;
  const data = { id: id, group: 'annotation', kind: kind, label: label };
  if (method) {
    data.method = method;
  }
  addNode(data, position);
  return id;
}

function addReference(fieldId, targetId) {
  const id = refEdgeId(fieldId, targetId);
  if (cy.getElementById(id).nonempty() || cy.getElementById(targetId).empty()) {
    return;
  }
  const field = cy.getElementById(fieldId);
  const card = cardinalityLabel(field.data('cardinality') != null ? field.data('cardinality') : 1);
  cy.add({ group: 'edges', data: { id: id, source: fieldId, target: targetId, group: 'ref', cardinality: card } });
  getController().syncReferences();
}

// Names a reference for a history label, such as
// 'reference from field “Tags” to entity “Tags”'.
function describeReference(fieldId, targetId) {
  return 'reference from ' + describeNode(cy.getElementById(fieldId)) + ' to ' + describeNode(cy.getElementById(targetId));
}

function removeReference(fieldId, targetId) {
  const change = 'Removed the ' + describeReference(fieldId, targetId);
  cy.getElementById(refEdgeId(fieldId, targetId)).remove();
  getController().syncReferences();
  checkpoint(change);
}

function deleteNode(id) {
  const node = cy.getElementById(id);
  const change = 'Deleted ' + describeNode(node);
  if (node.data('group') === 'entity') {
    cy.nodes('[group="field"][entity="' + id + '"]').remove();
  }
  node.remove();
  getController().syncReferences();
  closeInspector();
  hideHandles();
  bump();
  checkpoint(change);
}

/* Builder controller ---------------------------------------------------- */

function createEntity(form) {
  const bundle = machineName(form.bundle);
  if (!bundle) {
    return;
  }
  const label = (form.label || '').trim() || bundle;
  const id = addEntity(form.entityType, bundle, label);
  if (id) {
    selectCreated(id);
  }
}

function createField(entityId, form, side) {
  const name = machineName(form.name);
  // An open form can name an entity that an undo has removed.
  if (!entityId || !name || cy.getElementById(entityId).empty()) {
    return;
  }
  const label = (form.label || '').trim() || name;
  const id = addField(entityId, name, label, form.fieldType, form.cardinality != null ? form.cardinality : 1, side);
  if (id) {
    if (form.target) {
      addReference(id, form.target);
    }
    selectCreated(id);
  }
}

// Adds the field definitions in a column right of the entity, as 1 step.
function createFields(entityId, fields) {
  const entity = cy.getElementById(entityId);

  // An open form can name an entity that an undo has removed.
  if (entity.empty() || !fields.length) {
    return;
  }

  const anchor = entity.position();
  const added = [];

  fields.forEach((field, index) => {
    const position = { x: anchor.x + FIELD_DISTANCE, y: anchor.y + (index - (fields.length - 1) / 2) * FIELD_SPACING };
    const id = addField(entityId, field.name, field.label, field.fieldType, field.cardinality, null, position);

    if (!id) {
      return;
    }

    cy.getElementById(id).data('required', !!field.required);
    (field.targets || []).forEach((target) => addReference(id, target));
    added.push(id);
  });

  if (!added.length) {
    return;
  }

  selectNode(entityId);
  bump();
  checkpoint(added.length === 1 ? 'Added ' + describeNode(cy.getElementById(added[0])) : 'Added ' + added.length + ' fields to ' + describeNode(entity));
}

function createAnnotation(form) {
  const label = (form.label || '').trim() || 'Note';
  selectCreated(addAnnotation(form.kind, label, (form.method || '').trim()));
}

function createReference(fieldId, targetId) {
  addReference(fieldId, targetId);
  checkpoint('Added a ' + describeReference(fieldId, targetId));
}
