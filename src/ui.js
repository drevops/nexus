/**
 * Preact UI layer: toolbar-driven panels rendered over the Cytoscape canvas.
 *
 * The whole stage (side docks + canvas host + floating panels) is 1 Preact
 * tree driven by the shared store. Panels float and are dragged by their
 * header.
 *
 * Dropping a panel near an edge, or clicking its pin, docks it into a side
 * rail. Any number of docked panels stack, each scrolling independently, and
 * the rail can be resized horizontally.
 *
 * The canvas host is a no-update component so the Cytoscape instance and the
 * imperative overlays it owns are never re-rendered.
 */

import { h, render, Component } from 'preact';
import { useState, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import htmBase from 'htm';
import { icon } from './icons.js';
import { cardinalityLabel, identifierSegments, fitFontSize } from './model.js';
import { InspectorBody } from './inspector.js';
import { goToVersion, historyState } from './undo.js';
import {
  getState,
  subscribe,
  getController,
  togglePanel,
  closePanel,
  focusPanel,
  movePanel,
  pinPanel,
  unpinPanel,
  setDockWidth,
  setPanelHeight,
  setTableFilter,
  openTableFor,
} from './store.js';
import { $ } from './dom.js';

const html = htmBase.bind(h);

const PANEL_ORDER = ['entities', 'table', 'settings', 'legend', 'history', 'inspector'];
const TITLES = { entities: 'Entities', table: 'Fields', settings: 'Settings', legend: 'Legend', history: 'History', inspector: 'Inspector' };
const WIDE = { table: true };
const PANEL_TOGGLES = [
  ['entities-toggle', 'entities'],
  ['table-toggle', 'table'],
  ['legend-toggle', 'legend'],
  ['history-toggle', 'history'],
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
];

function useStore() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((v) => v + 1)), []);
  return getState();
}

function rawIcon(name, size) {
  return html`<span dangerouslySetInnerHTML=${{ __html: icon(name, size) }}></span>`;
}

