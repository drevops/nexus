/**
 * Shared UI store.
 *
 * A tiny observable holding the panel windowing, the inspector target and
 * the dock widths. Each panel's `order` places it in its side rail, and its
 * `size` sets its width and height while it floats.
 *
 * `revision` counts the times the graph changed under the Inspector: by the
 * history or by an edit in the Fields table. Its forms remount on each.
 * `editMode` is true while the app is in Edit mode. `comparison` holds the
 * comparison on the canvas, as `{ source, changes }`, or null.
 */

import { DEFAULT_SORT } from './field-table.js';

const listeners = new Set();

// The default order of the panels, also the order of a side rail's panels
// until they are moved.
export const PANEL_ORDER = ['entities', 'table', 'legend', 'history', 'checks', 'changes', 'inspector'];

const DEFAULT_POS = {
  entities: { left: 16, top: 16 },
  table: { right: 16, top: 16 },
  inspector: { right: 16, top: 16 },
  legend: { right: 16, bottom: 16 },
  history: { left: 16, bottom: 16 },
  checks: { left: 16, bottom: 16 },
  changes: { right: 16, top: 16 },
};

// Raised panels hold distinct z-indexes in a band from PANEL_Z up, 1 per
// panel, above the z-index every panel starts at.
const PANEL_Z = 10;

// Matches the min-height of .panel.is-docked in styles.css.
const MIN_PANEL_HEIGHT = 90;

const LAYOUT_KEY = 'nexusLayout';

let controller = null;
let builder = null;
let saveTimer = null;

function initialPanels() {
  const panels = {};
  Object.keys(DEFAULT_POS).forEach((id) => {
    panels[id] = { open: false, dock: null, pos: { ...DEFAULT_POS[id] }, z: 4, height: null, size: null, order: PANEL_ORDER.indexOf(id) };
  });
  return panels;
}

function layoutSnapshot() {
  const panels = {};
  Object.keys(state.panels).forEach((id) => {
    const p = state.panels[id];
    panels[id] = { open: p.open, dock: p.dock, pos: p.pos, height: p.height, size: p.size, order: p.order };
  });
  return { panels: panels, dockWidth: state.dockWidth };
}

// A stored layout is untrusted, so a size is kept only when both sides are
// positive numbers.
function storedSize(size) {
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    return null;
  }

  return { width: Math.round(size.width), height: Math.round(size.height) };
}

function mergeLayout(panels, saved) {
  Object.keys(panels).forEach((id) => {
    const entry = saved.panels && saved.panels[id];
    if (entry) {
      const order = Number.isFinite(entry.order) ? entry.order : panels[id].order;

      panels[id] = {
        ...panels[id],
        open: !!entry.open,
        dock: entry.dock || null,
        pos: entry.pos || panels[id].pos,
        height: entry.height || panels[id].height,
        size: entry.size === undefined ? panels[id].size : storedSize(entry.size),
        order,
      };
    }
  });
}

// The ids of the panels docked on a side, open or closed, in rail order.
// Panels that share an order keep the PANEL_ORDER order.
function sidePanels(panels, side) {
  const ids = PANEL_ORDER.filter((id) => panels[id].dock === side);

  return ids.sort((a, b) => panels[a].order - panels[b].order || PANEL_ORDER.indexOf(a) - PANEL_ORDER.indexOf(b));
}

function loadLayout() {
  try {
    return JSON.parse(window.localStorage.getItem(LAYOUT_KEY));
  } catch {
    return null;
  }
}

function saveLayout() {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutSnapshot()));
  } catch {
    // Storage may be unavailable (private mode); keep the in-memory layout.
  }
}

function scheduleSave() {
  if (saveTimer) {
    return;
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveLayout();
  }, 400);
}

function initialState() {
  const panels = initialPanels();
  let dockWidth = { left: 320, right: 340 };
  const saved = loadLayout();
  if (saved && saved.panels) {
    mergeLayout(panels, saved);
    if (saved.dockWidth) {
      dockWidth = saved.dockWidth;
    }
  } else {
    panels.legend.open = true;
  }
  return {
    panels: panels,
    dockWidth: dockWidth,
    selected: null,
    tableFilter: '__all__',
    tableSearch: '',
    tableSort: DEFAULT_SORT,
    editMode: false,
    comparison: null,
    version: 0,
    revision: 0,
    dragging: null,
  };
}

let state = initialState();

function emit(next) {
  state = { ...state, ...next };
  scheduleSave();
  listeners.forEach((fn) => fn());
}

function patchPanel(id, next) {
  emit({ panels: { ...state.panels, [id]: { ...state.panels[id], ...next } } });
}

