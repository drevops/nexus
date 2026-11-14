import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MERMAID_LARGE_NOTE,
  MERMAID_MAX_EDGES,
  MERMAID_MAX_ENTITIES,
  MERMAID_MAX_TEXT,
  canvasGraph,
  identifier,
  identifiers,
  mermaidCompactionNote,
  toDot,
  toMermaid,
} from '../../src/diagram-text.js';
import { documentToModel } from '../../src/document.js';
import { TEMPLATES, templatePath } from '../../src/templates.js';
import { SYMBOLS } from '../../src/type-styles.js';

const ROOT = join(import.meta.dirname, '..', '..');

const TAGS_FIELD = 'field:node.article:field_tags';
const TAGS_PROXY = 'proxy:' + TAGS_FIELD + '>taxonomy_term.tags';

// An article with a multi-value tags field that references a vocabulary
// through a proxy, and an API annotation pointing at the article.
function articleElements() {
  return {
    nodes: [
      { data: { id: 'node.article', group: 'entity', entityType: 'node', bundle: 'article', label: 'Article' }, position: { x: 0, y: 0 }, width: 120, height: 48 },
      {
        data: { id: TAGS_FIELD, group: 'field', entity: 'node.article', name: 'field_tags', label: 'Tags', kind: 'multi', required: true },
        position: { x: 180, y: -30 },
        width: 70,
        height: 28,
      },
      { data: { id: TAGS_PROXY, group: 'proxy', entityType: 'taxonomy_term', label: 'Tags', target: 'taxonomy_term.tags' }, position: { x: 300, y: -30 }, width: 80, height: 30 },
      { data: { id: 'taxonomy_term.tags', group: 'entity', entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags' }, position: { x: 500, y: 0 }, width: 100, height: 48 },
      { data: { id: 'api1', group: 'annotation', kind: 'api', label: 'Search API', method: 'GET /search' }, position: { x: 0, y: 200 }, width: 90, height: 40 },
    ],
    edges: [
      { data: { group: 'has', source: 'node.article', target: TAGS_FIELD } },
      { data: { group: 'proxyedge', source: TAGS_FIELD, target: TAGS_PROXY, cardinality: '1..n' } },
      { data: { group: 'annotation', source: 'api1', target: 'node.article', label: 'indexes' } },
    ],
  };
}

const ARTICLE_OPTIONS = {
  direction: 'LR',
  colorFor: (type) => (type === 'node' ? '#d9e2f3' : '#e2f0d9'),
  symbolFor: (type) => (type === 'node' ? 'rounded' : 'tag'),
  typeLabel: (type) => (type === 'node' ? 'Content type' : 'Vocabulary'),
  machineNames: true,
};

function articleGraph() {
  return canvasGraph(articleElements(), ARTICLE_OPTIONS);
}

// A graph of 1 node of the given group and data, with a self edge when an
// edge label is given.
function singleNode(data, edgeLabel) {
  const node = { id: 'node.a', group: 'entity', entityType: 'node', ...data };
  const edges = edgeLabel == null ? [] : [{ data: { group: 'annotation', source: node.id, target: node.id, label: edgeLabel } }];

  return canvasGraph({ nodes: [{ data: node }], edges: edges });
}

test('reads the nodes and edges the canvas shows', () => {
  const graph = articleGraph();

  assert.equal(graph.direction, 'LR');
  const node = (values) => ({ detail: '', caption: '', machineName: '', entityType: '', color: null, symbol: null, kind: '', ...values });

  assert.deepEqual(graph.nodes, [
    node({
      id: 'node.article',
      group: 'entity',
      label: 'Article',
      caption: 'Content type',
      machineName: 'article',
      entityType: 'node',
      color: '#d9e2f3',
      symbol: 'rounded',
      x: 0,
      y: 0,
      width: 120,
      height: 48,
    }),
    node({ id: TAGS_FIELD, group: 'field', label: 'Tags *', machineName: 'field_tags', kind: 'multi', x: 180, y: -30, width: 70, height: 28 }),
    node({ id: TAGS_PROXY, group: 'proxy', label: 'Tags', entityType: 'taxonomy_term', color: '#e2f0d9', symbol: 'tag', x: 300, y: -30, width: 80, height: 30 }),
    node({
      id: 'taxonomy_term.tags',
      group: 'entity',
      label: 'Tags',
      caption: 'Vocabulary',
      machineName: 'tags',
      entityType: 'taxonomy_term',
      color: '#e2f0d9',
      symbol: 'tag',
      x: 500,
      y: 0,
      width: 100,
      height: 48,
    }),
    node({ id: 'api1', group: 'annotation', label: 'Search API', detail: 'GET /search', kind: 'api', x: 0, y: 200, width: 90, height: 40 }),
  ]);
  assert.deepEqual(graph.edges, [
    { source: 'node.article', target: TAGS_FIELD, kind: 'has', label: '' },
    { source: TAGS_FIELD, target: TAGS_PROXY, kind: 'proxy', label: '1..n' },
    { source: 'api1', target: 'node.article', kind: 'annotation', label: 'indexes' },
  ]);
});

test('leaves out what the canvas does not draw', async (t) => {
  for (const [name, change, expectedNodes, expectedEdges] of dataProviderLeftOut()) {
    await t.test(name, () => {
      const elements = articleElements();
      change(elements);
      const graph = canvasGraph(elements);

      assert.deepEqual(
        graph.nodes.map((node) => node.id),
        expectedNodes,
      );
      assert.deepEqual(
        graph.edges.map((edge) => edge.kind),
        expectedEdges,
      );
    });
  }
});

function dataProviderLeftOut() {
  const all = ['node.article', TAGS_FIELD, TAGS_PROXY, 'taxonomy_term.tags', 'api1'];

  return [
    ['nothing', () => {}, all, ['has', 'proxy', 'annotation']],
    ['a node of an unknown group', (e) => e.nodes.push({ data: { id: 'x', group: 'caption' } }), all, ['has', 'proxy', 'annotation']],
    ['an edge of an unknown group', (e) => e.edges.push({ data: { group: 'link', source: 'api1', target: 'node.article' } }), all, ['has', 'proxy', 'annotation']],
    ['an edge to a node the graph does not hold', (e) => e.nodes.splice(2, 1), ['node.article', TAGS_FIELD, 'taxonomy_term.tags', 'api1'], ['has', 'annotation']],
    ['an edge from a node the graph does not hold', (e) => e.nodes.splice(4, 1), ['node.article', TAGS_FIELD, TAGS_PROXY, 'taxonomy_term.tags'], ['has', 'proxy']],
    [
      'an empty graph',
      (e) => {
        e.nodes.splice(0);
        e.edges.splice(0);
      },
      [],
      [],
    ],
  ];
}

test('reads each kind of edge with the label the canvas draws on it', () => {
  const elements = articleElements();
  elements.edges = [
    { data: { group: 'ref', source: TAGS_FIELD, target: 'taxonomy_term.tags', cardinality: '1..n' } },
    { data: { group: 'collapsed', source: 'node.article', target: 'taxonomy_term.tags', cardinality: '1' } },
    { data: { group: 'has', source: 'node.article', target: TAGS_FIELD, label: 'x' } },
    { data: { group: 'annotation', source: 'api1', target: 'node.article' } },
  ];

  assert.deepEqual(
    canvasGraph(elements).edges.map((edge) => [edge.kind, edge.label]),
    [
      ['ref', '1..n'],
      ['collapsed', ''],
      ['has', ''],
      ['annotation', ''],
    ],
  );
});

test('labels a node without a label by its id, name or target', async (t) => {
  for (const [name, data, expected] of dataProviderLabels()) {
    await t.test(name, () => {
      assert.equal(canvasGraph({ nodes: [{ data: data }] }).nodes[0].label, expected);
    });
  }
});

function dataProviderLabels() {
  return [
    ['a blank entity label', { id: 'node.a', group: 'entity', label: '  ' }, 'node.a'],
    ['a field without a label', { id: 'f', group: 'field', name: 'field_x' }, 'field_x'],
    ['a field without a label or name', { id: 'f', group: 'field' }, 'f'],
    ['a required field', { id: 'f', group: 'field', label: 'Body', required: true }, 'Body *'],
    ['a proxy without a label', { id: 'p', group: 'proxy', target: 'node.b' }, 'node.b'],
    ['an annotation', { id: 'a', group: 'annotation', label: 'Event' }, 'Event'],
    ['a label with line breaks', { id: 'node.a', group: 'entity', label: 'Two\nlines' }, 'Two lines'],
  ];
}

test('adds the type caption and the machine names the canvas shows', async (t) => {
  for (const [name, options, expected] of dataProviderCaptions()) {
    await t.test(name, () => {
      const graph = canvasGraph(articleElements(), options);

      assert.deepEqual(
        graph.nodes.map((node) => [node.caption, node.machineName]),
        expected,
      );
    });
  }
});

function dataProviderCaptions() {
  const typeLabel = (type) => 'Type ' + type;

  return [
    ['no options', {}, Array(5).fill(['', ''])],
    [
      'type captions',
      { typeLabel: typeLabel },
      [
        ['Type node', ''],
        ['', ''],
        ['', ''],
        ['Type taxonomy_term', ''],
        ['', ''],
      ],
    ],
    [
      'machine names',
      { machineNames: true },
      [
        ['', 'article'],
        ['', 'field_tags'],
        ['', ''],
        ['', 'tags'],
        ['', ''],
      ],
    ],
    ['machine names switched off', { machineNames: false, typeLabel: () => ' ' }, Array(5).fill(['', ''])],
  ];
}

test('escapes captions in both formats', () => {
  const graph = canvasGraph({ nodes: [{ data: { id: 'node.a', group: 'entity', entityType: 'node', bundle: 'a', label: 'A & B' } }] }, { typeLabel: () => '<i>"T"</i> #1' });

  assert.ok(toMermaid(graph).includes('label: "A #amp; B<br><small>#lt;i#gt;#quot;T#quot;#lt;/i#gt; #35;1</small>" }'), toMermaid(graph));
  assert.ok(toDot(graph).includes('[label=<A &amp; B<BR/><FONT POINT-SIZE="9" COLOR="#6b7280">&lt;i&gt;&quot;T&quot;&lt;/i&gt; #1</FONT>>, '), toDot(graph));
});

test('keeps a hex colour for each entity type and drops anything else', async (t) => {
  for (const [name, color, expected] of dataProviderColors()) {
    await t.test(name, () => {
      const graph = canvasGraph(articleElements(), { colorFor: () => color });

      assert.equal(graph.nodes[0].color, expected);
      assert.equal(graph.nodes[2].color, expected);
    });
  }
});

function dataProviderColors() {
  return [
    ['a 6-digit hex colour', '#d9e2f3', '#d9e2f3'],
    ['an 8-digit hex colour', '#d9e2f380', '#d9e2f380'],
    ['a colour name', 'red', null],
    ['a colour carrying markup', '#fff"><script>', null],
    ['no colour', undefined, null],
  ];
}

test('keeps a known symbol for each entity type and draws any other as a rounded rectangle', async (t) => {
  for (const [name, symbolFor, expected] of dataProviderSymbols()) {
    await t.test(name, () => {
      const graph = canvasGraph(articleElements(), { symbolFor: symbolFor });

      assert.equal(graph.nodes[0].symbol, expected);
      assert.equal(graph.nodes[2].symbol, expected);
    });
  }
});

function dataProviderSymbols() {
  return [
    ['a known symbol', () => 'hexagon', 'hexagon'],
    ['an unknown symbol', () => 'star', 'rounded'],
    ['an inherited object property', () => 'constructor', 'rounded'],
    ['no symbol', () => undefined, 'rounded'],
    ['no symbol function', undefined, 'rounded'],
  ];
}

test('reads the direction of the layout', async (t) => {
  for (const [direction, expected] of [
    ['TB', 'TB'],
    ['LR', 'LR'],
    ['RL', 'LR'],
    [undefined, 'LR'],
  ]) {
    await t.test(String(direction), () => {
      assert.equal(canvasGraph({}, { direction: direction }).direction, expected);
    });
  }
});

test('turns a value into an identifier', async (t) => {
  for (const [value, expected] of dataProviderIdentifier()) {
    await t.test(String(value), () => {
      assert.equal(identifier(value, 'e'), expected);
    });
  }
});

function dataProviderIdentifier() {
  return [
    ['node.article', 'node_article'],
    ['paragraph.*', 'paragraph__'],
    ['node.a-b', 'node_a_b'],
    ['node.café', 'node_caf_'],
    ['node.[x] "y" #z', 'node__x___y___z'],
    ['1abc', 'e_1abc'],
    ['_abc', 'e__abc'],
    ['', 'e'],
    [null, 'e'],
    [undefined, 'e'],
  ];
}

test('keeps identifiers apart and away from Mermaid keywords', async (t) => {
  for (const [name, ids, expected] of dataProviderIdentifiers()) {
    await t.test(name, () => {
      assert.deepEqual([...identifiers(ids).values()], expected);
    });
  }
});

function dataProviderIdentifiers() {
  return [
    ['distinct ids', ['node.a', 'node.b'], ['node_a', 'node_b']],
    ['2 clashing ids', ['node.a-b', 'node.a_b'], ['node_a_b', 'node_a_b_2']],
    ['3 clashing ids', ['node.a-b', 'node.a_b', 'node.a b'], ['node_a_b', 'node_a_b_2', 'node_a_b_3']],
    ['a suffix another id takes on its own', ['node.a-b', 'node.a_b', 'node.a_b_2'], ['node_a_b', 'node_a_b_3', 'node_a_b_2']],
    ['non-ASCII ids', ['node.café', 'node.cafè'], ['node_caf_', 'node_caf__2']],
    ['Mermaid keywords', ['end', 'End', 'style', 'classDef', 'graph'], ['n_end', 'n_End', 'n_style', 'n_classDef', 'n_graph']],
    ['a keyword inside an id', ['ending', 'node.end'], ['ending', 'node_end']],
    ['no ids', [], []],
  ];
}

test('writes a Mermaid flowchart of the canvas graph', () => {
  assert.equal(
    toMermaid(articleGraph(), 'My model'),
    [
      '---',
      'title: "My model"',
      'config:',
      '  flowchart:',
      '    curve: step',
      '---',
      'flowchart LR',
      '  node_article@{ shape: rounded, label: "Article<br><small>Content type</small><br><small>article</small>" }',
      '  field_node_article_field_tags@{ shape: stadium, label: "Tags *<br><small>field_tags</small>" }',
      '  proxy_field_node_article_field_tags_taxonomy_term_tags@{ shape: odd, label: "Tags" }',
      '  taxonomy_term_tags@{ shape: odd, label: "Tags<br><small>Vocabulary</small><br><small>tags</small>" }',
      '  api1@{ shape: hex, label: "Search API<br>GET /search" }',
      '  node_article --- field_node_article_field_tags',
      '  field_node_article_field_tags -.->|"1..n"| proxy_field_node_article_field_tags_taxonomy_term_tags',
      '  api1 -.->|"indexes"| node_article',
      '  classDef entity_node fill:#d9e2f3,stroke:#5b6470,color:#1f2933',
      '  classDef field_multi fill:#ffffff,stroke:#555c66,stroke-width:3px,color:#1f2933',
      '  classDef proxy_taxonomy_term fill:#e2f0d9,fill-opacity:0.4,stroke:#8a94a3,stroke-dasharray:4 3,color:#6b7280,font-style:italic',
      '  classDef entity_taxonomy_term fill:#e2f0d9,stroke:#5b6470,color:#1f2933',
      '  classDef annotation fill:#ffffff,stroke:#5b6470,color:#1f2933',
      '  class node_article entity_node',
      '  class field_node_article_field_tags field_multi',
      '  class proxy_field_node_article_field_tags_taxonomy_term_tags proxy_taxonomy_term',
      '  class taxonomy_term_tags entity_taxonomy_term',
      '  class api1 annotation',
      '  linkStyle 0 stroke:#aeb4bd',
      '  linkStyle 1 stroke:#c2c8d0',
      '  linkStyle 2 stroke:#b5739d,color:#8a5a76',
      '',
    ].join('\n'),
  );
});

test('writes each edge in the line style the canvas draws it in', () => {
  const elements = articleElements();
  elements.edges = [
    { data: { group: 'ref', source: TAGS_FIELD, target: 'taxonomy_term.tags', cardinality: '1..n' } },
    { data: { group: 'collapsed', source: 'node.article', target: 'taxonomy_term.tags' } },
    { data: { group: 'has', source: 'node.article', target: TAGS_FIELD } },
    { data: { group: 'ref', source: TAGS_FIELD, target: 'node.article' } },
  ];
  const lines = toMermaid(canvasGraph(elements)).split('\n');

  assert.deepEqual(
    lines.filter((line) => / (---|-->|-\.->)/.test(line)),
    [
      '  field_node_article_field_tags -->|"1..n"| taxonomy_term_tags',
      '  node_article --> taxonomy_term_tags',
      '  node_article --- field_node_article_field_tags',
      '  field_node_article_field_tags --> node_article',
    ],
  );
  assert.ok(lines.includes('  linkStyle 0,1,3 stroke:#8a94a3'));
  assert.ok(lines.includes('  linkStyle 2 stroke:#aeb4bd'));
});

test('draws each entity symbol, field and annotation as a Mermaid shape', async (t) => {
  for (const [name, data, expected] of dataProviderMermaidShapes()) {
    await t.test(name, () => {
      const graph = canvasGraph({ nodes: [{ data: { id: 'node.a', ...data } }] }, { symbolFor: () => data.symbol });

      assert.ok(toMermaid(graph).includes('\n  node_a@{ shape: ' + expected + ', label: '), toMermaid(graph));
    });
  }
});

function dataProviderMermaidShapes() {
  const symbols = {
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

  return [
    ...Object.entries(symbols).map(([symbol, shape]) => ['an entity drawn as ' + symbol, { group: 'entity', entityType: 'node', symbol: symbol }, shape]),
    ['a proxy', { group: 'proxy', entityType: 'node', symbol: 'diamond' }, 'diam'],
    ['a field', { group: 'field', kind: 'single' }, 'stadium'],
    ['an event annotation', { group: 'annotation', kind: 'event' }, 'diam'],
    ['an API annotation', { group: 'annotation', kind: 'api' }, 'hex'],
    ['a callback annotation', { group: 'annotation', kind: 'callback' }, 'rounded'],
    ['an annotation of an unknown kind', { group: 'annotation', kind: 'other' }, 'rect'],
  ];
}

test('maps every symbol to a Mermaid and a DOT shape', () => {
  for (const symbol of Object.keys(SYMBOLS)) {
    const graph = canvasGraph({ nodes: [{ data: { id: 'node.a', group: 'entity', entityType: 'node' } }] }, { symbolFor: () => symbol });

    assert.doesNotMatch(toMermaid(graph), /shape: undefined/, symbol);
    assert.doesNotMatch(toDot(graph), /shape=undefined/, symbol);
  }
});

test('styles each kind of field the way the canvas draws it', async (t) => {
  for (const [kind, mermaidClass, mermaidStyle, dot] of dataProviderFieldKinds()) {
    await t.test(kind, () => {
      const graph = canvasGraph({ nodes: [{ data: { id: 'f', group: 'field', label: 'F', kind: kind } }] });

      assert.ok(toMermaid(graph).includes('\n  classDef ' + mermaidClass + ' ' + mermaidStyle + '\n'), toMermaid(graph));
      assert.ok(toDot(graph).includes('  "f" [label="F", shape=ellipse, ' + dot), toDot(graph));
    });
  }
});

function dataProviderFieldKinds() {
  return [
    ['single', 'field', 'fill:#ffffff,stroke:#555c66,color:#1f2933', 'fillcolor="#ffffff", color="#555c66", style="filled"'],
    ['multi', 'field_multi', 'fill:#ffffff,stroke:#555c66,stroke-width:3px,color:#1f2933', 'fillcolor="#ffffff", color="#555c66", peripheries=2, style="filled"'],
    [
      'system',
      'field_system',
      'fill:#ffffff,stroke:#98a2b3,stroke-dasharray:4 3,color:#6b7280',
      'fillcolor="#ffffff", color="#98a2b3", fontcolor="#6b7280", style="dashed,filled"',
    ],
    [
      'calculated',
      'field_calculated',
      'fill:#ffd966,stroke:#c9a227,color:#3a2f0a',
      'fillcolor="#ffd966", color="#c9a227", fontcolor="#3a2f0a", style="filled"',
    ],
  ];
}

test('escapes text that Mermaid would read as syntax', async (t) => {
  for (const [name, label, expected] of dataProviderMermaidText()) {
    await t.test(name, () => {
      const output = toMermaid(singleNode({ label: label }, label));

      assert.ok(output.includes('  node_a@{ shape: rounded, label: "' + expected + '" }'), output);
      assert.ok(output.includes('  node_a -.->|"' + expected + '"| node_a'), output);
    });
  }
});

function dataProviderMermaidText() {
  return [
    ['double quotes', 'Say "hi"', 'Say #quot;hi#quot;'],
    ['a hash', 'Issue #12', 'Issue #35;12'],
    ['an entity code', 'Code #quot;', 'Code #35;quot;'],
    ['a backslash', 'a\\b', 'a#92;b'],
    ['backticks', '`md`', '#96;md#96;'],
    ['markup', '<b>x</b> & y', '#lt;b#gt;x#lt;/b#gt; #amp; y'],
    ['braces', 'A {c} }', 'A #123;c#125; #125;'],
    ['a bar', 'a | b', 'a #124; b'],
    ['brackets and parentheses', 'A [b] (d)', 'A [b] (d)'],
    ['non-ASCII text', 'Café ✓', 'Café ✓'],
    ['line breaks', 'Line\none', 'Line one'],
  ];
}

test('writes the title as a YAML string and leaves out a missing one', async (t) => {
  for (const [name, title, expected] of dataProviderMermaidTitles()) {
    await t.test(name, () => {
      assert.ok(toMermaid(canvasGraph({}), title).startsWith(expected), toMermaid(canvasGraph({}), title));
    });
  }
});

function dataProviderMermaidTitles() {
  return [
    ['a title with quotes, a hash and a backslash', 'A "quoted" #title\\ – é', '---\ntitle: "A \\"quoted\\" #title\\\\ – é"\nconfig:\n'],
    ['an empty title', '', '---\nconfig:\n'],
    ['a blank title', '  \n ', '---\nconfig:\n'],
    ['no title', undefined, '---\nconfig:\n'],
  ];
}

test('writes the flowchart in the direction of the layout', () => {
  assert.ok(toMermaid(canvasGraph({}, { direction: 'TB' })).endsWith('---\nflowchart TB\n'));
});

test('notes a graph too large for Mermaid', async (t) => {
  for (const [name, elements, expected] of dataProviderLargeGraphs()) {
    await t.test(name, () => {
      const lines = toMermaid(canvasGraph(elements), 'T').split('\n');

      assert.equal(lines[7] === MERMAID_LARGE_NOTE, expected);
      assert.equal(lines.includes(MERMAID_LARGE_NOTE), expected);
    });
  }
});

function dataProviderLargeGraphs() {
  const entities = (count) => ({
    nodes: Array.from({ length: count }, (_, index) => ({ data: { id: 'node.b' + index, group: 'entity', entityType: 'node', label: 'B' } })),
  });
  const edges = (count) => ({
    nodes: [{ data: { id: 'node.a', group: 'entity', entityType: 'node' } }],
    edges: Array.from({ length: count }, () => ({ data: { group: 'collapsed', source: 'node.a', target: 'node.a' } })),
  });
  const long = { nodes: [{ data: { id: 'node.a', group: 'entity', entityType: 'node', label: 'x'.repeat(MERMAID_MAX_TEXT) } }] };

  return [
    ['as many entities as the limit', entities(MERMAID_MAX_ENTITIES), false],
    ['more entities than the limit', entities(MERMAID_MAX_ENTITIES + 1), true],
    ['as many edges as the limit', edges(MERMAID_MAX_EDGES), false],
    ['more edges than the limit', edges(MERMAID_MAX_EDGES + 1), true],
    ['text longer than the limit', long, true],
  ];
}

test('shrinks a flowchart past the character limit 1 step at a time and notes what changed', () => {
  const graph = articleGraph();
  const full = toMermaid(graph, 'T');
  const note = (list) => "%% This diagram is past Mermaid's 50,000-character limit, so " + list + '.';
  const steps = [];
  let limit = full.length - 1;

  for (let index = 0; index < 4; index++) {
    const output = toMermaid(graph, 'T', limit);

    assert.ok(output.length <= limit, 'step ' + (index + 1) + ' fits');
    steps.push({ lines: output.split('\n') });
    limit = output.length - 1;
  }

  assert.ok(!full.includes('%% This diagram is past'));

  assert.equal(steps[0].lines[7], note('node ids are shortened'));
  assert.ok(steps[0].lines.includes('n1@{ shape: rounded, label: "Article<br><small>Content type</small><br><small>article</small>" }'));
  assert.ok(steps[0].lines.includes('n2 -.->|"1..n"| n3'));
  assert.ok(steps[0].lines.includes('class n1 entity_node'));

  assert.equal(steps[1].lines[7], note('node ids are shortened'));
  assert.ok(steps[1].lines.includes('n1("Article<br><small>Content type</small><br><small>article</small>")'));
  assert.ok(steps[1].lines.includes('n2(["Tags *<br><small>field_tags</small>"])'));
  assert.ok(steps[1].lines.includes('n3>"Tags"]'));
  assert.ok(steps[1].lines.includes('n5{{"Search API<br>GET /search"}}'));

  assert.equal(steps[2].lines[7], note('node ids are shortened and machine names are left out'));
  assert.ok(steps[2].lines.includes('n1("Article<br><small>Content type</small>")'));
  assert.ok(steps[2].lines.includes('n2(["Tags *"])'));

  assert.equal(steps[3].lines[7], note('node ids are shortened, machine names are left out and entity type captions are left out'));
  assert.ok(steps[3].lines.includes('n1("Article")'));
  assert.ok(!steps[3].lines.some((line) => line.includes('<small>')));

  const last = toMermaid(graph, 'T', limit).split('\n');
  assert.equal(last[7], MERMAID_LARGE_NOTE);
  assert.equal(last[8], note('node ids are shortened, machine names are left out and entity type captions are left out'));
});

test('keeps the new syntax for shapes the classic syntax lacks', async (t) => {
  for (const [symbol, expected] of [
    ['cut', 'n1@{ shape: notch-rect, label: "A" }'],
    ['pentagon', 'n1@{ shape: notch-pent, label: "A" }'],
    ['barrel', 'n1[("A")]'],
    ['rhomboid', 'n1[/"A"/]'],
    ['diamond', 'n1{"A"}'],
    ['rectangle', 'n1["A"]'],
  ]) {
    await t.test(symbol, () => {
      const graph = canvasGraph({ nodes: [{ data: { id: 'node.a', group: 'entity', entityType: 'node', label: 'A' } }] }, { symbolFor: () => symbol });
      const output = toMermaid(graph, '', 1);

      assert.ok(output.split('\n').includes(expected), output);
    });
  }
});

test('lists the changes a compaction note names', async (t) => {
  for (const [name, notes, expected] of dataProviderCompactionNotes()) {
    await t.test(name, () => {
      assert.equal(mermaidCompactionNote(notes), expected);
    });
  }
});

function dataProviderCompactionNotes() {
  const note = (list) => "%% This diagram is past Mermaid's 50,000-character limit, so " + list + '.';

  return [
    ['no changes', [], ''],
    ['only a change with nothing to say', [''], ''],
    ['1 change', ['a'], note('a')],
    ['2 changes around a silent one', ['a', '', 'b'], note('a and b')],
    ['3 changes', ['a', 'b', 'c'], note('a, b and c')],
  ];
}

test('writes a DOT graph that keeps the canvas layout', () => {
  assert.equal(
    toDot(articleGraph(), 'My model'),
    [
      'digraph "My model" {',
      '  graph [layout=neato, inputscale=72, splines=true, outputorder=edgesfirst, fontname="Helvetica", label="My model", labelloc=t];',
      '  node [fontname="Helvetica", fontsize=11, style=filled, fillcolor="#ffffff", color="#5b6470", fontcolor="#1f2933"];',
      '  edge [fontname="Helvetica", fontsize=9, color="#aeb4bd", fontcolor="#6b7280", arrowsize=0.7];',
      '  "node_article" [label=<Article<BR/><FONT POINT-SIZE="9" COLOR="#6b7280">Content type</FONT><BR/><FONT POINT-SIZE="9" COLOR="#6b7280">article</FONT>>, ' +
        'shape=box, fillcolor="#d9e2f3", style="rounded,filled", pos="0,0!", width=1.667, height=0.667];',
      '  "field_node_article_field_tags" [label=<Tags *<BR/><FONT POINT-SIZE="9" COLOR="#6b7280">field_tags</FONT>>, ' +
        'shape=ellipse, fillcolor="#ffffff", color="#555c66", peripheries=2, style="filled", pos="180,30!", width=0.972, height=0.389];',
      '  "proxy_field_node_article_field_tags_taxonomy_term_tags" [label="Tags", shape=cds, fillcolor="#e2f0d966", color="#8a94a3", fontcolor="#6b7280", fontname="Helvetica-Oblique", style="dashed,filled", pos="300,30!", width=1.111, height=0.417];',
      '  "taxonomy_term_tags" [label=<Tags<BR/><FONT POINT-SIZE="9" COLOR="#6b7280">Vocabulary</FONT><BR/><FONT POINT-SIZE="9" COLOR="#6b7280">tags</FONT>>, ' +
        'shape=cds, fillcolor="#e2f0d9", style="filled", pos="500,0!", width=1.389, height=0.667];',
      '  "api1" [label="Search API\\nGET /search", shape=hexagon, fillcolor="#ffffff", style="filled", pos="0,-200!", width=1.25, height=0.556];',
      '  "node_article" -> "field_node_article_field_tags" [dir=none];',
      '  "field_node_article_field_tags" -> "proxy_field_node_article_field_tags_taxonomy_term_tags" [style=dashed, color="#c2c8d0", label="1..n"];',
      '  "api1" -> "node_article" [style=dashed, color="#b5739d", fontcolor="#8a5a76", label="indexes"];',
      '}',
      '',
    ].join('\n'),
  );
});

test('writes an empty DOT graph without a title', () => {
  assert.equal(
    toDot(canvasGraph({})),
    [
      'digraph "nexus" {',
      '  graph [layout=neato, inputscale=72, splines=true, outputorder=edgesfirst, fontname="Helvetica"];',
      '  node [fontname="Helvetica", fontsize=11, style=filled, fillcolor="#ffffff", color="#5b6470", fontcolor="#1f2933"];',
      '  edge [fontname="Helvetica", fontsize=9, color="#aeb4bd", fontcolor="#6b7280", arrowsize=0.7];',
      '}',
      '',
    ].join('\n'),
  );
});

test('draws each entity symbol as a DOT shape', async (t) => {
  for (const [symbol, expected] of dataProviderDotShapes()) {
    await t.test(symbol, () => {
      const graph = canvasGraph({ nodes: [{ data: { id: 'node.a', group: 'entity', entityType: 'node', label: 'A' } }] }, { symbolFor: () => symbol });

      assert.ok(toDot(graph).includes('  "node_a" [label="A", ' + expected + ', pos='), toDot(graph));
    });
  }
});

function dataProviderDotShapes() {
  return [
    ['rounded', 'shape=box, style="rounded,filled"'],
    ['rectangle', 'shape=box, style="filled"'],
    ['ellipse', 'shape=ellipse, style="filled"'],
    ['diamond', 'shape=diamond, style="filled"'],
    ['hexagon', 'shape=hexagon, style="filled"'],
    ['tag', 'shape=cds, style="filled"'],
    ['barrel', 'shape=cylinder, style="filled"'],
    ['cut', 'shape=box, style="diagonals,filled"'],
    ['rhomboid', 'shape=parallelogram, style="filled"'],
    ['pentagon', 'shape=pentagon, style="filled"'],
    ['octagon', 'shape=octagon, style="filled"'],
  ];
}

test('keeps an 8-digit proxy colour and leaves out a missing one', () => {
  const graph = (color) => canvasGraph({ nodes: [{ data: { id: 'p', group: 'proxy', entityType: 'node', label: 'P' } }] }, { colorFor: () => color });

  assert.ok(toDot(graph('#d9e2f380')).includes('fillcolor="#d9e2f380"'));
  assert.ok(!toDot(graph(null)).includes('"p" [label="P", shape=box, fillcolor='));
});

test('escapes text that DOT would read as syntax', async (t) => {
  for (const [name, label, expected] of dataProviderDotText()) {
    await t.test(name, () => {
      const output = toDot(singleNode({ label: label }, label), label);

      assert.ok(output.startsWith('digraph "' + expected + '" {'), output);
      assert.ok(output.includes('  "node_a" [label="' + expected + '", '), output);
      assert.ok(output.includes(', label="' + expected + '"];'), output);
    });
  }
});

function dataProviderDotText() {
  return [
    ['double quotes', 'Say "hi"', 'Say \\"hi\\"'],
    ['a backslash', 'a\\nb', 'a\\\\nb'],
    ['markup', '<b>x</b>', '<b>x</b>'],
    ['an ampersand and an entity', 'A & B &amp;', 'A &amp; B &amp;amp;'],
    ['brackets, braces and a hash', 'A [b] {c} #d', 'A [b] {c} #d'],
    ['non-ASCII text', 'Café ✓', 'Café ✓'],
  ];
}

test('draws every node and edge of each template in both formats', async (t) => {
  for (const template of TEMPLATES) {
    await t.test(template.id, () => {
      const { modelData } = documentToModel(JSON.parse(readFileSync(join(ROOT, templatePath(template)), 'utf8')));
      const graph = canvasGraph(modelData);
      const names = identifiers(graph.nodes.map((node) => node.id));
      const mermaid = toMermaid(graph, template.label, Infinity).split('\n');

      assert.ok(toMermaid(graph, template.label).length <= MERMAID_MAX_TEXT, 'the export fits Mermaid');
      const dot = toDot(graph, template.label).split('\n');

      assert.equal(graph.nodes.length, modelData.nodes.length);
      assert.equal(new Set(names.values()).size, graph.nodes.length);
      assert.ok(graph.edges.some((edge) => edge.kind === 'ref'));

      for (const name of names.values()) {
        assert.ok(
          mermaid.some((line) => line.startsWith('  ' + name + '@{ shape: ')),
          name,
        );
        assert.ok(
          dot.some((line) => line.startsWith('  "' + name + '" [label=')),
          name,
        );
      }

      assert.equal(mermaid.filter((line) => / (---|-->|-\.->)(\|"[^"]*"\|)? /.test(line)).length, graph.edges.length);
      assert.equal(dot.filter((line) => line.includes(' -> ')).length, graph.edges.length);
    });
  }
});
