import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { bundlesCsv, cellText, csvSeparator, csvText, parseCsv, referencesCsv } from '../../src/csv.js';
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

test('writes formulas in document text as text in the bundles and references CSVs', () => {
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

  assert.deepEqual(bundlesCsv(doc).split('\r\n').slice(1), ["node,article,'=1+1,'+cmd,1,1,'@SUM(A1)"]);
  assert.deepEqual(referencesCsv(doc).split('\r\n').slice(1), ["node,article,field_ref,'-2+3,node,article,1,no"]);
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

test('reads CSV text into rows', async (t) => {
  for (const [name, text, expected] of dataProviderParseCsv()) {
    await t.test(name, () => {
      assert.deepEqual(parseCsv(text), expected);
    });
  }
});

function dataProviderParseCsv() {
  return [
    [
      'CRLF rows',
      'a,b\r\nc,d',
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
    ],
    [
      'LF rows',
      'a,b\nc,d',
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
    ],
    [
      'CR rows',
      'a,b\rc,d',
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
    ],
    ['a final line break', 'a,b\r\n', [['a', 'b']]],
    ['a byte order mark', '\uFEFFa,b', [['a', 'b']]],
    ['a quoted comma', '"a,b",c', [['a,b', 'c']]],
    ['a doubled quote', '"say ""hi"""', [['say "hi"']]],
    ['a quoted line break', '"a\r\nb",c\nd', [['a\r\nb', 'c'], ['d']]],
    ['an empty quoted cell', '""', [['']]],
    ['empty cells', ',,', [['', '', '']]],
    ['a trailing empty cell', 'a,', [['a', '']]],
    ['a blank line between rows', 'a\n\nb', [['a'], [''], ['b']]],
    ['a quote inside an unquoted cell', 'say "hi",b', [['say "hi"', 'b']]],
    ['text after a closing quote', '"a"b,c', [['ab', 'c']]],
    ['an unclosed quote', '"a,b', [['a,b']]],
    ['an empty string', '', []],
    ['null', null, []],
  ];
}

test('finds the separator of the first line', async (t) => {
  for (const [name, text, expected] of dataProviderSeparators()) {
    await t.test(name, () => {
      assert.equal(csvSeparator(text), expected);
    });
  }
});

function dataProviderSeparators() {
  return [
    ['commas', 'a,b,c\nd;e;f;g', ','],
    ['semicolons', 'a;b;c\nd,e,f,g', ';'],
    ['tabs', 'a\tb\tc', '\t'],
    ['semicolons beside a quoted comma', '"a,b,c";d;e', ';'],
    ['more commas than semicolons', 'a;b,c,d', ','],
    ['a tie', 'a;b,c', ','],
    ['a single column', 'Entity type', ','],
    ['an empty string', '', ','],
    ['null', null, ','],
  ];
}

test('reads cells split on another separator', async (t) => {
  for (const [name, text, separator, expected] of dataProviderOtherSeparators()) {
    await t.test(name, () => {
      assert.deepEqual(parseCsv(text, separator), expected);
    });
  }
});

function dataProviderOtherSeparators() {
  return [
    [
      'semicolons',
      'a;b\r\n"c;d";e,f',
      ';',
      [
        ['a', 'b'],
        ['c;d', 'e,f'],
      ],
    ],
    [
      'tabs',
      'a\tb\nc,d\te',
      '\t',
      [
        ['a', 'b'],
        ['c,d', 'e'],
      ],
    ],
  ];
}

test('drops the quote the writer puts before a formula', async (t) => {
  for (const [name, cell, expected] of dataProviderCellText()) {
    await t.test(name, () => {
      assert.equal(cellText(cell), expected);
    });
  }
});

function dataProviderCellText() {
  return [
    ['a guarded formula', "'=1+1", '=1+1'],
    ['a guarded plus', "'+cmd", '+cmd'],
    ['a guarded minus on its own', "'-", '-'],
    ['a guarded tab', "'\tx", '\tx'],
    ['plain text', 'Article', 'Article'],
    ['a quote before text', "'quoted", "'quoted"],
    ['a quote before a number', "'-3", "'-3"],
    ['a quote alone', "'", "'"],
    ['an empty cell', '', ''],
    ['undefined', undefined, ''],
  ];
}

test('reads back any rows it writes', () => {
  const cell = fc.string().filter((text) => !text.startsWith("'"));
  const rows = fc.array(fc.array(cell, { minLength: 2, maxLength: 2 }), { maxLength: 5 });

  fc.assert(
    fc.property(rows, (generated) => {
      const read = parseCsv(csvText(['a', 'b'], generated)).map((row) => row.map(cellText));

      assert.deepEqual(read, [['a', 'b'], ...generated]);
    }),
  );
});
