/**
 * Preact UI layer: toolbar-driven panels rendered over the Cytoscape canvas.
 *
 * The whole stage (side docks + canvas host + floating panels) is one Preact
 * tree driven by the shared store. Panels float and are dragged by their
 * header; dropping near an edge (or clicking pin) docks them into a side rail,
 * where any number stack, each scrolling independently, and the rail can be
 * resized horizontally. The canvas host is a no-update component so the
 * Cytoscape instance and the imperative overlays it owns are never re-rendered.
 */

import { h, render, Component } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import htmBase from 'htm';
import { icon } from './icons.js';
import { InspectorBody } from './inspector.js';
import {
  getState, subscribe, getController, togglePanel, closePanel, focusPanel,
  movePanel, pinPanel, unpinPanel, setDockWidth, setPanelHeight, setTableFilter, openTableFor,
} from './store.js';

const html = htmBase.bind(h);

const PANEL_ORDER = ['entities', 'table', 'settings', 'legend', 'inspector'];
const TITLES = { entities: 'Entities', table: 'Fields', settings: 'Settings', legend: 'Legend', inspector: 'Inspector' };
const WIDE = { table: true };

const SWATCHES = {
  entity: '<svg width="34" height="24"><rect x="2" y="4" width="30" height="16" rx="3" fill="#9fc5e8" stroke="#5b6470"/></svg>',
  single: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#555c66"/></svg>',
  multi: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#3d444d"/><ellipse cx="17" cy="12" rx="11" ry="6.5" fill="none" stroke="#3d444d"/></svg>',
  system: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#98a2b3" stroke-dasharray="3 2"/></svg>',
  calculated: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#ffd966" stroke="#c9a227"/></svg>',
  event: '<svg width="34" height="24"><polygon points="17,3 31,12 17,21 3,12" fill="#fff" stroke="#333b45"/></svg>',
  api: '<svg width="34" height="24"><polygon points="10,3 24,3 32,12 24,21 10,21 2,12" fill="#fff" stroke="#333b45"/></svg>',
  callback: '<svg width="34" height="24"><rect x="2" y="4" width="30" height="16" rx="2" fill="#fff" stroke="#333b45"/><line x1="2" y1="13" x2="32" y2="13" stroke="#333b45"/></svg>',
};

const LEGEND_ITEMS = [
  ['entity', 'Entity (name / type)'], ['single', 'Single-value field'], ['multi', 'Multi-value field'],
  ['system', 'System field'], ['calculated', 'Calculated field'], ['event', 'Event'], ['api', 'API'], ['callback', 'Callback / method'],
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
  const stage = document.getElementById('stage-root').getBoundingClientRect();
  if (clientX <= stage.left + 90) {
    return 'left';
  }
  if (clientX >= stage.right - 90) {
    return 'right';
  }
  return null;
}

function highlightDrop(side) {
  const stage = document.getElementById('stage-root');
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
  pinPanel(id, (rect.left + rect.width / 2) < (area.left + area.width / 2) ? 'left' : 'right');
}

function startResize(side, evt) {
  const dock = document.getElementById('dock-' + side);
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
  const style = docked ? { zIndex: panel.z, height: (panel.height || 260) + 'px' } : floatStyle(panel);

  return html`
    <section id=${id} ref=${ref} class=${cls} style=${style} onMouseDown=${() => focusPanel(id)}>
      <div class="panel__head" onMouseDown=${(e) => startDrag(id, e, ref.current)} title="Drag to move, drop at an edge to dock">
        <span class="panel__title">${TITLES[id]}</span>
        ${header}
        <span class="panel__spacer"></span>
        <button class="panel__pin" type="button" title=${docked ? 'Unpin from side' : 'Pin to a side'} aria-label="Pin" onClick=${() => pinFromButton(id, ref.current)} dangerouslySetInnerHTML=${{ __html: icon('pin') }}></button>
        <button class="panel__close" type="button" title="Close panel" aria-label="Close" onClick=${() => closePanel(id)} dangerouslySetInnerHTML=${{ __html: icon('x') }}></button>
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
  return html`
    <div class="dock" id=${'dock-' + side} data-side=${side} style=${{ width: s.dockWidth[side] + 'px' }}>
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
    return html`
      <div id="cy" class="cy"></div>
      <div id="captions" class="captions" aria-hidden="true"></div>
      <div id="handles" class="handles" hidden></div>
      <div id="tooltip" class="tooltip" role="tooltip" hidden></div>`;
  }
}

function StageApp() {
  const s = useStore();
  const sig = PANEL_ORDER.map((id) => s.panels[id].dock || '').join() + ':' + s.dockWidth.left + ':' + s.dockWidth.right;
  useEffect(() => {
    const c = getController();
    if (c && c.cy) {
      c.cy.resize();
    }
  }, [sig]);

  return html`
    <${DockRail} side="left" s=${s} />
    <div class="stage__canvas">
      <${CanvasHost} />
      <${FloatLayer} s=${s} />
    </div>
    <${DockRail} side="right" s=${s} />`;
}

/* Bodies ------------------------------------------------------------------ */

