/**
 * Preact UI layer: toolbar-driven panels rendered over the Cytoscape canvas.
 *
 * The whole stage (side docks + canvas host + floating panels) is 1 Preact
 * tree driven by the shared store. Panels float, are dragged by their header
 * and are resized from their left, right and bottom edges and bottom corners.
 *
 * Dropping a panel near an edge, or clicking its pin, docks it into a side
 * rail. Any number of docked panels stack, each at most as tall as its
 * content and scrolling independently, and the rail can be resized
 * horizontally. Dragging a docked panel's header undocks it, while its grip
 * handle moves it within or between the rails.
 *
 * The canvas host is a no-update component so the Cytoscape instance and the
 * imperative overlays it owns are never re-rendered.
 */

import { h, render, Component, options } from 'preact';
import { useState, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import htmBase from 'htm';
import { icon } from './icons.js';
import { cardinalityLabel, cardinalityOptions, identifierSegments, fitFontSize, typeOptions } from './model.js';
import { InspectorBody } from './inspector.js';
import { allowedValueLabels, allowedValuesText, parseAllowedValues, translatableChoice, translatableValue, TRANSLATABLE_OPTIONS } from './field-settings.js';
import { numberFields, sortFields, nextSort, isDefaultSort, cellEditor, referenceChanges } from './field-table.js';
import { setFieldCardinality, setFieldLabel, setFieldRequired, setFieldTranslatable, setFieldType, setSetting } from './field-edits.js';
import { SelectEditor, TextEditor } from './table-editors.js';
import { parseRichText, richTextPlain } from './rich-text.js';
import { usedInTitle } from './shared-fields.js';
import { RESIZE_HANDLES, resizeBox } from './panel-resize.js';
import { goToVersion, historyState } from './undo.js';
import { MODES } from './diagram-defaults.js';
import { MARKDOWN_DIAGRAM_OPTIONS } from './markdown.js';
import { CHECK_RULES, LEVEL_ERROR, LEVEL_WARNING, MAX_FIELD_LIMIT, isFieldLimit } from './model-checks.js';
import { titleShoelaceHosts } from './host-titles.js';
import {
  getState,
  subscribe,
  getController,
  getBuilder,
  bump,
  revise,
  togglePanel,
  closePanel,
  focusPanel,
  movePanel,
  pinPanel,
  unpinPanel,
  dockPanel,
  dockedPanels,
  setDragging,
  setDockWidth,
  setPanelHeight,
  resizePanel,
  resetPanelSize,
  setTableFilter,
  setTableSearch,
  setTableSort,
  openTableFor,
  PANEL_ORDER,
} from './store.js';
import { $ } from './dom.js';

const html = htmBase.bind(h);

const TITLES = { entities: 'Entities', table: 'Fields', settings: 'Settings', legend: 'Legend', history: 'History', checks: 'Checks', inspector: 'Inspector' };
const WIDE = { table: true };
const PANEL_TOGGLES = [
  ['entities-toggle', 'entities'],
  ['table-toggle', 'table'],
  ['legend-toggle', 'legend'],
  ['history-toggle', 'history'],
  ['checks-toggle', 'checks'],
  ['settings-toggle', 'settings'],
];

const SWATCHES = {
  entity: '<svg width="34" height="24"><rect x="2" y="4" width="30" height="16" rx="3" fill="#9fc5e8" stroke="#5b6470"/></svg>',
  single: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#555c66"/></svg>',
  multi:
    '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#3d444d"/><ellipse cx="17" cy="12" rx="11" ry="6.5" fill="none" stroke="#3d444d"/></svg>',
  system: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#98a2b3" stroke-dasharray="3 2"/></svg>',
  calculated: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#ffd966" stroke="#c9a227"/></svg>',
  event: '<svg width="34" height="24"><polygon points="17,3 31,12 17,21 3,12" fill="#fff" stroke="#333b45"/></svg>',
  api: '<svg width="34" height="24"><polygon points="10,3 24,3 32,12 24,21 10,21 2,12" fill="#fff" stroke="#333b45"/></svg>',
  callback:
    '<svg width="34" height="24"><rect x="2" y="4" width="30" height="16" rx="2" fill="#fff" stroke="#333b45"/><line x1="2" y1="13" x2="32" y2="13" stroke="#333b45"/></svg>',
  note: '<svg width="34" height="24"><rect x="4" y="3" width="26" height="18" fill="#fff4b3" stroke="#d9b93a"/><line x1="8" y1="9" x2="26" y2="9" stroke="#3a2f0a"/><line x1="8" y1="15" x2="20" y2="15" stroke="#3a2f0a"/></svg>',
};

// Entity types are drawn dynamically from the settings; these are the fixed
// field and annotation symbols that follow them in the legend.
const LEGEND_ITEMS = [
  ['single', 'Single-value field'],
  ['multi', 'Multi-value field'],
  ['system', 'System field'],
  ['calculated', 'Calculated field'],
  ['event', 'Event'],
  ['api', 'API'],
  ['callback', 'Callback / method'],
  ['note', 'Note'],
];

function useStore() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((v) => v + 1)), []);
  return getState();
}

function rawIcon(name, size) {
  return html`<span dangerouslySetInnerHTML=${{ __html: icon(name, size) }}></span>`;
}

// A resized panel is capped at the canvas beyond its left and top edges, so it
// shrinks with the window rather than leaving the canvas.
function floatStyle(panel) {
  const p = panel.pos;
  const size = panel.size;

  return {
    left: p.left != null ? p.left + 'px' : '',
    top: p.top != null ? p.top + 'px' : '',
    right: p.right != null ? p.right + 'px' : '',
    bottom: p.bottom != null ? p.bottom + 'px' : '',
    width: size ? size.width + 'px' : '',
    height: size ? size.height + 'px' : '',
    maxWidth: size && p.left != null ? 'calc(100% - ' + p.left + 'px)' : '',
    maxHeight: size && p.top != null ? 'calc(100% - ' + p.top + 'px)' : '',
    zIndex: panel.z,
  };
}

/* Drag, drag-to-dock and pin ---------------------------------------------- */

function edgeSide(clientX) {
  const stage = $('stage-root').getBoundingClientRect();
  if (clientX <= stage.left + 90) {
    return 'left';
  }
  if (clientX >= stage.right - 90) {
    return 'right';
  }
  return null;
}

// A rail takes a drop anywhere across its width, not only within the edge
// zone.
function sideAt(clientX) {
  const side = ['left', 'right'].find((key) => {
    const dock = $('dock-' + key);

    if (!dock) {
      return false;
    }

    const rect = dock.getBoundingClientRect();

    return clientX >= rect.left && clientX <= rect.right;
  });

  return side || edgeSide(clientX);
}

// The index a panel dropped at the pointer takes among the other open panels
// on the side: 1 past each panel whose middle is above the pointer.
function dockIndexAt(side, id, clientY) {
  const above = dockedPanels(side).filter((key) => {
    if (key === id) {
      return false;
    }

    const rect = $(key).getBoundingClientRect();

    return rect.top + rect.height / 2 < clientY;
  });

  return above.length;
}

