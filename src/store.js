/**
 * Shared UI store.
 *
 * A tiny observable that both the Preact UI layer and the imperative modules
 * (render.js, builder.js, app.js) read and write. Panel windowing, the
 * inspector target and dock widths all live here; the Preact roots subscribe
 * and re-render, while imperative callers just invoke the action functions.
 */

const listeners = new Set();

const DEFAULT_POS = {
  entities: { left: 16, top: 16 },
  table: { right: 16, top: 16 },
  inspector: { right: 16, top: 16 },
  settings: { right: 16, top: 16 },
  legend: { right: 16, bottom: 16 },
};

const LAYOUT_KEY = 'nexusLayout';

let zCounter = 10;
let controller = null;
let builder = null;
let saveTimer = null;

function initialPanels() {
  const panels = {};
  Object.keys(DEFAULT_POS).forEach((id) => {
    panels[id] = { open: false, dock: null, pos: { ...DEFAULT_POS[id] }, z: 4, height: 260 };
  });
  return panels;
}

function layoutSnapshot() {
  const panels = {};
  Object.keys(state.panels).forEach((id) => {
    const p = state.panels[id];
    panels[id] = { open: p.open, dock: p.dock, pos: p.pos, height: p.height };
  });
  return { panels: panels, dockWidth: state.dockWidth };
}

function mergeLayout(panels, saved) {
  Object.keys(panels).forEach((id) => {
    const entry = saved.panels && saved.panels[id];
    if (entry) {
      panels[id] = { ...panels[id], open: !!entry.open, dock: entry.dock || null, pos: entry.pos || panels[id].pos, height: entry.height || panels[id].height };
    }
  });
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
  return { panels: panels, dockWidth: dockWidth, selected: null, tableFilter: '__all__', version: 0 };
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

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setController(ctx) {
  controller = ctx;
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

export function openTableFor(entityId) {
  zCounter += 1;
  emit({ tableFilter: entityId, panels: { ...state.panels, table: { ...state.panels.table, open: true, z: zCounter } } });
}

// Bump to force the data-driven panel bodies to re-read the graph after an edit.
export function bump() {
  emit({ version: state.version + 1 });
}

export function openPanel(id) {
  zCounter += 1;
  patchPanel(id, { open: true, z: zCounter });
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
  zCounter += 1;
  patchPanel(id, { z: zCounter });
}

export function movePanel(id, left, top) {
  patchPanel(id, { open: true, dock: null, pos: { left: left, top: top } });
}

export function pinPanel(id, side) {
  // Clear any prior height so a freshly docked panel fills the sidebar; a manual
  // resize sets a fixed height again, and other panels then share the space.
  patchPanel(id, { open: true, dock: side, height: null });
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

export function setPanelHeight(id, height) {
  patchPanel(id, { height: Math.max(90, Math.min(900, Math.round(height))) });
}

// The panel layout persists to localStorage on every change; these let a saved
// Nexus document carry its own layout so it round-trips with the project.
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
  zCounter += 1;
  emit({ selected: selected, panels: { ...state.panels, inspector: { ...state.panels.inspector, open: true, z: zCounter } } });
}

export function closeInspector() {
  emit({ selected: null, panels: { ...state.panels, inspector: { ...state.panels.inspector, open: false } } });
}
