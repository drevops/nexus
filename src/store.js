/**
 * Shared UI store.
 *
 * A tiny observable holding the panel windowing, the inspector target and
 * the dock widths.
 *
 * `revision` counts the times the history changed the graph.
 */

const listeners = new Set();

const DEFAULT_POS = {
  entities: { left: 16, top: 16 },
  table: { right: 16, top: 16 },
  inspector: { right: 16, top: 16 },
  settings: { right: 16, top: 16 },
  legend: { right: 16, bottom: 16 },
  history: { left: 16, bottom: 16 },
};

// Raised panels hold distinct z-indexes in a band from PANEL_Z up, 1 per
// panel, above the z-index every panel starts at.
const PANEL_Z = 10;

const LAYOUT_KEY = 'nexusLayout';

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
  return { panels: panels, dockWidth: dockWidth, selected: null, tableFilter: '__all__', version: 0, revision: 0 };
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
  // Clear any prior height so a freshly docked panel fills the sidebar.
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