// The least distance, in pixels, between a dragged panel's grab point and its
// right edge.
const GRAB_MARGIN = 24;

function highlightDrop(side) {
  const stage = $('stage-root');
  stage.classList.toggle('drop-left', side === 'left');
  stage.classList.toggle('drop-right', side === 'right');
}

// Moves a docked panel up or down its rail, or to the other rail. Over the
// canvas the panel stays where it last was, so it never undocks.
function startDockDrag(id, evt) {
  function move(e) {
    const side = sideAt(e.clientX) || getState().panels[id].dock;
    const index = dockIndexAt(side, id, e.clientY);

    if (getState().panels[id].dock !== side || dockedPanels(side).indexOf(id) !== index) {
      dockPanel(id, side, index);
    }
  }

  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.body.classList.remove('is-dragging-panel');
    setDragging(null);
  }

  setDragging(id);
  document.body.classList.add('is-dragging-panel');
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  evt.preventDefault();
}

function startDrag(id, evt, el) {
  if (evt.target.closest('button, input, select, a, code')) {
    return;
  }

  // The handle keeps a docked panel docked; the rest of the header undocks it.
  if (getState().panels[id].dock && evt.target.closest('.panel__grip')) {
    startDockDrag(id, evt);
    return;
  }

  const rect = el.getBoundingClientRect();
  const offsetX = evt.clientX - rect.left;
  const offsetY = evt.clientY - rect.top;

  // The first move undocks a docked panel, which can remove its rail and
  // shift the canvas, so each move measures the canvas again. The panel also
  // narrows to its floating width, so the grab point is kept inside it.
  function move(e) {
    const area = $('stage-root').querySelector('.stage__canvas').getBoundingClientRect();
    const grabX = Math.min(offsetX, $(id).offsetWidth - GRAB_MARGIN);

    movePanel(id, Math.max(0, e.clientX - area.left - grabX), Math.max(0, e.clientY - area.top - offsetY));
    highlightDrop(sideAt(e.clientX));
  }

  function up(e) {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    highlightDrop(null);
    const side = sideAt(e.clientX);
    if (side) {
      dockPanel(id, side, dockIndexAt(side, id, e.clientY));
    }
  }

  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  evt.preventDefault();
}

function pinFromButton(id, el) {
  if (getState().panels[id].dock) {
    unpinPanel(id);
    return;
  }
  const rect = el.getBoundingClientRect();
  const area = el.closest('.stage__canvas').getBoundingClientRect();
  pinPanel(id, rect.left + rect.width / 2 < area.left + area.width / 2 ? 'left' : 'right');
}

function startResize(side, evt) {
  const dock = $('dock-' + side);
  const startX = evt.clientX;
  const startW = dock.getBoundingClientRect().width;

  function move(e) {
    setDockWidth(side, startW + (side === 'left' ? e.clientX - startX : startX - e.clientX));
  }

  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  }

  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  evt.preventDefault();
}

// The height a panel needs to show its body without scrolling.
function contentHeight(el) {
  const bodyEl = el.querySelector('.panel__body');

  return el.getBoundingClientRect().height - bodyEl.clientHeight + bodyEl.scrollHeight;
}

// The height of a dock's content box, inside its padding.
function dockHeight(el) {
  const scroll = el.closest('.dock__scroll');
  const style = getComputedStyle(scroll);

  return scroll.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
}

function startVResize(id, evt, el) {
  const startY = evt.clientY;
  const startH = el.getBoundingClientRect().height;
  const maxH = Math.min(contentHeight(el), dockHeight(el));

  function move(e) {
    setPanelHeight(id, startH + (e.clientY - startY), maxH);
  }

  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  }

  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  evt.preventDefault();
  evt.stopPropagation();
}

// Resizes a floating panel from 1 of its RESIZE_HANDLES within the canvas. A
// panel placed from the right or bottom edge is anchored at its top-left
// corner first, so the edges the handle doesn't move stay put. The handle's
// cursor stays on the whole page while the pointer is down.
function startPanelResize(id, handle, evt, el) {
  const rect = el.getBoundingClientRect();
  const area = el.closest('.stage__canvas').getBoundingClientRect();
  const start = { left: rect.left - area.left, top: rect.top - area.top, width: rect.width, height: rect.height };
  const frame = { width: area.width, height: area.height };

  function move(e) {
    resizePanel(id, resizeBox(start, handle, e.clientX - evt.clientX, e.clientY - evt.clientY, frame));
  }

  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.body.classList.remove('is-resizing-panel');
    document.body.style.removeProperty('--resize-cursor');
  }

  document.body.style.setProperty('--resize-cursor', getComputedStyle(evt.currentTarget).cursor);
  document.body.classList.add('is-resizing-panel');
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  evt.preventDefault();
}

/* Shell ------------------------------------------------------------------- */

const FLOAT_DRAG_TITLE = 'Drag to move, drop at an edge to dock';

// A docked panel is never taller than its content. The Inspector keeps its
// content height and the other panels shrink, while a resized panel keeps the
// height it was given as a maximum. The rest share the free space equally,
// and a panel that reaches its content height leaves the rest to the others.
function dockStyle(id, panel) {
  if (id === 'inspector') {
    return { zIndex: panel.z, flex: '0 0 auto', maxHeight: '100%' };
  }

  if (panel.height) {
    return { zIndex: panel.z, flex: '0 0 auto', maxHeight: panel.height + 'px' };
  }

  return { zIndex: panel.z, flex: '1 1 0', maxHeight: 'max-content' };
}

function Panel({ id, panel, dragging, header, children }) {
  const ref = useRef(null);
  const docked = !!panel.dock;
  const resizable = docked && id !== 'inspector';
  const cls =
    'panel' + (WIDE[id] ? ' panel--wide' : '') + (id === 'legend' ? ' panel--legend' : '') + (docked ? ' is-docked' : '') + (dragging ? ' is-dragging' : '');
  const style = docked ? dockStyle(id, panel) : floatStyle(panel);

  return html` <section id=${id} ref=${ref} class=${cls} style=${style} onMouseDown=${() => focusPanel(id)}>
    <div
      class="panel__head"
      onMouseDown=${(e) => startDrag(id, e, ref.current)}
      title=${docked ? 'Drag to undock and move, drop at an edge to dock' : FLOAT_DRAG_TITLE}
    >
      <span
        class="panel__grip"
        title=${docked ? 'Drag to move up or down, or to the other side' : FLOAT_DRAG_TITLE}
        dangerouslySetInnerHTML=${{ __html: icon('grip-vertical') }}
      ></span>
      <span class="panel__title">${TITLES[id]}</span>
      ${header}
      <span class="panel__spacer"></span>
      <button
        class="panel__pin"
        type="button"
        title=${docked ? 'Unpin from side' : 'Pin to a side'}
        aria-label="Pin"
        aria-pressed=${docked ? 'true' : 'false'}
        onClick=${() => pinFromButton(id, ref.current)}
        dangerouslySetInnerHTML=${{ __html: icon('pin') }}
      ></button>
      <button
        class="panel__close"
        type="button"
        title="Close panel"
        aria-label="Close"
        onClick=${() => closePanel(id)}
        dangerouslySetInnerHTML=${{ __html: icon('x') }}
      ></button>
    </div>
    <div class="panel__body">${children}</div>
    ${resizable ? html`<div class="panel__vresize" title="Drag to resize height" onMouseDown=${(e) => startVResize(id, e, ref.current)}></div>` : null}
    ${
      docked
        ? null
        : RESIZE_HANDLES.map(
            (handle) =>
              html`<div
                key=${handle}
                class=${'panel__resize panel__resize--' + handle}
                title="Drag to resize, double-click to fit the content"
                onMouseDown=${(e) => startPanelResize(id, handle, e, ref.current)}
                onDblClick=${() => resetPanelSize(id)}
              ></div>`,
          )
    }
  </section>`;
}

