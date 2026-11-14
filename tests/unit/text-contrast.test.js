import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { ENTITY_TYPES } from '../../src/entity-types.js';
import { TEXT_TONES, blendColors, contrastRatio, parseColor, textOn, textTone } from '../../src/text-contrast.js';

test('reads colours as their channels', async (t) => {
  for (const [name, value, expected] of dataProviderParseColor()) {
    await t.test(name, () => {
      assert.deepEqual(parseColor(value), expected);
    });
  }
});

function dataProviderParseColor() {
  return [
    ['a 6-digit hex', '#1f2933', [31, 41, 51]],
    ['an upper-case hex', '#FFD966', [255, 217, 102]],
    ['a 3-digit hex', '#fa0', [255, 170, 0]],
    ['an 8-digit hex, ignoring alpha', '#1f293380', [31, 41, 51]],
    ['rgb()', 'rgb(31, 41, 51)', [31, 41, 51]],
    ['rgb() without spaces', 'rgb(31,41,51)', [31, 41, 51]],
    ['rgba(), ignoring alpha', 'rgba(31, 41, 51, 0.6)', [31, 41, 51]],
    ['surrounding spaces', '  #ffffff ', [255, 255, 255]],
    ['a channel past 255', 'rgb(256, 0, 0)', null],
    ['a 4-digit hex', '#ffff', null],
    ['a hex without #', 'ffffff', null],
    ['a colour name', 'red', null],
    ['an empty string', '', null],
    ['null', null, null],
    ['undefined', undefined, null],
  ];
}

test('works out the WCAG contrast ratio', async (t) => {
  for (const [name, first, second, expected] of dataProviderContrastRatio()) {
    await t.test(name, () => {
      const ratio = contrastRatio(first, second);

      if (expected === null) {
        assert.equal(ratio, null);
      } else {
        assert.ok(Math.abs(ratio - expected) < 0.01, String(ratio));
      }
    });
  }
});

function dataProviderContrastRatio() {
  return [
    ['black on white', '#000000', '#ffffff', 21],
    ['white on black', '#ffffff', '#000000', 21],
    ['a colour on itself', '#9fc5e8', '#9fc5e8', 1],
    ['mid grey on white', '#777777', '#ffffff', 4.48],
    ['an unreadable colour', 'blue', '#ffffff', null],
    ['2 unreadable colours', '', null, null],
  ];
}

test('blends a colour over another', async (t) => {
  for (const [name, top, bottom, opacity, expected] of dataProviderBlendColors()) {
    await t.test(name, () => {
      assert.equal(blendColors(top, bottom, opacity), expected);
    });
  }
});

function dataProviderBlendColors() {
  return [
    ['fully opaque', '#123456', '#ffffff', 1, '#123456'],
    ['fully transparent', '#123456', '#ffffff', 0, '#ffffff'],
    ['black at 40% over white', '#000000', '#ffffff', 0.4, '#999999'],
    ['over an rgb() colour', '#ffffff', 'rgb(0, 0, 0)', 0.5, '#808080'],
    ['an unreadable top colour', 'blue', '#ffffff', 0.4, 'blue'],
    ['an unreadable bottom colour', '#123456', 'white', 0.4, '#123456'],
  ];
}

test('picks dark or light text for a fill', async (t) => {
  for (const [name, fill, expected] of dataProviderTextTone()) {
    await t.test(name, () => {
      assert.equal(textTone(fill), expected);
      assert.equal(textOn(fill), TEXT_TONES[expected]);
    });
  }
});

function dataProviderTextTone() {
  return [
    ['white', '#ffffff', 'dark'],
    ['a pastel', '#d9e2f3', 'dark'],
    ['a focused field fill', '#c3f0e8', 'dark'],
    ['a bright yellow', '#ffd966', 'dark'],
    ['black', '#000000', 'light'],
    ['a dark blue', '#1e3a8a', 'light'],
    ['a dark red', 'rgb(127, 29, 29)', 'light'],
    ['a mid grey', '#777777', 'light'],
    ['an unreadable fill', 'not a colour', 'dark'],
    ['no fill', undefined, 'dark'],
  ];
}

test('draws every built-in entity colour with dark text at AA contrast', () => {
  for (const entry of ENTITY_TYPES) {
    assert.equal(textTone(entry.color), 'dark', entry.type);
    assert.ok(contrastRatio(TEXT_TONES.dark.text, entry.color) >= 4.5, entry.type);
  }
});

test('keeps the muted text of each tone at AA contrast on white or black', () => {
  assert.ok(contrastRatio(TEXT_TONES.dark.muted, '#ffffff') >= 4.5);
  assert.ok(contrastRatio(TEXT_TONES.light.muted, '#000000') >= 4.5);
});

test('picks the text colour with the higher contrast for any fill', () => {
  const hex = fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255)).map((channels) => '#' + channels.map((c) => c.toString(16).padStart(2, '0')).join(''));

  fc.assert(
    fc.property(hex, (fill) => {
      const picked = textOn(fill).text;
      const other = picked === TEXT_TONES.dark.text ? TEXT_TONES.light.text : TEXT_TONES.dark.text;

      return contrastRatio(picked, fill) >= contrastRatio(other, fill);
    }),
  );
});
