/**
 * Text formats of the diagram: Mermaid and Graphviz DOT.
 *
 * canvasGraph() reads the nodes and edges the canvas shows from graph element
 * definitions: each node's data, position and drawn size, and each edge's
 * data. toMermaid() and toDot() write that graph as text, with the shapes,
 * colours and line styles the canvas draws. Nothing here touches the DOM.
 */

import { isHexColor, isSymbol } from './type-styles.js';
import { NOTE_KIND } from './annotations.js';
import { noteMarkdownPlain } from './note-markdown.js';

// Mermaid's default maxTextSize and maxEdges; a diagram past either doesn't
// render, and neither can be raised from inside the diagram.
export const MERMAID_MAX_TEXT = 50000;
export const MERMAID_MAX_EDGES = 500;

// Above this many entities Mermaid lays a diagram out slowly and overlaps it.
export const MERMAID_MAX_ENTITIES = 100;

export const MERMAID_LARGE_NOTE = '%% This diagram is large for Mermaid, which may draw it slowly or not at all. Save it as Graphviz DOT instead.';

const INDENT = '  ';

const FALLBACK_SYMBOL = 'rounded';

const NODE_GROUPS = ['entity', 'field', 'proxy', 'annotation'];

const EDGE_KINDS = { has: 'has', ref: 'ref', proxyedge: 'proxy', collapsed: 'collapsed', annotation: 'annotation' };

// The canvas's light theme colours, which every export draws in.
const COLORS = {
  text: '#1f2933',
  muted: '#6b7280',
  nodeBorder: '#5b6470',
  fieldBg: '#ffffff',
  fieldBorder: '#555c66',
  systemBorder: '#98a2b3',
  calculatedBg: '#ffd966',
  calculatedBorder: '#c9a227',
  calculatedText: '#3a2f0a',
  proxyBorder: '#8a94a3',
  edge: '#aeb4bd',
  refEdge: '#8a94a3',
  proxyEdge: '#c2c8d0',
  annotationEdge: '#b5739d',
  annotationText: '#8a5a76',
  noteBg: '#fff4b3',
  noteBorder: '#d9b93a',
  noteText: '#3a2f0a',
};

// Mermaid 11.3 shapes for the entity symbols. Mermaid has no ellipse, tag,
// pentagon or octagon, so those take the nearest shape it has.
const MERMAID_SHAPES = {
  rounded: 'rounded',
  rectangle: 'rect',
  ellipse: 'stadium',
  diamond: 'diam',
  hexagon: 'hex',
  tag: 'odd',
  barrel: 'cyl',
  cut: 'notch-rect',
  rhomboid: 'lean-r',
  pentagon: 'notch-pent',
  octagon: 'hex',
};

const DOT_SHAPES = {
  rounded: { shape: 'box', style: ['rounded'] },
  rectangle: { shape: 'box', style: [] },
  ellipse: { shape: 'ellipse', style: [] },
  diamond: { shape: 'diamond', style: [] },
  hexagon: { shape: 'hexagon', style: [] },
  tag: { shape: 'cds', style: [] },
  barrel: { shape: 'cylinder', style: [] },
  cut: { shape: 'box', style: ['diagonals'] },
  rhomboid: { shape: 'parallelogram', style: [] },
  pentagon: { shape: 'pentagon', style: [] },
  octagon: { shape: 'octagon', style: [] },
};

const ANNOTATION_SYMBOLS = { event: 'diamond', api: 'hexagon', callback: 'rounded', [NOTE_KIND]: 'rectangle' };

// Words that start a Mermaid flowchart statement, so a node id can't be one.
const MERMAID_KEYWORDS = /^(end|graph|flowchart|subgraph|direction|style|classdef|class|linkstyle|click|call|href|default)$/i;

function text(value, fallback) {
  const line = value == null ? '' : String(value).replace(/\s+/g, ' ').trim();

  return line === '' ? fallback : line;
}

function rounded(value, places) {
  const scale = 10 ** places;
  const result = Math.round((Number(value) || 0) * scale) / scale;

  return Object.is(result, -0) ? 0 : result;
}

