import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MERMAID_LARGE_NOTE,
  MERMAID_MAX_ENTITIES,
  MERMAID_MAX_TEXT,
  identifier,
  identifiers,
  textModel,
  toDot,
  toMermaid,
} from '../../src/diagram-text.js';
import { ContentModel, Entity, Field, KIND_MULTI, KIND_SINGLE } from '../../src/model.js';
import { parseConfig } from '../../src/parser.js';
import { documentToModel } from '../../src/document.js';
import { TEMPLATES, templatePath } from '../../src/templates.js';
import { configMin } from '../fixtures/config-min.js';

const ROOT = join(import.meta.dirname, '..', '..');

function entity(entityType, bundle, label, fields = []) {
  const result = new Entity(entityType, bundle, label);
  result.setFields(fields);

  return result;
}

function elementsOf(entities) {
  const model = new ContentModel();
  model.setEntities(entities);

  return model.toArray();
}

// An article with a required text field and a reference to an unrequired
// vocabulary, which has no fields.
function articleElements() {
  return elementsOf([
    entity('taxonomy_term', 'tags', 'Tags'),
    entity('node', 'article', 'Article', [
      new Field('field_tags', 'Tags', 'entity_reference', KIND_MULTI, false, 'taxonomy_term', ['tags'], -1),
      new Field('field_summary', 'Summary', 'string', KIND_SINGLE, true),
    ]),
  ]);
}

function summary(model) {
  return {
    entities: model.entities.map((item) => [item.id, item.fields.map((field) => field.name)]),
    references: model.references.map((reference) => [reference.source, reference.field.name, reference.target]),
  };
}

test('reads the entities, fields and references of a parsed config', () => {
  const model = textModel(parseConfig(configMin).toArray());

  assert.equal(model.fields, true);
  assert.deepEqual(
    model.entities.map((item) => item.id),
    ['node.article', 'node.page', 'taxonomy_term.tags', 'media.image', 'paragraph.*', 'paragraph.gallery', 'paragraph.text'],
  );
  assert.deepEqual(summary(model).references, [
    ['node.article', 'field_image', 'media.image'],
    ['node.article', 'field_sections', 'paragraph.gallery'],
    ['node.article', 'field_sections', 'paragraph.text'],
    ['node.article', 'field_tags', 'taxonomy_term.tags'],
    ['node.page', 'field_components', 'paragraph.*'],
  ]);

  const tags = model.entities[0].fields.find((field) => field.name === 'field_tags');
  assert.deepEqual(tags, {
    id: 'field:node.article:field_tags',
    entity: 'node.article',
    name: 'field_tags',
    label: 'Tags',
    type: 'entity_reference',
    cardinality: '1..n',
    required: false,
    reference: true,
  });
});

test('reads only what the canvas shows', async (t) => {
  for (const [name, elements, options, expected] of dataProviderTextModel()) {
    await t.test(name, () => {
      assert.deepEqual(summary(textModel(elements, options)), expected);
    });
  }
});

function dataProviderTextModel() {
  const hiddenTags = articleElements();
  hiddenTags.nodes.find((node) => node.data.id === 'field:node.article:field_tags').data.hidden = true;

  const extras = articleElements();
  extras.nodes.push({ data: { id: 'api1', group: 'annotation', label: 'API' } });
  extras.nodes.push({ data: { id: 'proxy:x', group: 'proxy', label: 'Tags' } });
  extras.edges.push({ data: { id: 'a1', source: 'api1', target: 'node.article', group: 'annotation' } });
  extras.edges.push({ data: { id: 'ref:twice', source: 'field:node.article:field_tags', target: 'taxonomy_term.tags', group: 'ref' } });

  const orphan = articleElements();
  orphan.nodes.push({ data: { id: 'field:node.gone:field_x', group: 'field', name: 'field_x', entity: 'node.gone' } });

  return [
    [
      'every entity, field and reference',
      articleElements(),
      {},
      {
        entities: [
          ['node.article', ['field_tags', 'field_summary']],
          ['taxonomy_term.tags', []],
        ],
        references: [['node.article', 'field_tags', 'taxonomy_term.tags']],
      },
    ],
    [
      'entities without fields keep their references',
      articleElements(),
      { fields: false },
      {
        entities: [
          ['node.article', []],
          ['taxonomy_term.tags', []],
        ],
        references: [['node.article', 'field_tags', 'taxonomy_term.tags']],
      },
    ],
    [
      'a hidden field and its references are left out',
      hiddenTags,
      {},
      {
        entities: [
          ['node.article', ['field_summary']],
          ['taxonomy_term.tags', []],
        ],
        references: [],
      },
    ],
    [
      'a hidden field is left out without fields too',
      hiddenTags,
      { fields: false },
      {
        entities: [
          ['node.article', []],
          ['taxonomy_term.tags', []],
        ],
        references: [],
      },
    ],
    ['a hidden type leaves out its entities and the references to them', articleElements(), { hiddenTypes: ['taxonomy_term'] }, { entities: [['node.article', ['field_tags', 'field_summary']]], references: [] }],
    ['a hidden type leaves out the fields and references of its entities', articleElements(), { hiddenTypes: ['node'] }, { entities: [['taxonomy_term.tags', []]], references: [] }],
    [
      'a reference to an entity outside the model is left out',
      elementsOf([entity('node', 'article', 'Article', [new Field('field_tags', 'Tags', 'entity_reference', KIND_MULTI, false, 'taxonomy_term', ['tags'], -1)])]),
      {},
      { entities: [['node.article', ['field_tags']]], references: [] },
    ],
    [
      'annotations, proxies and repeated ref edges are ignored',
      extras,
      {},
      {
        entities: [
          ['node.article', ['field_tags', 'field_summary']],
          ['taxonomy_term.tags', []],
        ],
        references: [['node.article', 'field_tags', 'taxonomy_term.tags']],
      },
    ],
    [
      'a field of a missing entity is left out',
      orphan,
      {},
      {
        entities: [
          ['node.article', ['field_tags', 'field_summary']],
          ['taxonomy_term.tags', []],
        ],
        references: [['node.article', 'field_tags', 'taxonomy_term.tags']],
      },
    ],
    ['an empty graph', {}, {}, { entities: [], references: [] }],
  ];
}

