/**
 * Nexus diagram renderer.
 *
 * render(model) draws the { meta, nodes, edges } model produced by the parser
 * with Cytoscape.js, mapping each element to the diagram's visual language.
 * Fields collapse to an entity-only overview by default; the toolbar reveals
 * detail, filters, an entity index, a field table and colour settings. Safe to
 * call repeatedly - each call tears down the previous graph.
 */

import { setController, bump, closeInspector } from './store.js';
import { icon } from './icons.js';

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
let proxyMode = false;
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
  const proxyNodes = [];
  const proxyEdges = [];
  edges.forEach((e) => {
    if (e.data.group !== 'ref') {
      return;
    }
    (refsByField[e.data.source] = refsByField[e.data.source] || []).push(e.data.target);

    // A proxy is a semi-opaque stand-in for the target entity placed beside the
    // referencing field, so a distant reference reads as a short local hop
    // instead of a long edge across the graph.
    const field = fieldById[e.data.source];
    const target = entityById[e.data.target];
    const proxyId = 'proxy:' + e.data.source + '>' + e.data.target;
    proxyNodes.push({ data: { id: proxyId, group: 'proxy', target: e.data.target, entity: field ? field.entity : '', entityType: target ? target.entityType : '', label: target ? target.label : e.data.target } });
    proxyEdges.push({ data: { id: 'pe:' + e.data.source + '>' + e.data.target, source: e.data.source, target: proxyId, group: 'proxyedge', cardinality: e.data.cardinality } });
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

  return { nodes: nodes.concat(proxyNodes), edges: edges.concat(collapsed).concat(proxyEdges) };
}

function themeColors() {
  const dark = document.documentElement.classList.contains('sl-theme-dark');
  if (dark) {
    return { text: '#e4e7ec', muted: '#9aa4b2', nodeBorder: '#8a94a3', fieldBg: '#2b3039', fieldBorder: '#7b8494', edge: '#5a636f', refEdge: '#8a94a3', labelBg: '#22262d' };
  }
  return { text: '#1f2933', muted: '#6b7280', nodeBorder: '#5b6470', fieldBg: '#ffffff', fieldBorder: '#555c66', edge: '#aeb4bd', refEdge: '#8a94a3', labelBg: '#f4f5f7' };
}

function style() {
  const tc = themeColors();
  return [
    {
      selector: 'node[group="entity"]',
      style: {
        shape: 'round-rectangle',
        'background-color': (ele) => entityColor(ele.data('entityType')),
        'border-color': tc.nodeBorder,
        'border-width': 1.5,
        // A blank second line reserves in-box space for the type caption, which
        // is drawn over it by positionCaptions (Cytoscape labels take a single
        // style, so the differently-styled type cannot live in the label).
        label: (ele) => ele.data('label') + '\n ',
        'text-wrap': 'wrap',
        'text-max-width': 160,
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 12,
        'font-weight': 600,
        'line-height': 1.3,
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
        'background-color': tc.fieldBg,
        'border-color': tc.fieldBorder,
        'border-width': 1,
        label: (ele) => (ele.data('required') ? ele.data('label') + ' *' : ele.data('label')),
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 10,
        color: tc.text,
        width: 'label',
        height: 'label',
        padding: '7px',
      },
    },
    { selector: 'node[group="field"][kind="multi"]', style: { 'border-width': 3, 'border-style': 'double', 'border-color': tc.fieldBorder } },
    { selector: 'node[group="field"][kind="system"]', style: { 'border-style': 'dashed', 'border-color': '#98a2b3', color: tc.muted } },
    { selector: 'node[group="field"][kind="calculated"]', style: { 'background-color': '#ffd966', 'border-color': '#c9a227', color: '#3a2f0a' } },
    {
      selector: 'node[group="annotation"]',
      style: {
        'background-color': tc.fieldBg,
        'border-color': tc.nodeBorder,
        color: tc.text,
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
    {
      selector: 'node[group="proxy"]',
      style: {
        shape: 'round-rectangle',
        'background-color': (ele) => entityColor(ele.data('entityType')),
        'background-opacity': 0.4,
        'border-color': '#8a94a3',
        'border-width': 1,
        'border-style': 'dashed',
        label: (ele) => ele.data('label'),
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 10,
        'font-style': 'italic',
        color: tc.muted,
        width: 'label',
        height: 'label',
        padding: '7px',
      },
    },
    {
      selector: 'edge[group="proxyedge"]',
      style: { 'line-color': '#c2c8d0', 'line-style': 'dashed', width: 1, 'target-arrow-shape': 'triangle', 'target-arrow-color': '#c2c8d0', 'arrow-scale': 0.8 },
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
        'line-color': tc.edge,
        'target-arrow-shape': 'none',
      },
    },
    {
      selector: 'edge[group="ref"], edge[group="collapsed"]',
      style: { 'line-color': tc.refEdge, 'target-arrow-shape': 'triangle', 'target-arrow-color': tc.refEdge, 'arrow-scale': 0.9 },
    },
    {
      selector: 'edge[group="ref"], edge[group="proxyedge"]',
      style: {
        label: 'data(cardinality)',
        'font-size': 9,
        color: tc.muted,
        'text-background-color': tc.labelBg,
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
  fieldsMode = true;
  proxyMode = true;
  rankDir = 'LR';
  showMachineNames = true;
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
  const notesEl = $('notes');
  let noteMap = {};

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
    if (group === 'proxy') {
      return proxyMode && fieldsMode && typeVisible[entityTypeOf(node.data('entity'))] !== false && typeVisible[node.data('entityType')] !== false;
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
      if (group === 'has') {
        vis = fieldsMode && ends;
      }
      else if (group === 'ref') {
        vis = fieldsMode && !proxyMode && ends;
      }
      else if (group === 'proxyedge') {
        vis = fieldsMode && proxyMode && ends;
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
    // Machine-name captions hang ~16px below each node (outside its Cytoscape
    // box), so widen the in-rank gap to fit them when they are shown.
    const captionRoom = showMachineNames ? 18 : 0;
    cy.elements(':visible').layout({
      name: 'dagre',
      rankDir: rankDir,
      ranker: 'network-simplex',
      nodeSep: (fieldsMode ? 10 : 34) + captionRoom,
      edgeSep: 6,
      rankSep: fieldsMode ? 62 : 120,
      nodeDimensionsIncludeLabels: true,
      animate: false,
    }).run();
    cy.fit(undefined, 45);
    positionCaptions();
    positionNotes();
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
    positionNotes();
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

  // Under each node: the entity type (always, de-emphasised) then, when the
  // toggle is on, the machine name. Cytoscape labels take a single style, so the
  // differently-styled type line lives here in the HTML caption layer.
  function captionLinesFor(node) {
    const lines = [];
    if (node.data('group') === 'entity') {
      lines.push({ text: typeLabel(node.data('entityType')), cls: 'caption caption--type' });
    }
    if (showMachineNames) {
      const name = machineNameOf(node);
      if (name) {
        lines.push({ text: name, cls: 'caption' });
      }
    }
    return lines;
  }

  function rebuildCaptions() {
    captionsEl.innerHTML = '';
    captionMap = {};
    cy.nodes().forEach((node) => {
      const lines = captionLinesFor(node);
      if (!lines.length) {
        return;
      }
      captionMap[node.id()] = lines.map((line) => {
        const div = document.createElement('div');
        div.className = line.cls;
        div.textContent = line.text;
        captionsEl.appendChild(div);
        return div;
      });
    });
    positionCaptions();
  }

  function positionCaptions() {
    const zoom = cy.zoom();
    const tooSmall = zoom < 0.35;
    // Scale the type with the zoom so captions grow and shrink with the canvas
    // (Cytoscape's own node labels are 12px in model space); a flat clamp made
    // them look pinned at high zoom.
    const size = 10 * zoom;
    Object.keys(captionMap).forEach((id) => {
      const node = cy.getElementById(id);
      const divs = captionMap[id];
      if (node.empty() || node.hasClass('hidden') || node.hasClass('faded') || tooSmall) {
        divs.forEach((div) => { div.style.display = 'none'; });
        return;
      }
      const pos = node.renderedPosition();
      const halfH = node.renderedOuterHeight() / 2;
      // Machine-name lines stack just below the node; the entity type sits over
      // the reserved blank line inside the box, so it reads as a sub-label.
      let below = pos.y + halfH + 3 * zoom;
      divs.forEach((div) => {
        div.style.display = 'block';
        div.style.left = pos.x + 'px';
        div.style.fontSize = size + 'px';
        if (div.classList.contains('caption--type')) {
          div.style.top = (pos.y + halfH - size - 5 * zoom) + 'px';
        }
        else {
          div.style.top = below + 'px';
          below += size + 2 * zoom;
        }
      });
    });
  }

  // A note badge sits at an entity's top-right corner; hovering or clicking it
  // reveals the note text in the shared tooltip.
  function rebuildNotes() {
    notesEl.innerHTML = '';
    noteMap = {};
    cy.nodes('[group="entity"]').forEach((node) => {
      if (!(node.data('note') || '').trim()) {
        return;
      }
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'note-badge';
      badge.setAttribute('aria-label', 'Show note');
      badge.innerHTML = icon('sticky-note');
      badge.addEventListener('mouseenter', () => showNote(node.id()));
      badge.addEventListener('mouseleave', hideNote);
      badge.addEventListener('click', (evt) => { evt.stopPropagation(); showNote(node.id()); });
      notesEl.appendChild(badge);
      noteMap[node.id()] = badge;
    });
    positionNotes();
  }

  function positionNotes() {
    const zoom = cy.zoom();
    const tooSmall = zoom < 0.35;
    const size = Math.max(15, 17 * zoom);
    Object.keys(noteMap).forEach((id) => {
      const node = cy.getElementById(id);
      const badge = noteMap[id];
      if (node.empty() || node.hasClass('hidden') || node.hasClass('faded') || tooSmall) {
        badge.style.display = 'none';
        return;
      }
      const bb = node.renderedBoundingBox();
      badge.style.display = 'flex';
      badge.style.width = size + 'px';
      badge.style.height = size + 'px';
      badge.style.left = (bb.x2 - size * 0.55) + 'px';
      badge.style.top = (bb.y1 - size * 0.45) + 'px';
    });
  }

  function showNote(id) {
    const badge = noteMap[id];
    const node = cy.getElementById(id);
    if (!badge || node.empty()) {
      return;
    }
    const tooltip = $('tooltip');
    const wrap = document.createElement('div');
    wrap.className = 'tooltip__note';
    wrap.textContent = node.data('note') || '';
    tooltip.innerHTML = '';
    tooltip.appendChild(wrap);
    tooltip.hidden = false;
    tooltip.style.left = (parseFloat(badge.style.left) + parseFloat(badge.style.width) + 6) + 'px';
    tooltip.style.top = (parseFloat(badge.style.top) + parseFloat(badge.style.height)) + 'px';
  }

  function hideNote() {
    $('tooltip').hidden = true;
  }

  function applyColor(type, color) {
    activeColors[type] = color;
    cy.nodes('[group="entity"][entityType="' + type + '"]').style('background-color', color);
    settings.colors = settings.colors || {};
    settings.colors[type] = color;
    saveSettings();
    if (window.__nexus) {
      window.__nexus.colors = { ...activeColors };
    }
    bump();
  }

  function resetColors() {
    delete settings.colors;
    saveSettings();
    TYPE_ORDER.forEach((type) => {
      activeColors[type] = DEFAULT_COLORS[type];
      cy.nodes('[group="entity"][entityType="' + type + '"]').style('background-color', DEFAULT_COLORS[type]);
    });
    if (window.__nexus) {
      window.__nexus.colors = { ...activeColors };
    }
    bump();
  }

  function searchHighlight(term) {
    cy.elements().addClass('faded');
    const matches = cy.nodes('[group="entity"]').filter((n) => (n.data('label') + ' ' + n.data('bundle')).toLowerCase().indexOf(term) !== -1);
    if (matches.empty()) {
      return;
    }
    matches.union(matches.closedNeighborhood().closedNeighborhood()).removeClass('faded');

    // Bring the match into view: a lone hit gets centred and zoomed in, several
    // hits are framed together so they all land in the viewport.
    if (matches.length === 1) {
      cy.animate({ center: { eles: matches }, zoom: Math.min(1.2, cy.maxZoom()) }, { duration: 350 });
    }
    else {
      cy.animate({ fit: { eles: matches, padding: 100 } }, { duration: 350 });
    }
  }

  cy.on('zoom', () => {
    $('zoom-level').textContent = Math.round(cy.zoom() * 100) + '%';
  });

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
  cy.on('tap', 'node[group="proxy"]', (evt) => {
    if (window.__nexusBuild) {
      return;
    }
    focusEntity(evt.target.data('target'));
  });
  cy.on('render', () => {
    if (captionRaf) {
      return;
    }
    captionRaf = true;
    requestAnimationFrame(() => {
      captionRaf = false;
      positionCaptions();
      positionNotes();
    });
  });
  let captionRaf = false;

  const controller = {
    cy,
    refresh, runLayout, applyLayout, clearFocus, focusEntity, focusField, rebuildCaptions, rebuildNotes, searchHighlight, applyColor, resetColors,
    applyTheme: () => { cy.style(style()); positionCaptions(); },
    typeLabel,
    colorFor: entityColor,
    allTypes: () => TYPE_ORDER.slice(),
    entities: () => cy.nodes('[group="entity"]').map((e) => ({ id: e.id(), label: e.data('label'), entityType: e.data('entityType'), fieldCount: cy.nodes('[group="field"][entity="' + e.id() + '"]').length })),
    records: () => cy.nodes('[group="field"]').map((f) => {
      const owner = cy.getElementById(f.data('entity'));
      const refs = f.connectedEdges('[group="ref"]').filter((e) => e.source().id() === f.id()).map((e) => {
        const target = cy.getElementById(e.target().id());
        return { id: e.target().id(), label: target.nonempty() ? target.data('label') : e.target().id() };
      });
      return { entityId: f.data('entity'), entity: owner.nonempty() ? owner.data('label') : f.data('entity'), entityType: owner.nonempty() ? owner.data('entityType') : '', field: f.data('label'), name: f.data('name') || '', type: f.data('fieldType'), kind: f.data('kind'), cardinality: f.data('cardinality') != null ? f.data('cardinality') : 1, required: !!f.data('required'), refs: refs };
    }),
    presentTypes: () => TYPE_ORDER.filter((t) => cy.nodes('[group="entity"][entityType="' + t + '"]').nonempty()).map((t) => ({ type: t, label: typeLabel(t), color: entityColor(t), visible: typeVisible[t] !== false })),
    setTypeVisible: (type, vis) => { typeVisible[type] = vis; refresh(true); bump(); },
  };
  setController(controller);

  // Reset the toolbar view state for this render; the panel layout persists
  // across renders and sessions, so it is deliberately left untouched here.
  $('fields-toggle').classList.add('is-active');
  $('proxy-toggle').classList.add('is-active');
  $('layout-toggle').querySelector('.layout-label').textContent = 'Layout: LR';
  $('machine-names').classList.add('is-active');
  $('search').value = '';
  closeInspector();

  return controller;
}

function wire() {
  $('zoom-in').addEventListener('click', () => ctx.cy.zoom({ level: ctx.cy.zoom() * 1.25, renderedPosition: { x: ctx.cy.width() / 2, y: ctx.cy.height() / 2 } }));
  $('zoom-out').addEventListener('click', () => ctx.cy.zoom({ level: ctx.cy.zoom() * 0.8, renderedPosition: { x: ctx.cy.width() / 2, y: ctx.cy.height() / 2 } }));
  $('fit').addEventListener('click', () => ctx.cy.fit(undefined, 45));
  $('reset').addEventListener('click', () => { ctx.clearFocus(); ctx.cy.fit(undefined, 45); });
  $('tidy').addEventListener('click', () => ctx.runLayout());

  $('zoom-menu').addEventListener('sl-select', (evt) => {
    const value = evt.detail.item.value;
    if (value === 'fit') {
      ctx.cy.fit(undefined, 45);
      return;
    }
    ctx.cy.zoom({ level: parseFloat(value), renderedPosition: { x: ctx.cy.width() / 2, y: ctx.cy.height() / 2 } });
  });

  $('fields-toggle').addEventListener('click', (evt) => {
    fieldsMode = !fieldsMode;
    evt.target.classList.toggle('is-active', fieldsMode);
    ctx.clearFocus();
    ctx.refresh(true);
  });

  $('proxy-toggle').addEventListener('click', (evt) => {
    proxyMode = !proxyMode;
    evt.target.classList.toggle('is-active', proxyMode);
    if (proxyMode && !fieldsMode) {
      fieldsMode = true;
      $('fields-toggle').classList.add('is-active');
    }
    ctx.clearFocus();
    ctx.refresh(true);
  });

  $('layout-toggle').addEventListener('click', () => {
    rankDir = rankDir === 'LR' ? 'TB' : 'LR';
    $('layout-toggle').querySelector('.layout-label').textContent = 'Layout: ' + rankDir;
    ctx.runLayout();
  });

  $('machine-names').addEventListener('click', (evt) => {
    showMachineNames = !showMachineNames;
    evt.target.classList.toggle('is-active', showMachineNames);
    ctx.rebuildCaptions();
  });

  $('search').addEventListener('sl-input', (evt) => {
    const term = evt.target.value.trim().toLowerCase();
    if (!term) {
      ctx.clearFocus();
      return;
    }
    ctx.searchHighlight(term);
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
  ctx.rebuildCaptions();
  ctx.rebuildNotes();
  window.__nexus = { cy: ctx.cy, model, colors: { ...activeColors }, applyTheme: ctx.applyTheme };
  return ctx;
}
