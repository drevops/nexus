/**
 * Nexus diagram renderer.
 *
 * render(model) draws the { meta, nodes, edges } model produced by the parser
 * with Cytoscape.js, mapping each element to the diagram's visual language.
 * Fields collapse to an entity-only overview by default; the toolbar reveals
 * detail, filters, an entity index, a field table and colour settings. Safe to
 * call repeatedly - each call tears down the previous graph.
 */

import { openPanel, closePanel } from './panels.js';

const DEFAULT_COLORS = {
  node: '#d9e2f3',
  taxonomy_term: '#9fc5e8',
  media: '#f6b26b',
  paragraph: '#cdbdec',
  block_content: '#b6d7a8',
  user: '#ea9999',
  external: '#ea9999',
};

const ENTITY_TYPE_LABELS = {
  node: 'Content type',
  taxonomy_term: 'Vocabulary',
  media: 'Media',
  paragraph: 'Paragraph',
  block_content: 'Block',
  user: 'User',
  external: 'External entity',
};

const TYPE_ORDER = ['node', 'taxonomy_term', 'media', 'paragraph', 'block_content', 'user', 'external'];

const SETTINGS_KEY = 'nexusSettings';

let settings = loadSettings();
const activeColors = {};

let fieldsMode = false;
let rankDir = 'LR';
let showMachineNames = false;
let typeVisible = {};

let entityById = {};
let fieldById = {};
let refsByField = {};

let ctx = null;
let wired = false;

function loadSettings() {
  try {
    return JSON.parse(window.localStorage.getItem(SETTINGS_KEY)) || {};
  }
  catch (e) {
    return {};
  }
}

function saveSettings() {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
  catch (e) {
    // Storage may be unavailable (e.g. private mode); fall back to in-memory.
  }
}

function initColors() {
  TYPE_ORDER.forEach((type) => {
    activeColors[type] = (settings.colors && settings.colors[type]) || DEFAULT_COLORS[type];
  });
}