// Returns the panels with the given one patched and on top of the band. The
// panels above it move down 1, so raised panels never pass the band's top.
function raisedPanels(id, next = {}) {
  const z = state.panels[id].z;
  const panels = {};

  Object.keys(state.panels).forEach((key) => {
    const panel = state.panels[key];
    panels[key] = panel.z > z ? { ...panel, z: panel.z - 1 } : panel;
  });

  panels[id] = { ...state.panels[id], ...next, z: PANEL_Z + Object.keys(state.panels).length - 1 };

  return panels;
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setController(value) {
  controller = value;
}

export function getController() {
  return controller;
}

export function setBuilder(api) {
  builder = api;
}

export function getBuilder() {
  return builder;
}

export function setTableFilter(value) {
  emit({ tableFilter: value });
}

export function setTableSearch(value) {
  emit({ tableSearch: value });
}

export function setTableSort(sort) {
  emit({ tableSort: sort });
}

export function setEditMode(editMode) {
  if (state.editMode !== editMode) {
    emit({ editMode });
  }
}

export function setComparison(comparison) {
  if (state.comparison !== comparison) {
    emit({ comparison });
  }
}

export function openTableFor(entityId) {
  emit({ tableFilter: entityId, panels: raisedPanels('table', { open: true }) });
}

// The store holds no graph data, so this notifies subscribers of graph
// changes.
export function bump() {
  emit({ version: state.version + 1 });
}

export function revise() {
  emit({ revision: state.revision + 1 });
}

export function openPanel(id) {
  emit({ panels: raisedPanels(id, { open: true }) });
}

export function closePanel(id) {
  if (id === 'inspector') {
    emit({ selected: null });
  }
  patchPanel(id, { open: false });
}

export function togglePanel(id) {
  if (state.panels[id].open) {
    closePanel(id);
  } else {
    openPanel(id);
  }
}

export function focusPanel(id) {
  emit({ panels: raisedPanels(id) });
}

export function movePanel(id, left, top) {
  patchPanel(id, { open: true, dock: null, pos: { left: left, top: top } });
}

export function pinPanel(id, side) {
  // Clear any prior height so a freshly docked panel takes its content height.
  patchPanel(id, { open: true, dock: side, height: null });
}

// The ids of the open panels docked on a side, top to bottom.
export function dockedPanels(side) {
  return sidePanels(state.panels, side).filter((id) => state.panels[id].open);
}

// Docks a panel on a side above the open panel now at the index, or last
// when the index is past the end. The side's closed panels keep their place
// relative to the others, so each reopens where it was.
export function dockPanel(id, side, index) {
  const panels = { ...state.panels };
  const ids = sidePanels(panels, side).filter((key) => key !== id);
  const next = dockedPanels(side).filter((key) => key !== id)[index];

  ids.splice(next ? ids.indexOf(next) : ids.length, 0, id);
  ids.forEach((key, order) => {
    panels[key] = { ...panels[key], order };
  });

  // A panel that changes side takes its content height, as a pinned panel does.
  const height = state.panels[id].dock === side ? state.panels[id].height : null;

  panels[id] = { ...panels[id], open: true, dock: side, height };
  emit({ panels });
}

// Marks the docked panel being dragged by its handle, or none.
export function setDragging(id) {
  emit({ dragging: id });
}

export function unpinPanel(id) {
  patchPanel(id, { dock: null, pos: { ...DEFAULT_POS[id] } });
}

export function togglePin(id, side) {
  if (state.panels[id].dock) {
    unpinPanel(id);
  } else {
    pinPanel(id, side);
  }
}

export function setDockWidth(side, width) {
  emit({ dockWidth: { ...state.dockWidth, [side]: Math.max(220, Math.min(680, Math.round(width))) } });
}

// The minimum wins over a maxHeight below it.
export function setPanelHeight(id, height, maxHeight) {
  patchPanel(id, { height: Math.max(MIN_PANEL_HEIGHT, Math.round(Math.min(height, maxHeight))) });
}

// Floats a panel in the box, as resizeBox() in panel-resize.js returns it.
export function resizePanel(id, box) {
  patchPanel(id, { pos: { left: Math.round(box.left), top: Math.round(box.top) }, size: { width: Math.round(box.width), height: Math.round(box.height) } });
}

// A floating panel without a size takes the size of its content.
export function resetPanelSize(id) {
  patchPanel(id, { size: null });
}

export function exportLayout() {
  return layoutSnapshot();
}

export function importLayout(layout) {
  if (!layout || !layout.panels) {
    return;
  }
  const panels = { ...state.panels };
  mergeLayout(panels, layout);
  emit({ panels: panels, dockWidth: layout.dockWidth || state.dockWidth });
}

export function openInspector(selected) {
  emit({ selected: selected, panels: raisedPanels('inspector', { open: true }) });
}

export function closeInspector() {
  emit({ selected: null, panels: { ...state.panels, inspector: { ...state.panels.inspector, open: false } } });
}