function panelFor(id, s) {
  return html`<${Panel} key=${id} id=${id} panel=${s.panels[id]} dragging=${s.dragging === id}>${body(id, s)}<//>`;
}

function DockRail({ side, s }) {
  const ids = dockedPanels(side);
  if (!ids.length) {
    return null;
  }
  return html` <div class="dock" id=${'dock-' + side} data-side=${side} style=${{ width: s.dockWidth[side] + 'px' }}>
    <div class="dock__scroll">${ids.map((id) => panelFor(id, s))}</div>
    <div class=${'dock__resize dock__resize--' + side} title="Drag to resize the side rail" onMouseDown=${(e) => startResize(side, e)}></div>
  </div>`;
}

function FloatLayer({ s }) {
  const ids = PANEL_ORDER.filter((id) => s.panels[id].open && !s.panels[id].dock);
  return ids.map((id) => panelFor(id, s));
}

class CanvasHost extends Component {
  shouldComponentUpdate() {
    return false;
  }

  render() {
    return html` <div id="cy" class="cy"></div>
      <div id="note-bodies" class="note-bodies"></div>
      <div id="captions" class="captions" aria-hidden="true"></div>
      <div id="notes" class="notes"></div>
      <div id="handles" class="handles" hidden></div>
      <div id="mode-frame" class="mode-frame" aria-hidden="true"></div>
      <div id="tooltip" class="tooltip" role="tooltip" hidden></div>`;
  }
}

function StageApp() {
  const s = useStore();
  const sig = PANEL_ORDER.map((id) => s.panels[id].dock || '').join() + ':' + s.dockWidth.left + ':' + s.dockWidth.right;
  useEffect(() => {
    const controller = getController();
    if (controller) {
      controller.cy.resize();
    }
  }, [sig]);

  return html` <${DockRail} side="left" s=${s} />
    <div class="stage__canvas">
      <${CanvasHost} />
      <${FloatLayer} s=${s} />
    </div>
    <${DockRail} side="right" s=${s} />`;
}

/* Bodies ------------------------------------------------------------------ */

function body(id, s) {
  const controller = getController();
  if (id === 'inspector') {
    return html`<${InspectorBody} selected=${s.selected} revision=${s.revision} />`;
  }
  if (!controller) {
    return null;
  }
  if (id === 'history') {
    return html`<${HistoryBody} />`;
  }
  if (id === 'checks') {
    return html`<${ChecksBody} controller=${controller} problems=${currentProblems()} />`;
  }
  if (id === 'legend') {
    return html`<div class="legend-body">
      ${controller
        .presentTypes()
        .map(
          (t) =>
            html` <div class="legend__item">
              <span class="legend__swatch" dangerouslySetInnerHTML=${{ __html: controller.symbolSvg(t.symbol, t.color) }}></span
              ><span class="legend__label">${t.label}</span>
            </div>`,
        )}
      ${LEGEND_ITEMS.map(
        (item) =>
          html` <div class="legend__item">
            <span class="legend__swatch" dangerouslySetInnerHTML=${{ __html: SWATCHES[item[0]] }}></span><span class="legend__label">${item[1]}</span>
          </div>`,
      )}
    </div>`;
  }
  if (id === 'entities') {
    return html`<${EntitiesBody} controller=${controller} />`;
  }
  if (id === 'table') {
    return html`<${TableBody} controller=${controller} filter=${s.tableFilter} term=${s.tableSearch} sort=${s.tableSort} editMode=${s.editMode} />`;
  }
  return html`<${SettingsBody} controller=${controller} />`;
}

function EntitiesBody({ controller }) {
  return html` <div id="type-filters" class="filters">
      ${controller.presentTypes().map(
        (t) =>
          html` <label class="filters__item" title=${'Show or hide every ' + t.label + ' entity on the canvas'}>
            <input type="checkbox" checked=${t.visible} onChange=${(e) => controller.setTypeVisible(t.type, e.target.checked)} />
            <span class="filters__swatch" style=${{ background: t.color }}></span>${t.label}
          </label>`,
      )}
    </div>
    <div id="entity-list" class="entity-list">
      ${controller.entities().map(
        (e) =>
          html` <div class="entity-row" data-type=${e.entityType}>
            <button class="entity-row__name" title="Focus this entity on the canvas" onClick=${() => controller.focusEntity(e.id)}>
              <b>${e.label}</b> <span class="entity-row__type">${controller.typeLabel(e.entityType)}</span>
            </button>
            <span class="entity-row__count">${e.fieldCount}</span>
            <button class="entity-row__fields" title="Show this entity's fields in the table" onClick=${() => openTableFor(e.id)}>fields</button>
          </div>`,
      )}
    </div>`;
}

const TIME_FORMAT = { hour: '2-digit', minute: '2-digit' };

// The versions of the open diagram, newest first. Versions after the current
// one were undone and stay listed until the next edit drops them.
function HistoryBody() {
  const { versions, index } = historyState();
  const listRef = useRef(null);

  // Undo and redo move the current version, which can scroll out of view.
  useLayoutEffect(() => {
    const current = listRef.current.querySelector('[aria-current]');

    if (current) {
      current.scrollIntoView({ block: 'nearest' });
    }
  }, [index, versions.length]);

  const rows = versions.map((version, i) => {
    const time = new Date(version.time);
    const state = i === index ? ' is-current' : i > index ? ' is-undone' : '';

    return html`<li>
      <button
        type="button"
        class=${'history__version' + state}
        data-history-index=${i}
        aria-current=${i === index ? 'step' : null}
        title=${'Return to this version, made ' + time.toLocaleString()}
        onClick=${() => goToVersion(i)}
      >
        <span class="history__label">${version.label}</span>
        <time class="history__time" datetime=${time.toISOString()}>${time.toLocaleTimeString([], TIME_FORMAT)}</time>
      </button>
    </li>`;
  });

  return html`<ol class="history-list" ref=${listRef}>
      ${rows.reverse()}
    </ol>
    <p class="panel__note history-note">Click a version to return to it. The versions after it stay until your next edit.</p>`;
}

const CHECK_LEVELS = [
  { level: LEVEL_ERROR, heading: 'Errors', icon: 'circle-alert', title: 'Problems Drupal would reject' },
  { level: LEVEL_WARNING, heading: 'Warnings', icon: 'triangle-alert', title: 'Problems that break common practice' },
];

