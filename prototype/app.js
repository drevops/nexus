/**
 * Preact prototype entry point.
 *
 * A self-contained page that reuses the real stylesheet, icon set and
 * Cytoscape canvas, but rebuilds the panels + inspector in Preact so the
 * approach can be compared against the vanilla app one directory up. The graph
 * is a small hand-built sample - enough to drag panels over, tap nodes and edit
 * them through the inspector.
 */

import { h, render } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import htmBase from 'htm';
import { icon } from '../assets/icons.js';
import { usePanelManager, Panel } from './panels.js';
import { EntityForm, FieldForm, NewFieldForm, existingFields } from './inspector.js';

const html = htmBase.bind(h);

const COLORS = { node: '#d9e2f3', taxonomy_term: '#9fc5e8', media: '#f6b26b', paragraph: '#cdbdec', block_content: '#b6d7a8', user: '#ea9999' };
const TYPE_LABELS = { node: 'Content type', taxonomy_term: 'Vocabulary', media: 'Media', paragraph: 'Paragraph', block_content: 'Block', user: 'User' };
const PANEL_IDS = ['entities', 'table', 'settings', 'legend', 'inspector'];
const TITLES = { entities: 'Entities', table: 'Fields', settings: 'Settings', legend: 'Legend', inspector: 'Inspector' };

