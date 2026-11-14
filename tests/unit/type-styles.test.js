import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SYMBOLS,
  SYMBOL_BOX,
  SYMBOL_SHAPES,
  customTypeList,
  isHexColor,
  isSymbol,
  isTypeName,
  symbolSvg,
  typeColors,
  typeSymbols,
} from '../../src/type-styles.js';

test('names a Cytoscape shape and a label for each symbol', () => {
  Object.entries(SYMBOLS).forEach(([key, symbol]) => {
    assert.equal(typeof symbol.shape, 'string', key);
    assert.equal(typeof symbol.label, 'string', key);
  });
});

test('draws a shape for exactly the symbols there are', () => {
  assert.deepEqual(Object.keys(SYMBOL_SHAPES), Object.keys(SYMBOLS));
});

// The numbers of a shape's geometry as x and y lists. A rect, an ellipse and
// a polygon or path each list their coordinates differently.
function shapeExtent(tag, geometry) {
  const value = (name) => Number(geometry.match(new RegExp('\\b' + name + '="([^"]+)"'))[1]);

  if (tag === 'rect') {
    return { xs: [value('x'), value('x') + value('width')], ys: [value('y'), value('y') + value('height')] };
  }

  if (tag === 'ellipse') {
    return { xs: [value('cx') - value('rx'), value('cx') + value('rx')], ys: [value('cy') - value('ry'), value('cy') + value('ry')] };
  }

  const numbers = geometry.match(/-?\d+(?:\.\d+)?/g).map(Number);

  return { xs: numbers.filter((n, i) => i % 2 === 0), ys: numbers.filter((n, i) => i % 2 === 1) };
}

test('keeps each shape and its outline inside the box, with its outer edges on half-units', async (t) => {
  for (const [key, [tag, geometry]] of Object.entries(SYMBOL_SHAPES)) {
    await t.test(key, () => {
      const { xs, ys } = shapeExtent(tag, geometry);
      const edges = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

      assert.ok(edges[0] >= 0.5 && edges[1] <= SYMBOL_BOX.width - 0.5, 'x from ' + edges[0] + ' to ' + edges[1]);
      assert.ok(edges[2] >= 0.5 && edges[3] <= SYMBOL_BOX.height - 0.5, 'y from ' + edges[2] + ' to ' + edges[3]);
      edges.forEach((edge) => assert.equal(edge % 1, 0.5, 'edge at ' + edge));
    });
  }
});

test('draws a symbol as 1 filled and outlined shape at a width, in proportion', async (t) => {
  for (const [name, args, expected] of dataProviderSymbolSvg()) {
    await t.test(name, () => {
      const svg = symbolSvg(...args);
      const shape = svg.match(
        /<svg width="(\d+)" height="(\d+)" viewBox="0 0 28 20"><(\w+) [^>]*fill="([^"]*)" stroke="#5b6470" stroke-linejoin="round"\/><\/svg>$/,
      );

      assert.ok(shape, svg);
      assert.deepEqual({ width: Number(shape[1]), height: Number(shape[2]), tag: shape[3], fill: shape[4] }, expected);
    });
  }
});

function dataProviderSymbolSvg() {
  return [
    ['the default width', ['tag', '#9fc5e8'], { width: 26, height: 19, tag: 'polygon', fill: '#9fc5e8' }],
    ['the width of the box', ['ellipse', '#ea9999', 28], { width: 28, height: 20, tag: 'ellipse', fill: '#ea9999' }],
    ['the Settings width', ['barrel', '#f6b26b', 34], { width: 34, height: 24, tag: 'path', fill: '#f6b26b' }],
    ['a colour with alpha', ['rectangle', '#b6d7a880', 34], { width: 34, height: 24, tag: 'rect', fill: '#b6d7a880' }],
    ['an unknown symbol as a rounded rectangle', ['star', '#d9e2f3'], { width: 26, height: 19, tag: 'rect', fill: '#d9e2f3' }],
    ['an inherited key as a rounded rectangle', ['toString', '#d9e2f3'], { width: 26, height: 19, tag: 'rect', fill: '#d9e2f3' }],
    ['a colour name with no fill', ['diamond', 'red'], { width: 26, height: 19, tag: 'polygon', fill: 'none' }],
    ['a colour carrying markup with no fill', ['diamond', '"><script>alert(1)</script>'], { width: 26, height: 19, tag: 'polygon', fill: 'none' }],
  ];
}

test('draws the rounded corners of a rounded rectangle and none on a rectangle', () => {
  assert.match(symbolSvg('rounded', '#d9e2f3'), / rx="3.5"/);
  assert.doesNotMatch(symbolSvg('rectangle', '#d9e2f3'), / rx=/);
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
