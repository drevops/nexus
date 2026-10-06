import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allowedWhileFocused, formatShortcut, matchShortcut, parseShortcut, placeHints } from '../../src/shortcuts.js';

const INDEX = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');

// The markup of each screen: the toolbar and status bar around the diagram,
// and the landing screen drawn over them.
const SCREENS = [
  ['the diagram screen', INDEX.slice(INDEX.indexOf('<header'), INDEX.indexOf('<div id="landing"'))],
  ['the landing screen', INDEX.slice(INDEX.indexOf('<div id="landing"'), INDEX.indexOf('<div id="loader"'))],
];

const VIEWPORT = { width: 1000, height: 600 };

// A keydown event as a browser reports it, with the modifiers in `held`.
function keydown(key, code, held = []) {
  return {
    key: key,
    code: code,
    ctrlKey: held.includes('ctrl'),
    metaKey: held.includes('meta'),
    altKey: held.includes('alt'),
    shiftKey: held.includes('shift'),
  };
}

// The id and shortcut of every element in the markup that has a shortcut.
function shortcutsIn(markup) {
  return [...markup.matchAll(/<[a-z-]+\s[^>]*\bdata-shortcut="([^"]*)"[^>]*>/g)].map((match) => {
    const id = /\sid="([^"]+)"/.exec(match[0]);

    return { id: id ? id[1] : null, shortcut: match[1], repeats: /\sdata-shortcut-repeat[\s>]/.test(match[0]) };
  });
}

// A control's box and the size of the badge that labels it.
function hint(left, top, right, bottom, width = 20, height = 10) {
  return { box: { left: left, top: top, right: right, bottom: bottom }, width: width, height: height };
}

function combination(key, kind, flags = []) {
  return { key: key, kind: kind, mod: flags.includes('mod'), ctrl: flags.includes('ctrl'), alt: flags.includes('alt'), shift: flags.includes('shift') };
}

test('parses each combination of a shortcut', async (t) => {
  for (const [name, shortcut, expected] of dataProviderParseShortcut()) {
    await t.test(name, () => {
      assert.deepEqual(parseShortcut(shortcut), expected);
    });
  }
});

function dataProviderParseShortcut() {
  return [
    ['a letter', 'F', [combination('F', 'letter')]],
    ['Shift and a letter', 'Shift+C', [combination('C', 'letter', ['shift'])]],
    ['Mod, Shift and a letter', 'Mod+Shift+Z', [combination('Z', 'letter', ['mod', 'shift'])]],
    ['2 combinations', 'Mod+Shift+Z Ctrl+Y', [combination('Z', 'letter', ['mod', 'shift']), combination('Y', 'letter', ['ctrl'])]],
    ['Alt and a letter', 'Alt+N', [combination('N', 'letter', ['alt'])]],
    ['every modifier but Mod', 'Ctrl+Alt+Shift+K', [combination('K', 'letter', ['ctrl', 'alt', 'shift'])]],
    ['a digit', '1', [combination('1', 'digit')]],
    ['Shift and a digit', 'Shift+1', [combination('1', 'digit', ['shift'])]],
    ['F1', 'F1', [combination('F1', 'named')]],
    ['F12', 'F12', [combination('F12', 'named')]],
    ['Escape', 'Escape', [combination('Escape', 'named')]],
    ['Plus', 'Plus', [combination('Plus', 'character')]],
    ['a character', '?', [combination('?', 'character')]],
    ['Mod and a character', 'Mod+/', [combination('/', 'character', ['mod'])]],
    ['Plus and a character', 'Plus =', [combination('Plus', 'character'), combination('=', 'character')]],
  ];
}

test('refuses a shortcut that does not parse', async (t) => {
  for (const [name, shortcut, message] of dataProviderMalformedShortcut()) {
    await t.test(name, () => {
      assert.throws(() => parseShortcut(shortcut), message);
    });
  }
});

