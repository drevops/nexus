/**
 * Nexus diagram renderer.
 *
 * render(model) draws a { meta, nodes, edges } model with Cytoscape.js,
 * mapping each element to the diagram's visual language. The model has the
 * shape that ContentModel.toArray() returns.
 *
 * Each render starts from the new diagram settings (see
 * src/diagram-defaults.js): the layout and whether fields, proxies and
 * machine names show. The status bar switches toggle the last 3 for the open
 * diagram. Hiding fields collapses the diagram to an entity-only overview.
 *
 * The proxies and the overview's collapsed edges are derived from the ref
 * edges (see src/references.js). The controller's syncReferences() brings
 * them in line with a changed graph.
 *
 * The toolbar's layout menu picks the layout that each layout run of the
 * open diagram uses (see LAYOUTS). Its lines menu picks the line style of
 * every diagram (see src/connection-lines.js).
 *
 * The controller that render() returns sets entity type colours and symbols,
 * adds or removes custom entity types and sets the new diagram settings and
 * the connection lines, saving each change to localStorage.
 *
 * Safe to call repeatedly - each call tears down the previous graph.
 */

import { setController, setComparison, bump, closeInspector, getState, subscribe } from './store.js';
import { icon } from './icons.js';
import { ENTITY_TYPE_ORDER, findEntityType } from './entity-types.js';
import { humanize, machineName } from './names.js';
import { REFERENCE_ELEMENTS, syncReferenceElements } from './references.js';
import { drawnShape, fitWidth, labelDrop, labelX, polygonPoints, wrapLabel } from './label-fit.js';
import { checkpoint, untracked } from './undo.js';
import { applyPartial, describeNode, diffSnapshots, snapshotGraph } from './history.js';
import { CHANGE_ADDED, CHANGE_CHANGED, CHANGE_REMOVED, changeKind, changeMarks, sharedMark } from './model-diff.js';
import { collapsedEdgeId, refEdgeId } from './model.js';
import { DIAGRAM_DEFAULTS, readDiagramDefaults } from './diagram-defaults.js';
import { DETAIL_LEVELS, detailLevel, levelShowsField, levelToShow, nextLevel, showsFields } from './detail-levels.js';
import { keepOrder, packColumns, tidyColumns } from './packing.js';
import { freeArea } from './free-area.js';
import { frameSettings } from './mode-frame.js';
import { readMarkdownSettings } from './markdown.js';
import { checkModel, readCheckSettings } from './model-checks.js';
import { documentFromGraph } from './document.js';
import { LINE_OPTIONS, lineOption, lineStyle, readLineSettings } from './connection-lines.js';
import { canvasGraph } from './diagram-text.js';
import { nodeLookup, selectionEntity } from './inspector-trail.js';
import { parseRichText, richTextHtml } from './rich-text.js';
import { NOTE_KIND } from './annotations.js';
import { noteMarkdownHtml, noteMarkdownPlain } from './note-markdown.js';
import { fieldSharing } from './shared-fields.js';
import { HOVER_DELAY, hoverNeighbourhood, readHoverSettings } from './hover-highlight.js';
import { EXPLORE_DEFAULTS, exploreEntities, readExplore } from './explore.js';
import { SYMBOLS, customTypeList, isHexColor, isSymbol, isTypeName, typeColors, typeSymbols } from './type-styles.js';
import { blendColors, textOn } from './text-contrast.js';
import { $ } from './dom.js';

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

// The Tidy button's title with nothing selected, and the end of its title
// after the name of the entity a selection belongs to.
const TIDY_TITLE = 'Tidy up: straighten each entity, keeping its fields in their order, and line the entities up in columns near where they are';
const TIDY_ENTITY_TITLE = ': straighten it, keeping its fields in their order, and leave the rest of the diagram where it is';

// Cytoscape's default label font, pinned so canvas measurement matches the
// labels Cytoscape draws.
const LABEL_FONT_FAMILY = 'Helvetica Neue, Helvetica, sans-serif';

// Model-space label and box metrics of entity, field and proxy nodes. The
// inset is the clearance between a text line and a slanted or curved edge.
// Box sizes stay on a quarter-pixel grid, so layout arithmetic is exact and a
// repeated layout gives identical positions. A proxy's smaller text wraps at
// about as many characters a line as its entity's.
const ENTITY_BOX = { fontSize: 12, fontWeight: 600, lineHeight: 1.25, textMaxWidth: 160, padding: 10, border: 1.5, inset: 3 };
const FIELD_BOX = { fontSize: 10, fontWeight: 'normal', padding: 7, border: 1 };
const PROXY_BOX = { fontSize: 10, fontStyle: 'italic', fontWeight: 'normal', lineHeight: 1.25, textMaxWidth: 130, padding: 7, border: 1, inset: 2 };

// The shape-polygon-points value of a shape Cytoscape draws on its own, which
// ignores it.
const SQUARE_POLYGON = '-1 -1 1 -1 1 1 -1 1';
const NODE_BOX_LIMIT = 2000;

// Model-space metrics of a note box. Its body wraps at textMaxWidth, and the
// plain-text label that exports draw matches the body's font size. The HTML
// body draws above every node, so the box does too.
const NOTE_BOX = { fontSize: 12, textMaxWidth: 240, minWidth: 80, minHeight: 16, padding: 10, border: 1, zIndex: 100 };

// The space Fit leaves around the diagram, in rendered pixels.
const FIT_PADDING = 45;

// The classes a comparison marks elements with, 1 per kind of change.
const DIFF_CLASS = { [CHANGE_ADDED]: 'diff-added', [CHANGE_REMOVED]: 'diff-removed', [CHANGE_CHANGED]: 'diff-changed' };
const DIFF_CLASSES = Object.values(DIFF_CLASS).join(' ');

// Model-space caption metrics: the font size, the height of 1 caption line
// and the gap between a node's box and its first machine-name line.
const CAPTION_SIZE = 10;
const CAPTION_LINE = 12;
const CAPTION_GAP = 6;

const NAME_CAPTION = 'caption';
const TYPE_CAPTION = 'caption caption--type';

const FADED_OPACITY = 0.1;

// A proxy draws its entity type's colour at this opacity over the canvas.
const PROXY_OPACITY = 0.4;

// The fill of a focused field.
const TRACE_FILL = '#c3f0e8';

let settings = loadSettings();
const activeColors = Object.create(null);
const activeSymbols = Object.create(null);

let measureContext = null;
const textWidths = new Map();
const nodeBoxes = new Map();
const noteSizes = new Map();
const captionStyles = {};

let levelId = DIAGRAM_DEFAULTS.level;
let proxyMode = false;
let layoutName = DIAGRAM_DEFAULTS.layout;
let showMachineNames = false;
let typeVisible = {};
// The depth and direction of the last explore view, which the next one
// starts with.
let exploreChoice = { ...EXPLORE_DEFAULTS };

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

function diagramDefaults() {
  return readDiagramDefaults(settings.newDiagrams, Object.keys(LAYOUTS));
}

// Sets 1 of the settings the next diagram opens with.
function setDiagramDefault(key, value) {
  settings.newDiagrams = { ...diagramDefaults(), [key]: value };
  saveSettings();
  bump();
}

// The stylesheet picks the frame colour from the stage's data-mode, which
// the builder sets.
function applyFrame() {
  const frame = frameSettings(settings.frame);
  const stage = $('stage-root');

  stage.style.setProperty('--frame-view', frame.view);
  stage.style.setProperty('--frame-edit', frame.edit);
  stage.classList.toggle('has-frame', frame.enabled);
}

function setFrame(patch) {
  settings.frame = frameSettings({ ...frameSettings(settings.frame), ...patch });
  saveSettings();
  applyFrame();
  bump();
}

function setMarkdown(patch) {
  settings.markdown = readMarkdownSettings({ ...readMarkdownSettings(settings.markdown), ...patch });
  saveSettings();
  bump();
}

function setChecks(patch) {
  settings.checks = readCheckSettings({ ...readCheckSettings(settings.checks), ...patch });
  saveSettings();
  bump();
}

function hoverEnabled() {
  return readHoverSettings(settings.hover).enabled;
}

