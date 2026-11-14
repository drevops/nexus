import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedValueLabels,
  allowedValueList,
  allowedValuesText,
  parseAllowedValues,
  settingText,
  translatableChoice,
  translatableValue,
  TRANSLATABLE_OPTIONS,
} from '../../src/field-settings.js';

test('keeps text with more than white space and drops the rest', async (t) => {
  for (const [name, value, expected] of dataProviderSettingText()) {
    await t.test(name, () => {
      assert.equal(settingText(value), expected);
    });
  }
});

function dataProviderSettingText() {
  return [
    ['text', 'Pick a topic.', 'Pick a topic.'],
    ['text with spaces around it', '  Pick a topic. ', '  Pick a topic. '],
    ['an empty string', '', ''],
    ['white space', ' \n\t', ''],
    ['a number', 7, ''],
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['a list', ['Pick'], ''],
  ];
}

test('reads allowed values from config or a document', async (t) => {
  for (const [name, raw, expected] of dataProviderAllowedValueList()) {
    await t.test(name, () => {
      assert.deepEqual(allowedValueList(raw), expected);
    });
  }
});

function dataProviderAllowedValueList() {
  return [
    [
      'a list of values and labels',
      [
        { value: 'wide', label: 'Wide' },
        { value: 'narrow', label: 'Narrow' },
      ],
      [
        { value: 'wide', label: 'Wide' },
        { value: 'narrow', label: 'Narrow' },
      ],
    ],
    [
      'a list of numbers',
      [
        { value: 1, label: 'One' },
        { value: 2.5, label: 2.5 },
      ],
      [
        { value: '1', label: 'One' },
        { value: '2.5', label: '2.5' },
      ],
    ],
    ['a value without a label', [{ value: 'wide' }], [{ value: 'wide', label: 'wide' }]],
    ['a value with an empty label', [{ value: 'wide', label: '' }], [{ value: 'wide', label: 'wide' }]],
    ['a value with a label that is not text', [{ value: 'wide', label: { en: 'Wide' } }], [{ value: 'wide', label: 'wide' }]],
    ['items without a value', [{ label: 'Wide' }, { value: '' }, { value: null }, 'wide', null, { value: 'narrow' }], [{ value: 'narrow', label: 'narrow' }]],
    [
      'a map of values to labels',
      { wide: 'Wide', narrow: 'Narrow' },
      [
        { value: 'wide', label: 'Wide' },
        { value: 'narrow', label: 'Narrow' },
      ],
    ],
    ['an empty list', [], []],
    ['null', null, []],
    ['undefined', undefined, []],
    ['text', 'wide', []],
  ];
}

test('writes allowed values as lines and reads them back', async (t) => {
  for (const [name, list, text] of dataProviderAllowedValuesText()) {
    await t.test(name, () => {
      assert.equal(allowedValuesText(list), text);
      assert.deepEqual(parseAllowedValues(text), list);
    });
  }
});

function dataProviderAllowedValuesText() {
  return [
    ['no values', [], ''],
    ['a value with its own label', [{ value: 'wide', label: 'Wide' }], 'wide|Wide'],
    ['a value labelled by itself', [{ value: 'wide', label: 'wide' }], 'wide'],
    [
      'several values',
      [
        { value: 'wide', label: 'Wide' },
        { value: 'narrow', label: 'narrow' },
        { value: 'full', label: 'Full width | edge to edge' },
      ],
      'wide|Wide\nnarrow\nfull|Full width | edge to edge',
    ],
  ];
}

test('reads allowed values from text the way a person types them', async (t) => {
  for (const [name, text, list] of dataProviderParseAllowedValues()) {
    await t.test(name, () => {
      assert.deepEqual(parseAllowedValues(text), list);
    });
  }
});

function dataProviderParseAllowedValues() {
  return [
    ['spaces around the value and label', '  wide | Wide  ', [{ value: 'wide', label: 'Wide' }]],
    ['an empty label', 'wide|', [{ value: 'wide', label: 'wide' }]],
    [
      'blank lines',
      '\nwide\n\n  \nnarrow\n',
      [
        { value: 'wide', label: 'wide' },
        { value: 'narrow', label: 'narrow' },
      ],
    ],
    ['a line without a value', '|Wide\nnarrow', [{ value: 'narrow', label: 'narrow' }]],
    [
      'Windows line endings',
      'wide|Wide\r\nnarrow\rfull',
      [
        { value: 'wide', label: 'Wide' },
        { value: 'narrow', label: 'narrow' },
        { value: 'full', label: 'full' },
      ],
    ],
    ['markup', '<b>|<i>Wide</i>', [{ value: '<b>', label: '<i>Wide</i>' }]],
    ['nothing', '', []],
  ];
}

test('labels each allowed value for display', () => {
  const list = [
    { value: 'wide', label: 'Wide' },
    { value: 'narrow', label: 'narrow' },
  ];

  assert.deepEqual(allowedValueLabels(list), ['Wide (wide)', 'narrow']);
  assert.deepEqual(allowedValueLabels([]), []);
});

test('offers translatable and not translatable', () => {
  assert.deepEqual(TRANSLATABLE_OPTIONS, [
    ['yes', 'Yes'],
    ['no', 'No'],
  ]);
});

test('turns a translatability into its choice and back', async (t) => {
  for (const [name, translatable, choice] of dataProviderTranslatableChoice()) {
    await t.test(name, () => {
      assert.equal(translatableChoice(translatable), choice);
      assert.equal(translatableValue(choice), translatable);
    });
  }
});

function dataProviderTranslatableChoice() {
  return [
    ['translatable', true, 'yes'],
    ['not translatable', false, 'no'],
    ['unknown', null, ''],
  ];
}

test('reads an unknown choice as an unknown translatability', async (t) => {
  for (const [name, choice] of dataProviderUnknownChoice()) {
    await t.test(name, () => {
      assert.equal(translatableValue(choice), null);
    });
  }
});

function dataProviderUnknownChoice() {
  return [
    ['an empty choice', ''],
    ['an unknown word', 'maybe'],
    ['a capitalised choice', 'Yes'],
    ['an inherited property', 'constructor'],
    ['no choice', undefined],
  ];
}

test('gives no choice for a value that is not a boolean', () => {
  assert.equal(translatableChoice('yes'), '');
  assert.equal(translatableChoice(undefined), '');
});