const RULE_LABELS = Object.fromEntries(CHECK_RULES.map((rule) => [rule.id, rule.label]));

// The store's version moves with every edit, undo, redo, new diagram and
// setting change, so the problems are worked out again only then.
let checked = { controller: null, version: -1, problems: [] };

function currentProblems() {
  const controller = getController();
  const { version } = getState();

  if (!controller) {
    return [];
  }

  if (checked.controller !== controller || checked.version !== version) {
    checked = { controller, version, problems: controller.problems() };
  }

  return checked.problems;
}

function countText(count, noun) {
  return count + ' ' + noun + (count === 1 ? '' : 's');
}

// In Edit mode the Inspector opens on the node too, so it can be fixed. A
// problem on an entity of a hidden type has nothing on the canvas to go to.
function goToProblem(controller, id) {
  if (!controller.canFocusProblem(id)) {
    return;
  }

  controller.focusProblem(id);

  if (window.__nexusBuild) {
    getBuilder().select(id);
  }
}

function problemRow(controller, problem, iconName, index) {
  const reachable = controller.canFocusProblem(problem.id);
  const action = reachable ? '. Click to go to it on the canvas' : '. Show its entity type to go to it';

  return html`<li key=${problem.rule + problem.id + index}>
    <button
      type="button"
      class="checks__item"
      data-check-rule=${problem.rule}
      data-check-id=${problem.id}
      aria-disabled=${reachable ? null : 'true'}
      title=${RULE_LABELS[problem.rule] + action}
      onClick=${() => goToProblem(controller, problem.id)}
    >
      ${rawIcon(iconName, 14)}<span class="checks__message">${problem.message}</span>
    </button>
  </li>`;
}

// The problems of the open model, errors first, each a button that goes to
// the entity or field it is on.
function ChecksBody({ controller, problems }) {
  if (problems.length === 0) {
    return html`<p class="panel__note checks-empty">No problems found.</p>`;
  }

  const groups = CHECK_LEVELS.map((group) => ({ ...group, items: problems.filter((problem) => problem.level === group.level) }));

  return html`<div class="checks">
      ${groups
        .filter((group) => group.items.length > 0)
        .map(
          (group) =>
            html`<section class="checks__group" data-level=${group.level} key=${group.level}>
              <h3 class="checks__heading" title=${group.title}>
                ${group.heading}<span class="checks__count" title=${countText(group.items.length, group.level)}>${group.items.length}</span>
              </h3>
              <ul class="checks__list">
                ${group.items.map((problem, index) => problemRow(controller, problem, group.icon, index))}
              </ul>
            </section>`,
        )}
    </div>
    <p class="panel__note checks-note">Click a problem to go to it. The list follows every edit, undo and redo.</p>`;
}

const KIND_BADGE_TITLES = {
  system: 'System field: a base field every bundle of the entity type has',
  calculated: 'Calculated field: a value worked out rather than stored',
};

// Base and computed fields carry a category badge; everything else shows its
// cardinality (1, 1..N, 1..n) coloured by single vs multi.
function cardBadge(r) {
  if (r.kind === 'system' || r.kind === 'calculated') {
    return html`<span class=${'badge badge--' + r.kind} title=${KIND_BADGE_TITLES[r.kind]}>${r.kind}</span>`;
  }

  const label = cardinalityLabel(r.cardinality);

  return html`<span class=${'badge badge--' + (r.cardinality === 1 ? 'single' : 'multi')} title=${'Cardinality: ' + label}>${label}</span>`;
}

// An underscore is not a line-break opportunity, so a <wbr> after each
// underscore run lets an identifier wrap between its words.
function wrappable(value) {
  return identifierSegments(value).map((segment, i) => (i ? html`<wbr />${segment}` : segment));
}

// 0.625rem is 10px at the default root size and grows with a larger default
// font, so readers who chose bigger text keep it.
const MIN_IDENTIFIER_REM = 0.625;

// Canvas and layout widths differ by a few hundredths of a pixel, so fitted
// text keeps a 1px margin.
const FIT_MARGIN = 1;

let measureContext = null;

// Chrome breaks at a <wbr> even under white-space: nowrap, so widths come
// from a canvas. Each <wbr> also splits the text into separately shaped runs,
// so the width is the sum of the segment widths.
function widthAtSize(element) {
  const style = getComputedStyle(element);
  const prefix = style.fontStyle + ' ' + style.fontWeight + ' ';
  const family = style.fontFamily;
  const segments = identifierSegments(element.textContent);

  measureContext = measureContext || document.createElement('canvas').getContext('2d');

  return (fontSize) => {
    measureContext.font = prefix + fontSize + 'px ' + family;

    return segments.reduce((width, segment) => width + measureContext.measureText(segment).width, 0);
  };
}

function contentWidth(cell) {
  const style = getComputedStyle(cell);

  return cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

// Shrinks each identifier to fit its cell on 1 line, down to the minimum size.
// An identifier that cannot fit keeps its size and wraps at its <wbr>s.
function fitIdentifiers(table) {
  const identifiers = [...table.querySelectorAll('[data-fit]')];
  const minFontSize = MIN_IDENTIFIER_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);

  identifiers.forEach((element) => {
    element.style.fontSize = '';
  });

  const sizes = identifiers.map((element) => {
    const availableWidth = contentWidth(element.closest('td')) - FIT_MARGIN;

    return fitFontSize(widthAtSize(element), availableWidth, parseFloat(getComputedStyle(element).fontSize), minFontSize);
  });

  identifiers.forEach((element, i) => {
    element.style.fontSize = sizes[i] === null ? '' : sizes[i] + 'px';
  });
}

// The title of a field's go-to button for each reason the field is off the
// canvas (see hiddenBy() in render.js).
const GO_TO_TITLES = {
  field: 'Show this field to go to it',
  fields: 'Turn on Fields to go to this field',
  type: 'Show its entity type to go to this field',
};

// The go-to and show-or-hide cells of a field's row.
function fieldActions(controller, r) {
  const visibilityTitle = r.hidden ? 'Show ' + r.field + ' on the canvas' : 'Hide ' + r.field + ' on the canvas';
  const goToTitle = r.hiddenBy ? GO_TO_TITLES[r.hiddenBy] : 'Go to ' + r.field + ' on the canvas';

  return html`<td class="field-table__action">
      <button
        type="button"
        class="table__action"
        data-field-go-to=${r.id}
        title=${goToTitle}
        aria-label=${goToTitle}
        aria-disabled=${r.hiddenBy ? 'true' : null}
        onClick=${() => {
          if (!r.hiddenBy) {
            controller.focusField(r.id);
          }
        }}
        dangerouslySetInnerHTML=${{ __html: icon('crosshair', 14) }}
      ></button>
    </td>
    <td class="field-table__action">
      <button
        type="button"
        class=${'table__action' + (r.hidden ? ' is-off' : '')}
        data-field-visibility=${r.id}
        title=${visibilityTitle}
        aria-label=${visibilityTitle}
        onClick=${() => controller.setFieldHidden(r.id, !r.hidden)}
        dangerouslySetInnerHTML=${{ __html: icon(r.hidden ? 'eye-off' : 'eye', 14) }}
      ></button>
    </td>`;
}