function machineNameOf(data) {
  if (data.group === 'entity') {
    return text(data.bundle, '');
  }

  return data.group === 'field' ? text(data.name, '') : '';
}

function nodeLabel(data) {
  if (data.group === 'field') {
    const label = text(data.label, text(data.name, data.id));

    return data.required === true ? label + ' *' : label;
  }

  if (data.group === 'proxy') {
    return text(data.label, text(data.target, data.id));
  }

  return text(data.label, data.id);
}

// A node's text as the label and the lines below it. A note's text is its
// Markdown without the markup, 1 line per block.
function nodeText(data) {
  if (data.group === 'annotation' && data.kind === NOTE_KIND) {
    const lines = noteMarkdownPlain(data.note)
      .split('\n')
      .map((line) => text(line, ''))
      .filter((line) => line !== '');

    return { label: lines[0] || '', detail: lines.slice(1).join('\n') };
  }

  return { label: nodeLabel(data), detail: data.group === 'annotation' ? text(data.method, '') : '' };
}

/**
 * Reads the graph a text export draws from graph element definitions.
 *
 * `elements` holds the nodes and edges the canvas shows, in canvas order. A
 * node is `{ data, position, width, height }`, with its drawn size in model
 * pixels, and an edge is `{ data }`.
 *
 * Options:
 * - direction: `LR` or `TB`, the direction of the layout. Defaults to `LR`.
 * - colorFor: returns the fill colour of an entity type. Only a 6- or 8-digit
 *   hex colour is kept.
 * - symbolFor: returns the symbol of an entity type. Only a key of SYMBOLS is
 *   kept, and any other value draws as a rounded rectangle.
 * - typeLabel: returns the caption of an entity type. Without it, entities
 *   have no type caption.
 * - machineNames: whether each entity and field carries its machine name.
 *
 * Nodes of an unknown group are left out, and so is every edge of an unknown
 * group or with an end the graph doesn't hold.
 */
export function canvasGraph(elements, options = {}) {
  const colorFor = options.colorFor || (() => null);
  const symbolFor = options.symbolFor || (() => FALLBACK_SYMBOL);
  const typeLabel = options.typeLabel || (() => '');

  const nodes = (elements.nodes || [])
    .filter((node) => NODE_GROUPS.includes(node.data.group))
    .map((node) => {
      const data = node.data;
      const typed = data.group === 'entity' || data.group === 'proxy';
      const color = typed ? colorFor(data.entityType) : null;
      const symbol = typed ? symbolFor(data.entityType) : null;

      return {
        id: data.id,
        group: data.group,
        ...nodeText(data),
        caption: data.group === 'entity' ? text(typeLabel(data.entityType), '') : '',
        machineName: options.machineNames === true ? machineNameOf(data) : '',
        entityType: typed ? text(data.entityType, '') : '',
        color: isHexColor(color) ? color : null,
        symbol: typed ? (isSymbol(symbol) ? symbol : FALLBACK_SYMBOL) : null,
        kind: data.group === 'field' || data.group === 'annotation' ? text(data.kind, '') : '',
        x: rounded(node.position?.x, 0),
        y: rounded(node.position?.y, 0),
        width: rounded(node.width, 0),
        height: rounded(node.height, 0),
      };
    });
  const ids = new Set(nodes.map((node) => node.id));

  const edges = (elements.edges || [])
    .filter((edge) => Object.hasOwn(EDGE_KINDS, edge.data.group) && ids.has(edge.data.source) && ids.has(edge.data.target))
    .map((edge) => {
      const data = edge.data;
      const kind = EDGE_KINDS[data.group];
      const label = kind === 'ref' || kind === 'proxy' ? data.cardinality : kind === 'annotation' ? data.label : '';

      return { source: data.source, target: data.target, kind: kind, label: text(label, '') };
    });

  return { direction: options.direction === 'TB' ? 'TB' : 'LR', nodes: nodes, edges: edges };
}

/**
 * Turns a value into an identifier of ASCII letters, digits and underscores
 * that starts with a letter. Any other character becomes an underscore, and a
 * value that doesn't start with a letter gets `prefix` and an underscore in
 * front. An empty value gives `prefix` alone.
 */