function floatStyle(panel) {
  const p = panel.pos;
  return {
    left: p.left != null ? p.left + 'px' : '',
    top: p.top != null ? p.top + 'px' : '',
    right: p.right != null ? p.right + 'px' : '',
    bottom: p.bottom != null ? p.bottom + 'px' : '',
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

function highlightDrop(side) {
  const stage = $('stage-root');
  stage.classList.toggle('drop-left', side === 'left');
  stage.classList.toggle('drop-right', side === 'right');
}

function startDrag(id, evt, el) {
  if (evt.target.closest('button, input, select, a, code')) {
    return;
  }
  const area = el.closest('.stage__canvas').getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  if (getState().panels[id].dock) {
    movePanel(id, rect.left - area.left, rect.top - area.top);
  }
  const offsetX = evt.clientX - rect.left;
  const offsetY = evt.clientY - rect.top;

  function move(e) {
    movePanel(id, Math.max(0, e.clientX - area.left - offsetX), Math.max(0, e.clientY - area.top - offsetY));
    highlightDrop(edgeSide(e.clientX));
  }

  function up(e) {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    highlightDrop(null);
    const side = edgeSide(e.clientX);
    if (side) {
      pinPanel(id, side);
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

function startVResize(id, evt, el) {
  const startY = evt.clientY;
  const startH = el.getBoundingClientRect().height;

  // Fixing a height makes this panel stop filling; the other docked panels then
  // share the remaining sidebar space.
  function move(e) {
    setPanelHeight(id, startH + (e.clientY - startY));
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

/* Shell ------------------------------------------------------------------- */

function Panel({ id, panel, header, children }) {
  const ref = useRef(null);
  const docked = !!panel.dock;
  const cls = 'panel' + (WIDE[id] ? ' panel--wide' : '') + (id === 'legend' ? ' panel--legend' : '') + (docked ? ' is-docked' : '');
  const style = docked
    ? panel.height
      ? { zIndex: panel.z, flex: '0 0 auto', height: panel.height + 'px' }
      : { zIndex: panel.z, flex: '1 1 0', minHeight: '90px' }
    : floatStyle(panel);

  return html` <section id=${id} ref=${ref} class=${cls} style=${style} onMouseDown=${() => focusPanel(id)}>
    <div class="panel__head" onMouseDown=${(e) => startDrag(id, e, ref.current)} title="Drag to move, drop at an edge to dock">
      <span class="panel__title">${TITLES[id]}</span>
      ${header}
      <span class="panel__spacer"></span>
      <button
        class="panel__pin"
        type="button"
        title=${docked ? 'Unpin from side' : 'Pin to a side'}
        aria-label="Pin"
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
    ${docked ? html`<div class="panel__vresize" title="Drag to resize height" onMouseDown=${(e) => startVResize(id, e, ref.current)}></div>` : null}
  </section>`;
}

function panelFor(id, s) {
  return html`<${Panel} key=${id} id=${id} panel=${s.panels[id]}>${body(id, s)}<//>`;
}

function DockRail({ side, s }) {
  const ids = PANEL_ORDER.filter((id) => s.panels[id].open && s.panels[id].dock === side);
  if (!ids.length) {
    return null;
  }
  return html` <div class="dock" id=${'dock-' + side} data-side=${side} style=${{ width: s.dockWidth[side] + 'px' }}>
    <div class="dock__scroll">${ids.map((id) => panelFor(id, s))}</div>
    <div class=${'dock__resize dock__resize--' + side} onMouseDown=${(e) => startResize(side, e)}></div>
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
      <div id="captions" class="captions" aria-hidden="true"></div>
      <div id="notes" class="notes"></div>
      <div id="handles" class="handles" hidden></div>
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
    return html`<${TableBody} controller=${controller} filter=${s.tableFilter} />`;
  }
  return html`<${SettingsBody} controller=${controller} />`;
}

function EntitiesBody({ controller }) {
  return html` <div id="type-filters" class="filters">
      ${controller.presentTypes().map(
        (t) =>
          html` <label class="filters__item">
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

// Base and computed fields carry a category badge; everything else shows its
// cardinality (1, 1..N, 1..n) coloured by single vs multi.
function cardBadge(r) {
  if (r.kind === 'system' || r.kind === 'calculated') {
    return html`<span class=${'badge badge--' + r.kind}>${r.kind}</span>`;
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

function TableBody({ controller, filter }) {
  const [term, setTerm] = useState('');
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

  const records = controller.records().filter((r) => {
    if (filter && filter !== '__all__' && r.entityId !== filter) {
      return false;
    }
    if (term) {
      const hay = (r.entity + ' ' + r.field + ' ' + r.name + ' ' + r.type + ' ' + r.refs.map((x) => x.label).join(' ')).toLowerCase();
      return hay.indexOf(term.toLowerCase()) !== -1;
    }
    return true;
  });

  const rows = [];
  let current = null;
  records.forEach((r) => {
    if (r.entityId !== current) {
      current = r.entityId;
      rows.push(
        html`<tr class="is-group">
          <td colspan="5">${r.entity} · ${controller.typeLabel(r.entityType)}</td>
        </tr>`,
      );
    }
    rows.push(
      html`<tr>
        <td>${r.field}<br /><code data-fit>${wrappable(r.name)}</code></td>
        <td data-fit>${wrappable(r.type)}</td>
        <td>${cardBadge(r)}</td>
        <td>${r.required ? '✓' : ''}</td>
        <td>
          ${r.refs.map(
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
          )}
        </td>
      </tr>`,
    );
  });

  return html` <div class="panel__toolbar">
      <sl-select id="table-entity" class="panel__select" size="small" value=${filter} onsl-change=${(e) => setTableFilter(e.target.value)}>
        <sl-option value="__all__">All entities</sl-option>
        ${controller.entities().map((e) => html`<sl-option value=${e.id}>${e.label}</sl-option>`)}
      </sl-select>
      <sl-input
        id="table-search"
        class="panel__search"
        size="small"
        type="search"
        placeholder="Filter fields…"
        clearable
        value=${term}
        onsl-input=${(e) => setTerm(e.target.value)}
      ></sl-input>
    </div>
    <div class="table-wrap">
      <table id="field-table" class="field-table" ref=${tableRef}>
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Card.</th>
            <th>Req</th>
            <th>References</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows
              : html`<tr>
                  <td colspan="5">No fields match.</td>
                </tr>`
          }
        </tbody>
      </table>
    </div>`;
}

function symbolSelect(controller, type, value, onChange) {
  return html`<sl-select class="type-row__symbol" size="small" hoist data-symbol=${type || ''} value=${value} onsl-change=${onChange}>
    ${controller.symbolOptions().map((o) => html`<sl-option value=${o.key}><span slot="prefix" class="type-row__preview" dangerouslySetInnerHTML=${{ __html: controller.symbolSvg(o.key, '#c7d2df', 20) }}></span>${o.label}</sl-option>`)}
  </sl-select>`;
}

function SettingsBody({ controller }) {
  const [nt, setNt] = useState({ name: '', label: '', color: '#cfe3f7', symbol: 'rounded' });

  function add() {
    if (controller.addCustomType(nt.name, nt.label, nt.color, nt.symbol)) {
      setNt({ name: '', label: '', color: '#cfe3f7', symbol: 'rounded' });
    }
  }

  return html` <div class="settings-body">
    <h3 class="settings-section__title">Entity types</h3>
    <div id="type-settings" class="type-settings">
      ${controller.allTypes().map(
        (t) =>
          html` <div class="type-row" data-type-row=${t}>
            <span class="type-row__label">${controller.typeLabel(t)}</span>
            <div class="type-row__controls">
              <sl-color-picker
                data-color=${t}
                value=${controller.colorFor(t)}
                format="hex"
                size="small"
                no-format-toggle
                hoist
                onsl-input=${(e) => controller.applyColor(t, e.target.value)}
              ></sl-color-picker>
              ${symbolSelect(controller, t, controller.symbolFor(t), (e) => controller.applySymbol(t, e.target.value))}
              ${controller.isCustomType(t) ? html`<button class="type-row__remove" type="button" title="Remove this custom type" onClick=${() => controller.removeCustomType(t)}>${rawIcon('x', 14)}</button>` : null}
            </div>
          </div>`,
      )}
    </div>
    <div class="type-add">
      <div class="type-add__names">
        <input
          class="type-add__input"
          data-new-type
          placeholder="machine_name"
          value=${nt.name}
          onInput=${(e) => setNt((p) => ({ ...p, name: e.target.value }))}
        />
        <input class="type-add__input" placeholder="Label" value=${nt.label} onInput=${(e) => setNt((p) => ({ ...p, label: e.target.value }))} />
      </div>
      <div class="type-add__controls">
        <sl-color-picker
          value=${nt.color}
          format="hex"
          size="small"
          no-format-toggle
          hoist
          onsl-input=${(e) => setNt((p) => ({ ...p, color: e.target.value }))}
        ></sl-color-picker>
        ${symbolSelect(controller, null, nt.symbol, (e) => setNt((p) => ({ ...p, symbol: e.target.value })))}
        <sl-button size="small" variant="primary" data-add-type title="Add a custom entity type" onClick=${add}>${rawIcon('plus')}Add</sl-button>
      </div>
    </div>
    <sl-button id="settings-reset" class="settings-reset" size="small" title="Restore the default colours and symbols" onClick=${() => controller.resetColors()}
      >${rawIcon('rotate-ccw')}Reset to defaults</sl-button
    >
    <p class="panel__note">Saved to this browser and reused across diagrams.</p>
  </div>`;
}

/* Boot -------------------------------------------------------------------- */

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
  render(html`<${StageApp} />`, $('stage-root'));

  PANEL_TOGGLES.forEach(([btn, id]) => {
    const el = $(btn);

    if (el) {
      el.addEventListener('click', () => togglePanel(id));
    }
  });

  subscribe(syncToggles);
  syncToggles();
}