function dataProviderMalformedShortcut() {
  return [
    ['an empty shortcut', '', /Unknown key ""/],
    ['a space', ' ', /Unknown key ""/],
    ['2 spaces between combinations', 'F  P', /Unknown key ""/],
    ['a modifier without a key', 'Mod+', /Unknown key ""/],
    ['a bare plus sign', '+', /Unknown key ""/],
    ['a modifier as the key', 'Mod+Shift', /Unknown key "Shift"/],
    ['a lowercase letter', 'f', /Unknown key "f"/],
    ['a key name it does not know', 'Enter', /Unknown key "Enter"/],
    ['F0', 'F0', /Unknown key "F0"/],
    ['F13', 'F13', /Unknown key "F13"/],
    ['an unknown modifier', 'Cmd+S', /Unknown or repeated modifier "Cmd"/],
    ['a lowercase modifier', 'shift+C', /Unknown or repeated modifier "shift"/],
    ['an inherited object property as a modifier', 'constructor+Z', /Unknown or repeated modifier "constructor"/],
    ['a repeated modifier', 'Shift+Shift+Z', /Unknown or repeated modifier "Shift"/],
    ['Mod with Ctrl', 'Mod+Ctrl+Z', /Mod already stands for Ctrl/],
    ['Shift with a character', 'Shift+?', /A character takes no Shift/],
    ['Shift with Plus', 'Shift+Plus', /A character takes no Shift/],
    ['a bad second combination', 'F p', /Unknown key "p"/],
    ['undefined', undefined, /Unknown key "undefined"/],
  ];
}

test('matches the key presses of a shortcut', async (t) => {
  for (const [name, shortcut, evt, expected] of dataProviderMatchShortcut()) {
    await t.test(name, () => {
      const match = matchShortcut(shortcut, evt);

      assert.equal(match ? match.key : null, expected);
    });
  }
});