function hasSettings(r) {
  return Boolean(r.description || r.defaultValue || r.allowedValues.length || r.translatable !== null);
}

// The sortable columns of the Fields table, left to right, each keyed by its
// column in SORT_COLUMNS. `edits` names what an edit of the column's cells
// changes. A `settings` column shows in Edit mode, and in View mode while a
// field of the diagram has a setting.
const FIELD_COLUMNS = [
  { key: 'position', label: '#', name: 'position', title: '#: the place of the field in its entity' },
  { key: 'field', label: 'Field', name: 'field', title: 'Field: its label', edits: 'label' },
  { key: 'name', label: 'Machine name', name: 'machine name', title: 'Machine name: the name the field is stored under', edits: 'machine name' },
  { key: 'type', label: 'Type', name: 'type', title: 'Type: the field type', edits: 'type' },
  { key: 'cardinality', label: 'Card.', name: 'cardinality', title: 'Cardinality: how many values the field holds', edits: 'cardinality' },
  { key: 'required', label: 'Req', name: 'required', title: 'Required: whether the field must have a value' },
  { key: 'references', label: 'Refs', name: 'references', title: 'References: the entities a reference field points to', edits: 'references' },
  { key: 'usedIn', label: 'Used in', name: 'used in', title: 'Used in: how many bundles of the entity type have a field with this machine name' },
  { key: 'description', label: 'Help text', name: 'help text', title: 'Help text: the text editors see under the field', edits: 'help text', settings: true },
  { key: 'defaultValue', label: 'Default', name: 'default', title: 'Default: the value a new item starts with', edits: 'default value', settings: true },
  {
    key: 'allowedValues',
    label: 'Allowed values',
    name: 'allowed values',
    title: 'Allowed values: the values a list field offers',
    edits: 'allowed values',
    settings: true,
  },
  {
    key: 'translatable',
    label: 'Transl.',
    name: 'translatable',
    title: 'Translatable: whether the value can differ per language',
    edits: 'translatability',
    settings: true,
  },
];

function sortHeader(column, sort) {
  const next = nextSort(sort, column.key);
  const buttonTitle = isDefaultSort(next) ? 'Sort by position, as the diagram lists the fields' : 'Sort by ' + column.name + ', ' + next.direction;

  return html`<th class=${'field-table__col--' + column.key} title=${column.title} aria-sort=${sort.column === column.key ? sort.direction : null}>
    <button type="button" class="field-table__sort" data-sort=${column.key} title=${buttonTitle} onClick=${() => setTableSort(next)}>${column.label}</button>
  </th>`;
}

function translatableMark(translatable) {
  if (translatable === null) {
    return '';
  }

  return translatable
    ? html`<span title="Translatable: the value can differ per language">✓</span>`
    : html`<span title="Not translatable: the value is the same in every language">✕</span>`;
}

// Draws markup from config through the allowlist of parseRichText(), as
// elements, so no text reaches innerHTML.
function richText(text) {
  const draw = (nodes) =>
    nodes.map((node) => {
      if (typeof node === 'string') {
        return node;
      }

      if (node.tag === 'a') {
        return h('span', { class: 'rich-text__link', title: node.href || null }, draw(node.children));
      }

      return h(node.tag, null, node.tag === 'br' ? null : draw(node.children));
    });

  return draw(parseRichText(text));
}

function referenceLinks(controller, r) {
  return r.refs.map(
    (ref, i) =>
      html`${i ? ', ' : ''}<a
          class="table__reflink"
          href="#"
          title=${'Locate ' + ref.label + ' on the canvas'}
          onClick=${(e) => {
            e.preventDefault();
            controller.focusEntity(ref.id);
          }}
          >${ref.label}</a
        >`,
  );
}

// What each column's cell shows for a field.
const CELL_CONTENT = {
  position: (r) => r.position,
  field: (r) => r.field,
  name: (r) => html`<code data-fit>${wrappable(r.name)}</code>`,
  type: (r) => html`<span data-fit>${wrappable(r.type)}</span>`,
  cardinality: (r) => cardBadge(r),
  required: (r) => (r.required ? html`<span title="Required: the field must have a value">✓</span>` : ''),
  references: (r, controller) => referenceLinks(controller, r),
  usedIn: (r) => (r.usedIn.length ? html`<span title=${usedInTitle(r.usedIn)}>${r.usedIn.length}</span>` : ''),
  description: (r) => richText(r.description),
  defaultValue: (r) => r.defaultValue,
  allowedValues: (r) => allowedValueLabels(r.allowedValues).join(', '),
  translatable: (r) => translatableMark(r.translatable),
};

const CELL_CLASSES = {
  position: 'field-table__position',
  usedIn: 'field-table__used-in',
  description: 'field-table__text',
  defaultValue: 'field-table__text',
  allowedValues: 'field-table__text',
};

// The value, options and placeholder of each column's editor for a field.
const EDITOR_PROPS = {
  field: (r) => ({ value: r.field, placeholder: 'Label' }),
  name: (r) => ({ value: r.name, placeholder: 'field_name' }),
  type: (r) => ({ value: r.type, options: typeOptions(r.type).map((type) => [type, type]) }),
  cardinality: (r) => ({ value: String(r.cardinality), options: cardinalityOptions(r.cardinality) }),
  references: (r, entities) => ({
    value: r.refs.map((ref) => ref.id),
    options: entities.map((e) => [e.id, e.label]),
    multiple: true,
    placeholder: 'No references',
  }),
  description: (r) => ({ value: r.description, placeholder: 'Explain what goes in this field…' }),
  defaultValue: (r) => ({ value: r.defaultValue, placeholder: 'No default' }),
  allowedValues: (r) => ({ value: allowedValuesText(r.allowedValues), placeholder: 'draft|Draft\npublished|Published' }),
  translatable: (r) => ({ value: translatableChoice(r.translatable), options: TRANSLATABLE_OPTIONS, clearable: true, placeholder: 'Not set' }),
};

// The hint each kind of editor adds to its title.
const EDITOR_HINTS = {
  text: 'Enter saves and Escape cancels.',
  multiline: 'Enter saves, Shift+Enter starts a new line and Escape cancels.',
  select: 'Pick a value, or press Escape to cancel.',
  multiselect: 'Pick or unpick each entity, then press Escape to close.',
};

function applyReferences(r, picked) {
  const { added, removed } = referenceChanges(
    r.refs.map((ref) => ref.id),
    picked,
  );

  removed.forEach((target) => getBuilder().removeReference(r.id, target));
  added.forEach((target) => getBuilder().createReference(r.id, target));

  if (added.length || removed.length) {
    bump();
  }
}

/**
 * Writes a committed cell value to the field's node through the edits the
 * Inspector makes. Returns the field's id after the edit, which a rename
 * changes.
 */
