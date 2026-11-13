import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, customTypeList, isHexColor, isSymbol, isTypeName, typeColors, typeSymbols } from '../../src/type-styles.js';

test('names a Cytoscape shape and a label for each symbol', () => {
  Object.entries(SYMBOLS).forEach(([key, symbol]) => {
    assert.equal(typeof symbol.shape, 'string', key);
    assert.equal(typeof symbol.label, 'string', key);
  });
});

test('checks a single value', async (t) => {
  for (const [name, check, value, expected] of dataProviderValues()) {
    await t.test(name, () => {
      assert.equal(check(value), expected);
    });
  }
});

function dataProviderValues() {
  return [
    ['a 6-digit hex colour', isHexColor, '#a1B2c3', true],
    ['an 8-digit hex colour', isHexColor, '#a1b2c3d4', true],
    ['a 3-digit hex colour', isHexColor, '#abc', false],
    ['a colour name', isHexColor, 'red', false],
    ['a colour carrying markup', isHexColor, '#a1b2c3"/><img src=x onerror=alert(1)>', false],
    ['a colour on 2 lines', isHexColor, '#a1b2c3\n', false],
    ['a colour that is a number', isHexColor, 0xa1b2c3, false],
    ['a known symbol', isSymbol, 'hexagon', true],
    ['an unknown symbol', isSymbol, 'star', false],
    ['an inherited property as a symbol', isSymbol, 'toString', false],
    ['a symbol that is not a string', isSymbol, null, false],
    ['a machine name', isTypeName, 'taxonomy_term', true],
    ['a type name with a capital', isTypeName, 'Node', false],
    ['a type name with a quote', isTypeName, 'node"]', false],
    ['an empty type name', isTypeName, '', false],
    ['a type name that is not a string', isTypeName, 7, false],
  ];
}

test('keeps the valid colours of a map', async (t) => {
  for (const [name, map, expected] of dataProviderColors()) {
    await t.test(name, () => {
      assert.deepEqual(typeColors(map), expected);
    });
  }
});

function dataProviderColors() {
  return [
    ['nothing', undefined, {}],
    ['null', null, {}],
    ['a string', '#ffffff', {}],
    ['an array', ['#ffffff'], {}],
    ['valid colours', { node: '#ffffff', media: '#00000080' }, { node: '#ffffff', media: '#00000080' }],
    ['a colour carrying markup', { node: '#fff"/><img src=x onerror=alert(1)>', media: '#ffffff' }, { media: '#ffffff' }],
    ['a type name that is not a machine name', { 'node"]': '#ffffff' }, {}],
    ['a colour that is an object', { node: { toString: () => '#ffffff' } }, {}],
  ];
}

test('keeps the known symbols of a map', async (t) => {
  for (const [name, map, expected] of dataProviderSymbols()) {
    await t.test(name, () => {
      assert.deepEqual(typeSymbols(map), expected);
    });
  }
});

function dataProviderSymbols() {
  return [
    ['nothing', undefined, {}],
    ['known symbols', { node: 'tag', media: 'barrel' }, { node: 'tag', media: 'barrel' }],
    ['an unknown symbol', { node: 'star', media: 'barrel' }, { media: 'barrel' }],
    ['an inherited property as a symbol', { node: 'constructor' }, {}],
    ['a type name that is not a machine name', { 'Node Type': 'tag' }, {}],
  ];
}

test('leaves the prototype of the result alone', () => {
  const colors = typeColors(JSON.parse('{"__proto__": {"polluted": "#ffffff"}, "node": "#ffffff"}'));
  const symbols = typeSymbols(JSON.parse('{"__proto__": "tag"}'));

  assert.equal(Object.getPrototypeOf(colors), Object.prototype);
  assert.equal(colors.polluted, undefined);
  assert.deepEqual(colors, { node: '#ffffff' });
  assert.equal(Object.getPrototypeOf(symbols), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test('reads only own entries', () => {
  const map = Object.create({ inherited: '#ffffff' });
  map.node = '#000000';

  assert.deepEqual(typeColors(map), { node: '#000000' });
});

test('keeps the valid custom types of a list', async (t) => {
  for (const [name, list, expected] of dataProviderCustomTypes()) {
    await t.test(name, () => {
      assert.deepEqual(customTypeList(list), expected);
    });
  }
});

function dataProviderCustomTypes() {
  return [
    ['nothing', undefined, []],
    ['an object', { type: 'event', label: 'Event' }, []],
    ['a valid type', [{ type: 'event', label: 'Event' }], [{ type: 'event', label: 'Event' }]],
    ['an extra key', [{ type: 'event', label: 'Event', color: '#ffffff' }], [{ type: 'event', label: 'Event' }]],
    ['a type that is not a machine name', [{ type: 'event"]', label: 'Event' }], []],
    ['a label that is not a string', [{ type: 'event', label: { html: '<b>' } }], []],
    ['a missing label', [{ type: 'event' }], []],
    ['null and strings in the list', [null, 'event', { type: 'event', label: 'Event' }], [{ type: 'event', label: 'Event' }]],
    [
      'a type listed twice',
      [
        { type: 'event', label: 'Event' },
        { type: 'event', label: 'Other' },
      ],
      [{ type: 'event', label: 'Event' }],
    ],
  ];
}
