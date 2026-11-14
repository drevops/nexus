import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundlesCsv, csvText, fieldsCsv, referencesCsv } from '../../src/csv.js';
import { markdownDocument } from '../fixtures/markdown/document.js';
import { savedDocument } from '../fixtures/saved-document.js';

test('writes a header row and rows joined by CRLF', () => {
  assert.equal(
    csvText(
      ['a', 'b'],
      [
        ['1', '2'],
        ['3', '4'],
      ],
    ),
    'a,b\r\n1,2\r\n3,4',
  );
  assert.equal(csvText(['a', 'b'], []), 'a,b');
});

test('escapes each cell', async (t) => {
  for (const [name, value, expected] of dataProviderCsvCell()) {
    await t.test(name, () => {
      assert.equal(csvText(['header'], [[value]]), 'header\r\n' + expected);
    });
  }
});

function dataProviderCsvCell() {
  return [
    ['plain text', 'Article', 'Article'],
    ['an empty string', '', ''],
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['zero', 0, '0'],
    ['a number', 12, '12'],
    ['a comma', 'Comma, label', '"Comma, label"'],
    ['a quote', 'Quote "label"', '"Quote ""label"""'],
    ['a line feed', 'Line\nfeed', '"Line\nfeed"'],
    ['a carriage return', 'Carriage\rreturn', '"Carriage\rreturn"'],
    ['a semicolon', 'a; b', 'a; b'],
    ['a single quote', "Editor's pick", "Editor's pick"],
    ['leading and trailing spaces', ' padded ', ' padded '],
    ['a formula', '=1+1', "'=1+1"],
    ['a formula with a comma', '=HYPERLINK("https://example.com","x")', '"\'=HYPERLINK(""https://example.com"",""x"")"'],
    ['a leading plus', '+cmd', "'+cmd"],
    ['a leading minus', '-cmd', "'-cmd"],
    ['a leading at sign', '@SUM(A1)', "'@SUM(A1)"],
    ['a leading tab', '\tx', "'\tx"],
    ['a leading carriage return', '\rx', '"\'\rx"'],
    ['an equals sign inside text', 'a=b', 'a=b'],
    ['a negative number', -3, '-3'],
    ['a negative number as text', '-3', '-3'],
    ['a signed decimal as text', '+1.5', '+1.5'],
    ['a minus on its own', '-', "'-"],
  ];
}

test('writes the fields table', () => {
  const records = [
    {
      entity: 'Article',
      entityType: 'node',
      field: 'Tags',
      name: 'field_tags',
      type: 'entity_reference',
      cardinality: -1,
      required: true,
      refs: [{ label: 'Tags' }, { label: 'Topics' }],
      usedIn: [{ id: 'node.page' }, { id: 'node.event' }],
      description: 'Pick "up to" 3, please.',
      defaultValue: '',
      allowedValues: [],
      translatable: true,
    },
    {
      entity: 'Article',
      entityType: 'node',
      field: 'Size',
      name: 'field_size',
      type: 'list_string',
      cardinality: 1,
      required: false,
      refs: [],
      usedIn: [],
      description: '',
      defaultValue: 's',
      allowedValues: [
        { value: 's', label: 'Small' },
        { value: 'l', label: 'l' },
      ],
      translatable: false,
    },
    {
      entity: 'Tags',
      entityType: 'taxonomy_term',
      field: 'Name',
      name: 'name',
      type: 'string',
      cardinality: 1,
      required: true,
      refs: [],
      usedIn: [],
      description: '',
      defaultValue: '',
      allowedValues: [],
      translatable: null,
    },
  ];
  const typeLabel = (type) => ({ node: 'Content type', taxonomy_term: 'Vocabulary' })[type];

  assert.deepEqual(fieldsCsv(records, typeLabel).split('\r\n'), [
    'Entity,Entity type,Field,Machine name,Field type,Cardinality,Required,References,Used in,Help text,Default,Allowed values,Translatable',
    'Article,Content type,Tags,field_tags,entity_reference,1..n,yes,Tags; Topics,2,"Pick ""up to"" 3, please.",,,yes',
    'Article,Content type,Size,field_size,list_string,1,no,,,,s,Small (s); l,no',
    'Tags,Vocabulary,Name,name,string,1,yes,,,,,,',
  ]);
  assert.equal(
    fieldsCsv([], typeLabel),
    'Entity,Entity type,Field,Machine name,Field type,Cardinality,Required,References,Used in,Help text,Default,Allowed values,Translatable',
  );
});