test('sorts entities by type order, then type, then id, and references by target', () => {
  const elements = elementsOf([
    entity('zeta', 'b', 'Z b'),
    entity('alpha', 'a', 'A a'),
    entity('paragraph', 'b', 'B'),
    entity('paragraph', 'a', 'A'),
    entity('node', 'z', 'Z', [new Field('field_items', 'Items', 'entity_reference', KIND_MULTI, false, 'paragraph', ['b', 'a'], -1)]),
  ]);
  const model = textModel(elements);

  assert.deepEqual(
    model.entities.map((item) => item.id),
    ['node.z', 'paragraph.a', 'paragraph.b', 'alpha.a', 'zeta.b'],
  );
  assert.deepEqual(
    model.references.map((reference) => reference.target),
    ['paragraph.a', 'paragraph.b'],
  );
});

test('keeps a hex colour for each entity type and drops anything else', async (t) => {
  for (const [name, color, expected] of dataProviderColors()) {
    await t.test(name, () => {
      const model = textModel(articleElements(), { colorFor: () => color });

      assert.equal(model.entities[0].color, expected);
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

test('labels an entity or field without a label by its id or name', () => {
  const elements = { nodes: [{ data: { id: 'node.a', group: 'entity', entityType: 'node', label: '  ' } }, { data: { id: 'field:node.a:f', group: 'field', entity: 'node.a', name: 'f' } }] };
  const model = textModel(elements);

  assert.equal(model.entities[0].label, 'node.a');
  assert.equal(model.entities[0].fields[0].label, 'f');
  assert.equal(model.entities[0].fields[0].cardinality, '1');
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

test('keeps identifiers apart when ids sanitise to the same one', async (t) => {
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
    ['no ids', [], []],
  ];
}

test('writes an erDiagram of the entities with their fields', () => {
  assert.equal(
    toMermaid(textModel(articleElements()), 'My model'),
    [
      '---',
      'title: "My model"',
      '---',
      'erDiagram',
      '  node_article["Article"] {',
      '    entity_reference field_tags FK "Tags (1..n)"',
      '    string field_summary "Summary (1, required)"',
      '  }',
      '  taxonomy_term_tags["Tags"]',
      '  node_article }o--o{ taxonomy_term_tags : "Tags (1..n)"',
      '',
    ].join('\n'),
  );
});

test('writes a flowchart of the entities without fields', () => {
  assert.equal(
    toMermaid(textModel(articleElements(), { fields: false }), 'My model'),
    [
      '---',
      'title: "My model"',
      '---',
      'flowchart LR',
      '  node_article["Article"]',
      '  taxonomy_term_tags["Tags"]',
      '  node_article -->|"Tags (1..n)"| taxonomy_term_tags',
      '',
    ].join('\n'),
  );
});

test('writes an empty Mermaid diagram without a title', async (t) => {
  for (const [name, title] of dataProviderNoTitle()) {
    await t.test(name, () => {
      assert.equal(toMermaid(textModel({}), title), 'erDiagram\n');
      assert.equal(toMermaid(textModel({}, { fields: false }), title), 'flowchart LR\n');
    });
  }
});

function dataProviderNoTitle() {
  return [
    ['an empty title', ''],
    ['a blank title', '  \n '],
    ['no title', undefined],
  ];
}

test('marks each relationship by its cardinality and whether it is required', async (t) => {
  for (const [name, cardinality, required, expected] of dataProviderRelationships()) {
    await t.test(name, () => {
      const elements = elementsOf([
        entity('node', 'a', 'A', [new Field('field_b', 'B', 'entity_reference', KIND_SINGLE, required, 'node', ['b'], cardinality)]),
        entity('node', 'b', 'B'),
      ]);

      assert.match(toMermaid(textModel(elements)), new RegExp('  node_a ' + expected.replace(/[|{}]/g, '\\$&') + ' node_b : "B \\('));
    });
  }
});

function dataProviderRelationships() {
  return [
    ['single and optional', 1, false, '}o--o|'],
    ['single and required', 1, true, '}o--||'],
    ['limited and optional', 3, false, '}o--o{'],
    ['unlimited and required', -1, true, '}o--|{'],
  ];
}

test('escapes text that Mermaid would read as syntax', async (t) => {
  for (const [name, label, expected] of dataProviderMermaidText()) {
    await t.test(name, () => {
      const elements = elementsOf([entity('node', 'a', label, [new Field('field_self', label, 'entity_reference', KIND_SINGLE, false, 'node', ['a'])])]);
      const er = toMermaid(textModel(elements));
      const flowchart = toMermaid(textModel(elements, { fields: false }));

      assert.ok(er.includes('  node_a["' + expected + '"] {'), er);
      assert.ok(er.includes(' FK "' + expected + ' (1)"'), er);
      assert.ok(er.includes(' : "' + expected + ' (1)"'), er);
      assert.ok(flowchart.includes('  node_a -->|"' + expected + ' (1)"| node_a'), flowchart);
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
    ['brackets and braces', 'A [b] {c} (d)', 'A [b] {c} (d)'],
    ['non-ASCII text', 'Café ✓', 'Café ✓'],
    ['line breaks', 'Line\none', 'Line one'],
  ];
}

test('writes the title as a YAML string', () => {
  const output = toMermaid(textModel({}), 'A "quoted" #title\\ – é');

  assert.ok(output.startsWith('---\ntitle: "A \\"quoted\\" #title\\\\ – é"\n---\n'), output);
});

test('keeps attribute types and names Mermaid can read', async (t) => {
  for (const [name, fieldName, fieldType, expected] of dataProviderAttributes()) {
    await t.test(name, () => {
      const elements = elementsOf([entity('node', 'a', 'A', [new Field(fieldName, 'Label', fieldType, KIND_SINGLE)])]);

      assert.ok(toMermaid(textModel(elements)).includes('\n    ' + expected + ' "Label (1)"\n'));
    });
  }
});

function dataProviderAttributes() {
  return [
    ['a machine name', 'field_body', 'text_long', 'text_long field_body'],
    ['key markers', 'PK', 'FK', 't_FK f_PK'],
    ['key markers in lower case', 'uk', 'pk', 't_pk f_uk'],
    ['non-ASCII and punctuation', 'field_é', 'my-type', 'my_type field__'],
    ['a leading digit', '1st', '2nd', 't_2nd f_1st'],
    ['no type', 'field_x', '', 't field_x'],
  ];
}

test('notes a model too large for Mermaid', async (t) => {
  for (const [name, elements, expected] of dataProviderLargeModels()) {
    await t.test(name, () => {
      const lines = toMermaid(textModel(elements), 'T').split('\n');

      assert.equal(lines[4] === MERMAID_LARGE_NOTE, expected);
      assert.equal(lines.includes(MERMAID_LARGE_NOTE), expected);
    });
  }
});

function dataProviderLargeModels() {
  const many = (count) => elementsOf(Array.from({ length: count }, (_, index) => entity('node', 'b' + index, 'B' + index)));
  const long = elementsOf([entity('node', 'a', 'x'.repeat(MERMAID_MAX_TEXT))]);

  return [
    ['as many entities as the limit', many(MERMAID_MAX_ENTITIES), false],
    ['more entities than the limit', many(MERMAID_MAX_ENTITIES + 1), true],
    ['text longer than the limit', long, true],
  ];
}

test('writes a DOT graph of the entities with their fields', () => {
  const model = textModel(articleElements(), { colorFor: (type) => (type === 'node' ? '#d9e2f3' : null) });

  assert.equal(
    toDot(model, 'My model'),
    [
      'digraph "My model" {',
      '  graph [rankdir=LR, fontname="Helvetica", label="My model", labelloc=t];',
      '  node [shape=plain, fontname="Helvetica", fontsize=11];',
      '  edge [fontname="Helvetica", fontsize=9, color="#8a94a3"];',
      '  "node_article" [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4"><TR><TD BGCOLOR="#d9e2f3"><B>Article</B></TD></TR>' +
        '<TR><TD PORT="f1" ALIGN="LEFT">Tags <FONT COLOR="#6b7280">field_tags: entity_reference, 1..n</FONT></TD></TR>' +
        '<TR><TD PORT="f2" ALIGN="LEFT">Summary <FONT COLOR="#6b7280">field_summary: string, 1, required</FONT></TD></TR></TABLE>>];',
      '  "taxonomy_term_tags" [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4"><TR><TD><B>Tags</B></TD></TR></TABLE>>];',
      '  "node_article":f1 -> "taxonomy_term_tags" [label="Tags (1..n)"];',
      '}',
      '',
    ].join('\n'),
  );
});

test('writes a DOT graph of the entities without fields', () => {
  const model = textModel(articleElements(), { fields: false, colorFor: (type) => (type === 'node' ? '#d9e2f3' : null) });

  assert.equal(
    toDot(model, 'My model'),
    [
      'digraph "My model" {',
      '  graph [rankdir=LR, fontname="Helvetica", label="My model", labelloc=t];',
      '  node [shape=box, style="rounded,filled", fillcolor="#ffffff", fontname="Helvetica", fontsize=11];',
      '  edge [fontname="Helvetica", fontsize=9, color="#8a94a3"];',
      '  "node_article" [label="Article", fillcolor="#d9e2f3"];',
      '  "taxonomy_term_tags" [label="Tags"];',
      '  "node_article" -> "taxonomy_term_tags" [label="Tags (1..n)"];',
      '}',
      '',
    ].join('\n'),
  );
});

test('writes an empty DOT graph without a title', () => {
  assert.equal(
    toDot(textModel({}, { fields: false })),
    [
      'digraph "nexus" {',
      '  graph [rankdir=LR, fontname="Helvetica"];',
      '  node [shape=box, style="rounded,filled", fillcolor="#ffffff", fontname="Helvetica", fontsize=11];',
      '  edge [fontname="Helvetica", fontsize=9, color="#8a94a3"];',
      '}',
      '',
    ].join('\n'),
  );
});

test('escapes text that DOT would read as syntax', async (t) => {
  for (const [name, label, quoted, html] of dataProviderDotText()) {
    await t.test(name, () => {
      const elements = elementsOf([entity('node', 'a', label, [new Field('field_self', label, 'entity_reference', KIND_SINGLE, false, 'node', ['a'])])]);
      const table = toDot(textModel(elements), label);
      const boxes = toDot(textModel(elements, { fields: false }), label);

      assert.ok(table.startsWith('digraph "' + quoted + '" {'), table);
      assert.ok(table.includes('<B>' + html + '</B>'), table);
      assert.ok(table.includes('<TD PORT="f1" ALIGN="LEFT">' + html + ' <FONT'), table);
      assert.ok(table.includes(' [label="' + quoted + ' (1)"];'), table);
      assert.ok(boxes.includes('  "node_a" [label="' + quoted + '"];'), boxes);
    });
  }
});

function dataProviderDotText() {
  return [
    ['double quotes', 'Say "hi"', 'Say \\"hi\\"', 'Say &quot;hi&quot;'],
    ['a backslash', 'a\\nb', 'a\\\\nb', 'a\\nb'],
    ['markup', '<b>x</b>', '<b>x</b>', '&lt;b&gt;x&lt;/b&gt;'],
    ['an ampersand and an entity', 'A & B &amp;', 'A &amp; B &amp;amp;', 'A &amp; B &amp;amp;'],
    ['brackets, braces and a hash', 'A [b] {c} #d', 'A [b] {c} #d', 'A [b] {c} #d'],
    ['non-ASCII text', 'Café ✓', 'Café ✓', 'Café ✓'],
  ];
}

test('draws every entity and reference of each template in both formats', async (t) => {
  for (const template of TEMPLATES) {
    await t.test(template.id, () => {
      const { modelData } = documentToModel(JSON.parse(readFileSync(join(ROOT, templatePath(template)), 'utf8')));

      for (const fields of [true, false]) {
        const model = textModel(modelData, { fields: fields });
        const names = identifiers(model.entities.map((item) => item.id));
        const mermaid = toMermaid(model, template.label).split('\n');
        const dot = toDot(model, template.label).split('\n');

        assert.equal(model.entities.length, modelData.nodes.filter((node) => node.data.group === 'entity').length);
        assert.ok(model.references.length > 0);
        assert.equal(new Set(names.values()).size, model.entities.length);

        for (const name of names.values()) {
          assert.ok(mermaid.some((line) => line.startsWith('  ' + name + '["')), name);
          assert.ok(dot.some((line) => line.startsWith('  "' + name + '" [label=')), name);
        }

        assert.equal(mermaid.filter((line) => / : "|-->\|"/.test(line)).length, model.references.length);
        assert.equal(dot.filter((line) => line.includes(' -> ')).length, model.references.length);
      }
    });
  }
});