const SAMPLE = {
  nodes: [
    { data: { id: 'node.article', group: 'entity', entityType: 'node', bundle: 'article', label: 'Article' } },
    { data: { id: 'node.page', group: 'entity', entityType: 'node', bundle: 'page', label: 'Page' } },
    { data: { id: 'taxonomy_term.tags', group: 'entity', entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags' } },
    { data: { id: 'media.image', group: 'entity', entityType: 'media', bundle: 'image', label: 'Image' } },
    { data: { id: 'field:node.article:field_body', group: 'field', name: 'field_body', label: 'Body', fieldType: 'text_long', kind: 'single', required: true, entity: 'node.article' } },
    { data: { id: 'field:node.article:field_tags', group: 'field', name: 'field_tags', label: 'Tags', fieldType: 'entity_reference', kind: 'multi', required: false, entity: 'node.article' } },
    { data: { id: 'field:node.article:field_image', group: 'field', name: 'field_image', label: 'Image', fieldType: 'entity_reference', kind: 'single', required: false, entity: 'node.article' } },
    { data: { id: 'field:node.page:field_summary', group: 'field', name: 'field_summary', label: 'Summary', fieldType: 'string_long', kind: 'single', required: false, entity: 'node.page' } },
  ],
  edges: [
    { data: { id: 'has:body', source: 'node.article', target: 'field:node.article:field_body', group: 'has' } },
    { data: { id: 'has:tags', source: 'node.article', target: 'field:node.article:field_tags', group: 'has' } },
    { data: { id: 'has:image', source: 'node.article', target: 'field:node.article:field_image', group: 'has' } },
    { data: { id: 'has:summary', source: 'node.page', target: 'field:node.page:field_summary', group: 'has' } },
    { data: { id: 'ref:field:node.article:field_tags>taxonomy_term.tags', source: 'field:node.article:field_tags', target: 'taxonomy_term.tags', group: 'ref', cardinality: '1..n' } },
    { data: { id: 'ref:field:node.article:field_image>media.image', source: 'field:node.article:field_image', target: 'media.image', group: 'ref', cardinality: '1' } },
  ],
};

function cyStyle() {
  return [
    { selector: 'node[group="entity"]', style: { shape: 'round-rectangle', 'background-color': (e) => COLORS[e.data('entityType')] || '#eee', 'border-color': '#5b6470', 'border-width': 1.5, label: (e) => e.data('label'), 'text-valign': 'center', 'text-halign': 'center', 'font-size': 12, 'font-weight': 600, width: 'label', height: 'label', padding: '10px' } },
    { selector: 'node[group="field"]', style: { shape: 'ellipse', 'background-color': '#fff', 'border-color': '#555c66', 'border-width': 1, label: (e) => e.data('label'), 'text-valign': 'center', 'text-halign': 'center', 'font-size': 10, width: 'label', height: 'label', padding: '7px' } },
    { selector: 'node[group="field"][kind="multi"]', style: { 'border-width': 3, 'border-style': 'double' } },
    { selector: 'edge', style: { 'curve-style': 'taxi', 'taxi-direction': 'horizontal', width: 1.2, 'line-color': '#aeb4bd', 'target-arrow-shape': 'none' } },
    { selector: 'edge[group="ref"]', style: { 'line-color': '#8a94a3', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#8a94a3', label: 'data(cardinality)', 'font-size': 9, color: '#6b7280' } },
    { selector: '.faded', style: { opacity: 0.25 } },
  ];
}

function rawIcon(name, size) {
  return html`<span dangerouslySetInnerHTML=${{ __html: icon(name, size) }}></span>`;
}

function relayout(cy) {
  cy.layout({ name: 'dagre', rankDir: 'LR', nodeSep: 24, rankSep: 90, animate: false }).run();
  cy.fit(undefined, 40);
}

function Chrome() {
  const cyRef = useRef(null);
  const cyInstance = useRef(null);
  const selectRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [build, setBuild] = useState(true);
  const [selected, setSelected] = useState(null);
  const [, setVersion] = useState(0);
  const { panels, api } = usePanelManager(['entities', 'legend']);

  const bump = () => setVersion((v) => v + 1);

  function selectNode(id) {
    const node = cyInstance.current.getElementById(id);
    if (node.empty()) {
      return;
    }
    setSelected({ kind: node.data('group'), id: id });
    api.open('inspector');
  }
  selectRef.current = selectNode;

  useEffect(() => {
    const cy = window.cytoscape({ container: cyRef.current, elements: SAMPLE, style: cyStyle(), minZoom: 0.2, maxZoom: 3 });
    relayout(cy);
    cy.on('tap', 'node', (e) => selectRef.current(e.target.id()));
    cyInstance.current = cy;
    window.__proto = { cy: cy, select: (id) => selectRef.current(id) };
    setReady(true);
    return () => cy.destroy();
  }, []);

  const dockSig = PANEL_IDS.map((id) => (panels[id].open ? '1' : '0') + (panels[id].dock || '')).join(',');
  useEffect(() => {
    if (cyInstance.current) {
      cyInstance.current.resize();
    }
  }, [dockSig]);

  useEffect(() => {
    if (cyInstance.current) {
      cyInstance.current.autoungrabify(!build);
    }
  }, [build, ready]);

  function addEntity() {
    const cy = cyInstance.current;
    let n = 1;
    while (cy.getElementById('node.custom_' + n).nonempty()) {
      n += 1;
    }
    const id = 'node.custom_' + n;
    cy.add({ group: 'nodes', data: { id: id, group: 'entity', entityType: 'node', bundle: 'custom_' + n, label: 'Custom ' + n }, position: { x: 0, y: 0 } });
    selectNode(id);
    bump();
  }

  function addField(entityId) {
    setSelected({ kind: 'new-field', entityId: entityId });
    api.open('inspector');
  }

  function createField(entityId, form) {
    const cy = cyInstance.current;
    const name = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!name) {
      return;
    }
    const fieldId = 'field:' + entityId + ':' + name;
    if (cy.getElementById(fieldId).empty()) {
      const anchor = cy.getElementById(entityId).position();
      cy.add({ group: 'nodes', data: { id: fieldId, group: 'field', name: name, label: form.label || name, fieldType: form.fieldType, kind: form.kind, required: false, entity: entityId }, position: { x: anchor.x + 180, y: anchor.y } });
      cy.add({ group: 'edges', data: { id: 'has:' + fieldId, source: entityId, target: fieldId, group: 'has' } });
    }
    selectNode(fieldId);
    bump();
  }

  function deleteNode(id) {
    const cy = cyInstance.current;
    const node = cy.getElementById(id);
    if (node.data('group') === 'entity') {
      cy.nodes('[group="field"][entity="' + id + '"]').remove();
    }
    node.remove();
    setSelected(null);
    api.close('inspector');
    bump();
  }

  function recolor(type, color) {
    COLORS[type] = color;
    cyInstance.current.nodes('[group="entity"][entityType="' + type + '"]').style('background-color', color);
    bump();
  }

  function inspectorBody() {
    if (!selected) {
      return html`<p class="insp__empty">Tap a node to inspect it.</p>`;
    }
    if (selected.kind === 'entity') {
      return html`<${EntityForm} key=${selected.id} cy=${cyInstance.current} id=${selected.id} onSelect=${selectNode} onAddField=${addField} onDelete=${deleteNode} onChange=${bump} />`;
    }
    if (selected.kind === 'field') {
      return html`<${FieldForm} key=${selected.id} cy=${cyInstance.current} id=${selected.id} onSelect=${selectNode} onDelete=${deleteNode} onChange=${bump} />`;
    }
    return html`<${NewFieldForm} key=${'new:' + selected.entityId} cy=${cyInstance.current} entityId=${selected.entityId} onCreate=${createField} />`;
  }

  function panelBody(id) {
    const cy = cyInstance.current;
    if (id === 'inspector') {
      return inspectorBody();
    }
    if (id === 'entities') {
      return html`<div class="entity-list">${cy.nodes('[group="entity"]').map((e) => html`
        <div class="entity-row">
          <button class="entity-row__name" onClick=${() => selectNode(e.id())}><b>${e.data('label')}</b> <span class="entity-row__type">${TYPE_LABELS[e.data('entityType')]}</span></button>
          <span class="entity-row__count">${cy.nodes('[group="field"][entity="' + e.id() + '"]').length}</span>
        </div>`)}</div>`;
    }
    if (id === 'table') {
      return html`<div class="table-wrap"><table class="field-table">
        <thead><tr><th>Field</th><th>Type</th><th>Card.</th></tr></thead>
        <tbody>${cy.nodes('[group="field"]').map((f) => html`<tr><td>${f.data('label')}<br/><code>${f.data('name')}</code></td><td>${f.data('fieldType')}</td><td>${f.data('kind')}</td></tr>`)}</tbody>
      </table></div>`;
    }
    if (id === 'settings') {
      return html`<div style="padding:0.9rem 1rem"><h3 class="settings-section__title">Entity colours</h3>
        <div class="color-settings">${Object.keys(TYPE_LABELS).map((t) => html`
          <div class="color-row"><span class="color-row__label">${TYPE_LABELS[t]}</span>
          <input type="color" value=${COLORS[t] || '#cccccc'} onInput=${(e) => recolor(t, e.target.value)} /></div>`)}</div></div>`;
    }
    return html`<div class="legend-body">
      <div class="legend__item"><span class="legend__swatch"><svg width="34" height="24"><rect x="2" y="4" width="30" height="16" rx="3" fill="#9fc5e8" stroke="#5b6470"/></svg></span><span class="legend__label">Entity</span></div>
      <div class="legend__item"><span class="legend__swatch"><svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#555c66"/></svg></span><span class="legend__label">Single-value field</span></div>
      <div class="legend__item"><span class="legend__swatch"><svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#3d444d"/><ellipse cx="17" cy="12" rx="11" ry="6.5" fill="none" stroke="#3d444d"/></svg></span><span class="legend__label">Multi-value field</span></div>
    </div>`;
  }

  function renderPanel(id) {
    return html`<${Panel} id=${id} title=${TITLES[id]} panel=${panels[id]} wide=${id === 'table'} api=${api}>${panelBody(id)}<//>`;
  }

  const btnCls = (id) => 'toolbar__button' + (panels[id].open ? ' is-active' : '');
  const docked = (side) => ready ? PANEL_IDS.filter((id) => panels[id].open && panels[id].dock === side).map(renderPanel) : null;
  const floating = () => ready ? PANEL_IDS.filter((id) => panels[id].open && !panels[id].dock).map(renderPanel) : null;

  return html`
    <header class="toolbar">
      <div class="toolbar__actions">
        <span class="toolbar__brand">Nexus</span>
        <span class="toolbar__title">Preact prototype - panels + inspector</span>
      </div>
      <div class="toolbar__actions">
        <div class="toolbar__group">
          <button class=${'toolbar__button' + (!build ? ' is-active' : '')} onClick=${() => setBuild(false)}>${rawIcon('eye')}View</button>
          <button class=${'toolbar__button' + (build ? ' is-active' : '')} onClick=${() => setBuild(true)}>${rawIcon('pencil')}Build</button>
        </div>
        ${build && html`<div class="toolbar__group"><button class="toolbar__button" onClick=${addEntity}>${rawIcon('plus-square')}Entity</button></div>`}
        <div class="toolbar__group">
          <button class=${btnCls('entities')} onClick=${() => api.toggle('entities')}>${rawIcon('box')}Entities</button>
          <button class=${btnCls('table')} onClick=${() => api.toggle('table')}>${rawIcon('table')}Table</button>
          <button class=${btnCls('legend')} onClick=${() => api.toggle('legend')}>${rawIcon('info')}Legend</button>
          <button class=${btnCls('settings')} onClick=${() => api.toggle('settings')}>${rawIcon('sliders')}Settings</button>
        </div>
      </div>
    </header>
    <main class="stage">
      <div class="dock" id="dock-left">${docked('left')}</div>
      <div class="stage__canvas">
        <div id="cy" class="cy" ref=${cyRef}></div>
        ${floating()}
      </div>
      <div class="dock" id="dock-right">${docked('right')}</div>
    </main>`;
}

render(html`<${Chrome} />`, document.getElementById('app'));
