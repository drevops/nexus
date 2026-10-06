/**
 * Nexus diagram renderer.
 *
 * render(model) draws a { meta, nodes, edges } model with Cytoscape.js,
 * mapping each element to the diagram's visual language. The model has the
 * shape that ContentModel.toArray() returns.
 *
 * Each render shows fields, proxies and machine names, and the toolbar
 * toggles each of them. Hiding fields collapses the diagram to an
 * entity-only overview.
 *
 * The proxies and the overview's collapsed edges are derived from the ref
 * edges (see src/references.js). The controller's syncReferences() brings
 * them in line with a changed graph.
 *
 * The toolbar's layout menu picks the layout that each layout run uses (see
 * LAYOUTS), and localStorage keeps the pick for later diagrams.
 *
 * The controller that render() returns sets entity type colours and symbols
 * and adds or removes custom entity types, saving each change to
 * localStorage.
 *
 * Safe to call repeatedly - each call tears down the previous graph.
 */

import { setController, bump, closeInspector } from './store.js';
import { icon } from './icons.js';
import { ENTITY_TYPE_ORDER, findEntityType } from './entity-types.js';
import { humanize, machineName } from './names.js';
import { REFERENCE_ELEMENTS, syncReferenceElements } from './references.js';
import { fitWidth, wrapLabel } from './label-fit.js';
import { checkpoint, untracked } from './undo.js';
import { packColumns, tidyColumns } from './packing.js';
import { $ } from './dom.js';

// A small library of UML-ish node shapes, keyed for settings/persistence; the
// value is the Cytoscape shape that draws it.
const SYMBOLS = {
  rounded: { shape: 'round-rectangle', label: 'Rounded rectangle' },
  rectangle: { shape: 'rectangle', label: 'Rectangle' },
  ellipse: { shape: 'ellipse', label: 'Ellipse' },
  diamond: { shape: 'diamond', label: 'Diamond' },
  hexagon: { shape: 'hexagon', label: 'Hexagon' },
  tag: { shape: 'tag', label: 'Tag' },
  barrel: { shape: 'barrel', label: 'Barrel' },
  cut: { shape: 'cut-rectangle', label: 'Cut rectangle' },
  rhomboid: { shape: 'rhomboid', label: 'Parallelogram' },
  pentagon: { shape: 'pentagon', label: 'Pentagon' },
  octagon: { shape: 'octagon', label: 'Octagon' },
};

const FALLBACK_COLOR = '#eceff3';
const FALLBACK_SYMBOL = 'rounded';

const SETTINGS_KEY = 'nexusSettings';

// columnSep and islandSep space the islands that a packed layout stacks in
// columns.
const LAYOUT_SPACING = {
  fields: { nodeSep: 10, rankSep: 62, columnSep: 96, islandSep: 40 },
  overview: { nodeSep: 34, rankSep: 120, columnSep: 160, islandSep: 60 },
};

// The layouts the toolbar's layout menu offers, in menu order and keyed by
// menu item value. The label names the layout on the button and the name in
// the menu. A packed layout runs Dagre on each island of connected nodes on
// its own and then stacks the islands in columns that fill the canvas.
const LAYOUTS = {
  lr: { label: 'LR', name: 'Left to right (LR)', title: 'Lay the diagram out left to right', rankDir: 'LR', packed: false },
  tb: { label: 'TB', name: 'Top to bottom (TB)', title: 'Lay the diagram out top to bottom', rankDir: 'TB', packed: false },
  columns: { label: 'Columns', name: 'Columns', title: 'Stack the entities in columns that fill the screen', rankDir: 'LR', packed: true },
};

const DEFAULT_LAYOUT = 'columns';

// Cytoscape's default label font, pinned so canvas measurement matches the
// labels Cytoscape draws.
const LABEL_FONT_FAMILY = 'Helvetica Neue, Helvetica, sans-serif';

// Model-space label and box metrics of entity and field nodes. The inset is
// the clearance between a text line and a slanted or curved edge. Box sizes
// stay on a quarter-pixel grid, so layout arithmetic is exact and a repeated
// layout gives identical positions.
const ENTITY_BOX = { fontSize: 12, fontWeight: 600, lineHeight: 1.25, textMaxWidth: 160, padding: 10, border: 1.5, inset: 3 };
const FIELD_BOX = { fontSize: 10, fontWeight: 'normal', padding: 7, border: 1 };

// Model-space caption metrics: the font size, the height of 1 caption line
// and the gap between a node's box and its first machine-name line.
const CAPTION_SIZE = 10;
const CAPTION_LINE = 12;
const CAPTION_GAP = 6;

const NAME_CAPTION = 'caption';
const TYPE_CAPTION = 'caption caption--type';

let settings = loadSettings();
const activeColors = {};
const activeSymbols = {};

let measureContext = null;
const textWidths = new Map();
const captionStyles = {};

let fieldsMode = false;
let proxyMode = false;
let layoutName = Object.hasOwn(LAYOUTS, settings.layout) ? settings.layout : DEFAULT_LAYOUT;
let showMachineNames = false;
let typeVisible = {};

let controller = null;
let wired = false;