function dataProviderMatchShortcut() {
  return [
    ['a letter', 'F', keydown('f', 'KeyF'), 'F'],
    ['a letter typed with Caps Lock on', 'F', keydown('F', 'KeyF'), 'F'],
    ['a letter with Shift held', 'F', keydown('F', 'KeyF', ['shift']), null],
    ['a letter with Ctrl held', 'F', keydown('f', 'KeyF', ['ctrl']), null],
    ['a letter with Cmd held', 'F', keydown('f', 'KeyF', ['meta']), null],
    ['a letter with Alt held', 'F', keydown('f', 'KeyF', ['alt']), null],
    ['another letter', 'F', keydown('g', 'KeyG'), null],
    ['a letter on a non-Latin layout', 'F', keydown('а', 'KeyF'), 'F'],
    ['a letter on a layout that moves it', 'Z', keydown('z', 'KeyW'), 'Z'],
    ['the key a moved letter leaves', 'W', keydown('z', 'KeyW'), null],
    ['a key press that reports only its key', 'F', { key: 'f' }, 'F'],
    ['a key press that reports neither a letter nor a code', 'F', { key: 'Unidentified' }, null],
    ['Shift and a letter', 'Shift+C', keydown('C', 'KeyC', ['shift']), 'C'],
    ['a letter without the Shift it needs', 'Shift+C', keydown('c', 'KeyC'), null],
    ['Option and a dead key on a Mac', 'Alt+N', keydown('Dead', 'KeyN', ['alt']), 'N'],
    ['Option and a letter that types another character on a Mac', 'Alt+S', keydown('ß', 'KeyS', ['alt']), 'S'],
    ['Ctrl for Mod', 'Mod+S', keydown('s', 'KeyS', ['ctrl']), 'S'],
    ['Cmd for Mod', 'Mod+S', keydown('s', 'KeyS', ['meta']), 'S'],
    ['Ctrl and Cmd for Mod', 'Mod+S', keydown('s', 'KeyS', ['ctrl', 'meta']), 'S'],
    ['a letter without Mod', 'Mod+S', keydown('s', 'KeyS'), null],
    ['Mod with Alt held too', 'Mod+Z', keydown('z', 'KeyZ', ['ctrl', 'alt']), null],
    ['Mod with Shift held too', 'Mod+Z', keydown('Z', 'KeyZ', ['ctrl', 'shift']), null],
    ['the first of 2 combinations', 'Mod+Shift+Z Ctrl+Y', keydown('Z', 'KeyZ', ['meta', 'shift']), 'Z'],
    ['the second of 2 combinations', 'Mod+Shift+Z Ctrl+Y', keydown('y', 'KeyY', ['ctrl']), 'Y'],
    ['neither of 2 combinations', 'Mod+Shift+Z Ctrl+Y', keydown('z', 'KeyZ', ['ctrl']), null],
    ['Cmd for Ctrl', 'Ctrl+Y', keydown('y', 'KeyY', ['meta']), null],
    ['Ctrl and Cmd for Ctrl', 'Ctrl+Y', keydown('y', 'KeyY', ['ctrl', 'meta']), null],
    ['a digit', '1', keydown('1', 'Digit1'), '1'],
    ['a digit that types a symbol on AZERTY', '1', keydown('&', 'Digit1'), '1'],
    ['a keypad digit', '1', keydown('1', 'Numpad1'), '1'],
    ['a keypad key while Num Lock is off', '1', keydown('End', 'Numpad1'), null],
    ['another digit', '1', keydown('2', 'Digit2'), null],
    ['a digit with Shift held', '1', keydown('!', 'Digit1', ['shift']), null],
    ['Shift and a digit', 'Shift+1', keydown('!', 'Digit1', ['shift']), '1'],
    ['Shift and a digit on AZERTY', 'Shift+1', keydown('1', 'Digit1', ['shift']), '1'],
    ['a character', '/', keydown('/', 'Slash'), '/'],
    ['a character typed with Shift', '?', keydown('?', 'Slash', ['shift']), '?'],
    ['a character on a layout that types it with Shift', '/', keydown('/', 'Digit7', ['shift']), '/'],
    ['a character with Ctrl held', '?', keydown('?', 'Slash', ['ctrl', 'shift']), null],
    ['another character', ',', keydown('.', 'Period'), null],
    ['Plus typed with Shift', 'Plus =', keydown('+', 'Equal', ['shift']), 'Plus'],
    ['Plus on the keypad', 'Plus =', keydown('+', 'NumpadAdd'), 'Plus'],
    ['the character after Plus', 'Plus =', keydown('=', 'Equal'), '='],
    ['F1', 'F1', keydown('F1', 'F1'), 'F1'],
    ['F1 with Shift held', 'F1', keydown('F1', 'F1', ['shift']), null],
    ['F10 for F1', 'F1', keydown('F10', 'F10'), null],
    ['Escape', 'Escape', keydown('Escape', 'Escape'), 'Escape'],
    ['Escape with Shift held', 'Escape', keydown('Escape', 'Escape', ['shift']), null],
  ];
}

test('labels the first combination of a shortcut on a Mac and elsewhere', async (t) => {
  for (const [name, shortcut, mac, other] of dataProviderFormatShortcut()) {
    await t.test(name, () => {
      assert.equal(formatShortcut(shortcut, true), mac);
      assert.equal(formatShortcut(shortcut, false), other);
    });
  }
});