function body(id, s) {
  const ctx = getController();
  if (id === 'inspector') {
    return html`<${InspectorBody} selected=${s.selected} />`;
  }
  if (!ctx) {
    return null;
  }
  if (id === 'legend') {
    return html`<div class="legend-body">${LEGEND_ITEMS.map((item) => html`
      <div class="legend__item"><span class="legend__swatch" dangerouslySetInnerHTML=${{ __html: SWATCHES[item[0]] }}></span><span class="legend__label">${item[1]}</span></div>`)}</div>`;
  }
  if (id === 'entities') {
    return html`<${EntitiesBody} ctx=${ctx} />`;
  }
  if (id === 'table') {
    return html`<${TableBody} ctx=${ctx} filter=${s.tableFilter} />`;
  }
  return html`<${SettingsBody} ctx=${ctx} />`;
}

function EntitiesBody({ ctx }) {
  return html`
    <div id="type-filters" class="filters">
      ${ctx.presentTypes().map((t) => html`
        <label class="filters__item">
          <input type="checkbox" checked=${t.visible} onChange=${(e) => ctx.setTypeVisible(t.type, e.target.checked)} />
          <span class="filters__swatch" style=${{ background: t.color }}></span>${t.label}
        </label>`)}
    </div>
    <div id="entity-list" class="entity-list">
      ${ctx.entities().map((e) => html`
        <div class="entity-row" data-type=${e.entityType}>
          <button class="entity-row__name" title="Focus this entity on the canvas" onClick=${() => ctx.focusEntity(e.id)}><b>${e.label}</b> <span class="entity-row__type">${ctx.typeLabel(e.entityType)}</span></button>
          <span class="entity-row__count">${e.fieldCount}</span>
          <button class="entity-row__fields" title="Show this entity's fields in the table" onClick=${() => openTableFor(e.id)}>fields</button>
        </div>`)}
    </div>`;
}

function TableBody({ ctx, filter }) {
  const [term, setTerm] = useState('');
  const records = ctx.records().filter((r) => {
    if (filter && filter !== '__all__' && r.entityId !== filter) {
      return false;
    }
    if (term) {
      const hay = (r.entity + ' ' + r.field + ' ' + r.name + ' ' + r.type + ' ' + r.refs.join(' ')).toLowerCase();
      return hay.indexOf(term.toLowerCase()) !== -1;
    }
    return true;
  });

  const rows = [];
  let current = null;
  records.forEach((r) => {
    if (r.entityId !== current) {
      current = r.entityId;
      rows.push(html`<tr class="is-group"><td colspan="5">${r.entity} · ${ctx.typeLabel(r.entityType)}</td></tr>`);
    }
    rows.push(html`<tr>
      <td>${r.field}<br/><code>${r.name}</code></td><td>${r.type}</td>
      <td><span class=${'badge badge--' + r.kind}>${r.kind}</span></td>
      <td>${r.required ? '✓' : ''}</td><td>${r.refs.join(', ')}</td>
    </tr>`);
  });

  return html`
    <div class="panel__toolbar">
      <select id="table-entity" class="panel__select" value=${filter} onChange=${(e) => setTableFilter(e.target.value)}>
        <option value="__all__">All entities</option>
        ${ctx.entities().map((e) => html`<option value=${e.id}>${e.label}</option>`)}
      </select>
      <input id="table-search" class="panel__search" type="search" placeholder="Filter fields…" value=${term} onInput=${(e) => setTerm(e.target.value)} />
    </div>
    <div class="table-wrap">
      <table id="field-table" class="field-table">
        <thead><tr><th>Field</th><th>Type</th><th>Card.</th><th>Req</th><th>References</th></tr></thead>
        <tbody>${rows.length ? rows : html`<tr><td colspan="5">No fields match.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function SettingsBody({ ctx }) {
  return html`
    <div class="settings-body">
      <h3 class="settings-section__title">Entity colours</h3>
      <div id="color-settings" class="color-settings">
        ${ctx.allTypes().map((t) => html`
          <div class="color-row">
            <span class="filters__swatch" style=${{ background: ctx.colorFor(t) }}></span>
            <span class="color-row__label">${ctx.typeLabel(t)}</span>
            <input type="color" data-color=${t} value=${ctx.colorFor(t)} onInput=${(e) => ctx.applyColor(t, e.target.value)} />
          </div>`)}
      </div>
      <button id="settings-reset" class="settings-reset" type="button" title="Restore the default entity colours" onClick=${() => ctx.resetColors()}>${rawIcon('rotate-ccw')}Reset to defaults</button>
      <p class="panel__note">Saved to this browser and reused across diagrams.</p>
    </div>`;
}

/* Boot -------------------------------------------------------------------- */

function syncToggles() {
  const s = getState();
  [['entities-toggle', 'entities'], ['table-toggle', 'table'], ['legend-toggle', 'legend'], ['settings-toggle', 'settings']].forEach(([btn, id]) => {
    const el = document.getElementById(btn);
    if (el) {
      el.classList.toggle('is-active', s.panels[id].open);
    }
  });
}

export function initUI() {
  render(html`<${StageApp} />`, document.getElementById('stage-root'));

  [['entities-toggle', 'entities'], ['table-toggle', 'table'], ['legend-toggle', 'legend'], ['settings-toggle', 'settings']].forEach(([btn, id]) => {
    const el = document.getElementById(btn);
    if (el) {
      el.addEventListener('click', () => togglePanel(id));
    }
  });

  subscribe(syncToggles);
  syncToggles();
}