function commitCell(controller, r, column, value) {
  const node = controller.cy.getElementById(r.id);

  if (node.empty()) {
    return r.id;
  }

  if (column === 'field') {
    if (value.trim() !== '') {
      setFieldLabel(node, value.trim());
    }
  } else if (column === 'name') {
    return getBuilder().renameField(r.id, value) || r.id;
  } else if (column === 'type') {
    setFieldType(node, value);
  } else if (column === 'cardinality') {
    setFieldCardinality(node, parseInt(value, 10));
  } else if (column === 'required') {
    setFieldRequired(node, value);
  } else if (column === 'references') {
    applyReferences(r, value);
  } else if (column === 'description') {
    setSetting(node, 'description', value, 'Edited the help text of');
  } else if (column === 'defaultValue') {
    setSetting(node, 'defaultValue', value, 'Changed the default value of');
  } else if (column === 'allowedValues') {
    setSetting(node, 'allowedValues', parseAllowedValues(value), 'Changed the allowed values of');
  } else if (column === 'translatable') {
    setFieldTranslatable(node, translatableValue(value));
  }

  return r.id;
}

// The Inspector's forms read the graph when they mount, so a form showing
// the edited field or its entity remounts.
function reviseInspectorFor(r) {
  const selected = getState().selected;

  if (selected && (selected.id === r.id || selected.id === r.entityId)) {
    revise();
  }
}

function cellKey(id, column) {
  return id + '|' + column;
}

function TableBody({ controller, filter, term, sort, editMode }) {
  const tableRef = useRef(null);
  const fitKey = useRef('');

  // Every store update re-renders the table, so it refits only when its
  // width, the root font size or its text changed.
  function refit() {
    const table = tableRef.current;
    const key = [table.clientWidth, getComputedStyle(document.documentElement).fontSize, table.tBodies[0].textContent].join('|');

    if (key === fitKey.current) {
      return;
    }

    fitKey.current = key;
    fitIdentifiers(table);
  }

  useLayoutEffect(refit);

  // Browser zoom and window resizes change the width without a store update.
  // The refit waits a frame because resizing the table inside the observer
  // callback triggers a ResizeObserver loop error.
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refit);
    });

    observer.observe(tableRef.current);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // The cell being edited, as { id, column }. The ref holds the same cell
  // between renders, so a rename can move it to the field's new id.
  const [editing, setEditing] = useState(null);
  const editingRef = useRef(null);
  const refocus = useRef(null);

  function edit(cell) {
    editingRef.current = cell;
    setEditing(cell);
  }

  // A key press that closes an editor returns the focus to its cell.
  function closeEditor(returnFocus) {
    refocus.current = returnFocus ? editingRef.current : null;
    edit(null);
  }

  function commit(r, column, value) {
    const id = commitCell(controller, r, column, value);

    if (editingRef.current && editingRef.current.id === r.id) {
      editingRef.current = { ...editingRef.current, id };
    }

    reviseInspectorFor(r);
  }

  // A mode switch can hide the settings column an editor sits in.
  useEffect(() => edit(null), [editMode]);

  useLayoutEffect(() => {
    const cell = refocus.current;

    if (!cell) {
      return;
    }

    refocus.current = null;

    const target = tableRef.current.querySelector('[data-edit-cell="' + CSS.escape(cellKey(cell.id, cell.column)) + '"]');

    if (target) {
      target.focus();
    }
  });

  // Numbered before the filter, so each field keeps its place in its entity.
  const allRecords = numberFields(controller.records());
  const entities = controller.entities();
  // Taken from every field, so the columns stay put while the list is
  // filtered. Edit mode shows them so a setting can be added.
  const showSettings = editMode || allRecords.some(hasSettings);
  const columns = FIELD_COLUMNS.filter((column) => showSettings || !column.settings);
  const columnCount = columns.length + 2;
  const filtered = allRecords.filter((r) => {
    if (filter && filter !== '__all__' && r.entityId !== filter) {
      return false;
    }
    if (term) {
      const hay = [r.entity, r.field, r.name, r.type, ...r.refs.map((x) => x.label), richTextPlain(parseRichText(r.description))].join(' ').toLowerCase();
      return hay.indexOf(term.toLowerCase()) !== -1;
    }
    return true;
  });
  const records = sortFields(filtered, sort);

  function editorCell(r, column, kind) {
    const props = EDITOR_PROPS[column.key](r, entities);
    const title = 'The ' + column.edits + ' of ' + (r.field || r.name) + '. ' + EDITOR_HINTS[kind];

    if (kind === 'text' || kind === 'multiline') {
      return html`<${TextEditor}
        ...${props}
        multiline=${kind === 'multiline'}
        title=${title}
        onCommit=${(value) => commit(r, column.key, value)}
        onClose=${closeEditor}
      />`;
    }

    return html`<${SelectEditor}
      ...${props}
      title=${title}
      onShow=${alignWideList}
      onChange=${(value) => commit(r, column.key, value)}
      onClose=${closeEditor}
    />`;
  }

  // An editable cell is a button that opens its editor, except Required,
  // which is a checkbox, and References, whose links stay beside the button.
  function cell(r, column) {
    const content = CELL_CONTENT[column.key](r, controller);
    const className = CELL_CLASSES[column.key] || null;
    const kind = cellEditor(r, column.key);
    const key = cellKey(r.id, column.key);
    const name = r.field || r.name;

    if (!kind) {
      return html`<td class=${className} data-column=${column.key}>${content}</td>`;
    }

    if (kind === 'toggle') {
      const toggleTitle = r.required ? 'Make ' + name + ' optional' : 'Make ' + name + ' required';

      return html`<td data-column=${column.key}>
        <input
          type="checkbox"
          class="field-table__check"
          data-edit-cell=${key}
          title=${toggleTitle}
          checked=${r.required}
          onChange=${(e) => commit(r, column.key, e.target.checked)}
        />
      </td>`;
    }

    if (editing && editing.id === r.id && editing.column === column.key) {
      return html`<td class=${(className ? className + ' ' : '') + 'is-editing'} data-column=${column.key}>${editorCell(r, column, kind)}</td>`;
    }

    const editTitle = 'Edit the ' + column.edits + ' of ' + name;
    const open = () => edit({ id: r.id, column: column.key });

    if (column.key === 'references') {
      return html`<td data-column=${column.key}>
        ${content}
        <button
          type="button"
          class="table__action field-table__edit-refs"
          data-edit-cell=${key}
          title=${editTitle}
          aria-label=${editTitle}
          onClick=${open}
          dangerouslySetInnerHTML=${{ __html: icon('pencil', 12) }}
        ></button>
      </td>`;
    }

    return html`<td class=${className} data-column=${column.key}>
      <button type="button" class="field-table__edit" data-edit-cell=${key} title=${editTitle} onClick=${open}>${content}</button>
    </td>`;
  }

  const rows = [];
  let current = null;
  records.forEach((r) => {
    if (r.entityId !== current) {
      current = r.entityId;
      rows.push(
        html`<tr class="is-group" key=${'group|' + r.entityId}>
          <td colspan=${columnCount}>
            ${r.entity} · ${controller.typeLabel(r.entityType)}
            ${r.entityDescription ? html`<span class="field-table__description">${richText(r.entityDescription)}</span>` : null}
          </td>
        </tr>`,
      );
    }
    rows.push(
      html`<tr class=${r.hidden ? 'is-hidden-field' : null} key=${r.id}>
        ${fieldActions(controller, r)} ${columns.map((column) => cell(r, column))}
      </tr>`,
    );
  });

  return html` <div class="panel__toolbar">
      <sl-select
        id="table-entity"
        class="panel__select"
        size="small"
        title="List the fields of every entity or of 1 entity"
        value=${filter}
        onsl-change=${(e) => setTableFilter(e.target.value)}
      >
        <sl-option value="__all__">All entities</sl-option>
        ${controller.entities().map((e) => html`<sl-option value=${e.id}>${e.label}</sl-option>`)}
      </sl-select>
      <sl-input
        id="table-search"
        class="panel__search"
        size="small"
        type="search"
        placeholder="Filter fields…"
        title="Filter the fields by entity, label, machine name, type, reference or help text"
        clearable
        value=${term}
        onsl-input=${(e) => setTableSearch(e.target.value)}
      ></sl-input>
    </div>
    <table id="field-table" class=${'field-table' + (showSettings ? ' has-settings' : '')} ref=${tableRef}>
      <thead>
        <tr>
          <th class="field-table__action" title="Go to each field on the canvas">${rawIcon('crosshair', 14)}<span class="visually-hidden">Go to</span></th>
          <th class="field-table__action" title="Show or hide each field on the canvas">${rawIcon('eye', 14)}<span class="visually-hidden">Show</span></th>
          ${columns.map((column) => sortHeader(column, sort))}
        </tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
            : html`<tr>
                <td colspan=${columnCount}>No fields match.</td>
              </tr>`
        }
      </tbody>
    </table>`;
}