function dataProviderFormatShortcut() {
  return [
    ['a letter', 'F', 'F', 'F'],
    ['Shift and a letter', 'Shift+C', '⇧C', 'Shift+C'],
    ['Mod and a letter', 'Mod+S', '⌘S', 'Ctrl+S'],
    ['Mod, Shift and a letter', 'Mod+Shift+E', '⇧⌘E', 'Ctrl+Shift+E'],
    ['the first of 2 combinations', 'Mod+Shift+Z Ctrl+Y', '⇧⌘Z', 'Ctrl+Shift+Z'],
    ['Ctrl and a letter', 'Ctrl+Y', '⌃Y', 'Ctrl+Y'],
    ['Alt and a letter', 'Alt+N', '⌥N', 'Alt+N'],
    ['every modifier but Mod', 'Ctrl+Alt+Shift+K', '⌃⌥⇧K', 'Ctrl+Alt+Shift+K'],
    ['every modifier but Ctrl', 'Mod+Alt+Shift+K', '⌥⇧⌘K', 'Ctrl+Alt+Shift+K'],
    ['Shift and a digit', 'Shift+1', '⇧1', 'Shift+1'],
    ['a digit', '0', '0', '0'],
    ['Escape', 'Escape', 'Esc', 'Esc'],
    ['Plus', 'Plus =', '+', '+'],
    ['a character', '?', '?', '?'],
    ['F1', 'F1', 'F1', 'F1'],
  ];
}

test('runs only the combinations a focused control leaves alone', async (t) => {
  for (const [name, shortcut, focus, expected] of dataProviderAllowedWhileFocused()) {
    await t.test(name, () => {
      assert.equal(allowedWhileFocused(parseShortcut(shortcut)[0], focus), expected);
    });
  }
});

function dataProviderAllowedWhileFocused() {
  return [
    ['a letter on the page', 'F', null, true],
    ['Shift and a letter on the page', 'Shift+C', null, true],
    ['Mod+Z on the page', 'Mod+Z', null, true],
    ['a letter in a text field', 'F', 'text', false],
    ['Shift and a letter in a text field', 'Shift+C', 'text', false],
    ['a character in a text field', '/', 'text', false],
    ['Escape in a text field', 'Escape', 'text', false],
    ['Alt and a letter in a text field', 'Alt+N', 'text', false],
    ['Mod+S in a text field', 'Mod+S', 'text', true],
    ['Mod+Shift+E in a text field', 'Mod+Shift+E', 'text', true],
    ['Mod+Z in a text field', 'Mod+Z', 'text', false],
    ['Mod+Shift+Z in a text field', 'Mod+Shift+Z', 'text', false],
    ['Ctrl+Y in a text field', 'Ctrl+Y', 'text', false],
    ['a letter in a choice', 'F', 'choice', false],
    ['Shift and a letter in a choice', 'Shift+C', 'choice', false],
    ['a digit in a choice', '1', 'choice', false],
    ['a character in a choice', '?', 'choice', false],
    ['Mod+Z in a choice', 'Mod+Z', 'choice', true],
    ['Ctrl+Y in a choice', 'Ctrl+Y', 'choice', true],
    ['Alt and a letter in a choice', 'Alt+N', 'choice', true],
  ];
}

test('places the badges of the shortcut view', async (t) => {
  for (const [name, items, expected] of dataProviderPlaceHints()) {
    await t.test(name, () => {
      assert.deepEqual(placeHints(items, VIEWPORT), expected);
    });
  }
});