function loadSettings() {
  try {
    return JSON.parse(window.localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSettings() {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (e.g. private mode); fall back to in-memory.
  }
}

function initColors() {
  allTypeKeys().forEach((type) => {
    const builtIn = findEntityType(type);
    activeColors[type] = (settings.colors && settings.colors[type]) || (builtIn ? builtIn.color : FALLBACK_COLOR);
    activeSymbols[type] = (settings.symbols && settings.symbols[type]) || (builtIn ? builtIn.symbol : FALLBACK_SYMBOL);
  });
}

function customTypes() {
  return Array.isArray(settings.customTypes) ? settings.customTypes : [];
}

function allTypeKeys() {
  return ENTITY_TYPE_ORDER.concat(customTypes().map((t) => t.type));
}

function entityShape(entityType) {
  return (SYMBOLS[activeSymbols[entityType]] || SYMBOLS[FALLBACK_SYMBOL]).shape;
}

function symbolSvg(key, color, size) {
  const w = size || 26;
  const h = Math.round(w * 0.72);
  const s = '#5b6470';
  const shapes = {
    rounded: '<rect x="2" y="3" width="' + (w - 4) + '" height="' + (h - 6) + '" rx="4" fill="' + color + '" stroke="' + s + '"/>',
    rectangle: '<rect x="2" y="3" width="' + (w - 4) + '" height="' + (h - 6) + '" fill="' + color + '" stroke="' + s + '"/>',
    ellipse: '<ellipse cx="' + w / 2 + '" cy="' + h / 2 + '" rx="' + (w / 2 - 2) + '" ry="' + (h / 2 - 3) + '" fill="' + color + '" stroke="' + s + '"/>',
    diamond:
      '<polygon points="' + w / 2 + ',2 ' + (w - 2) + ',' + h / 2 + ' ' + w / 2 + ',' + (h - 2) + ' 2,' + h / 2 + '" fill="' + color + '" stroke="' + s + '"/>',
    hexagon:
      '<polygon points="' +
      w * 0.26 +
      ',3 ' +
      w * 0.74 +
      ',3 ' +
      (w - 2) +
      ',' +
      h / 2 +
      ' ' +
      w * 0.74 +
      ',' +
      (h - 3) +
      ' ' +
      w * 0.26 +
      ',' +
      (h - 3) +
      ' 2,' +
      h / 2 +
      '" fill="' +
      color +
      '" stroke="' +
      s +
      '"/>',
    tag:
      '<polygon points="2,3 ' +
      w * 0.72 +
      ',3 ' +
      (w - 2) +
      ',' +
      h / 2 +
      ' ' +
      w * 0.72 +
      ',' +
      (h - 3) +
      ' 2,' +
      (h - 3) +
      '" fill="' +
      color +
      '" stroke="' +
      s +
      '"/>',
    barrel:
      '<path d="M4,6 Q' +
      w / 2 +
      ',1 ' +
      (w - 4) +
      ',6 L' +
      (w - 4) +
      ',' +
      (h - 6) +
      ' Q' +
      w / 2 +
      ',' +
      (h - 1) +
      ' 4,' +
      (h - 6) +
      ' Z" fill="' +
      color +
      '" stroke="' +
      s +
      '"/>',
    cut:
      '<polygon points="7,3 ' +
      (w - 7) +
      ',3 ' +
      (w - 2) +
      ',8 ' +
      (w - 2) +
      ',' +
      (h - 8) +
      ' ' +
      (w - 7) +
      ',' +
      (h - 3) +
      ' 7,' +
      (h - 3) +
      ' 2,' +
      (h - 8) +
      ' 2,8" fill="' +
      color +
      '" stroke="' +
      s +
      '"/>',
    rhomboid:
      '<polygon points="' + w * 0.2 + ',3 ' + (w - 2) + ',3 ' + w * 0.8 + ',' + (h - 3) + ' 2,' + (h - 3) + '" fill="' + color + '" stroke="' + s + '"/>',
    pentagon:
      '<polygon points="' +
      w / 2 +
      ',2 ' +
      (w - 2) +
      ',' +
      h * 0.42 +
      ' ' +
      w * 0.8 +
      ',' +
      (h - 3) +
      ' ' +
      w * 0.2 +
      ',' +
      (h - 3) +
      ' 2,' +
      h * 0.42 +
      '" fill="' +
      color +
      '" stroke="' +
      s +
      '"/>',
    octagon:
      '<polygon points="' +
      w * 0.3 +
      ',3 ' +
      w * 0.7 +
      ',3 ' +
      (w - 2) +
      ',' +
      h * 0.35 +
      ' ' +
      (w - 2) +
      ',' +
      h * 0.65 +
      ' ' +
      w * 0.7 +
      ',' +
      (h - 3) +
      ' ' +
      w * 0.3 +
      ',' +
      (h - 3) +
      ' 2,' +
      h * 0.65 +
      ' 2,' +
      h * 0.35 +
      '" fill="' +
      color +
      '" stroke="' +
      s +
      '"/>',
  };
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + (shapes[key] || shapes[FALLBACK_SYMBOL]) + '</svg>';
}

function typeLabel(entityType) {
  const custom = customTypes().find((t) => t.type === entityType);
  if (custom) {
    return custom.label || humanize(entityType);
  }
  const builtIn = findEntityType(entityType);
  return builtIn ? builtIn.label : humanize(entityType);
}

function entityColor(entityType) {
  return activeColors[entityType] || FALLBACK_COLOR;
}

function esc(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"]/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function overlaps(a, b) {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

// The elements without the 'hidden' class, with their style brought up to
// date. Cytoscape restyles an element after a class change only later, so
// until then :visible and the element's size reflect its old class.
function shown(elements) {
  const current = elements.not('.hidden');
  current.cleanStyle();

  return current;
}

// Width of text in a CSS font, rounded up the way Cytoscape measures labels.
// Every restyle measures the same labels again, so widths are cached.
function textWidth(text, font) {
  const key = font + '\n' + text;

  if (!textWidths.has(key)) {
    if (!measureContext) {
      measureContext = document.createElement('canvas').getContext('2d');
    }
    measureContext.font = font;
    textWidths.set(key, Math.ceil(measureContext.measureText(text).width));
  }

  return textWidths.get(key);
}

// The canvas font Cytoscape draws a label in for the given box metrics.
function labelFont(box) {
  return 'normal ' + box.fontWeight + ' ' + box.fontSize + 'px ' + LABEL_FONT_FAMILY;
}

// The canvas font and horizontal padding of a caption line at zoom 1, read
// from the stylesheet through a probe caption.
function captionStyle(cls) {
  if (!captionStyles[cls]) {
    const probe = document.createElement('div');
    probe.className = cls;
    $('captions').appendChild(probe);
    const computed = getComputedStyle(probe);
    captionStyles[cls] = {
      font: computed.fontStyle + ' ' + computed.fontWeight + ' ' + CAPTION_SIZE + 'px ' + computed.fontFamily,
      padding: parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight),
    };
    probe.remove();
  }

  return captionStyles[cls];
}

// Model-space width of a caption line, padding included.
function captionWidth(text, cls) {
  const style = captionStyle(cls);

  return textWidth(text, style.font) + style.padding;
}

function fieldLabel(ele) {
  return ele.data('required') ? ele.data('label') + ' *' : ele.data('label');
}

// The text lines of an entity box and half the box's height. Each line has
// its width and the offsets of its top and bottom from the box centre: the
// name lines as Cytoscape wraps them, then the type caption on the label's
// blank last line.
function entityLines(ele) {
  const font = labelFont(ENTITY_BOX);
  const names = wrapLabel(ele.data('label'), ENTITY_BOX.textMaxWidth, (text) => textWidth(text, font));
  const pitch = ENTITY_BOX.fontSize * ENTITY_BOX.lineHeight;
  const labelBottom = (ENTITY_BOX.fontSize + names.length * pitch) / 2;
  const lines = names.map((name, i) => {
    const bottom = labelBottom - (names.length - i) * pitch;

    return { width: textWidth(name, font), top: bottom - ENTITY_BOX.fontSize, bottom: bottom };
  });
  const typeCentre = labelBottom - ENTITY_BOX.fontSize / 2;
  const typeWidth = captionWidth(typeLabel(ele.data('entityType')), TYPE_CAPTION);
  lines.push({ width: typeWidth, top: typeCentre - CAPTION_LINE / 2, bottom: typeCentre + CAPTION_LINE / 2 });

  return { lines: lines, halfHeight: labelBottom + ENTITY_BOX.padding };
}

// Model-space width of the text area of an entity box, wide enough for every
// line to fit inside the entity's shape. It is rounded up to a whole pixel to
// stay on the box grid.
function entityTextWidth(ele) {
  const box = entityLines(ele);

  return Math.ceil(fitWidth(box.lines, entityShape(ele.data('entityType')), box.halfHeight, ENTITY_BOX.padding, ENTITY_BOX.inset));
}

// Model-space outer width of an entity or field box.
function boxWidth(ele) {
  if (ele.data('group') === 'entity') {
    return entityTextWidth(ele) + 2 * ENTITY_BOX.padding + ENTITY_BOX.border;
  }

  return textWidth(fieldLabel(ele), labelFont(FIELD_BOX)) + 2 * FIELD_BOX.padding + FIELD_BOX.border;
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

// The room a node's machine-name caption takes below and beside its box, as
// a bounds-expansion value.
function captionFootprint(ele) {
  const name = showMachineNames ? machineNameOf(ele) : '';

  if (!name) {
    return 0;
  }

  const side = Math.max(0, (captionWidth(name, NAME_CAPTION) - boxWidth(ele)) / 2);

  return [0, side, CAPTION_GAP + CAPTION_LINE, side];
}

function buildElements(model) {
  const nodes = model.nodes || [];
  const ids = new Set(nodes.map((n) => n.data.id));
  const edges = (model.edges || []).filter((e) => ids.has(e.data.source) && ids.has(e.data.target));

  return { nodes: nodes, edges: edges };
}

function themeColors() {
  const dark = document.documentElement.classList.contains('sl-theme-dark');
  if (dark) {
    return {
      text: '#e4e7ec',
      muted: '#9aa4b2',
      nodeBorder: '#8a94a3',
      fieldBg: '#2b3039',
      fieldBorder: '#7b8494',
      edge: '#5a636f',
      refEdge: '#8a94a3',
      labelBg: '#22262d',
    };
  }
  return {
    text: '#1f2933',
    muted: '#6b7280',
    nodeBorder: '#5b6470',
    fieldBg: '#ffffff',
    fieldBorder: '#555c66',
    edge: '#aeb4bd',
    refEdge: '#8a94a3',
    labelBg: '#f4f5f7',
  };
}

function style() {
  const tc = themeColors();
  return [
    {
      selector: 'node[group="entity"]',
      style: {
        shape: (ele) => entityShape(ele.data('entityType')),
        'background-color': (ele) => entityColor(ele.data('entityType')),
        'border-color': tc.nodeBorder,
        'border-width': ENTITY_BOX.border,
        // Cytoscape labels take a single style, so positionCaptions() draws the
        // type caption on a blank last line reserved here. The line holds a
        // zero-width space, which survives the trim Cytoscape applies to labels.
        label: (ele) => ele.data('label') + '\n\u200b',
        'text-wrap': 'wrap',
        'text-max-width': ENTITY_BOX.textMaxWidth,
        'text-valign': 'center',
        'text-halign': 'center',
        'font-family': LABEL_FONT_FAMILY,
        'font-size': ENTITY_BOX.fontSize,
        'font-weight': ENTITY_BOX.fontWeight,
        'line-height': ENTITY_BOX.lineHeight,
        color: '#1f2933',
        width: (ele) => entityTextWidth(ele),
        height: 'label',
        padding: ENTITY_BOX.padding + 'px',
      },
    },
    {
      selector: 'node[group="field"]',
      style: {
        shape: 'ellipse',
        'background-color': tc.fieldBg,
        'border-color': tc.fieldBorder,
        'border-width': FIELD_BOX.border,
        label: (ele) => fieldLabel(ele),
        'text-valign': 'center',
        'text-halign': 'center',
        'font-family': LABEL_FONT_FAMILY,
        'font-size': FIELD_BOX.fontSize,
        'font-weight': FIELD_BOX.fontWeight,
        color: tc.text,
        width: 'label',
        height: 'label',
        padding: FIELD_BOX.padding + 'px',
      },
    },
    // Bounding boxes cover the machine-name caption, so layouts, Fit and proxy
    // placement keep other nodes off it.
    { selector: 'node[group="entity"], node[group="field"]', style: { 'bounds-expansion': (ele) => captionFootprint(ele) } },
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
        shape: (ele) => entityShape(ele.data('entityType')),
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
      style: {
        'line-color': '#c2c8d0',
        'line-style': 'dashed',
        width: 1,
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#c2c8d0',
        'arrow-scale': 0.8,
      },
    },
    { selector: 'node[group="annotation"][kind="event"]', style: { shape: 'diamond' } },
    { selector: 'node[group="annotation"][kind="api"]', style: { shape: 'hexagon' } },
    { selector: 'node[group="annotation"][kind="callback"]', style: { shape: 'round-rectangle', 'font-weight': 600, padding: '9px' } },
    {
      selector: 'edge',
      style: {
        'curve-style': 'taxi',
        'taxi-direction': () => (LAYOUTS[layoutName].rankDir === 'TB' ? 'vertical' : 'horizontal'),
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

function fieldReferences(field) {
  return field.outgoers('edge[group="ref"]').map((edge) => edge.target().data('label') ?? edge.target().id());
}

function tooltipHtml(node) {
  const group = node.data('group');
  const name = esc(node.data('label'));

  if (group === 'entity') {
    return (
      '<div class="tooltip__name">' +
      name +
      '</div>' +
      '<div class="tooltip__meta">' +
      esc(typeLabel(node.data('entityType'))) +
      ' · ' +
      esc(node.data('bundle')) +
      '</div>'
    );
  }

  if (group === 'field') {
    const meta = [humanize(node.data('kind')) + ' field', esc(node.data('fieldType'))];
    const refs = fieldReferences(node);
    if (refs.length) {
      meta.push('→ ' + esc(refs.join(', ')));
    }
    return '<div class="tooltip__name">' + name + '</div><div class="tooltip__meta">' + meta.join(' · ') + '</div>';
  }

  const extra = node.data('method') ? ' · ' + esc(node.data('method')) : '';
  return '<div class="tooltip__name">' + name + '</div><div class="tooltip__meta">' + esc(humanize(node.data('kind'))) + extra + '</div>';
}

function buildController(model, options = {}) {
  typeVisible = {};
  fieldsMode = true;
  proxyMode = true;
  showMachineNames = true;
  initColors();
  if (Array.isArray(options.customTypes) && options.customTypes.length) {
    const known = new Set(customTypes().map((t) => t.type));
    settings.customTypes = customTypes().concat(options.customTypes.filter((t) => t && t.type && !known.has(t.type)));
  }
  if (options.colors) {
    Object.assign(activeColors, options.colors);
  }
  if (options.symbols) {
    Object.assign(activeSymbols, options.symbols);
  }

  const elements = buildElements(model);
  ENTITY_TYPE_ORDER.forEach((t) => {
    typeVisible[t] = true;
  });

  const cy = window.cytoscape({
    container: $('cy'),
    elements: elements,
    style: style(),
    minZoom: 0.05,
    maxZoom: 3,
    layout: { name: 'grid' },
  });
  syncReferenceElements(cy);

  const captionsEl = $('captions');
  let captionMap = {};
  const notesEl = $('notes');
  let noteMap = {};

  function entityTypeOf(entityId) {
    const entity = cy.getElementById(entityId);

    return entity.nonempty() ? entity.data('entityType') : null;
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

  function edgeVisible(edge) {
    const group = edge.data('group');
    const ends = !edge.source().hasClass('hidden') && !edge.target().hasClass('hidden');

    if (group === 'has') {
      return fieldsMode && ends;
    }

    if (group === 'ref') {
      return fieldsMode && !proxyMode && ends;
    }

    if (group === 'proxyedge') {
      return fieldsMode && proxyMode && ends;
    }

    if (group === 'collapsed') {
      return !fieldsMode && ends;
    }

    return ends;
  }

  // An edge is shown only while both of its ends are, so nodes are updated
  // first.
  function applyVisibility(elements) {
    elements.nodes().forEach((node) => node.toggleClass('hidden', !nodeVisible(node)));
    elements.edges().forEach((edge) => edge.toggleClass('hidden', !edgeVisible(edge)));
  }

  function refresh(relayout) {
    applyVisibility(cy.elements());
    if (relayout) {
      runLayout();
    }
  }

  // The default view is 100%, centred on the diagram. Fitting the whole graph
  // is left to the explicit Fit control and the zoom dropdown.
  function resetView() {
    cy.zoom(1);
    cy.center();
  }

  // The Dagre options for the picked layout, and the gap between the islands
  // that packIslands() and tidy() line up.
  function layoutSettings() {
    const spacing = fieldsMode ? LAYOUT_SPACING.fields : LAYOUT_SPACING.overview;
    const options = {
      name: 'dagre',
      rankDir: LAYOUTS[layoutName].rankDir,
      ranker: 'network-simplex',
      nodeSep: spacing.nodeSep,
      edgeSep: 6,
      rankSep: spacing.rankSep,
      nodeDimensionsIncludeLabels: true,
      animate: false,
    };

    return { options: options, gap: { x: spacing.columnSep, y: spacing.islandSep } };
  }

  function runLayout() {
    const { options, gap } = layoutSettings();
    const elements = shown(cy.elements());

    if (LAYOUTS[layoutName].packed) {
      packIslands(elements, options, gap);
    } else {
      elements.layout(options).run();
    }

    resetView();
    positionCaptions();
    positionNotes();
  }

  // Lays each island out on its own again and lines the islands up in
  // columns near where they were (see tidyColumns()). The view stays put.
  function tidy() {
    const { options, gap } = layoutSettings();
    const islands = layIslandsOut(shown(cy.elements()), options);
    const boxes = islands.map((entry) => ({ x: entry.before.x1, y: entry.before.y1, w: entry.box.w, h: entry.box.h }));

    placeIslands(islands, tidyColumns(boxes, gap).positions);
    positionCaptions();
    positionNotes();
  }

  // A comparator that orders entities by the place of their type in the
  // diagram's type list, then by label.
  function entityOrder() {
    const types = allTypeKeys();
    const rank = (entity) => {
      const index = types.indexOf(entity.data('entityType'));

      return index === -1 ? types.length : index;
    };

    return (a, b) => rank(a) - rank(b) || String(a.data('label')).localeCompare(String(b.data('label')));
  }

  // Runs Dagre on each island of connected elements on its own. Each entry
  // holds the island and its box before and after the run.
  function layIslandsOut(elements, options) {
    return elements.components().map((island) => {
      const before = island.boundingBox();
      island.layout({ ...options, fit: false }).run();

      return { island: island, before: before, box: island.boundingBox() };
    });
  }

  // Moves each island so its box starts at the matching position.
  function placeIslands(islands, positions) {
    islands.forEach((entry, index) => {
      const { x, y } = positions[index];
      entry.island.nodes().shift({ x: x - entry.box.x1, y: y - entry.box.y1 });
    });
  }

  // Lays each island out on its own, then stacks the islands in columns
  // shaped like the canvas. An island takes the place of its first entity in
  // entityOrder().
  function packIslands(elements, options, gap) {
    const compare = entityOrder();
    const lead = (island) => island.nodes('[group="entity"]').sort(compare).first();
    const islands = layIslandsOut(elements, options).map((entry) => ({ ...entry, lead: lead(entry.island) }));

    // An island with no entity, such as a lone note, goes last.
    islands.sort((a, b) => (a.lead.empty() || b.lead.empty() ? b.lead.length - a.lead.length : compare(a.lead, b.lead)));

    const boxes = islands.map((entry) => entry.box);
    placeIslands(islands, packColumns(boxes, { w: cy.width(), h: cy.height() }, gap).positions);
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
    // A saved layout leaves out hidden proxies (see documentFromGraph()).
    placeProxies(cy.nodes('[group="proxy"]').filter((proxy) => !layout[proxy.id()]));
    resetView();
    positionCaptions();
    positionNotes();
  }

  // Places each visible proxy in the free slot of its field's proxy column
  // nearest the field, clear of every other visible node. A hidden proxy is
  // left to the layout run that shows it.
  function placeProxies(proxies) {
    const placing = shown(proxies);
    if (placing.empty()) {
      return;
    }

    const taken = shown(cy.nodes())
      .difference(placing)
      .map((node) => node.boundingBox());
    placing.forEach((proxy) => {
      const field = proxy.incomers('node');
      const x = proxyColumn(field, proxy, placing);
      const y = field.position('y');
      // The taken boxes are bounding boxes, which extend past the outer size,
      // so the slot is measured the same way.
      const { w: width, h: height } = proxy.boundingBox();
      const step = height + LAYOUT_SPACING.fields.nodeSep;
      const slotBox = (dy) => ({ x1: x - width / 2, x2: x + width / 2, y1: y + dy - height / 2, y2: y + dy + height / 2 });
      let offset = 0;

      // Offsets alternate below and above the field (0, +1, -1, +2, -2...
      // steps), so its proxies centre on it.
      while (taken.some((other) => overlaps(other, slotBox(offset)))) {
        offset = offset > 0 ? -offset : step - offset;
      }

      proxy.position({ x: x, y: y + offset });
      taken.push(slotBox(offset));
    });
  }

  // A field's placed proxies fix its column. Otherwise the column clears the
  // widest of the entity's fields stacked with this one, so no proxy is drawn
  // beside another field.
  function proxyColumn(field, proxy, placing) {
    const placed = shown(field.outgoers('node[group="proxy"]')).difference(placing);
    if (placed.nonempty()) {
      return placed.first().position('x');
    }

    const entity = cy.getElementById(field.data('entity'));
    const sideOf = (node) => (node.position('x') < entity.position('x') ? -1 : 1);
    const side = sideOf(field);
    const own = field.boundingBox();
    const stack = cy.nodes('[group="field"][entity="' + entity.id() + '"]').filter((peer) => {
      const box = peer.boundingBox();
      return sideOf(peer) === side && box.x1 < own.x2 && own.x1 < box.x2;
    });
    const box = stack.boundingBox();
    const edge = side > 0 ? box.x2 : box.x1;

    return edge + side * (LAYOUT_SPACING.fields.rankSep + proxy.outerWidth() / 2);
  }

  // Brings the reference elements in line with the ref edges and places each
  // new proxy beside its field. Only reference elements and ref edges are
  // re-filtered, so entities and fields keep their visibility.
  function syncReferences(renames) {
    const added = syncReferenceElements(cy, renames);

    applyVisibility(cy.elements(REFERENCE_ELEMENTS).union(cy.edges('[group="ref"]')));
    placeProxies(added);
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

  // Under each node: the entity type (always, de-emphasised) then, when
  // showMachineNames is set, the machine name. Cytoscape labels take a single
  // style, so the differently styled type line is in the HTML caption layer.
  function captionLinesFor(node) {
    const lines = [];
    if (node.data('group') === 'entity') {
      lines.push({ text: typeLabel(node.data('entityType')), cls: TYPE_CAPTION });
    }
    if (showMachineNames) {
      const name = machineNameOf(node);
      if (name) {
        lines.push({ text: name, cls: NAME_CAPTION });
      }
    }
    return lines;
  }

  function addCaptions(node) {
    const lines = captionLinesFor(node);
    if (!lines.length) {
      return;
    }

    captionMap[node.id()] = lines.map((line) => {
      const div = document.createElement('div');
      div.className = line.cls;
      div.dataset.nodeId = node.id();
      div.textContent = line.text;
      captionsEl.appendChild(div);
      return div;
    });
  }

  function removeCaptions(node) {
    const divs = captionMap[node.id()];
    if (!divs) {
      return;
    }

    divs.forEach((div) => div.remove());
    delete captionMap[node.id()];
  }

  function rebuildCaptions() {
    captionsEl.innerHTML = '';
    captionMap = {};
    // captionFootprint() reads showMachineNames, which isn't element data, so
    // Cytoscape restyles only when asked.
    cy.style().update();
    cy.nodes().forEach((node) => addCaptions(node));
    positionCaptions();
    // No Cytoscape frame is drawn here, so no 'render' event fires.
    cy.emit('captions');
  }

  // Below 35% zoom the captions are too small to read.
  function captionsShown(node) {
    return node.nonempty() && !node.hasClass('hidden') && !node.hasClass('faded') && cy.zoom() >= 0.35;
  }

  // Rendered y of a node's box bottom, of the top of its type caption and of
  // the top of the first machine-name line below it. Each line below takes 1
  // step.
  function captionStack(node) {
    const zoom = cy.zoom();
    const boxBottom = node.renderedPosition('y') + node.renderedOuterHeight() / 2;
    // The type caption centres on the blank last line of the entity label,
    // which ends half the border plus the padding above the box bottom.
    const typeCentre = boxBottom - (ENTITY_BOX.border / 2 + ENTITY_BOX.padding + ENTITY_BOX.fontSize / 2) * zoom;

    return { boxBottom: boxBottom, typeTop: typeCentre - (CAPTION_LINE / 2) * zoom, top: boxBottom + CAPTION_GAP * zoom, step: CAPTION_LINE * zoom };
  }

  function positionCaptions() {
    const zoom = cy.zoom();
    // Scale the type with the zoom so captions grow and shrink with the canvas
    // (Cytoscape's own node labels are 12px in model space).
    const size = CAPTION_SIZE * zoom;
    Object.keys(captionMap).forEach((id) => {
      const node = cy.getElementById(id);
      const divs = captionMap[id];
      if (!captionsShown(node)) {
        divs.forEach((div) => {
          div.style.display = 'none';
        });
        return;
      }
      const pos = node.renderedPosition();
      const stack = captionStack(node);
      // Machine-name lines stack below the node. The entity type sits inside
      // the box, so it reads as a sub-label.
      let below = stack.top;
      divs.forEach((div) => {
        div.style.display = 'block';
        div.style.left = pos.x + 'px';
        div.style.fontSize = size + 'px';
        div.style.lineHeight = stack.step + 'px';
        if (div.classList.contains('caption--type')) {
          div.style.top = stack.typeTop + 'px';
        } else {
          div.style.top = below + 'px';
          below += stack.step;
        }
      });
    });
  }

  // Rendered y of the lowest edge drawn for a node: the bottom of its box, or
  // of the last machine-name line shown below it. Null for an unknown id.
  function renderedBottom(id) {
    const node = cy.getElementById(id);
    if (node.empty()) {
      return null;
    }

    const stack = captionStack(node);
    const lines = (captionMap[id] || []).filter((div) => !div.classList.contains('caption--type')).length;
    if (!lines || !captionsShown(node)) {
      return stack.boxBottom;
    }

    return stack.top + lines * stack.step;
  }

  // A note badge sits at an entity's top-right corner; hovering or clicking it
  // reveals the note text in the shared tooltip.
  function addNoteBadge(node) {
    if (node.data('group') === 'proxy' || !(node.data('note') || '').trim()) {
      return;
    }

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'note-badge';
    badge.dataset.nodeId = node.id();
    badge.setAttribute('aria-label', 'Show note');
    badge.innerHTML = icon('sticky-note');
    badge.addEventListener('mouseenter', () => showNote(node.id()));
    badge.addEventListener('mouseleave', hideNote);
    badge.addEventListener('click', (evt) => {
      evt.stopPropagation();
      showNote(node.id());
    });
    notesEl.appendChild(badge);
    noteMap[node.id()] = badge;
  }

  function removeNoteBadge(node) {
    const badge = noteMap[node.id()];
    if (!badge) {
      return;
    }

    badge.remove();
    delete noteMap[node.id()];
  }

  function rebuildNotes() {
    notesEl.innerHTML = '';
    noteMap = {};
    cy.nodes().forEach((node) => addNoteBadge(node));
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
      // The bounding box also covers the machine-name caption, so the corner
      // comes from the box itself.
      const pos = node.renderedPosition();
      badge.style.display = 'flex';
      badge.style.width = size + 'px';
      badge.style.height = size + 'px';
      badge.style.left = pos.x + node.renderedOuterWidth() / 2 - size * 0.55 + 'px';
      badge.style.top = pos.y - node.renderedOuterHeight() / 2 - size * 0.45 + 'px';
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
    tooltip.style.left = parseFloat(badge.style.left) + parseFloat(badge.style.width) + 6 + 'px';
    tooltip.style.top = parseFloat(badge.style.top) + parseFloat(badge.style.height) + 'px';
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
    bump();
  }

  function applySymbol(type, key) {
    activeSymbols[type] = key;
    // The shape and entity width functions read activeSymbols, which isn't
    // element data, so Cytoscape restyles only when asked.
    cy.style().update();
    settings.symbols = settings.symbols || {};
    settings.symbols[type] = key;
    saveSettings();
    bump();
  }

  function resetColors() {
    delete settings.colors;
    delete settings.symbols;
    saveSettings();
    initColors();
    // applyColor sets inline overrides on the nodes; clear them so the
    // stylesheet's default-reading functions take effect again.
    cy.nodes().removeStyle('background-color');
    cy.style(style());
    positionCaptions();
    positionNotes();
    bump();
  }

  function addCustomType(type, label, color, symbol) {
    const key = machineName(type);
    if (!key || allTypeKeys().includes(key)) {
      return null;
    }
    settings.customTypes = customTypes().concat([{ type: key, label: (label || '').trim() || humanize(key) }]);
    settings.colors = { ...(settings.colors || {}), [key]: color || FALLBACK_COLOR };
    settings.symbols = { ...(settings.symbols || {}), [key]: symbol || FALLBACK_SYMBOL };
    activeColors[key] = settings.colors[key];
    activeSymbols[key] = settings.symbols[key];
    saveSettings();
    bump();
    return key;
  }

  function removeCustomType(type) {
    settings.customTypes = customTypes().filter((t) => t.type !== type);
    saveSettings();
    bump();
  }

  function searchHighlight(term) {
    cy.elements().addClass('faded');
    const matches = cy.nodes('[group="entity"]').filter((n) => (n.data('label') + ' ' + n.data('bundle')).toLowerCase().indexOf(term) !== -1);
    if (matches.empty()) {
      return;
    }
    matches.union(matches.closedNeighborhood().closedNeighborhood()).removeClass('faded');

    cy.animate({ center: { eles: matches }, zoom: 1 }, { duration: 350 });
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
    tooltip.style.left = evt.renderedPosition.x + 14 + 'px';
    tooltip.style.top = evt.renderedPosition.y + 14 + 'px';
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

  // rebuildCaptions() and rebuildNotes() only cover nodes present when they
  // run, so these handlers apply later additions and removals to both layers.
  cy.on('add', 'node', (evt) => {
    addCaptions(evt.target);
    addNoteBadge(evt.target);
    positionCaptions();
    positionNotes();
  });
  cy.on('remove', 'node', (evt) => {
    removeCaptions(evt.target);
    removeNoteBadge(evt.target);
  });

  $('fields-toggle').classList.add('is-active');
  $('proxy-toggle').classList.add('is-active');
  $('machine-names').classList.add('is-active');
  $('search').value = '';

  return {
    cy,
    refresh,
    runLayout,
    tidy,
    applyLayout,
    syncReferences,
    resetView,
    clearFocus,
    focusEntity,
    focusField,
    rebuildCaptions,
    rebuildNotes,
    renderedBottom,
    searchHighlight,
    applyColor,
    applySymbol,
    resetColors,
    addCustomType,
    removeCustomType,
    applyTheme: () => {
      cy.style(style());
      positionCaptions();
    },
    typeLabel,
    colorFor: entityColor,
    symbolFor: (type) => activeSymbols[type] || FALLBACK_SYMBOL,
    typeSettings: () => ({ colors: { ...activeColors }, symbols: { ...activeSymbols }, customTypes: customTypes().map((t) => ({ ...t })) }),
    symbolSvg: (key, color, size) => symbolSvg(key, color, size),
    symbolOptions: () => Object.keys(SYMBOLS).map((key) => ({ key: key, label: SYMBOLS[key].label })),
    isCustomType: (type) => customTypes().some((t) => t.type === type),
    allTypes: () => allTypeKeys(),
    entities: () =>
      cy.nodes('[group="entity"]').map((e) => ({
        id: e.id(),
        label: e.data('label'),
        entityType: e.data('entityType'),
        fieldCount: cy.nodes('[group="field"][entity="' + e.id() + '"]').length,
      })),
    records: () =>
      cy.nodes('[group="field"]').map((f) => {
        const owner = cy.getElementById(f.data('entity'));
        const refs = f
          .connectedEdges('[group="ref"]')
          .filter((e) => e.source().id() === f.id())
          .map((e) => {
            const target = cy.getElementById(e.target().id());
            return { id: e.target().id(), label: target.nonempty() ? target.data('label') : e.target().id() };
          });
        return {
          entityId: f.data('entity'),
          entity: owner.nonempty() ? owner.data('label') : f.data('entity'),
          entityType: owner.nonempty() ? owner.data('entityType') : '',
          field: f.data('label'),
          name: f.data('name') || '',
          type: f.data('fieldType'),
          kind: f.data('kind'),
          cardinality: f.data('cardinality') != null ? f.data('cardinality') : 1,
          required: !!f.data('required'),
          refs: refs,
        };
      }),
    presentTypes: () =>
      allTypeKeys()
        .filter((t) => cy.nodes('[group="entity"][entityType="' + t + '"]').nonempty())
        .map((t) => ({ type: t, label: typeLabel(t), color: entityColor(t), symbol: activeSymbols[t] || FALLBACK_SYMBOL, visible: typeVisible[t] !== false })),
    setTypeVisible: (type, vis) => {
      typeVisible[type] = vis;
      untracked(() => refresh(true));
      bump();
    },
  };
}

// Fills the layout menu with an item for each layout, in LAYOUTS order.
function fillLayoutMenu() {
  const items = Object.entries(LAYOUTS).map(([value, layout]) => {
    const item = document.createElement('sl-menu-item');

    item.setAttribute('type', 'checkbox');
    item.setAttribute('value', value);
    item.setAttribute('title', layout.title);
    item.textContent = layout.name;

    return item;
  });

  $('layout-menu').append(...items);
}

// Names the picked layout on the layout button and ticks it in the menu.
function showLayout() {
  const layout = LAYOUTS[layoutName];
  const button = $('layout-run');
  const items = $('layout-menu').querySelectorAll('sl-menu-item');

  button.querySelector('.layout-label').textContent = 'Layout: ' + layout.label;
  // SlButton does not reflect its title property, so set the attribute.
  button.setAttribute('title', layout.title);
  items.forEach((item) => {
    item.checked = item.getAttribute('value') === layoutName;
  });
}

function wire() {
  $('zoom-in').addEventListener('click', () =>
    controller.cy.zoom({ level: controller.cy.zoom() * 1.25, renderedPosition: { x: controller.cy.width() / 2, y: controller.cy.height() / 2 } }),
  );
  $('zoom-out').addEventListener('click', () =>
    controller.cy.zoom({ level: controller.cy.zoom() * 0.8, renderedPosition: { x: controller.cy.width() / 2, y: controller.cy.height() / 2 } }),
  );
  $('fit').addEventListener('click', () => controller.cy.fit(undefined, 45));
  $('reset').addEventListener('click', () => {
    controller.clearFocus();
    controller.resetView();
  });
  $('layout-run').addEventListener('click', () => {
    controller.runLayout();
    checkpoint('Re-ran the ' + LAYOUTS[layoutName].label + ' layout');
  });
  $('tidy').addEventListener('click', () => {
    controller.tidy();
    checkpoint('Tidied the layout');
  });

  fillLayoutMenu();

  // The menu flips a checkbox item on every select, so showLayout() ticks
  // the picked item again even when it was already ticked. Cytoscape caches
  // the edges' taxi direction from style(), so the stylesheet is reapplied
  // before the run. A pick changes the display, so its layout is not a history
  // step, as for the display toggles below.
  $('layout-menu').addEventListener('sl-select', (evt) => {
    layoutName = evt.detail.item.value;
    settings.layout = layoutName;
    saveSettings();
    showLayout();
    controller.cy.style().update();
    untracked(() => controller.runLayout());
  });

  $('zoom-menu').addEventListener('sl-select', (evt) => {
    const value = evt.detail.item.value;
    if (value === 'fit') {
      controller.cy.fit(undefined, 45);
      return;
    }
    controller.cy.zoom({ level: parseFloat(value), renderedPosition: { x: controller.cy.width() / 2, y: controller.cy.height() / 2 } });
  });

  // The display toggles re-run the layout too, but undo reverts edits only,
  // so their layout is not a history step.
  $('fields-toggle').addEventListener('click', (evt) => {
    fieldsMode = !fieldsMode;
    evt.target.classList.toggle('is-active', fieldsMode);
    controller.clearFocus();
    untracked(() => controller.refresh(true));
  });

  $('proxy-toggle').addEventListener('click', (evt) => {
    proxyMode = !proxyMode;
    evt.target.classList.toggle('is-active', proxyMode);
    if (proxyMode && !fieldsMode) {
      fieldsMode = true;
      $('fields-toggle').classList.add('is-active');
    }
    controller.clearFocus();
    untracked(() => controller.refresh(true));
  });

  $('machine-names').addEventListener('click', (evt) => {
    showMachineNames = !showMachineNames;
    evt.target.classList.toggle('is-active', showMachineNames);
    controller.rebuildCaptions();
  });

  function runSearch() {
    const term = $('search').value.trim().toLowerCase();
    if (!term) {
      controller.clearFocus();
      return;
    }
    controller.searchHighlight(term);
  }
  $('search-btn').addEventListener('click', runSearch);
  $('search').addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') {
      runSearch();
    }
  });
  $('search').addEventListener('sl-clear', () => controller.clearFocus());
}

export function render(model, options = {}) {
  if (controller) {
    controller.cy.destroy();
  }

  controller = buildController(model, options);
  setController(controller);
  closeInspector();

  if (!wired) {
    wire();
    wired = true;
  }

  showLayout();

  if (options.layout && Object.keys(options.layout).length) {
    controller.applyLayout(options.layout);
  } else {
    controller.refresh(true);
  }

  controller.rebuildCaptions();
  controller.rebuildNotes();
  window.__nexus = { cy: controller.cy, model };

  return controller;
}