// A list wider than its select ends under the select's right edge when
// starting under the left edge would cross the window's edge.
function alignWideList(evt) {
  const select = evt.currentTarget;

  if (evt.target !== select) {
    return;
  }

  const list = select.shadowRoot.querySelector('[part~="listbox"]');
  const width = parseFloat(getComputedStyle(list).width);

  select.classList.toggle('is-list-end', select.getBoundingClientRect().left + width > document.documentElement.clientWidth);
}

// The select draws the picked symbol in place of its name, so it takes no
// more room than the color picker beside it.
function symbolSelect(controller, type, value, color, onChange) {
  const options = controller.symbolOptions();
  const picked = options.find((o) => o.key === value);

  return html`<sl-select
    class="type-row__symbol"
    size="small"
    hoist
    data-symbol=${type || ''}
    value=${value}
    title=${'Symbol: ' + (picked ? picked.label : value)}
    onsl-show=${alignWideList}
    onsl-change=${onChange}
  >
    <span slot="prefix" class="type-row__preview" dangerouslySetInnerHTML=${{ __html: controller.symbolSvg(value, color, 20) }}></span>
    ${options.map((o) => html`<sl-option value=${o.key}><span slot="prefix" class="type-row__preview" dangerouslySetInnerHTML=${{ __html: controller.symbolSvg(o.key, '#c7d2df', 20) }}></span>${o.label}</sl-option>`)}
  </sl-select>`;
}

const DEFAULT_SWITCHES = [
  ['fields', 'Fields', 'Show the fields of each entity'],
  ['proxies', 'Proxies', 'Draw each reference as a faded copy of its target beside the field'],
  ['machineNames', 'Machine names', 'Show each machine name under its node'],
];

// The settings a new diagram opens with, 1 per line with its label on the
// left.
function DiagramDefaults({ controller }) {
  const defaults = controller.diagramDefaults();

  return html`<h3 class="settings-section__title">New diagrams</h3>
    <div class="diagram-defaults">
      <sl-select
        class="default-row"
        size="small"
        hoist
        label="Layout"
        data-default="layout"
        title="The layout a new diagram opens with"
        value=${defaults.layout}
        onsl-change=${(e) => controller.setDiagramDefault('layout', e.target.value)}
      >
        ${controller.layoutOptions().map((o) => html`<sl-option value=${o.value}>${o.name}</sl-option>`)}
      </sl-select>
      <sl-select
        class="default-row"
        size="small"
        hoist
        label="Mode"
        data-default="mode"
        title="The mode a new diagram opens in"
        value=${defaults.mode}
        onsl-change=${(e) => controller.setDiagramDefault('mode', e.target.value)}
      >
        ${MODES.map((mode) => html`<sl-option value=${mode.id}>${mode.label}</sl-option>`)}
      </sl-select>
      ${DEFAULT_SWITCHES.map(
        ([key, label, title]) =>
          html`<sl-switch
            class="default-row default-row--switch"
            size="small"
            data-default=${key}
            title=${title + ' in a new diagram'}
            checked=${defaults[key]}
            onsl-change=${(e) => controller.setDiagramDefault(key, e.target.checked)}
            >${label}</sl-switch
          >`,
      )}
    </div>`;
}

// Below this width, in rem, each entity type's label leaves too little room
// beside its controls.
const NARROW_SETTINGS_REM = 17;