function dataProviderPlaceHints() {
  return [
    ['no badges', [], []],
    ['a badge, centred on the bottom edge of its control', [hint(100, 20, 160, 50)], [{ left: 120, top: 45 }]],
    ['a badge that just fits below its control', [hint(100, 550, 160, 593)], [{ left: 120, top: 588 }]],
    ['a badge that would leave the viewport below, on the top edge', [hint(100, 570, 160, 598)], [{ left: 120, top: 565 }]],
    ['a badge past the left edge of the viewport', [hint(0, 20, 10, 50)], [{ left: 2, top: 45 }]],
    ['a badge past the right edge of the viewport', [hint(990, 20, 1000, 50)], [{ left: 978, top: 45 }]],
    [
      'badges clear of each other',
      [hint(100, 20, 160, 50), hint(200, 20, 260, 50)],
      [
        { left: 120, top: 45 },
        { left: 220, top: 45 },
      ],
    ],
    [
      'a badge exactly the margin from an earlier one',
      [hint(100, 20, 120, 50), hint(122, 20, 142, 50)],
      [
        { left: 100, top: 45 },
        { left: 122, top: 45 },
      ],
    ],
    [
      'a badge closer than the margin to an earlier one, moved down',
      [hint(100, 20, 120, 50), hint(121, 20, 141, 50)],
      [
        { left: 100, top: 45 },
        { left: 121, top: 57 },
      ],
    ],
    [
      'a badge over an earlier one, moved down',
      [hint(100, 20, 130, 50, 40), hint(130, 20, 160, 50, 40)],
      [
        { left: 95, top: 45 },
        { left: 125, top: 57 },
      ],
    ],
    [
      'a badge over an earlier one on the top edge, moved up',
      [hint(100, 570, 130, 598, 40), hint(130, 570, 160, 598, 40)],
      [
        { left: 95, top: 565 },
        { left: 125, top: 553 },
      ],
    ],
    [
      'a badge over 2 earlier ones, moved past both',
      [hint(100, 20, 130, 50, 40), hint(130, 20, 160, 50, 40), hint(115, 20, 145, 50, 40)],
      [
        { left: 95, top: 45 },
        { left: 125, top: 57 },
        { left: 110, top: 69 },
      ],
    ],
  ];
}

test('keeps a row of crowded badges centred on their controls and clear of each other', () => {
  const items = Array.from({ length: 12 }, (_, i) => hint(100 + i * 30, 20, 130 + i * 30, 50, 70, 14));
  const badges = placeHints(items, VIEWPORT).map((place) => ({ ...place, width: 70, height: 14 }));

  badges.forEach((badge, i) => {
    assert.equal(badge.left + 35, 115 + i * 30);

    for (const other of badges.slice(i + 1)) {
      const apart = badge.left + 70 <= other.left || other.left + 70 <= badge.left || badge.top + 14 <= other.top || other.top + 14 <= badge.top;

      assert.ok(apart, 'badges ' + i + ' and ' + badges.indexOf(other) + ' overlap');
    }
  });
});

test('parses the shortcut of every control on the page', () => {
  const shortcuts = shortcutsIn(INDEX);

  assert.ok(shortcuts.length > 40, 'only ' + shortcuts.length + ' controls have a shortcut');

  for (const { id, shortcut } of shortcuts) {
    assert.doesNotThrow(() => parseShortcut(shortcut), id + ' has a shortcut that does not parse');
  }
});

test('gives every control with a shortcut an id', () => {
  assert.deepEqual(
    shortcutsIn(INDEX).filter((entry) => !entry.id),
    [],
  );
});

test('gives no 2 controls on a screen the same key', async (t) => {
  for (const [name, markup] of SCREENS) {
    await t.test(name, () => {
      const owners = new Map();
      const clashes = [];

      for (const { id, shortcut } of shortcutsIn(markup)) {
        for (const text of shortcut.split(' ')) {
          const label = formatShortcut(text, false);

          if (owners.has(label)) {
            clashes.push(label + ' on ' + owners.get(label) + ' and ' + id);
          }

          owners.set(label, id);
        }
      }

      assert.ok(owners.size > 4, name + ' has no shortcuts');
      assert.deepEqual(clashes, []);
    });
  }
});

test('leaves the digit keys on the landing screen to the templates', () => {
  const landing = shortcutsIn(SCREENS[1][1]).flatMap((entry) => parseShortcut(entry.shortcut));

  assert.deepEqual(
    landing.filter((entry) => entry.kind === 'digit'),
    [],
  );
});

test('lets only undo, redo and zoom repeat while their key is held', () => {
  const repeating = shortcutsIn(INDEX).filter((entry) => entry.repeats);

  assert.deepEqual(
    repeating.map((entry) => entry.id),
    ['undo', 'redo', 'zoom-out', 'zoom-in'],
  );
});