function prettify(value) {
  return String(value || '').replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function typeLabel(entityType) {
  return ENTITY_TYPE_LABELS[entityType] || prettify(entityType);
}

function entityColor(entityType) {
  return activeColors[entityType] || '#eceff3';
}

function esc(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"]/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function buildElements(model) {
  const nodes = model.nodes || [];
  const ids = {};
  nodes.forEach((n) => {
    ids[n.data.id] = true;
    if (n.data.group === 'entity') {
      entityById[n.data.id] = n.data;
    }
    else if (n.data.group === 'field') {
      fieldById[n.data.id] = n.data;
    }
  });

  const edges = (model.edges || []).filter((e) => ids[e.data.source] && ids[e.data.target]);

  const seen = {};
  const collapsed = [];
  edges.forEach((e) => {
    if (e.data.group === 'ref') {
      (refsByField[e.data.source] = refsByField[e.data.source] || []).push(e.data.target);
    }
  });
  Object.keys(refsByField).forEach((fieldId) => {
    const field = fieldById[fieldId];
    if (!field) {
      return;
    }
    refsByField[fieldId].forEach((target) => {
      const key = field.entity + '>' + target;
      if (!seen[key] && ids[field.entity]) {
        seen[key] = true;
        collapsed.push({ data: { id: 'c:' + key, source: field.entity, target: target, group: 'collapsed' } });
      }
    });
  });

  return { nodes: nodes, edges: edges.concat(collapsed) };
}

function style() {
  return [
    {
      selector: 'node[group="entity"]',
      style: {
        shape: 'round-rectangle',
        'background-color': (ele) => entityColor(ele.data('entityType')),
        'border-color': '#5b6470',
        'border-width': 1.5,
        label: (ele) => ele.data('label') + '\n' + typeLabel(ele.data('entityType')),
        'text-wrap': 'wrap',
        'text-max-width': 160,
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 12,
        'font-weight': 600,
        'line-height': 1.25,
        color: '#1f2933',
        width: 'label',
        height: 'label',
        padding: '10px',
      },
    },
    {
      selector: 'node[group="field"]',
      style: {
        shape: 'ellipse',
        'background-color': '#ffffff',
        'border-color': '#555c66',
        'border-width': 1,
        label: (ele) => (ele.data('required') ? ele.data('label') + ' *' : ele.data('label')),
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 10,
        color: '#2b333d',
        width: 'label',
        height: 'label',
        padding: '7px',
      },
    },
    { selector: 'node[group="field"][kind="multi"]', style: { 'border-width': 3, 'border-style': 'double', 'border-color': '#3d444d' } },
    { selector: 'node[group="field"][kind="system"]', style: { 'border-style': 'dashed', 'border-color': '#98a2b3', color: '#6b7280' } },
    { selector: 'node[group="field"][kind="calculated"]', style: { 'background-color': '#ffd966', 'border-color': '#c9a227' } },
    {
      selector: 'node[group="annotation"]',
      style: {
        'background-color': '#ffffff',
        'border-color': '#333b45',
        'border-width': 1.5,
        label: (ele) => (ele.data('method') ? ele.data('label') + '\n' + ele.data('method') : ele.data('label')),
        'text-wrap': 'wrap',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 10,
        width: 'label',
        height: 'label',
        padding: '12px',
      },
    },
    { selector: 'node[group="annotation"][kind="event"]', style: { shape: 'diamond' } },
    { selector: 'node[group="annotation"][kind="api"]', style: { shape: 'hexagon' } },
    { selector: 'node[group="annotation"][kind="callback"]', style: { shape: 'round-rectangle', 'font-weight': 600, padding: '9px' } },
    {
      selector: 'edge',
      style: {
        'curve-style': 'taxi',
        'taxi-direction': () => (rankDir === 'TB' ? 'vertical' : 'horizontal'),
        'taxi-turn': '50%',
        'taxi-turn-min-distance': '8px',
        width: 1.2,
        'line-color': '#aeb4bd',
        'target-arrow-shape': 'none',
      },
    },
    {
      selector: 'edge[group="ref"], edge[group="collapsed"]',
      style: { 'line-color': '#8a94a3', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#8a94a3', 'arrow-scale': 0.9 },
    },
    {
      selector: 'edge[group="ref"]',
      style: {
        label: 'data(cardinality)',
        'font-size': 9,
        color: '#6b7280',
        'text-background-color': '#f4f5f7',
        'text-background-opacity': 1,
        'text-background-padding': 2,
      },
    },
    {
      selector: 'edge[group="annotation"]',
      style: {
        'line-style': 'dashed',
        'line-color': '#b5739d',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#b5739d',
        label: 'data(label)',
        'font-size': 9,
        color: '#8a5a76',
      },
    },
    { selector: '.faded', style: { opacity: 0.1 } },
    { selector: '.hidden', style: { display: 'none' } },
    { selector: '.highlight', style: { 'border-color': '#2f6db3', 'border-width': 3 } },
    { selector: 'node.trace', style: { opacity: 1, 'border-color': '#0f9d8f', 'border-width': 3 } },
    { selector: 'edge.trace', style: { opacity: 1, 'line-color': '#0f9d8f', 'target-arrow-color': '#0f9d8f', width: 2.6, 'z-index': 20 } },
    { selector: 'node.trace-source', style: { opacity: 1, 'border-color': '#0b7a70', 'border-width': 4, 'background-color': '#c3f0e8' } },
  ];
}

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
  ['entity', 'Entity (name / type)'],
  ['single', 'Single-value field'],
  ['multi', 'Multi-value field'],
  ['system', 'System field'],
  ['calculated', 'Calculated field'],
  ['event', 'Event'],
  ['api', 'API'],
  ['callback', 'Callback / method'],
];

function buildLegend(container) {
  let html = '';
  LEGEND_ITEMS.forEach((item) => {
    html += '<div class="legend__item"><span class="legend__swatch">' + SWATCHES[item[0]] +
      '</span><span class="legend__label">' + item[1] + '</span></div>';
  });
  container.innerHTML = html;
}

function fieldReferences(fieldId) {
  return (refsByField[fieldId] || []).map((target) => (entityById[target] ? entityById[target].label : target));
}

function tooltipHtml(node) {
  const group = node.data('group');
  const name = esc(node.data('label'));

  if (group === 'entity') {
    return '<div class="tooltip__name">' + name + '</div>' +
      '<div class="tooltip__meta">' + esc(typeLabel(node.data('entityType'))) + ' · ' + esc(node.data('bundle')) + '</div>';
  }

  if (group === 'field') {
    const meta = [prettify(node.data('kind')) + ' field', esc(node.data('fieldType'))];
    const refs = fieldReferences(node.id());
    if (refs.length) {
      meta.push('→ ' + esc(refs.join(', ')));
    }
    return '<div class="tooltip__name">' + name + '</div><div class="tooltip__meta">' + meta.join(' · ') + '</div>';
  }

  const extra = node.data('method') ? ' · ' + esc(node.data('method')) : '';
  return '<div class="tooltip__name">' + name + '</div><div class="tooltip__meta">' + esc(prettify(node.data('kind'))) + extra + '</div>';
}

function $(id) {
  return document.getElementById(id);
}

function buildController(model, options = {}) {
  entityById = {};
  fieldById = {};
  refsByField = {};
  typeVisible = {};
  fieldsMode = false;
  rankDir = 'LR';
  showMachineNames = false;
  initColors();
  if (options.colors) {
    Object.assign(activeColors, options.colors);
  }

  const elements = buildElements(model);
  TYPE_ORDER.forEach((t) => { typeVisible[t] = true; });

  if (ctx && ctx.cy) {
    ctx.cy.destroy();
  }

  const cy = window.cytoscape({
    container: $('cy'),
    elements: elements,
    style: style(),
    minZoom: 0.05,
    maxZoom: 3,
    layout: { name: 'grid' },
  });

  const captionsEl = $('captions');
  let captionMap = {};

  function entityTypeOf(entityId) {
    return entityById[entityId] ? entityById[entityId].entityType : null;
  }

  function nodeVisible(node) {
    const group = node.data('group');
    if (group === 'entity') {
      return typeVisible[node.data('entityType')] !== false;
    }
    if (group === 'field') {
      return fieldsMode && typeVisible[entityTypeOf(node.data('entity'))] !== false;
    }
    return true;
  }

  function refresh(relayout) {
    const visible = {};
    cy.nodes().forEach((n) => {
      const vis = nodeVisible(n);
      n.toggleClass('hidden', !vis);
      if (vis) {
        visible[n.id()] = true;
      }
    });
    cy.edges().forEach((e) => {
      const group = e.data('group');
      const ends = visible[e.data('source')] && visible[e.data('target')];
      let vis;
      if (group === 'has' || group === 'ref') {
        vis = fieldsMode && ends;
      }
      else if (group === 'collapsed') {
        vis = !fieldsMode && ends;
      }
      else {
        vis = ends;
      }
      e.toggleClass('hidden', !vis);
    });
    if (relayout) {
      runLayout();
    }
  }

  function runLayout() {
    cy.elements(':visible').layout({
      name: 'dagre',
      rankDir: rankDir,
      ranker: 'network-simplex',
      nodeSep: fieldsMode ? 26 : 52,
      edgeSep: 16,
      rankSep: fieldsMode ? 95 : 150,
      nodeDimensionsIncludeLabels: true,
      animate: false,
    }).run();
    cy.fit(undefined, 50);
    positionCaptions();
  }

  function applyLayout(layout) {
    fieldsMode = true;
    $('fields-toggle').classList.add('is-active');
    refresh(false);
    cy.nodes().forEach((node) => {
      if (layout[node.id()]) {
        node.position(layout[node.id()]);
      }
    });
    cy.fit(undefined, 50);
    positionCaptions();
  }

  function focusEntity(id) {
    const node = cy.getElementById(id);
    if (node.empty()) {
      return;
    }
    const hood = node.closedNeighborhood().closedNeighborhood();
    cy.elements().removeClass('trace trace-source').addClass('faded');
    hood.removeClass('faded');
    node.removeClass('faded');
    cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.8) }, { duration: 350 });
  }

  function focusField(id) {
    const node = cy.getElementById(id);
    if (node.empty()) {
      return;
    }

    // A field's closed neighbourhood is exactly its inbound owner (via the
    // has-edge) and outbound reference targets - the connections to trace.
    const hood = node.closedNeighborhood();
    cy.elements().removeClass('trace trace-source').addClass('faded');
    hood.removeClass('faded').addClass('trace');
    node.removeClass('trace').addClass('trace-source');
    cy.animate({ center: { eles: hood }, zoom: Math.max(cy.zoom(), 0.8) }, { duration: 350 });
  }

  function clearFocus() {
    cy.elements().removeClass('faded trace trace-source');
  }

  function machineNameOf(node) {
    const group = node.data('group');
    if (group === 'entity') {
      return node.data('bundle');
    }
    if (group === 'field') {
      return node.data('name') || '';
    }
    return '';
  }

  function rebuildCaptions() {
    captionsEl.innerHTML = '';
    captionMap = {};
    if (!showMachineNames) {
      return;
    }
    cy.nodes().forEach((node) => {
      const name = machineNameOf(node);
      if (!name) {
        return;
      }
      const div = document.createElement('div');
      div.className = 'caption';
      div.textContent = name;
      captionsEl.appendChild(div);
      captionMap[node.id()] = div;
    });
    positionCaptions();
  }

  function positionCaptions() {
    if (!showMachineNames) {
      return;
    }
    const zoom = cy.zoom();
    const tooSmall = zoom < 0.35;
    const size = Math.max(7, Math.min(13, 10 * zoom));
    Object.keys(captionMap).forEach((id) => {
      const node = cy.getElementById(id);
      const div = captionMap[id];
      if (node.empty() || node.hasClass('hidden') || node.hasClass('faded') || tooSmall) {
        div.style.display = 'none';
        return;
      }
      const pos = node.renderedPosition();
      div.style.display = 'block';
      div.style.left = pos.x + 'px';
      div.style.top = (pos.y + node.renderedOuterHeight() / 2 + 3) + 'px';
      div.style.fontSize = size + 'px';
    });
  }

  buildLegend($('legend-body'));

  const presentTypes = TYPE_ORDER.filter((t) => Object.keys(entityById).some((id) => entityById[id].entityType === t));
  $('type-filters').innerHTML = presentTypes.map((t) => {
    return '<label class="filters__item"><input type="checkbox" data-type="' + esc(t) + '" checked>' +
      '<span class="filters__swatch" data-swatch="' + esc(t) + '" style="background:' + entityColor(t) + '"></span>' + esc(typeLabel(t)) + '</label>';
  }).join('');

  $('entity-list').innerHTML = Object.keys(entityById).map((id) => {
    const e = entityById[id];
    const count = cy.nodes('[group="field"][entity="' + id + '"]').length;
    return '<div class="entity-row" data-type="' + esc(e.entityType) + '">' +
      '<button class="entity-row__name" data-id="' + esc(id) + '"><b>' + esc(e.label) + '</b> ' +
      '<span class="entity-row__type">' + esc(typeLabel(e.entityType)) + '</span></button>' +
      '<span class="entity-row__count">' + count + '</span>' +
      '<button class="entity-row__fields" data-fields="' + esc(id) + '">fields</button></div>';
  }).join('');

  const records = [];
  cy.nodes('[group="field"]').forEach((f) => {
    const entity = entityById[f.data('entity')] || { label: f.data('entity'), entityType: '' };
    records.push({
      entityId: f.data('entity'),
      entity: entity.label,
      entityType: entity.entityType,
      field: f.data('label'),
      name: f.data('name') || '',
      type: f.data('fieldType'),
      kind: f.data('kind'),
      required: !!f.data('required'),
      refs: fieldReferences(f.id()),
    });
  });

  const tableEntity = $('table-entity');
  tableEntity.innerHTML = '<option value="__all__">All entities</option>' + Object.keys(entityById).map((id) => {
    return '<option value="' + esc(id) + '">' + esc(entityById[id].label) + '</option>';
  }).join('');
  tableEntity.value = '__all__';
  $('table-search').value = '';

  function kindBadge(kind) {
    return '<span class="badge badge--' + esc(kind) + '">' + esc(kind) + '</span>';
  }

  function renderTable() {
    const filter = tableEntity.value;
    const term = $('table-search').value.trim().toLowerCase();
    const rows = records.filter((r) => {
      if (filter && filter !== '__all__' && r.entityId !== filter) {
        return false;
      }
      if (term) {
        const hay = (r.entity + ' ' + r.field + ' ' + r.name + ' ' + r.type + ' ' + r.refs.join(' ')).toLowerCase();
        if (hay.indexOf(term) === -1) {
          return false;
        }
      }
      return true;
    });

    let html = '<thead><tr><th>Field</th><th>Type</th><th>Card.</th><th>Req</th><th>References</th></tr></thead><tbody>';
    let current = null;
    rows.forEach((r) => {
      if (r.entityId !== current) {
        current = r.entityId;
        html += '<tr class="is-group"><td colspan="5">' + esc(r.entity) + ' · ' + esc(typeLabel(r.entityType)) + '</td></tr>';
      }
      html += '<tr><td>' + esc(r.field) + '<br><code>' + esc(r.name) + '</code></td><td>' + esc(r.type) +
        '</td><td>' + kindBadge(r.kind) + '</td><td>' + (r.required ? '✓' : '') + '</td><td>' + esc(r.refs.join(', ')) + '</td></tr>';
    });
    if (!rows.length) {
      html += '<tr><td colspan="5">No fields match.</td></tr>';
    }
    $('field-table').innerHTML = html + '</tbody>';
  }

  function openTable(entityId) {
    tableEntity.value = entityId;
    renderTable();
    openPanel('table');
  }

  $('color-settings').innerHTML = TYPE_ORDER.map((type) => {
    return '<div class="color-row">' +
      '<span class="filters__swatch" data-swatch="' + esc(type) + '" style="background:' + entityColor(type) + '"></span>' +
      '<span class="color-row__label">' + esc(typeLabel(type)) + '</span>' +
      '<input type="color" data-color="' + esc(type) + '" value="' + entityColor(type) + '"></div>';
  }).join('');

  function applyColor(type, color) {
    activeColors[type] = color;
    cy.nodes('[group="entity"][entityType="' + type + '"]').style('background-color', color);
    Array.prototype.forEach.call(document.querySelectorAll('[data-swatch="' + type + '"]'), (el) => {
      el.style.background = color;
    });
    if (window.__nexus) {
      window.__nexus.colors = { ...activeColors };
    }
  }

  function searchHighlight(term) {
    cy.elements().addClass('faded');
    const matches = cy.nodes('[group="entity"]').filter((n) => (n.data('label') + ' ' + n.data('bundle')).toLowerCase().indexOf(term) !== -1);
    matches.union(matches.closedNeighborhood().closedNeighborhood()).removeClass('faded');
  }

  cy.on('mouseover', 'node', (evt) => {
    const tooltip = $('tooltip');
    tooltip.innerHTML = tooltipHtml(evt.target);
    tooltip.hidden = false;
  });
  cy.on('mousemove', 'node', (evt) => {
    const tooltip = $('tooltip');
    tooltip.style.left = (evt.renderedPosition.x + 14) + 'px';
    tooltip.style.top = (evt.renderedPosition.y + 14) + 'px';
  });
  cy.on('mouseout', 'node', () => {
    $('tooltip').hidden = true;
  });
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      clearFocus();
    }
  });
  cy.on('tap', 'node[group="entity"]', (evt) => {
    if (window.__nexusBuild) {
      return;
    }
    focusEntity(evt.target.id());
  });
  cy.on('tap', 'node[group="field"]', (evt) => {
    if (window.__nexusBuild) {
      return;
    }
    focusField(evt.target.id());
  });
  cy.on('render', () => {
    if (!showMachineNames || captionRaf) {
      return;
    }
    captionRaf = true;
    requestAnimationFrame(() => {
      captionRaf = false;
      positionCaptions();
    });
  });
  let captionRaf = false;

  // Reset toolbar/panels to their default state for this render.
  $('fields-toggle').classList.remove('is-active');
  $('layout-toggle').textContent = 'Layout: LR';
  $('machine-names').classList.remove('is-active');
  $('search').value = '';
  openPanel('legend');
  closePanel('entities');
  closePanel('table');
  closePanel('settings');
  closePanel('inspector');

  renderTable();

  return { cy, refresh, runLayout, applyLayout, clearFocus, focusEntity, focusField, openTable, renderTable, rebuildCaptions, searchHighlight, applyColor };
}