test('writes 1 row per bundle in outline order', () => {
  assert.equal(
    bundlesCsv(markdownDocument),
    [
      'entity_type,bundle,label,description,fields,referenced_by,note',
      'node,contents,Contents,,0,0,',
      'node,page,Page,,2,0,',
      'node,session,Session | Talk,,3,1,"Talks and *workshops*.\n- Run on day 2\n\n1. Keep under 45 minutes"',
      'taxonomy_term,tags,Tags,,0,1,',
      'paragraph,page,Page,,1,1,',
      'gadget,beacon,Beacon,,0,0,',
      'widget,dial,Dial,,0,0,',
    ].join('\r\n'),
  );
});

test('writes the description and counts fields hidden on the canvas', () => {
  assert.deepEqual(bundlesCsv(savedDocument).split('\r\n'), [
    'entity_type,bundle,label,description,fields,referenced_by,note',
    'node,article,Article,Use <em>articles</em> for news.,3,0,Long-form content.',
    'taxonomy_term,tags,Tags,,0,1,',
  ]);
});

test('writes 1 row per reference target in outline order', () => {
  assert.equal(
    referencesCsv(markdownDocument),
    [
      'source_entity_type,source_bundle,field,field_label,target_entity_type,target_bundle,cardinality,required',
      'node,page,field_sessions,Sessions,node,session,1..n,yes',
      'node,page,field_gadget,Gadget,gadget,*,1,no',
      'node,session,field_tags,Tags,taxonomy_term,tags,1..3,no',
      'node,session,field_tags,Tags,taxonomy_term,topics,1..3,no',
      'node,session,field_media,Media,media,*,1,no',
      'paragraph,page,field_items,Items,paragraph,page,1..n,no',
    ].join('\r\n'),
  );
});

test('escapes bundle and reference cells', () => {
  const doc = {
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'News, "daily"',
        description: 'Line 1\nLine 2',
        note: 'A, b',
        fields: [{ name: 'field_ref', label: 'Ref, "main"', kind: 'single', targetType: 'node', targetBundles: ['article'] }],
      },
    ],
  };

  assert.deepEqual(bundlesCsv(doc).split('\r\n').slice(1), ['node,article,"News, ""daily""","Line 1\nLine 2",1,1,"A, b"']);
  assert.deepEqual(referencesCsv(doc).split('\r\n').slice(1), ['node,article,field_ref,"Ref, ""main""",node,article,1,no']);
});

test('writes formulas in document text as text in every CSV', () => {
  const doc = {
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: '=1+1',
        description: '+cmd',
        note: '@SUM(A1)',
        fields: [{ name: 'field_ref', label: '-2+3', kind: 'single', targetType: 'node', targetBundles: ['article'] }],
      },
    ],
  };
  const record = {
    entity: '=1+1',
    entityType: 'node',
    field: '-2+3',
    name: 'field_ref',
    type: 'entity_reference',
    cardinality: 1,
    required: false,
    refs: [{ label: '=1+1' }],
    usedIn: [],
    description: '@SUM(A1)',
    defaultValue: '-1',
    allowedValues: [],
    translatable: null,
  };

  assert.deepEqual(bundlesCsv(doc).split('\r\n').slice(1), ["node,article,'=1+1,'+cmd,1,1,'@SUM(A1)"]);
  assert.deepEqual(referencesCsv(doc).split('\r\n').slice(1), ["node,article,field_ref,'-2+3,node,article,1,no"]);
  assert.deepEqual(
    fieldsCsv([record], () => 'Content type')
      .split('\r\n')
      .slice(1),
    ["'=1+1,Content type,'-2+3,field_ref,entity_reference,1,no,'=1+1,,'@SUM(A1),-1,,"],
  );
});

test('fills in what a sparse document leaves out', () => {
  const doc = {
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        fields: [
          { name: 'field_items', kind: 'multi', targetType: 'paragraph' },
          { name: 'field_body', kind: 'single' },
        ],
      },
    ],
  };

  assert.deepEqual(bundlesCsv(doc).split('\r\n').slice(1), ['node,article,article,,2,0,']);
  assert.deepEqual(referencesCsv(doc).split('\r\n').slice(1), ['node,article,field_items,field_items,paragraph,*,1..n,no']);
});

test('writes only the header row for a document with no bundles', async (t) => {
  for (const [name, doc] of dataProviderEmptyDocuments()) {
    await t.test(name, () => {
      assert.equal(bundlesCsv(doc), 'entity_type,bundle,label,description,fields,referenced_by,note');
      assert.equal(referencesCsv(doc), 'source_entity_type,source_bundle,field,field_label,target_entity_type,target_bundle,cardinality,required');
    });
  }
});

function dataProviderEmptyDocuments() {
  return [
    ['an empty object', {}],
    ['no entities', { entities: [] }],
    ['only a placeholder', { entities: [{ entityType: 'media', bundle: '*', label: 'Any Media', fields: [] }] }],
  ];
}
