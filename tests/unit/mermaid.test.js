import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mermaidFlowchart, mermaidText } from '../../src/mermaid.js';
import { documentOutline } from '../../src/document-outline.js';

function entity(entityType, bundle, label, fields = []) {
  return { entityType, bundle, label, note: '', fields };
}

function reference(name, label, targetType, targetBundles, cardinality = 1) {
  return { name, label, fieldType: 'entity_reference', kind: 'single', cardinality, required: false, note: '', targetType, targetBundles };
}

function flowchart(entities, customTypes = []) {
  return mermaidFlowchart(documentOutline({ title: 'Model', customTypes, entities }));
}

test('draws each entity in a subgraph of its type, in outline order', () => {
  assert.equal(
    flowchart([entity('taxonomy_term', 'tags', 'Tags'), entity('node', 'page', 'Page'), entity('node', 'article', 'Article')]),
    [
      'flowchart LR',
      '  subgraph t1["Content types"]',
      '    e1["Article"]',
      '    e2["Page"]',
      '  end',
      '  subgraph t2["Vocabularies"]',
      '    e3["Tags"]',
      '  end',
    ].join('\n'),
  );
});

test('draws each reference as an edge labelled with its field and cardinality', () => {
  const lines = flowchart([
    entity('node', 'page', 'Page', [reference('field_tags', 'Tags', 'taxonomy_term', ['tags'], -1), reference('field_self', 'Parent', 'node', ['page'], 3)]),
    entity('taxonomy_term', 'tags', 'Tags'),
  ]).split('\n');

  assert.deepEqual(lines.slice(-2), ['  e1 -->|"Tags (1..n)"| e2', '  e1 -->|"Parent (1..3)"| e1']);
});

test('draws a target the document has no entity for once, outside the subgraphs', () => {
  const lines = flowchart([
    entity('node', 'page', 'Page', [
      reference('field_media', 'Media', 'media', []),
      reference('field_image', 'Image', 'media', []),
      reference('field_topic', 'Topic', 'taxonomy_term', ['topics']),
    ]),
  ]).split('\n');

  assert.deepEqual(lines.slice(4), [
    '  x1["Any Media"]',
    '  x2["taxonomy_term.topics"]',
    '  e1 -->|"Media (1)"| x1',
    '  e1 -->|"Image (1)"| x1',
    '  e1 -->|"Topic (1)"| x2',
  ]);
});

test('labels a custom type subgraph with its label', () => {
  assert.match(flowchart([entity('gadget', 'g', 'G')], [{ type: 'gadget', label: 'Gadget' }]), /subgraph t1\["Gadget"\]/);
});

test('escapes labels for Mermaid', () => {
  const chart = flowchart([entity('node', 'page', 'A "B" #1 & <C>\nD', [reference('field_x', 'Say "hi"', 'node', ['page'])])]);

  assert.match(chart, /e1\["A #quot;B#quot; #35;1 #amp; #lt;C#gt; D"\]/);
  assert.match(chart, /e1 -->\|"Say #quot;hi#quot; \(1\)"\| e1/);
});

test('draws an empty outline as a bare flowchart', () => {
  assert.equal(flowchart([]), 'flowchart LR');
});

test('escapes the text of a label', async (t) => {
  for (const [name, value, expected] of dataProviderMermaidText()) {
    await t.test(name, () => {
      assert.equal(mermaidText(value), expected);
    });
  }
});

function dataProviderMermaidText() {
  return [
    ['plain text', 'Article', 'Article'],
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['a quote', 'a"b', 'a#quot;b'],
    ['a hash', 'C#', 'C#35;'],
    ['an entity code', '#quot;', '#35;quot;'],
    ['an ampersand', 'Q&A', 'Q#amp;A'],
    ['angle brackets', '<b>', '#lt;b#gt;'],
    ['brackets', '[a] (b) {c}', '[a] (b) {c}'],
    ['a pipe', 'a | b', 'a #124; b'],
    ['line breaks', 'a\n  b\r\nc', 'a b c'],
  ];
}