function SettingsBody({ controller }) {
  const [nt, setNt] = useState({ name: '', label: '', color: '#cfe3f7', symbol: 'rounded' });
  const [narrow, setNarrow] = useState(false);
  const bodyRef = useRef(null);

  // A container query can't switch the layout: an inline-size container is
  // the containing block of the hoisted popups inside it. The class changes
  // the body's height, so it waits a frame to avoid a ResizeObserver loop.
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setNarrow(entry.contentRect.width < NARROW_SETTINGS_REM * rem));
    });

    observer.observe(bodyRef.current);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  function add() {
    if (controller.addCustomType(nt.name, nt.label, nt.color, nt.symbol)) {
      setNt({ name: '', label: '', color: '#cfe3f7', symbol: 'rounded' });
    }
  }

  // The removed row takes its focused button with it, so the focus moves to
  // the new type's name instead of leaving the panel.
  function remove(type) {
    controller.removeCustomType(type);
    bodyRef.current.querySelector('[data-new-type]').focus();
  }

  return html` <div class=${'settings-body' + (narrow ? ' is-narrow' : '')} ref=${bodyRef}>
    <h3 class="settings-section__title">Entity types</h3>
    <div id="type-settings" class="type-settings">
      ${controller.allTypes().map(
        (t) =>
          html` <div class="type-row" data-type-row=${t}>
            <span class="type-row__label" title=${controller.typeLabel(t)}>${controller.typeLabel(t)}</span>
            <sl-color-picker
              data-color=${t}
              value=${controller.colorFor(t)}
              format="hex"
              size="small"
              no-format-toggle
              hoist
              title=${'Colour of ' + controller.typeLabel(t)}
              onsl-input=${(e) => controller.applyColor(t, e.target.value)}
            ></sl-color-picker>
            ${symbolSelect(controller, t, controller.symbolFor(t), controller.colorFor(t), (e) => controller.applySymbol(t, e.target.value))}
            ${
              controller.isCustomType(t)
                ? html`<sl-button
                    class="type-row__action"
                    size="small"
                    data-remove-type=${t}
                    title="Remove this custom type"
                    aria-label=${'Remove ' + controller.typeLabel(t)}
                    onClick=${() => remove(t)}
                    >${rawIcon('minus', 14)}</sl-button
                  >`
                : null
            }
          </div>`,
      )}
    </div>
    <div class="type-row type-add">
      <div class="type-add__names">
        <input
          class="type-add__input"
          data-new-type
          placeholder="Name"
          title="Machine name of the new type, such as event_ticket"
          aria-label="Machine name of the new type"
          value=${nt.name}
          onInput=${(e) => setNt((p) => ({ ...p, name: e.target.value }))}
        />
        <input
          class="type-add__input"
          placeholder="Label"
          title="Label of the new type, such as Event ticket"
          aria-label="Label of the new type"
          value=${nt.label}
          onInput=${(e) => setNt((p) => ({ ...p, label: e.target.value }))}
        />
      </div>
      <sl-color-picker
        value=${nt.color}
        format="hex"
        size="small"
        no-format-toggle
        hoist
        title="Colour of the new type"
        onsl-input=${(e) => setNt((p) => ({ ...p, color: e.target.value }))}
      ></sl-color-picker>
      ${symbolSelect(controller, null, nt.symbol, nt.color, (e) => setNt((p) => ({ ...p, symbol: e.target.value })))}
      <sl-button
        class="type-row__action"
        size="small"
        variant="primary"
        data-add-type
        title="Add a custom entity type"
        aria-label="Add a custom entity type"
        onClick=${add}
        >${rawIcon('plus', 14)}</sl-button
      >
    </div>
    <${DiagramDefaults} controller=${controller} />
    <${FrameSettings} controller=${controller} />
    <${HoverSettings} controller=${controller} />
    <${MarkdownSettings} controller=${controller} />
    <${CheckSettings} controller=${controller} />
    <sl-button
      id="settings-reset"
      class="settings-reset"
      size="small"
      title="Restore the default colours, symbols, new diagram settings, mode frame, hover highlight, Markdown export and checks"
      onClick=${() => controller.resetSettings()}
      >${rawIcon('rotate-ccw')}Reset to defaults</sl-button
    >
    <p class="panel__note">Saved to this browser and reused across diagrams.</p>
  </div>`;
}

const FRAME_MODES = [
  ['view', 'View mode'],
  ['edit', 'Edit mode'],
];

function FrameSettings({ controller }) {
  const frame = controller.frameSettings();

  return html`<h3 class="settings-section__title settings-section__title--spaced">Mode frame</h3>
    <sl-switch
      id="frame-toggle"
      class="frame-toggle"
      size="small"
      checked=${frame.enabled}
      title="Draw a frame inside the canvas edge in the colour of the mode"
      onsl-change=${(e) => controller.setFrame({ enabled: e.target.checked })}
      >Frame the canvas</sl-switch
    >
    <div class="frame-settings">
      ${FRAME_MODES.map(
        ([mode, label]) =>
          html`<div class="frame-row" data-frame-row=${mode}>
            <span class="type-row__label">${label}</span>
            <sl-color-picker
              data-frame-color=${mode}
              value=${frame[mode]}
              format="hex"
              size="small"
              opacity
              no-format-toggle
              hoist
              disabled=${!frame.enabled}
              title=${'Frame colour in ' + label}
              onsl-input=${(e) => controller.setFrame({ [mode]: e.target.value })}
            ></sl-color-picker>
          </div>`,
      )}
    </div>`;
}

function HoverSettings({ controller }) {
  const hover = controller.hoverSettings();

  return html`<h3 class="settings-section__title settings-section__title--spaced">Hover highlight</h3>
    <sl-switch
      id="hover-toggle"
      class="hover-toggle"
      size="small"
      checked=${hover.enabled}
      title="Highlight the fields, references and connected entities of the node under the pointer, and fade the rest"
      onsl-change=${(e) => controller.setHover({ enabled: e.target.checked })}
      >Highlight connections</sl-switch
    >`;
}

function MarkdownSettings({ controller }) {
  const markdown = controller.markdownSettings();

  return html`<h3 class="settings-section__title settings-section__title--spaced">Markdown export</h3>
    <sl-select
      class="default-row"
      size="small"
      hoist
      label="Diagram"
      data-markdown="diagram"
      title="When a Markdown export starts with a Mermaid diagram of the model"
      value=${markdown.diagram}
      onsl-change=${(e) => controller.setMarkdown({ diagram: e.target.value })}
    >
      ${MARKDOWN_DIAGRAM_OPTIONS.map((option) => html`<sl-option value=${option.id}>${option.label}</sl-option>`)}
    </sl-select>`;
}

function CheckSettings({ controller }) {
  const { fieldLimit } = controller.checkSettings();

  // A value that is not a field limit is dropped, and the input shows the
  // stored limit again.
  function change(evt) {
    const limit = Number(evt.target.value);

    if (isFieldLimit(limit)) {
      controller.setChecks({ fieldLimit: limit });
    }

    evt.target.value = String(controller.checkSettings().fieldLimit);
  }

  return html`<h3 class="settings-section__title settings-section__title--spaced">Checks</h3>
    <sl-input
      class="default-row"
      type="number"
      size="small"
      min="1"
      max=${MAX_FIELD_LIMIT}
      step="1"
      label="Field limit"
      data-check-setting="fieldLimit"
      title=${'Warn about a bundle with more fields of its own than this, from 1 to ' + MAX_FIELD_LIMIT}
      value=${String(fieldLimit)}
      onsl-change=${change}
    ></sl-input>`;
}

/* Boot -------------------------------------------------------------------- */

// The badge counts every problem and takes the colour of the worst.
function syncChecksBadge() {
  const badge = document.querySelector('#checks-toggle .checks-badge');

  if (!badge) {
    return;
  }

  const problems = currentProblems();
  const errors = problems.filter((problem) => problem.level === LEVEL_ERROR).length;

  badge.hidden = problems.length === 0;
  badge.textContent = String(problems.length);
  badge.dataset.level = errors > 0 ? LEVEL_ERROR : LEVEL_WARNING;
  badge.title = countText(errors, LEVEL_ERROR) + ' and ' + countText(problems.length - errors, LEVEL_WARNING);
}

function syncToggles() {
  const s = getState();

  PANEL_TOGGLES.forEach(([btn, id]) => {
    const el = $(btn);

    if (el) {
      el.classList.toggle('is-active', s.panels[id].open);
    }
  });
}

export function initUI() {
  titleShoelaceHosts(options);
  render(html`<${StageApp} />`, $('stage-root'));

  PANEL_TOGGLES.forEach(([btn, id]) => {
    const el = $(btn);

    if (el) {
      el.addEventListener('click', () => togglePanel(id));
    }
  });

  subscribe(syncToggles);
  subscribe(syncChecksBadge);
  syncToggles();
  syncChecksBadge();
}