function initColors() {
  const colors = typeColors(settings.colors);
  const symbols = typeSymbols(settings.symbols);

  allTypeKeys().forEach((type) => {
    const builtIn = findEntityType(type);
    activeColors[type] = Object.hasOwn(colors, type) ? colors[type] : builtIn ? builtIn.color : FALLBACK_COLOR;
    activeSymbols[type] = Object.hasOwn(symbols, type) ? symbols[type] : builtIn ? builtIn.symbol : FALLBACK_SYMBOL;
  });
}

function customTypes() {
  return customTypeList(settings.customTypes);
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
  return (box.fontStyle || 'normal') + ' ' + box.fontWeight + ' ' + box.fontSize + 'px ' + LABEL_FONT_FAMILY;
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

// The lines of a label as Cytoscape wraps it, with blank lines reserved below
// them, and the offset of the label's bottom from its centre line. Each line
// has its width and the offsets of its top and bottom from the centre line.
// Cytoscape draws k lines 1 font size plus k - 1 line pitches tall.
function wrappedLines(text, metrics, reserved) {
  const font = labelFont(metrics);
  const texts = wrapLabel(text, metrics.textMaxWidth, (line) => textWidth(line, font));
  const pitch = metrics.fontSize * metrics.lineHeight;
  const count = texts.length + reserved;
  const labelBottom = (metrics.fontSize + (count - 1) * pitch) / 2;
  const lines = texts.map((line, i) => {
    const bottom = labelBottom - (count - 1 - i) * pitch;

    return { width: textWidth(line, font), top: bottom - metrics.fontSize, bottom: bottom };
  });

  return { lines: lines, labelBottom: labelBottom };
}

// The text lines of an entity box and half the box's height: the name lines,
// then the type caption on the label's blank last line.
function entityLines(ele) {
  const label = wrappedLines(ele.data('label'), ENTITY_BOX, 1);
  const typeCentre = label.labelBottom - ENTITY_BOX.fontSize / 2;
  const typeWidth = captionWidth(typeLabel(ele.data('entityType')), TYPE_CAPTION);
  label.lines.push({ width: typeWidth, top: typeCentre - CAPTION_LINE / 2, bottom: typeCentre + CAPTION_LINE / 2 });

  return { lines: label.lines, halfHeight: label.labelBottom + ENTITY_BOX.padding };
}

// The text lines of a proxy and half the proxy's height.
function proxyLines(ele) {
  const label = wrappedLines(ele.data('label'), PROXY_BOX, 0);

  return { lines: label.lines, halfHeight: label.labelBottom + PROXY_BOX.padding };
}

// The model-space box of an entity or proxy in its shape: the width of its
// text area, the offset of its label from the box centre and the polygon
// that draws a fixed-end shape. The width is rounded up to a whole pixel to
// stay on the box grid.
function fitBox(ele, metrics) {
  const shape = entityShape(ele.data('entityType'));
  const text = ele.data('group') === 'proxy' ? proxyLines(ele) : entityLines(ele);
  const width = Math.ceil(fitWidth(text.lines, shape, text.halfHeight, metrics.padding, metrics.inset));
  const halfWidth = width / 2 + metrics.padding;
  const points = polygonPoints(shape, halfWidth, text.halfHeight);

  return {
    width: width,
    offset: { x: labelX(text.lines, shape, halfWidth, text.halfHeight, metrics.padding, metrics.inset), y: labelDrop(shape) * text.halfHeight },
    points: points ? points.join(' ') : SQUARE_POLYGON,
  };
}

// The box of an entity or proxy, as fitBox() works it out. Cytoscape reads it
// once per style property, so boxes are cached by everything they depend on.
function nodeBox(ele) {
  const group = ele.data('group');
  const key = [group, entityShape(ele.data('entityType')), typeLabel(ele.data('entityType')), ele.data('label')].join('\n');

  if (!nodeBoxes.has(key)) {
    if (nodeBoxes.size >= NODE_BOX_LIMIT) {
      nodeBoxes.clear();
    }
    nodeBoxes.set(key, fitBox(ele, group === 'proxy' ? PROXY_BOX : ENTITY_BOX));
  }

  return nodeBoxes.get(key);
}

function isNote(ele) {
  return ele.data('group') === 'annotation' && ele.data('kind') === NOTE_KIND;
}

// A note's body as HTML. noteMarkdownHtml() escapes every string, so only the
// Markdown tags reach innerHTML.
function noteHtml(text) {
  return (text || '').trim() ? noteMarkdownHtml(text) : '<p class="note-body__empty">Empty note</p>';
}

// Model-space size of a note's body, without padding, measured through a probe
// body at zoom 1. Measuring reads layout, so sizes are cached by text.
function noteSize(ele) {
  const text = ele.data('note') || '';

  if (!noteSizes.has(text)) {
    if (noteSizes.size >= NODE_BOX_LIMIT) {
      noteSizes.clear();
    }

    const probe = document.createElement('div');
    probe.className = 'note-body note-body--probe';
    probe.style.maxWidth = NOTE_BOX.textMaxWidth + 'px';
    probe.innerHTML = noteHtml(text);
    $('note-bodies').appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();

    noteSizes.set(text, {
      width: Math.min(NOTE_BOX.textMaxWidth, Math.max(NOTE_BOX.minWidth, Math.ceil(rect.width))),
      height: Math.max(NOTE_BOX.minHeight, Math.ceil(rect.height)),
    });
  }

  return noteSizes.get(text);
}

// Model-space outer width of an entity or field box.
function boxWidth(ele) {
  if (ele.data('group') === 'entity') {
    return nodeBox(ele).width + 2 * ENTITY_BOX.padding + ENTITY_BOX.border;
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
      canvas: '#2c2c31',
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
    canvas: '#f4f4f5',
  };
}

function proxyFill(entityType, tc) {
  return blendColors(entityColor(entityType), tc.canvas, PROXY_OPACITY);
}

function style() {
  const tc = themeColors();
  return [
    {
      selector: 'core',
      style: { 'selection-box-color': '#2f6db3', 'selection-box-opacity': 0.12, 'selection-box-border-color': '#2f6db3', 'selection-box-border-width': 1 },
    },
    {
      selector: 'node[group="entity"]',
      style: {
        shape: (ele) => drawnShape(entityShape(ele.data('entityType'))),
        'shape-polygon-points': (ele) => nodeBox(ele).points,
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
        'text-margin-x': (ele) => nodeBox(ele).offset.x,
        'text-margin-y': (ele) => nodeBox(ele).offset.y,
        'font-family': LABEL_FONT_FAMILY,
        'font-size': ENTITY_BOX.fontSize,
        'font-weight': ENTITY_BOX.fontWeight,
        'line-height': ENTITY_BOX.lineHeight,
        color: (ele) => textOn(entityColor(ele.data('entityType'))).text,
        width: (ele) => nodeBox(ele).width,
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
        shape: (ele) => drawnShape(entityShape(ele.data('entityType'))),
        'shape-polygon-points': (ele) => nodeBox(ele).points,
        'background-color': (ele) => entityColor(ele.data('entityType')),
        'background-opacity': PROXY_OPACITY,
        'border-color': '#8a94a3',
        'border-width': PROXY_BOX.border,
        'border-style': 'dashed',
        label: (ele) => ele.data('label'),
        'text-wrap': 'wrap',
        'text-max-width': PROXY_BOX.textMaxWidth,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-margin-x': (ele) => nodeBox(ele).offset.x,
        'text-margin-y': (ele) => nodeBox(ele).offset.y,
        'font-family': LABEL_FONT_FAMILY,
        'font-size': PROXY_BOX.fontSize,
        'font-style': PROXY_BOX.fontStyle,
        'line-height': PROXY_BOX.lineHeight,
        color: (ele) => textOn(proxyFill(ele.data('entityType'), tc)).muted,
        width: (ele) => nodeBox(ele).width,
        height: 'label',
        padding: PROXY_BOX.padding + 'px',
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
    // positionNotes() draws a note's Markdown in the HTML note layer, which
    // exports leave out. The plain-text label shows only in exports.
    {
      selector: 'node[group="annotation"][kind="note"]',
      style: {
        shape: 'rectangle',
        'background-color': '#fff4b3',
        'border-color': '#d9b93a',
        'border-width': NOTE_BOX.border,
        label: (ele) => noteMarkdownPlain(ele.data('note')),
        'text-opacity': 0,
        'text-max-width': (ele) => noteSize(ele).width,
        'text-justification': 'left',
        'font-family': LABEL_FONT_FAMILY,
        'font-size': NOTE_BOX.fontSize,
        'font-weight': 'normal',
        color: '#3a2f0a',
        width: (ele) => noteSize(ele).width,
        height: (ele) => noteSize(ele).height,
        padding: NOTE_BOX.padding + 'px',
        'z-index': NOTE_BOX.zIndex,
      },
    },
    {
      selector: 'edge',
      style: {
        'taxi-direction': () => (LAYOUTS[layoutName].rankDir === 'TB' ? 'vertical' : 'horizontal'),
        'taxi-turn-min-distance': '8px',
        ...lineStyle(settings.lines),
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
    ...diffStyles(),
    { selector: '.faded', style: { opacity: FADED_OPACITY } },
    { selector: '.hidden', style: { display: 'none' } },
    { selector: '.highlight', style: { 'border-color': '#2f6db3', 'border-width': 3 } },
    { selector: 'node.trace', style: { opacity: 1, 'border-color': '#0f9d8f', 'border-width': 3 } },
    { selector: 'edge.trace', style: { opacity: 1, 'line-color': '#0f9d8f', 'target-arrow-color': '#0f9d8f', width: 2.6, 'z-index': 20 } },
    {
      selector: 'node.trace-source',
      style: { opacity: 1, 'border-color': '#0b7a70', 'border-width': 4, 'background-color': TRACE_FILL, color: textOn(TRACE_FILL).text },
    },
    { selector: 'node:selected', style: { 'border-color': '#2f6db3', 'border-width': 3 } },
    // The hover classes come last, so they win over the fade and the trace
    // while a hover lasts and leave both in place for when it ends.
    { selector: '.hover-lit', style: { opacity: 1 } },
    { selector: '.hover-faded', style: { opacity: FADED_OPACITY } },
  ];
}

// A comparison draws each changed element in the colour of its kind, and a
// removed one faded and dashed. A multi-value field keeps its double border.
function diffStyles() {
  const added = changeKind(CHANGE_ADDED).color;
  const removed = changeKind(CHANGE_REMOVED).color;
  const changed = changeKind(CHANGE_CHANGED).color;

  return [
    { selector: 'node.diff-added', style: { 'border-color': added, 'border-width': 3 } },
    { selector: 'edge.diff-added', style: { 'line-color': added, 'target-arrow-color': added, width: 2.4 } },
    { selector: 'node.diff-changed', style: { 'border-color': changed, 'border-width': 3 } },
    { selector: 'node.diff-removed', style: { 'border-color': removed, 'border-width': 3, 'border-style': 'dashed', opacity: 0.45 } },
    { selector: 'edge.diff-removed', style: { 'line-color': removed, 'target-arrow-color': removed, 'line-style': 'dashed', width: 2, opacity: 0.45 } },
  ];
}

function fieldReferences(field) {
  return field.outgoers('edge[group="ref"]').map((edge) => edge.target().data('label') ?? edge.target().id());
}

// richTextHtml() escapes every string, so the allowlisted tags are the only
// markup that reaches innerHTML.
function tooltipText(text) {
  return text ? '<div class="tooltip__text">' + richTextHtml(parseRichText(text)) + '</div>' : '';
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
      '</div>' +
      tooltipText(node.data('description'))
    );
  }

  if (group === 'field') {
    const meta = [esc(humanize(node.data('kind'))) + ' field', esc(node.data('fieldType'))];
    const refs = fieldReferences(node);
    if (refs.length) {
      meta.push('→ ' + esc(refs.join(', ')));
    }
    return '<div class="tooltip__name">' + name + '</div><div class="tooltip__meta">' + meta.join(' · ') + '</div>' + tooltipText(node.data('description'));
  }

  const extra = node.data('method') ? ' · ' + esc(node.data('method')) : '';
  return '<div class="tooltip__name">' + name + '</div><div class="tooltip__meta">' + esc(humanize(node.data('kind'))) + extra + '</div>';
}

// Cytoscape's layered texture cache copies each element's cached bitmap into a
// layer with image smoothing off. The bitmap and the element's box differ by a
// fraction of a pixel, so the copy drops pixel rows and some labels lose their
// strokes. With no layers, Cytoscape draws each element's bitmap onto the
// canvas with smoothing on.
function drawWithoutLayers(cy) {
  cy.renderer().data.lyrTxrCache.getLayers = () => null;
}

function buildController(model, options = {}) {
  const defaults = diagramDefaults();

  typeVisible = {};
  layoutName = defaults.layout;
  // Edit mode leaves the Entities level for All, so the diagram starts there
  // rather than re-running the layout when the builder enters the mode.
  levelId = defaults.mode === 'edit' && !showsFields(defaults.level) ? 'all' : defaults.level;
  proxyMode = defaults.proxies;
  showMachineNames = defaults.machineNames;
  initColors();
  const added = customTypeList(options.customTypes);
  if (added.length) {
    const known = new Set(customTypes().map((t) => t.type));
    settings.customTypes = customTypes().concat(added.filter((t) => !known.has(t.type)));
  }
  Object.assign(activeColors, typeColors(options.colors));
  Object.assign(activeSymbols, typeSymbols(options.symbols));

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

  drawWithoutLayers(cy);

  // The node a View-mode tap focused, as { kind, id }, or null.
  let focused = null;
  // The timer of a hover highlight that waits for HOVER_DELAY, and whether a
  // highlight is drawn.
  let hoverTimer = 0;
  let hoverShown = false;
  // The explore view, as { entityId, outside, saved }, or null. `outside`
  // holds the ids of the entities and annotations the view hides, and
  // `saved` the positions, viewport and display it started from.
  let explore = null;
  // What startComparison() saved to restore, or null while not comparing.
  let comparison = null;
  syncReferenceElements(cy);

  const captionsEl = $('captions');
  let captionMap = {};
  const notesEl = $('notes');
  let noteMap = {};
  const noteBodiesEl = $('note-bodies');
  let noteBodies = {};

  function entityTypeOf(entityId) {
    const entity = cy.getElementById(entityId);

    return entity.nonempty() ? entity.data('entityType') : null;
  }

  // Whether the explore view hides the node: an entity or annotation outside
  // it, or a proxy standing in for an entity outside it. A field follows its
  // entity through hiddenBy().
  function outsideExplore(node) {
    if (!explore) {
      return false;
    }

    return explore.outside.has(node.data('group') === 'proxy' ? node.data('target') : node.id());
  }

  function nodeVisible(node) {
    const group = node.data('group');
    if (group === 'entity') {
      return typeVisible[node.data('entityType')] !== false && !outsideExplore(node);
    }
    if (group === 'field') {
      return hiddenBy(node) === null;
    }
    if (group === 'proxy') {
      return proxyMode && hiddenBy(cy.getElementById(node.data('field'))) === null && typeVisible[node.data('entityType')] !== false && !outsideExplore(node);
    }
    return !outsideExplore(node);
  }

  // What keeps a field off the canvas: the field itself, the detail level,
  // its entity type's filter, the explore view, or null when nothing does.
  function hiddenBy(field) {
    if (field.data('hidden')) {
      return 'field';
    }

    if (!levelShowsField(levelId, { kind: field.data('kind'), fieldType: field.data('fieldType') })) {
      return 'level';
    }

    if (typeVisible[entityTypeOf(field.data('entity'))] === false) {
      return 'type';
    }

    return explore && explore.outside.has(field.data('entity')) ? 'explore' : null;
  }

  function edgeVisible(edge) {
    const group = edge.data('group');
    const ends = !edge.source().hasClass('hidden') && !edge.target().hasClass('hidden');
    const fields = showsFields(levelId);

    if (group === 'has') {
      return fields && ends;
    }

    if (group === 'ref') {
      return fields && !proxyMode && ends;
    }

    if (group === 'proxyedge') {
      return fields && proxyMode && ends;
    }

    if (group === 'collapsed') {
      return !fields && ends;
    }

    return ends;
  }

  // An edge is shown only while both of its ends are, so nodes are updated
  // first.
  function applyVisibility(elements) {
    elements.nodes().forEach((node) => node.toggleClass('hidden', !nodeVisible(node)));
    elements.edges().forEach((edge) => edge.toggleClass('hidden', !edgeVisible(edge)));
  }

  // A field with its proxies and their edges.
  function refreshField(field) {
    const nodes = field.union(cy.nodes('[group="proxy"]').filter((proxy) => proxy.data('field') === field.id()));

    applyVisibility(nodes.union(nodes.connectedEdges()));
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
    const spacing = showsFields(levelId) ? LAYOUT_SPACING.fields : LAYOUT_SPACING.overview;
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

  // Layouts place only the shown nodes, so each hidden field moves with its
  // entity and is beside it when shown again.
  function keepHiddenFields(run) {
    const offsets = cy.nodes('[group="field"][?hidden]').map((field) => {
      const entity = cy.getElementById(field.data('entity'));

      return { field: field, entity: entity, dx: field.position('x') - entity.position('x'), dy: field.position('y') - entity.position('y') };
    });

    run();

    offsets.forEach(({ field, entity, dx, dy }) => {
      field.position({ x: entity.position('x') + dx, y: entity.position('y') + dy });
    });
  }

  function runLayout() {
    const { options, gap } = layoutSettings();
    const elements = shown(cy.elements());

    keepHiddenFields(() => {
      if (LAYOUTS[layoutName].packed) {
        packIslands(elements, options, gap);
      } else {
        elements.layout(options).run();
      }
    });

    resetView();
    positionCaptions();
    positionNotes();
  }

  // The entity Tidy works on: the one the Inspector's screen or the focused
  // node belongs to. Empty when the selection belongs to no shown entity.
  function tidyTarget() {
    const id = selectionEntity(getState().selected || focused, nodeLookup(cy));

    return id ? shown(cy.getElementById(id)) : cy.collection();
  }

  // Names the entity Tidy will work on in the Tidy button's title.
  function showTidyTarget() {
    const target = tidyTarget();
    const title = target.nonempty() ? 'Tidy up ' + nodeLookup(cy)(target.id()).label + TIDY_ENTITY_TITLE : TIDY_TITLE;
    const button = $('tidy');

    if (button.getAttribute('title') !== title) {
      button.setAttribute('title', title);
    }
  }

  // An entity with its shown fields, their shown proxies and the edges
  // between them.
  function entityGroup(entity) {
    const own = cy.nodes('[group="field"], [group="proxy"]').filter((node) => node.data('entity') === entity.id());
    const nodes = entity.union(own);
    const edges = nodes.connectedEdges().filter((edge) => nodes.contains(edge.source()) && nodes.contains(edge.target()));

    return shown(nodes.union(edges));
  }

  // Lays each island out on its own again, keeps each entity's field order
  // and lines the islands up in columns near where they were (see
  // tidyColumns()). With a target entity, only the entity, its fields and
  // their proxies move, and they keep their top-left corner. The view stays
  // put.
  function tidy() {
    const target = tidyTarget();

    arrange(target.nonempty() ? entityGroup(target) : shown(cy.elements()));
  }

  // Runs Dagre on each island of the elements and lines the islands up near
  // where they were, keeping each entity's field order.
  function arrange(elements) {
    const { options, gap } = layoutSettings();
    const before = new Map(elements.nodes().map((node) => [node.id(), { ...node.position() }]));

    keepHiddenFields(() => {
      const islands = layIslandsOut(elements, options).map((entry) => {
        keepFieldOrder(entry.island, before, options.nodeSep);

        return { ...entry, box: entry.island.boundingBox() };
      });
      const boxes = islands.map((entry) => ({ x: entry.before.x1, y: entry.before.y1, w: entry.box.w, h: entry.box.h }));

      placeIslands(islands, tidyColumns(boxes, gap).positions);
    });
    positionCaptions();
    positionNotes();
  }

  // Hides a field on the canvas with its proxies and reference edges, or
  // shows it again with its proxies placed beside it, as 1 history step.
  function setFieldHidden(id, hidden) {
    const field = cy.getElementById(id);

    if (field.empty() || !!field.data('hidden') === hidden) {
      return;
    }

    if (hidden) {
      field.data('hidden', true);
    } else {
      field.removeData('hidden');
    }

    refresh(false);

    if (!hidden) {
      placeProxies(cy.nodes('[group="proxy"]').filter((proxy) => proxy.data('field') === id));
    }

    positionCaptions();
    positionNotes();
    checkpoint((hidden ? 'Hid ' : 'Showed ') + describeNode(field));
    bump();
  }

  // Dagre orders an entity's fields as it likes, so each field, with its
  // proxies, goes back to the place it had in the order before the run: top
  // to bottom in LR and Columns, left to right in TB. `before` holds each
  // node's position before the run. The entity stays centred on its fields.
  function keepFieldOrder(island, before, gap) {
    const across = LAYOUTS[layoutName].rankDir === 'TB' ? 'x' : 'y';
    const along = across === 'x' ? 'y' : 'x';
    const middle = (box) => (box[across + '1'] + box[across + '2']) / 2;

    island.nodes('[group="entity"]').forEach((entity) => {
      const fields = island.nodes('[group="field"]').filter((field) => field.data('entity') === entity.id());

      if (fields.empty()) {
        return;
      }

      const span = fields.boundingBox();
      const ranks = new Map();

      fields.forEach((field) => {
        const rank = Math.round(field.position(along));
        ranks.set(rank, (ranks.get(rank) || []).concat([field]));
      });

      ranks.forEach((fieldsOfRank) => {
        // A field's proxies can reach past its neighbours, so the fields'
        // own positions give the layout's order.
        const rank = [...fieldsOfRank].sort((a, b) => a.position(across) - b.position(across));
        const units = rank.map((field) => field.union(island.nodes('[group="proxy"]').filter((proxy) => proxy.data('field') === field.id())));
        const boxes = units.map((unit, index) => {
          const box = unit.boundingBox();

          return { start: box[across + '1'], end: box[across + '2'], key: before.get(rank[index].id())[across] };
        });

        keepOrder(boxes, gap).forEach((shift, index) => units[index].shift(across, shift));
      });

      entity.shift(across, middle(fields.boundingBox()) - middle(span));
    });
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
    if (explore && renames) {
      renameExplore(renames);
    }

    const added = syncReferenceElements(cy, renames);

    applyVisibility(cy.elements(REFERENCE_ELEMENTS).union(cy.edges('[group="ref"]')));
    placeProxies(added);
  }

  // Keeps the node a View-mode tap focused as a selection Tidy reads.
  function setFocused(selection) {
    focused = selection;
    showTidyTarget();
  }

  // The part of the canvas no floating panel covers, in rendered
  // coordinates. Docked panels sit beside the canvas, so they don't count.
  function openArea() {
    const box = cy.container().getBoundingClientRect();
    const panels = [...document.querySelectorAll('.stage__canvas > .panel')].map((panel) => {
      const rect = panel.getBoundingClientRect();

      return { x1: rect.left - box.left, y1: rect.top - box.top, x2: rect.right - box.left, y2: rect.bottom - box.top };
    });

    return freeArea({ x1: 0, y1: 0, x2: box.width, y2: box.height }, panels);
  }

  // Animates to the zoom with the visible elements centred in openArea().
  function centreOn(eles, zoom) {
    const area = openArea();
    const box = eles.filter(':visible').boundingBox();
    const pan = { x: (area.x1 + area.x2) / 2 - ((box.x1 + box.x2) / 2) * zoom, y: (area.y1 + area.y2) / 2 - ((box.y1 + box.y2) / 2) * zoom };

    cy.animate({ zoom, pan }, { duration: 350 });
  }

  // An entity with its fields, the group the focus and Find entity centre.
  function withFields(entities) {
    return entities.union(cy.nodes('[group="field"]').filter((field) => entities.some((entity) => entity.id() === field.data('entity'))));
  }

  function focusEntity(id) {
    const node = cy.getElementById(id);
    if (node.empty()) {
      return;
    }
    setFocused({ kind: 'entity', id: id });
    const hood = node.closedNeighborhood().closedNeighborhood();
    cy.elements().removeClass('trace trace-source').addClass('faded');
    hood.removeClass('faded');
    node.removeClass('faded');
    centreOn(withFields(node), Math.max(cy.zoom(), 0.8));
  }

  // The node a check problem on the node with the id is reached through: a
  // field the canvas shows, else the field's entity. Null when the node is
  // gone or its entity type is hidden.
  function problemTarget(id) {
    const node = cy.getElementById(id);

    if (node.empty()) {
      return null;
    }

    if (node.data('group') === 'field' && hiddenBy(node) === null) {
      return node;
    }

    const entity = node.data('group') === 'field' ? cy.getElementById(node.data('entity')) : node;

    return nodeVisible(entity) ? entity : null;
  }

  function focusProblem(id) {
    const target = problemTarget(id);

    if (!target) {
      return;
    }

    if (target.data('group') === 'field') {
      focusField(target.id());
    } else {
      focusEntity(target.id());
    }
  }

  function focusField(id) {
    const node = cy.getElementById(id);
    if (node.empty()) {
      return;
    }
    setFocused({ kind: 'field', id: id });

    // A field's closed neighbourhood is exactly its inbound owner (via the
    // has-edge) and outbound reference targets - the connections to trace.
    const hood = node.closedNeighborhood();
    cy.elements().removeClass('trace trace-source').addClass('faded');
    hood.removeClass('faded').addClass('trace');
    node.removeClass('trace').addClass('trace-source');
    centreOn(hood, Math.max(cy.zoom(), 0.8));
  }

  function clearFocus() {
    cy.elements().removeClass('faded trace trace-source');
    setFocused(null);
  }

  // A hover highlight lights its elements over any fade.
  function isFaded(node) {
    return node.hasClass('hover-faded') || (node.hasClass('faded') && !node.hasClass('hover-lit'));
  }

  // The HTML layers read isFaded() and follow only Cytoscape's render event,
  // which a class change alone may not fire.
  function showHover(node) {
    if (cy.destroyed() || node.removed()) {
      return;
    }

    const lit = hoverNeighbourhood(node);

    if (lit.empty()) {
      return;
    }

    cy.batch(() => {
      cy.elements().difference(lit).addClass('hover-faded');
      lit.addClass('hover-lit');
    });
    hoverShown = true;
    positionCaptions();
    positionNotes();
  }

  // The highlight waits, so a pointer crossing the canvas draws none. A held
  // button means a drag, a pan or a box selection.
  function scheduleHover(evt) {
    clearHover();

    if (!hoverEnabled() || evt.originalEvent?.buttons) {
      return;
    }

    const node = evt.target;
    hoverTimer = setTimeout(() => {
      hoverTimer = 0;
      showHover(node);
    }, HOVER_DELAY);
  }

  // Only the hover classes come off, so a focus, an isolation or a search
  // fade stays as it was.
  function clearHover() {
    clearTimeout(hoverTimer);
    hoverTimer = 0;

    if (!hoverShown) {
      return;
    }

    hoverShown = false;
    cy.elements().removeClass('hover-lit hover-faded');
    positionCaptions();
    positionNotes();
  }

  function setHover(patch) {
    settings.hover = readHoverSettings({ ...readHoverSettings(settings.hover), ...patch });
    saveSettings();
    clearHover();
    bump();
  }

  // Each reference as the entity holding its field and the entity it targets.
  function referenceLinks() {
    return cy.edges('[group="ref"]').map((edge) => ({ source: edge.source().data('entity'), target: edge.target().id() }));
  }

  // The ids of the entities outside the explore view from the entity, and of
  // the annotations attached to no entity or field inside it.
  function exploreOutside(entityId) {
    const inside = exploreEntities(referenceLinks(), entityId, exploreChoice.depth, exploreChoice.direction);
    const ownerInside = (node) => inside.has(node.data('group') === 'field' ? node.data('entity') : node.id());
    const entities = cy.nodes('[group="entity"]').filter((entity) => !inside.has(entity.id()));
    const notes = cy.nodes('[group="annotation"]').filter((note) => !note.connectedEdges('[group="annotation"]').connectedNodes().some(ownerInside));

    return new Set(entities.union(notes).map((node) => node.id()));
  }

  // The display settings a layout run depends on.
  function displayKey() {
    return JSON.stringify([levelId, proxyMode, typeVisible]);
  }

  // Shows only the entity and the entities within the chosen depth of it,
  // and lays them out. A view started from another entity keeps the
  // positions the first one saved.
  function startExplore(entityId) {
    const entity = cy.getElementById(entityId);

    if (entity.empty() || entity.data('group') !== 'entity') {
      return;
    }

    const saved = explore
      ? explore.saved
      : { positions: new Map(cy.nodes().map((node) => [node.id(), { ...node.position() }])), zoom: cy.zoom(), pan: { ...cy.pan() }, display: displayKey() };

    explore = { entityId: entityId, outside: new Set(), saved: saved };
    applyExplore();
  }

  function applyExplore() {
    explore.outside = exploreOutside(explore.entityId);
    clearFocus();
    // The layout moves nodes from under the pointer without a mouseout.
    $('tooltip').hidden = true;
    clearHover();
    untracked(() => refresh(true));
    bump();
  }

  function setExplore(patch) {
    exploreChoice = readExplore({ ...exploreChoice, ...patch });

    if (explore) {
      applyExplore();
    }
  }

  // Shows the whole diagram again, at the positions and the viewport the
  // view started from. A display switch changed during the view moved only
  // the nodes it showed, so the layout runs again instead.
  function clearExplore() {
    if (!explore) {
      return;
    }

    const saved = explore.saved;

    explore = null;
    clearFocus();
    $('tooltip').hidden = true;
    clearHover();
    untracked(() => {
      if (saved.display !== displayKey()) {
        refresh(true);
        return;
      }

      refresh(false);
      cy.nodes().forEach((node) => {
        const position = saved.positions.get(node.id());

        if (position) {
          node.position(position);
        }
      });
      cy.viewport({ zoom: saved.zoom, pan: saved.pan });
      positionCaptions();
      positionNotes();
    });
    bump();
  }

  // Ends the explore view when the entity it started from is gone.
  function syncExplore() {
    if (explore && cy.getElementById(explore.entityId).empty()) {
      clearExplore();
    }
  }

  // Carries the explore view over renamed node ids.
  function renameExplore(renames) {
    const renamed = (id) => (Object.hasOwn(renames, id) ? renames[id] : id);

    explore.entityId = renamed(explore.entityId);
    explore.outside = new Set([...explore.outside].map(renamed));
    explore.saved.positions = new Map([...explore.saved.positions].map(([id, position]) => [renamed(id), position]));
  }

  // The explore view as { entityId, label, depth, direction }, or null.
  function exploring() {
    if (!explore) {
      return null;
    }

    return { entityId: explore.entityId, label: cy.getElementById(explore.entityId).data('label'), ...exploreChoice };
  }

  // Runs `read` on the graph as it is without the explore view, at the
  // positions the view saved, and returns its result. A saved document then
  // keeps the diagram's own layout.
  function withoutExplore(read) {
    if (!explore) {
      return read();
    }

    const view = explore;
    const shownAt = new Map(cy.nodes().map((node) => [node.id(), { ...node.position() }]));
    const moveTo = (positions) =>
      positions.forEach((position, id) => {
        const node = cy.getElementById(id);

        if (node.nonempty()) {
          node.position(position);
        }
      });

    explore = null;
    applyVisibility(cy.elements());
    moveTo(view.saved.positions);

    try {
      return read();
    } finally {
      explore = view;
      moveTo(shownAt);
      applyVisibility(cy.elements());
    }
  }

  // The kind of change an element is marked with, or null. Proxies, proxy
  // edges and collapsed edges take the mark of the ref edges they draw, and
  // `collapsed` maps each collapsed edge's id to the ids of those ref edges.
  function changeMarkOf(element, marks, collapsed) {
    const group = element.data('group');

    if (group === 'proxy' || group === 'proxyedge') {
      const proxy = group === 'proxy' ? element : element.target();

      return marks.get(refEdgeId(proxy.data('field'), proxy.data('target'))) || null;
    }

    if (group === 'collapsed') {
      return sharedMark(marks, collapsed.get(element.id()) || []);
    }

    return marks.get(element.id()) || null;
  }

  function markChanges(marks) {
    const collapsed = new Map();

    cy.edges('[group="ref"]').forEach((ref) => {
      const id = collapsedEdgeId(ref.source().data('entity'), ref.target().id());

      collapsed.set(id, (collapsed.get(id) || []).concat([ref.id()]));
    });

    cy.elements().removeClass(DIFF_CLASSES);
    cy.elements().forEach((element) => {
      const mark = changeMarkOf(element, marks, collapsed);

      if (mark) {
        element.addClass(DIFF_CLASS[mark]);
      }
    });
  }

  // The element definitions of `data` a comparison adds. Added entities start
  // in a column right of the diagram and added fields on their entity, for
  // placeCompared() to lay out. An added field shows, even if it was saved
  // hidden. Cytoscape keeps the position object it is given, so each node
  // gets its own copy.
  function comparedElements(data, marks) {
    const box = cy.nodes().nonempty() ? cy.nodes().boundingBox() : { x2: 0, y1: 0 };
    const isAdded = (definition) => marks.get(definition.data.id) === CHANGE_ADDED;
    const entities = (data.nodes || []).filter((node) => isAdded(node) && node.data.group === 'entity');
    const fields = (data.nodes || []).filter((node) => isAdded(node) && node.data.group === 'field');
    const start = new Map(entities.map((node, index) => [node.data.id, { x: box.x2 + 200, y: box.y1 + index * 80 }]));
    const fieldDefinitions = fields.map((node) => {
      const fieldData = { ...node.data };
      const anchor = { ...(start.get(fieldData.entity) || cy.getElementById(fieldData.entity).position()) };

      delete fieldData.hidden;

      return { group: 'nodes', data: fieldData, position: anchor };
    });

    return [
      ...entities.map((node) => ({ group: 'nodes', data: { ...node.data }, position: { ...start.get(node.data.id) } })),
      ...fieldDefinitions,
      ...(data.edges || []).filter(isAdded).map((edge) => ({ group: 'edges', data: { ...edge.data } })),
    ];
  }

  // Packs the islands made only of added elements right of the rest of the
  // diagram. When an added element joined an island the diagram already had,
  // the whole diagram is tidied as the Tidy button does.
  function placeCompared() {
    const { options, gap } = layoutSettings();
    const islands = shown(cy.elements()).components();
    const isAdded = (island) => island.nodes().every((node) => node.hasClass(DIFF_CLASS[CHANGE_ADDED]));
    const fresh = islands.filter(isAdded).reduce((all, island) => all.union(island), cy.collection());
    const rest = shown(cy.elements()).difference(fresh);
    const joined = rest.some((element) => element.hasClass(DIFF_CLASS[CHANGE_ADDED]));

    if (fresh.nonempty()) {
      const box = rest.nodes().nonempty() ? rest.nodes().boundingBox() : { x2: -gap.x, y1: 0 };

      packIslands(fresh, options, gap);

      const packed = fresh.nodes().boundingBox();

      fresh.nodes().shift({ x: box.x2 + gap.x - packed.x1, y: box.y1 - packed.y1 });
    }

    if (joined) {
      arrange(shown(cy.elements()));
    }
  }

  // Draws a comparison on the canvas: adds what only `after` has, marks
  // every element `changes` names and shows the All level, so every field
  // change shows. stopComparison() brings back the graph, the display
  // settings and the view as they were before.
  function startComparison(changes, after) {
    stopComparison();
    clearFocus();

    comparison = {
      snapshot: snapshotGraph(cy, ''),
      display: { levelId, proxyMode, showMachineNames, layoutName, typeVisible: { ...typeVisible } },
      view: { zoom: cy.zoom(), pan: { ...cy.pan() } },
      problems: checkModel(documentFromGraph(cy), settings.checks),
    };

    const marks = changeMarks(changes);
    const added = comparedElements(after, marks);

    levelId = 'all';
    showLevel();
    cy.add(added);
    syncReferences();
    refresh(false);
    markChanges(marks);

    if (added.length) {
      placeCompared();
    }

    rebuildCaptions();
    rebuildNotes();
  }

  // Animates to the zoom, up to 100%, that fits every shown element in
  // openArea().
  function fitOpenArea() {
    const area = openArea();
    const box = shown(cy.elements()).boundingBox();
    const room = { w: area.x2 - area.x1 - 2 * FIT_PADDING, h: area.y2 - area.y1 - 2 * FIT_PADDING };
    const zoom = Math.max(cy.minZoom(), Math.min(1, room.w / Math.max(box.w, 1), room.h / Math.max(box.h, 1)));

    centreOn(shown(cy.elements()), zoom);
  }

  function stopComparison() {
    if (!comparison) {
      return;
    }

    const saved = comparison;

    comparison = null;
    // An explore view moves the nodes it shows, which the snapshot puts back.
    clearExplore();
    clearFocus();
    cy.elements().removeClass(DIFF_CLASSES);
    ({ levelId, proxyMode, showMachineNames, layoutName } = saved.display);
    typeVisible = { ...saved.display.typeVisible };
    showLevel();
    $('proxy-toggle').checked = proxyMode;
    $('machine-names').checked = showMachineNames;

    const change = diffSnapshots(snapshotGraph(cy, ''), saved.snapshot);

    if (change) {
      applyPartial(cy, change.after, () => {
        refresh(false);
        syncReferences();
      });
    }

    refresh(false);
    showLayout();
    // A fit or focus can still be animating the view.
    cy.stop(true);
    cy.viewport(saved.view);
    rebuildCaptions();
    rebuildNotes();
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
    return node.nonempty() && !node.hasClass('hidden') && !isFaded(node) && cy.zoom() >= 0.35;
  }

  // Rendered y of a node's box bottom, rendered x and y of the centre top of
  // its type caption and rendered y of the top of the first machine-name line
  // below it. Each line below takes 1 step.
  function captionStack(node) {
    const zoom = cy.zoom();
    const boxBottom = node.renderedPosition('y') + node.renderedOuterHeight() / 2;
    // The type caption centres on the blank last line of the entity label,
    // which ends half the border plus the padding above the box bottom when
    // the label is centred. The label's margins move it with the label.
    const typeCentre = boxBottom + (node.numericStyle('text-margin-y') - ENTITY_BOX.border / 2 - ENTITY_BOX.padding - ENTITY_BOX.fontSize / 2) * zoom;

    return {
      boxBottom: boxBottom,
      typeX: node.renderedPosition('x') + node.numericStyle('text-margin-x') * zoom,
      typeTop: typeCentre - (CAPTION_LINE / 2) * zoom,
      top: boxBottom + CAPTION_GAP * zoom,
      step: CAPTION_LINE * zoom,
    };
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
        div.style.fontSize = size + 'px';
        div.style.lineHeight = stack.step + 'px';
        if (div.classList.contains('caption--type')) {
          div.style.color = textOn(entityColor(node.data('entityType'))).muted;
          div.style.left = stack.typeX + 'px';
          div.style.top = stack.typeTop + 'px';
        } else {
          div.style.left = pos.x + 'px';
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
    if (node.data('group') === 'proxy' || isNote(node) || !(node.data('note') || '').trim()) {
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

  function addNoteBody(node) {
    if (!isNote(node)) {
      return;
    }

    const body = document.createElement('div');
    body.className = 'note-body';
    body.dataset.nodeId = node.id();
    body.innerHTML = noteHtml(node.data('note'));
    noteBodiesEl.appendChild(body);
    noteBodies[node.id()] = body;
  }

  function removeNoteBody(node) {
    const body = noteBodies[node.id()];
    if (!body) {
      return;
    }

    body.remove();
    delete noteBodies[node.id()];
  }

  function rebuildNotes() {
    notesEl.innerHTML = '';
    noteMap = {};
    noteBodiesEl.innerHTML = '';
    noteBodies = {};
    cy.nodes().forEach((node) => {
      addNoteBadge(node);
      addNoteBody(node);
    });
    positionNotes();
  }

  // Each body is laid out at zoom 1 in model pixels and scaled with the canvas,
  // so it wraps exactly as noteSize() measured it.
  function positionNoteBodies() {
    const zoom = cy.zoom();

    Object.keys(noteBodies).forEach((id) => {
      const node = cy.getElementById(id);
      const body = noteBodies[id];

      if (node.empty() || node.hasClass('hidden')) {
        body.style.display = 'none';
        return;
      }

      const size = noteSize(node);
      const pos = node.renderedPosition();
      body.style.display = 'block';
      body.style.width = size.width + 'px';
      body.style.height = size.height + 'px';
      body.style.opacity = isFaded(node) ? String(FADED_OPACITY) : '';
      body.style.transform = 'translate(' + (pos.x - (size.width / 2) * zoom) + 'px, ' + (pos.y - (size.height / 2) * zoom) + 'px) scale(' + zoom + ')';
    });
  }

  function positionNotes() {
    positionNoteBodies();

    const zoom = cy.zoom();
    const tooSmall = zoom < 0.35;
    const size = Math.max(15, 17 * zoom);
    Object.keys(noteMap).forEach((id) => {
      const node = cy.getElementById(id);
      const badge = noteMap[id];
      if (node.empty() || node.hasClass('hidden') || isFaded(node) || tooSmall) {
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
    if (!isTypeName(type) || !isHexColor(color)) {
      return;
    }

    activeColors[type] = color;
    // The fill and text functions of entities and proxies read activeColors,
    // which isn't element data, so Cytoscape restyles only when asked.
    cy.nodes('[entityType="' + type + '"]').updateStyle();
    positionCaptions();
    settings.colors = settings.colors || {};
    settings.colors[type] = color;
    saveSettings();
    bump();
  }

  function applySymbol(type, key) {
    if (!isTypeName(type) || !isSymbol(key)) {
      return;
    }

    activeSymbols[type] = key;
    // The shape and entity width functions read activeSymbols, which isn't
    // element data, so Cytoscape restyles only when asked.
    cy.style().update();
    settings.symbols = settings.symbols || {};
    settings.symbols[type] = key;
    saveSettings();
    bump();
  }

  // The new diagram settings apply to the next diagram, so only the colours
  // and symbols are redrawn.
  function resetSettings() {
    delete settings.colors;
    delete settings.symbols;
    delete settings.newDiagrams;
    delete settings.frame;
    delete settings.markdown;
    delete settings.checks;
    delete settings.hover;
    saveSettings();
    applyFrame();
    initColors();
    cy.style(style());
    positionCaptions();
    positionNotes();
    bump();
  }

  function setLines(patch) {
    settings.lines = readLineSettings({ ...readLineSettings(settings.lines), ...patch });
    saveSettings();
    cy.style(style());
    showLines();
  }

  function addCustomType(type, label, color, symbol) {
    const key = machineName(type);
    if (!key || allTypeKeys().includes(key)) {
      return null;
    }
    settings.customTypes = customTypes().concat([{ type: key, label: (label || '').trim() || humanize(key) }]);
    settings.colors = { ...(settings.colors || {}), [key]: isHexColor(color) ? color : FALLBACK_COLOR };
    settings.symbols = { ...(settings.symbols || {}), [key]: isSymbol(symbol) ? symbol : FALLBACK_SYMBOL };
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

    centreOn(withFields(matches), 1);
  }

  cy.on('zoom', () => {
    $('zoom-level').textContent = Math.round(cy.zoom() * 100) + '%';
  });

  cy.on('mouseover', 'node', (evt) => {
    if (isNote(evt.target)) {
      return;
    }

    const tooltip = $('tooltip');
    tooltip.innerHTML = tooltipHtml(evt.target);
    tooltip.hidden = false;
  });
  cy.on('mouseover', 'node', scheduleHover);
  cy.on('mousemove', 'node', (evt) => {
    const tooltip = $('tooltip');
    tooltip.style.left = evt.renderedPosition.x + 14 + 'px';
    tooltip.style.top = evt.renderedPosition.y + 14 + 'px';
  });
  cy.on('mouseout', 'node', () => {
    $('tooltip').hidden = true;
    clearHover();
  });
  // A press starts a tap, a drag, a pan or a box selection, and a pan, a
  // zoom or an edit moves the elements under the pointer.
  cy.on('tapstart cxttapstart boxstart viewport add remove', clearHover);
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
    // The proxy highlights the entity it stands in for, but it belongs to
    // the entity of its field.
    focusEntity(evt.target.data('target'));
    setFocused({ kind: 'proxy', id: evt.target.id() });
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
    addNoteBody(evt.target);
    positionCaptions();
    positionNotes();
  });
  // refresh() covers only the fields present when it runs, so a field added,
  // renamed or retyped later is checked against the level here.
  cy.on('add data', 'node[group="field"]', (evt) => refreshField(evt.target));
  cy.on('remove', 'node', (evt) => {
    removeCaptions(evt.target);
    removeNoteBadge(evt.target);
    removeNoteBody(evt.target);
  });
  cy.on('data', 'node[group="annotation"][kind="note"]', (evt) => {
    const body = noteBodies[evt.target.id()];

    if (body) {
      body.innerHTML = noteHtml(evt.target.data('note'));
      positionNoteBodies();
    }
  });

  // The level is a display setting, so its layout run is not a history step.
  // The Fields table shows which fields are on the canvas, so the store is
  // notified.
  function setDetailLevel(id) {
    if (!detailLevel(id) || id === levelId) {
      return;
    }

    levelId = id;
    showLevel();
    clearFocus();
    untracked(() => refresh(true));
    bump();
  }

  // Moves to the first level that shows every field with the ids, when the
  // level hides any of them.
  function revealFields(ids) {
    const fields = cy.nodes('[group="field"]').filter((field) => ids.includes(field.id()));

    setDetailLevel(
      levelToShow(
        levelId,
        fields.map((field) => ({ kind: field.data('kind'), fieldType: field.data('fieldType') })),
      ),
    );
  }

  $('proxy-toggle').checked = proxyMode;
  $('machine-names').checked = showMachineNames;
  $('search').value = '';

  return {
    cy,
    refresh,
    runLayout,
    tidyTarget,
    showTidyTarget,
    tidy,
    applyLayout,
    syncReferences,
    resetView,
    clearFocus,
    clearHover,
    focusEntity,
    focusField,
    explore: startExplore,
    setExplore,
    clearExplore,
    syncExplore,
    exploring,
    withoutExplore,
    // Whether the explore view hides the entity or field with the id, or the
    // field's entity.
    exploreHides: (id) => {
      const node = cy.getElementById(id);

      return node.nonempty() && outsideExplore(node.data('group') === 'field' ? cy.getElementById(node.data('entity')) : node);
    },
    setFieldHidden,
    detailLevel: () => levelId,
    setDetailLevel,
    revealFields,
    rebuildCaptions,
    rebuildNotes,
    renderedBottom,
    searchHighlight,
    applyColor,
    applySymbol,
    resetSettings,
    diagramDefaults,
    setDiagramDefault,
    layoutOptions: () => Object.entries(LAYOUTS).map(([value, layout]) => ({ value: value, name: layout.name })),
    addCustomType,
    removeCustomType,
    frameSettings: () => frameSettings(settings.frame),
    setFrame,
    markdownSettings: () => readMarkdownSettings(settings.markdown),
    setMarkdown,
    checkSettings: () => readCheckSettings(settings.checks),
    setChecks,
    hoverSettings: () => readHoverSettings(settings.hover),
    setHover,
    // A comparison adds elements the open diagram lacks, so the checks keep
    // the problems the diagram had before it.
    problems: () => (comparison ? comparison.problems : checkModel(documentFromGraph(cy), settings.checks)),
    startComparison,
    stopComparison,
    fitOpenArea,
    modelData: () => ({
      nodes: cy.nodes('[group="entity"], [group="field"]').map((node) => ({ data: node.data() })),
      edges: cy.edges('[group="ref"]').map((edge) => ({ data: edge.data() })),
    }),
    focusProblem,
    canFocusProblem: (id) => problemTarget(id) !== null,
    setLines,
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
    records: () => {
      const records = cy.nodes('[group="field"]').map((f) => {
        const owner = cy.getElementById(f.data('entity'));
        const refs = f
          .connectedEdges('[group="ref"]')
          .filter((e) => e.source().id() === f.id())
          .map((e) => {
            const target = cy.getElementById(e.target().id());
            return { id: e.target().id(), label: target.nonempty() ? target.data('label') : e.target().id() };
          });
        return {
          id: f.id(),
          hidden: !!f.data('hidden'),
          hiddenBy: hiddenBy(f),
          entityId: f.data('entity'),
          entity: owner.nonempty() ? owner.data('label') : f.data('entity'),
          entityType: owner.nonempty() ? owner.data('entityType') : '',
          entityDescription: owner.nonempty() ? owner.data('description') || '' : '',
          field: f.data('label'),
          name: f.data('name') || '',
          type: f.data('fieldType'),
          kind: f.data('kind'),
          cardinality: f.data('cardinality') != null ? f.data('cardinality') : 1,
          required: !!f.data('required'),
          refs: refs,
          description: f.data('description') || '',
          defaultValue: f.data('defaultValue') || '',
          allowedValues: f.data('allowedValues') || [],
          translatable: typeof f.data('translatable') === 'boolean' ? f.data('translatable') : null,
        };
      });
      const sharing = fieldSharing(records);

      return records.map((r) => ({ ...r, usedIn: sharing.get(r.id) }));
    },
    canvasGraph: () => {
      const visible = shown(cy.elements());

      return canvasGraph(
        {
          nodes: visible.nodes().map((n) => ({ data: n.data(), position: n.position(), width: n.outerWidth(), height: n.outerHeight() })),
          edges: visible.edges().map((e) => ({ data: e.data() })),
        },
        {
          direction: LAYOUTS[layoutName].rankDir,
          colorFor: entityColor,
          symbolFor: (type) => activeSymbols[type] || FALLBACK_SYMBOL,
          typeLabel: typeLabel,
          machineNames: showMachineNames,
        },
      );
    },
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

// Fills the lines menu with an item for each line style, in LINE_OPTIONS
// order.
function fillLinesMenu() {
  const items = LINE_OPTIONS.map((option) => {
    const item = document.createElement('sl-menu-item');
    const prefix = document.createElement('span');

    prefix.setAttribute('slot', 'prefix');
    prefix.innerHTML = icon(option.icon);
    item.setAttribute('type', 'checkbox');
    item.setAttribute('value', option.id);
    item.setAttribute('title', option.title);
    item.append(prefix, option.label);

    return item;
  });

  $('lines-menu').append(...items);
}

// Names the line style on the lines button and ticks it in the menu.
function showLines() {
  const option = lineOption(readLineSettings(settings.lines).style);
  const button = $('lines-choose');

  button.querySelector('.lines-label').textContent = 'Lines: ' + option.label;
  // SlButton does not reflect its title property, so set the attribute.
  button.setAttribute('title', option.title);
  $('lines-menu')
    .querySelectorAll('sl-menu-item')
    .forEach((item) => {
      item.checked = item.getAttribute('value') === option.id;
    });
}

// Fills the detail level group with an icon button for each level, in
// DETAIL_LEVELS order.
function fillLevelButtons() {
  const buttons = DETAIL_LEVELS.map((level) => {
    const button = document.createElement('sl-button');

    button.className = 'toolbar__button toolbar__button--icon';
    button.setAttribute('size', 'small');
    button.setAttribute('data-level', level.id);
    button.setAttribute('title', level.label + ': ' + level.title);
    button.setAttribute('aria-label', level.label);
    button.innerHTML = icon(level.icon);

    return button;
  });

  $('detail-levels').append(...buttons);
}

// Marks the level's button active and titles the group with the level the
// F shortcut moves to.
function showLevel() {
  const group = $('detail-levels');

  group.querySelectorAll('[data-level]').forEach((button) => {
    const active = button.getAttribute('data-level') === levelId;

    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  group.setAttribute('title', 'Switch to the next detail level: ' + nextLevel(levelId).label);
}

function wire() {
  // A shortcut can export the diagram while the pointer rests on a node, and
  // an export draws the classes the graph has.
  window.addEventListener('keydown', () => controller.clearHover(), true);
  // Cytoscape fires no mouseout when the pointer leaves a node for a panel
  // over the canvas.
  $('cy').addEventListener('mouseleave', () => controller.clearHover());
  $('zoom-in').addEventListener('click', () =>
    controller.cy.zoom({ level: controller.cy.zoom() * 1.25, renderedPosition: { x: controller.cy.width() / 2, y: controller.cy.height() / 2 } }),
  );
  $('zoom-out').addEventListener('click', () =>
    controller.cy.zoom({ level: controller.cy.zoom() * 0.8, renderedPosition: { x: controller.cy.width() / 2, y: controller.cy.height() / 2 } }),
  );
  $('fit').addEventListener('click', () => controller.cy.fit(undefined, FIT_PADDING));
  $('reset').addEventListener('click', () => {
    controller.clearFocus();
    controller.resetView();
  });
  $('layout-run').addEventListener('click', () => {
    controller.runLayout();
    checkpoint('Re-ran the ' + LAYOUTS[layoutName].label + ' layout');
  });
  $('tidy').addEventListener('click', () => {
    const target = controller.tidyTarget();

    controller.tidy();
    checkpoint(target.nonempty() ? 'Tidied ' + nodeLookup(controller.cy)(target.id()).label : 'Tidied the layout');
  });

  // The Inspector's screen is in the store, so its changes reach the Tidy
  // button's title from here.
  subscribe(() => controller.showTidyTarget());

  fillLayoutMenu();
  fillLinesMenu();
  showLines();

  // A line style is a display preference, so it is not a history step.
  $('lines-menu').addEventListener('sl-select', (evt) => {
    controller.setLines({ style: evt.detail.item.value });
  });

  // The menu flips a checkbox item on every select, so showLayout() ticks
  // the picked item again even when it was already ticked. Cytoscape caches
  // the edges' taxi direction from style(), so the stylesheet is reapplied
  // before the run. A pick changes the display, so its layout is not a history
  // step, as for the display toggles below.
  $('layout-menu').addEventListener('sl-select', (evt) => {
    layoutName = evt.detail.item.value;
    showLayout();
    controller.cy.style().update();
    untracked(() => controller.runLayout());
  });

  $('zoom-menu').addEventListener('sl-select', (evt) => {
    const value = evt.detail.item.value;
    if (value === 'fit') {
      controller.cy.fit(undefined, FIT_PADDING);
      return;
    }
    controller.cy.zoom({ level: parseFloat(value), renderedPosition: { x: controller.cy.width() / 2, y: controller.cy.height() / 2 } });
  });

  fillLevelButtons();
  // The F shortcut clicks the group itself, which steps to the next level.
  $('detail-levels').addEventListener('click', (evt) => {
    const button = evt.target.closest('[data-level]');

    controller.setDetailLevel(button ? button.getAttribute('data-level') : nextLevel(levelId).id);
  });

  // The display toggles re-run the layout too, but undo reverts edits only,
  // so their layout is not a history step. A click on a switch's label
  // clicks its input too, so the handlers take 'sl-change', which fires
  // once per toggle. Proxies draw beside reference fields, so turning them
  // on at the Entities level moves to the References level.
  $('proxy-toggle').addEventListener('sl-change', (evt) => {
    proxyMode = evt.target.checked;
    if (proxyMode && !showsFields(levelId)) {
      levelId = 'references';
      showLevel();
    }
    controller.clearFocus();
    untracked(() => controller.refresh(true));
    bump();
  });

  $('machine-names').addEventListener('sl-change', (evt) => {
    showMachineNames = evt.target.checked;
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
  // A comparison is drawn on the graph it started on, which is gone.
  setComparison(null);
  closeInspector();
  applyFrame();

  if (!wired) {
    wire();
    wired = true;
  }

  showLayout();
  showLevel();
  controller.showTidyTarget();

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