export function identifier(value, prefix) {
  const name = String(value == null ? '' : value).replace(/[^A-Za-z0-9_]/g, '_');

  if (name === '') {
    return prefix;
  }

  return /^[A-Za-z]/.test(name) ? name : prefix + '_' + name;
}

/**
 * Maps each id to a distinct identifier. Ids that give the same identifier
 * keep their order: the first takes it and each later one takes the lowest
 * free `_2`, `_3` suffix that no other id gives on its own.
 */
export function identifiers(ids, prefix = 'n') {
  const bases = ids.map((id) => {
    const name = identifier(id, prefix);

    return MERMAID_KEYWORDS.test(name) ? prefix + '_' + name : name;
  });
  const taken = new Set(bases);
  const used = new Set();
  const result = new Map();

  ids.forEach((id, index) => {
    let name = bases[index];

    if (used.has(name)) {
      let suffix = 2;

      while (taken.has(bases[index] + '_' + suffix)) {
        suffix++;
      }

      name = bases[index] + '_' + suffix;
      taken.add(name);
    }

    used.add(name);
    result.set(id, name);
  });

  return result;
}

// Mermaid replaces '#name;' and '#123;' codes in the diagram before it parses
// it, so '#' is encoded first and every other code stays literal. Braces end
// a shape's data and a bar ends an edge label.
function mermaidText(value) {
  return value
    .replace(/#/g, '#35;')
    .replace(/\\/g, '#92;')
    .replace(/"/g, '#quot;')
    .replace(/`/g, '#96;')
    .replace(/&/g, '#amp;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/\{/g, '#123;')
    .replace(/\}/g, '#125;')
    .replace(/\|/g, '#124;');
}

function nodeSymbol(node) {
  if (node.group === 'field') {
    return 'ellipse';
  }

  if (node.group === 'annotation') {
    return ANNOTATION_SYMBOLS[node.kind] || 'rectangle';
  }

  return node.symbol;
}

// The canvas draws the type caption and the machine name smaller than the
// label, so they go on lines of their own in <small>.
function captionLines(node) {
  return [node.caption, node.machineName].filter((line) => line !== '');
}

function textLines(node) {
  return [node.label, ...node.detail.split('\n')].filter((line) => line !== '');
}

function mermaidLabel(node, compaction) {
  const lines = textLines(node).map(mermaidText);
  const captions = [compaction.captions ? node.caption : '', compaction.machineNames ? node.machineName : ''].filter((line) => line !== '');

  return lines.concat(captions.map((line) => '<small>' + mermaidText(line) + '</small>')).join('<br>');
}

function mermaidShape(node) {
  return node.group === 'field' ? 'stadium' : MERMAID_SHAPES[nodeSymbol(node)];
}

// The shorter shape syntax that draws the same shape as Mermaid 11.3's
// '@{ shape: ... }', as the text before and after the quoted label. The
// notched shapes have none.
const MERMAID_CLASSIC_SHAPES = {
  rect: ['[', ']'],
  rounded: ['(', ')'],
  stadium: ['([', '])'],
  diam: ['{', '}'],
  hex: ['{{', '}}'],
  'lean-r': ['[/', '/]'],
  cyl: ['[(', ')]'],
  odd: ['>', ']'],
};

function mermaidNode(name, node, compaction) {
  const shape = mermaidShape(node);
  const label = '"' + mermaidLabel(node, compaction) + '"';

  if (compaction.classicShapes && Object.hasOwn(MERMAID_CLASSIC_SHAPES, shape)) {
    return name + MERMAID_CLASSIC_SHAPES[shape][0] + label + MERMAID_CLASSIC_SHAPES[shape][1];
  }

  return name + '@{ shape: ' + shape + ', label: ' + label + ' }';
}

function fieldClass(node) {
  return ['multi', 'system', 'calculated'].includes(node.kind) ? 'field_' + node.kind : 'field';
}

function mermaidClass(node) {
  if (node.group === 'field') {
    return fieldClass(node);
  }

  if (node.group === 'annotation') {
    return node.kind === NOTE_KIND ? 'note' : 'annotation';
  }

  return node.group + '_' + identifier(node.entityType, 't');
}

function mermaidStyle(name, node) {
  const fill = node.color ? 'fill:' + node.color + ',' : '';
  const styles = {
    field: 'fill:' + COLORS.fieldBg + ',stroke:' + COLORS.fieldBorder + ',color:' + COLORS.text,
    field_multi: 'fill:' + COLORS.fieldBg + ',stroke:' + COLORS.fieldBorder + ',stroke-width:3px,color:' + COLORS.text,
    field_system: 'fill:' + COLORS.fieldBg + ',stroke:' + COLORS.systemBorder + ',stroke-dasharray:4 3,color:' + COLORS.muted,
    field_calculated: 'fill:' + COLORS.calculatedBg + ',stroke:' + COLORS.calculatedBorder + ',color:' + COLORS.calculatedText,
    annotation: 'fill:' + COLORS.fieldBg + ',stroke:' + COLORS.nodeBorder + ',color:' + COLORS.text,
    note: 'fill:' + COLORS.noteBg + ',stroke:' + COLORS.noteBorder + ',color:' + COLORS.noteText,
  };

  if (Object.hasOwn(styles, name)) {
    return styles[name];
  }

  if (node.group === 'proxy') {
    return fill + 'fill-opacity:0.4,stroke:' + COLORS.proxyBorder + ',stroke-dasharray:4 3,color:' + COLORS.muted + ',font-style:italic';
  }

  return fill + 'stroke:' + COLORS.nodeBorder + ',color:' + COLORS.text;
}

const MERMAID_LINKS = {
  has: { arrow: '---', style: 'stroke:' + COLORS.edge },
  ref: { arrow: '-->', style: 'stroke:' + COLORS.refEdge },
  collapsed: { arrow: '-->', style: 'stroke:' + COLORS.refEdge },
  proxy: { arrow: '-.->', style: 'stroke:' + COLORS.proxyEdge },
  annotation: { arrow: '-.->', style: 'stroke:' + COLORS.annotationEdge + ',color:' + COLORS.annotationText },
};

const FULL_MERMAID = { shortIds: false, classicShapes: false, machineNames: true, captions: true };

// The steps that shrink a flowchart past MERMAID_MAX_TEXT, least lossy first,
// each with what the note says it changed. The classic shapes draw the same
// shapes, so they need no note.
export const MERMAID_COMPACTIONS = [
  { change: { shortIds: true }, note: 'node ids are shortened' },
  { change: { classicShapes: true }, note: '' },
  { change: { machineNames: false }, note: 'machine names are left out' },
  { change: { captions: false }, note: 'entity type captions are left out' },
];

/**
 * Returns the note that says which compactions shrank a flowchart past
 * Mermaid's character limit, or an empty string when none says anything.
 */
export function mermaidCompactionNote(notes) {
  const changes = notes.filter((note) => note !== '');

  if (changes.length === 0) {
    return '';
  }

  const list = changes.length === 1 ? changes[0] : changes.slice(0, -1).join(', ') + ' and ' + changes[changes.length - 1];

  return "%% This diagram is past Mermaid's " + MERMAID_MAX_TEXT.toLocaleString('en-US') + '-character limit, so ' + list + '.';
}

function mermaidLines(graph, title, compaction, note) {
  const names = compaction.shortIds ? new Map(graph.nodes.map((node, index) => [node.id, 'n' + (index + 1)])) : identifiers(graph.nodes.map((node) => node.id));
  const name = (id) => names.get(id);
  const indent = compaction.shortIds ? '' : INDENT;
  const lines = ['---'];

  // The front matter is YAML, which Mermaid reads before it decodes '#'
  // codes, and a JSON string is a valid YAML string.
  if (text(title, '') !== '') {
    lines.push('title: ' + JSON.stringify(text(title, '')));
  }

  lines.push('config:', '  flowchart:', '    curve: step', '---', 'flowchart ' + graph.direction);
  const header = lines.length;

  if (note !== '') {
    lines.push(note);
  }

  const classes = new Map();

  graph.nodes.forEach((node) => {
    const className = mermaidClass(node);

    lines.push(indent + mermaidNode(name(node.id), node, compaction));

    if (!classes.has(className)) {
      classes.set(className, { style: mermaidStyle(className, node), members: [] });
    }

    classes.get(className).members.push(name(node.id));
  });

  const linkStyles = new Map();

  graph.edges.forEach((edge, index) => {
    const link = MERMAID_LINKS[edge.kind];
    const label = edge.label ? '|"' + mermaidText(edge.label) + '"|' : '';

    lines.push(indent + name(edge.source) + ' ' + link.arrow + label + ' ' + name(edge.target));
    linkStyles.set(link.style, [...(linkStyles.get(link.style) || []), index]);
  });

  classes.forEach((entry, className) => lines.push(indent + 'classDef ' + className + ' ' + entry.style));
  classes.forEach((entry, className) => lines.push(indent + 'class ' + entry.members.join(',') + ' ' + className));
  linkStyles.forEach((indexes, style) => lines.push(indent + 'linkStyle ' + indexes.join(',') + ' ' + style));

  return { lines: lines, header: header };
}

function joined(lines) {
  return lines.join('\n') + '\n';
}

/**
 * Writes a canvas graph as a Mermaid flowchart in the direction of the
 * layout: each node in the shape and colours the canvas draws it in, and
 * each edge in its line style. Mermaid lays the flowchart out itself.
 *
 * A flowchart past `maxText` characters, Mermaid's limit by default, goes
 * through MERMAID_COMPACTIONS in turn until it fits, and starts with a note
 * that says what they changed. A graph Mermaid still can't draw well also
 * starts with MERMAID_LARGE_NOTE.
 */
export function toMermaid(graph, title = '', maxText = MERMAID_MAX_TEXT) {
  let compaction = FULL_MERMAID;
  const notes = [];
  let result = mermaidLines(graph, title, compaction, '');

  for (const step of MERMAID_COMPACTIONS) {
    if (joined(result.lines).length <= maxText) {
      break;
    }

    compaction = { ...compaction, ...step.change };
    notes.push(step.note);
    result = mermaidLines(graph, title, compaction, mermaidCompactionNote(notes));
  }

  const entities = graph.nodes.filter((node) => node.group === 'entity').length;

  if (entities > MERMAID_MAX_ENTITIES || graph.edges.length > MERMAID_MAX_EDGES || joined(result.lines).length > maxText) {
    result.lines.splice(result.header, 0, MERMAID_LARGE_NOTE);
  }

  return joined(result.lines);
}

// Graphviz decodes HTML entities in quoted labels, so '&' is escaped too.
function dotEscape(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/&/g, '&amp;');
}

function dotString(value) {
  return '"' + dotEscape(value) + '"';
}

function dotAttributes(attributes) {
  return (
    '[' +
    Object.entries(attributes)
      .filter(([, value]) => value !== null && value !== '')
      .map(([key, value]) => key + '=' + value)
      .join(', ') +
    ']'
  );
}

function dotHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A label with captions is an HTML-like label, so the captions can be smaller
// and muted. '\n' in a quoted DOT string is a line break.
function dotLabel(node) {
  const captions = captionLines(node);

  if (captions.length > 0) {
    const lines = textLines(node).map(dotHtml);
    const small = captions.map((line) => '<FONT POINT-SIZE="9" COLOR="' + COLORS.muted + '">' + dotHtml(line) + '</FONT>');

    return '<' + lines.concat(small).join('<BR/>') + '>';
  }

  return '"' + textLines(node).map(dotEscape).join('\\n') + '"';
}

// A proxy's fill is its entity's colour at 40% opacity, as on the canvas.
function proxyFill(color) {
  return color && color.length === 7 ? color + '66' : color;
}

function dotNodeAttributes(node) {
  const shape = DOT_SHAPES[nodeSymbol(node)];
  const style = [...shape.style, 'filled'];
  const attributes = { label: dotLabel(node), shape: shape.shape };

  if (node.group === 'entity') {
    attributes.fillcolor = node.color ? '"' + node.color + '"' : null;
  }

  if (node.group === 'proxy') {
    style.unshift('dashed');
    Object.assign(attributes, {
      fillcolor: node.color ? '"' + proxyFill(node.color) + '"' : null,
      color: '"' + COLORS.proxyBorder + '"',
      fontcolor: '"' + COLORS.muted + '"',
      fontname: '"Helvetica-Oblique"',
    });
  }

  if (node.group === 'field') {
    Object.assign(attributes, { fillcolor: '"' + COLORS.fieldBg + '"', color: '"' + COLORS.fieldBorder + '"' });

    if (node.kind === 'multi') {
      attributes.peripheries = 2;
    }

    if (node.kind === 'system') {
      style.unshift('dashed');
      Object.assign(attributes, { color: '"' + COLORS.systemBorder + '"', fontcolor: '"' + COLORS.muted + '"' });
    }

    if (node.kind === 'calculated') {
      Object.assign(attributes, {
        fillcolor: '"' + COLORS.calculatedBg + '"',
        color: '"' + COLORS.calculatedBorder + '"',
        fontcolor: '"' + COLORS.calculatedText + '"',
      });
    }
  }

  if (node.group === 'annotation') {
    attributes.fillcolor = '"' + COLORS.fieldBg + '"';

    if (node.kind === NOTE_KIND) {
      Object.assign(attributes, { fillcolor: '"' + COLORS.noteBg + '"', color: '"' + COLORS.noteBorder + '"', fontcolor: '"' + COLORS.noteText + '"' });
    }

    if (node.kind === 'callback') {
      attributes.fontname = '"Helvetica-Bold"';
    }
  }

  // Graphviz's y axis points up and the canvas's points down.
  return {
    ...attributes,
    style: '"' + style.join(',') + '"',
    pos: '"' + node.x + ',' + -node.y + '!"',
    width: node.width ? rounded(node.width / 72, 3) : null,
    height: node.height ? rounded(node.height / 72, 3) : null,
  };
}

const DOT_EDGES = {
  has: { dir: 'none' },
  ref: { color: '"' + COLORS.refEdge + '"' },
  collapsed: { color: '"' + COLORS.refEdge + '"' },
  proxy: { style: 'dashed', color: '"' + COLORS.proxyEdge + '"' },
  annotation: { style: 'dashed', color: '"' + COLORS.annotationEdge + '"', fontcolor: '"' + COLORS.annotationText + '"' },
};

/**
 * Writes a canvas graph as a Graphviz DOT digraph that keeps the canvas
 * layout: neato pins each node at its canvas position, in points, at least as
 * large as the canvas draws it, and draws it in the canvas's shape and
 * colours.
 */
export function toDot(graph, title = '') {
  const names = identifiers(graph.nodes.map((node) => node.id));
  const name = (id) => dotString(names.get(id));
  const graphTitle = text(title, '');
  const graphLabel = graphTitle ? ', label=' + dotString(graphTitle) + ', labelloc=t' : '';
  const lines = ['digraph ' + dotString(graphTitle || 'nexus') + ' {'];

  lines.push(INDENT + 'graph [layout=neato, inputscale=72, splines=true, outputorder=edgesfirst, fontname="Helvetica"' + graphLabel + '];');
  lines.push(
    INDENT + 'node [fontname="Helvetica", fontsize=11, style=filled, fillcolor="#ffffff", color="' + COLORS.nodeBorder + '", fontcolor="' + COLORS.text + '"];',
  );
  lines.push(INDENT + 'edge [fontname="Helvetica", fontsize=9, color="' + COLORS.edge + '", fontcolor="' + COLORS.muted + '", arrowsize=0.7];');

  graph.nodes.forEach((node) => lines.push(INDENT + name(node.id) + ' ' + dotAttributes(dotNodeAttributes(node)) + ';'));

  graph.edges.forEach((edge) => {
    const attributes = { ...DOT_EDGES[edge.kind], label: edge.label ? dotString(edge.label) : null };

    lines.push(INDENT + name(edge.source) + ' -> ' + name(edge.target) + ' ' + dotAttributes(attributes) + ';');
  });

  lines.push('}');

  return lines.join('\n') + '\n';
}