function wire() {
  $('zoom-in').addEventListener('click', () => ctx.cy.zoom({ level: ctx.cy.zoom() * 1.25, renderedPosition: { x: ctx.cy.width() / 2, y: ctx.cy.height() / 2 } }));
  $('zoom-out').addEventListener('click', () => ctx.cy.zoom({ level: ctx.cy.zoom() * 0.8, renderedPosition: { x: ctx.cy.width() / 2, y: ctx.cy.height() / 2 } }));
  $('fit').addEventListener('click', () => ctx.cy.fit(undefined, 45));
  $('reset').addEventListener('click', () => { ctx.clearFocus(); ctx.cy.fit(undefined, 45); });

  $('fields-toggle').addEventListener('click', (evt) => {
    fieldsMode = !fieldsMode;
    evt.target.classList.toggle('is-active', fieldsMode);
    ctx.clearFocus();
    ctx.refresh(true);
  });

  $('layout-toggle').addEventListener('click', (evt) => {
    rankDir = rankDir === 'LR' ? 'TB' : 'LR';
    evt.target.textContent = 'Layout: ' + rankDir;
    ctx.runLayout();
  });

  $('machine-names').addEventListener('click', (evt) => {
    showMachineNames = !showMachineNames;
    evt.target.classList.toggle('is-active', showMachineNames);
    ctx.rebuildCaptions();
  });

  $('search').addEventListener('input', (evt) => {
    const term = evt.target.value.trim().toLowerCase();
    if (!term) {
      ctx.clearFocus();
      return;
    }
    ctx.searchHighlight(term);
  });

  $('type-filters').addEventListener('change', (evt) => {
    const type = evt.target.getAttribute && evt.target.getAttribute('data-type');
    if (type) {
      typeVisible[type] = evt.target.checked;
      ctx.refresh(true);
    }
  });

  $('entity-list').addEventListener('click', (evt) => {
    const focus = evt.target.closest('.entity-row__name');
    if (focus) {
      ctx.focusEntity(focus.getAttribute('data-id'));
      return;
    }
    const fields = evt.target.closest('.entity-row__fields');
    if (fields) {
      ctx.openTable(fields.getAttribute('data-fields'));
    }
  });

  $('table-entity').addEventListener('change', () => ctx.renderTable());
  $('table-search').addEventListener('input', () => ctx.renderTable());

  $('color-settings').addEventListener('input', (evt) => {
    const type = evt.target.getAttribute && evt.target.getAttribute('data-color');
    if (!type) {
      return;
    }
    settings.colors = settings.colors || {};
    settings.colors[type] = evt.target.value;
    saveSettings();
    ctx.applyColor(type, evt.target.value);
  });

  $('settings-reset').addEventListener('click', () => {
    delete settings.colors;
    saveSettings();
    TYPE_ORDER.forEach((type) => {
      ctx.applyColor(type, DEFAULT_COLORS[type]);
      const input = $('color-settings').querySelector('[data-color="' + type + '"]');
      if (input) {
        input.value = DEFAULT_COLORS[type];
      }
    });
  });
}

export function render(model, options = {}) {
  ctx = buildController(model, options);
  if (!wired) {
    wire();
    wired = true;
  }
  if (options.layout && Object.keys(options.layout).length) {
    ctx.applyLayout(options.layout);
  }
  else {
    ctx.refresh(true);
  }
  window.__nexus = { cy: ctx.cy, model, colors: { ...activeColors } };
  return ctx;
}
