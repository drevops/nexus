/**
 * The syntax of a keyboard shortcut, the key presses it matches, its label
 * and where the shortcut view draws each label.
 *
 * A shortcut lists 1 or more key combinations separated by spaces, and its
 * label shows the first. A combination joins any of the modifiers Mod, Ctrl,
 * Alt and Shift to a key with '+', as in 'Mod+Shift+Z', 'Alt+N' or '?'.
 *
 * Mod is Cmd on a Mac and Ctrl elsewhere, and either key matches it on every
 * platform. Ctrl matches the Ctrl key alone.
 *
 * A key is a letter, a digit, F1 to F12, Escape, Plus for '+' or another
 * printable character. A letter or a digit names the key that types it, so
 * Shift has to match.
 *
 * Any other character matches as typed, whatever Shift the keyboard layout
 * needs for it, so its combinations take no Shift.
 */

const MODIFIERS = new Map([
  ['Mod', 'mod'],
  ['Ctrl', 'ctrl'],
  ['Alt', 'alt'],
  ['Shift', 'shift'],
]);

const CHARACTERS = new Map([['Plus', '+']]);

const MAC_SYMBOLS = [
  ['ctrl', '⌃'],
  ['alt', '⌥'],
  ['shift', '⇧'],
  ['mod', '⌘'],
];

const NAMES = [
  ['mod', 'Ctrl'],
  ['ctrl', 'Ctrl'],
  ['alt', 'Alt'],
  ['shift', 'Shift'],
];

const LABELS = new Map([
  ['Escape', 'Esc'],
  ['Plus', '+'],
]);

// Text fields undo and redo their own typing with these keys.
const TEXT_UNDO_KEYS = ['Z', 'Y'];

// Badges keep this far from the viewport's edges and from each other.
const HINT_MARGIN = 2;

const parsed = new Map();

function keyKind(key) {
  if (/^[A-Z]$/.test(key)) {
    return 'letter';
  }

  if (/^[0-9]$/.test(key)) {
    return 'digit';
  }

  if (/^(F[1-9]|F1[0-2]|Escape)$/.test(key)) {
    return 'named';
  }

  if (CHARACTERS.has(key) || /^[^\sA-Za-z0-9+]$/u.test(key)) {
    return 'character';
  }

  throw new Error('Unknown key "' + key + '"');
}

function parseCombination(text) {
  const parts = text.split('+');
  const key = parts.pop();
  const combination = { key: key, kind: keyKind(key), mod: false, ctrl: false, alt: false, shift: false };

  for (const part of parts) {
    const flag = MODIFIERS.get(part);

    if (!flag || combination[flag]) {
      throw new Error('Unknown or repeated modifier "' + part + '" in "' + text + '"');
    }

    combination[flag] = true;
  }

  if (combination.mod && combination.ctrl) {
    throw new Error('Mod already stands for Ctrl in "' + text + '"');
  }

  if (combination.kind === 'character' && combination.shift) {
    throw new Error('A character takes no Shift in "' + text + '"');
  }

  return combination;
}

/**
 * Returns the combinations of a shortcut, each as its key, the kind of key
 * and the modifiers it needs. Throws on a shortcut that does not parse.
 */
export function parseShortcut(shortcut) {
  if (!parsed.has(shortcut)) {
    parsed.set(shortcut, String(shortcut).split(' ').map(parseCombination));
  }

  return parsed.get(shortcut);
}

// A non-Latin layout, or Option on a Mac, types another character than the
// key's letter, so the physical key decides there.
function letterOf(evt) {
  if (/^[a-z]$/i.test(evt.key)) {
    return evt.key.toUpperCase();
  }

  const match = /^Key([A-Z])$/.exec(evt.code || '');

  return match ? match[1] : null;
}

function keyMatches(combination, evt) {
  const key = combination.key;

  if (combination.kind === 'letter') {
    return letterOf(evt) === key;
  }

  // The digit keys type other characters on some layouts, such as '&' on
  // AZERTY, so the physical key decides. A keypad key counts only while it
  // types its digit.
  if (combination.kind === 'digit') {
    return evt.code === 'Digit' + key || (evt.code === 'Numpad' + key && evt.key === key);
  }

  if (combination.kind === 'character') {
    return evt.key === (CHARACTERS.get(key) || key);
  }

  return evt.key === key;
}

function modifiersMatch(combination, evt) {
  let command = !evt.ctrlKey && !evt.metaKey;

  if (combination.mod) {
    command = !!(evt.ctrlKey || evt.metaKey);
  } else if (combination.ctrl) {
    command = !!evt.ctrlKey && !evt.metaKey;
  }

  const shift = combination.kind === 'character' || !!evt.shiftKey === combination.shift;

  return command && shift && !!evt.altKey === combination.alt;
}

/**
 * Returns the combination of a shortcut that a keydown event presses, or
 * null.
 */
export function matchShortcut(shortcut, evt) {
  return parseShortcut(shortcut).find((combination) => modifiersMatch(combination, evt) && keyMatches(combination, evt)) || null;
}

/**
 * Returns the label of a shortcut's first combination, such as '⇧⌘Z' on a
 * Mac or 'Ctrl+Shift+Z' elsewhere.
 */
export function formatShortcut(shortcut, mac) {
  const combination = parseShortcut(shortcut)[0];
  const key = LABELS.get(combination.key) || combination.key;
  const modifiers = (mac ? MAC_SYMBOLS : NAMES).filter(([flag]) => combination[flag]).map(([, label]) => label);

  return mac ? modifiers.join('') + key : [...modifiers, key].join('+');
}

/**
 * Returns whether a combination runs while the focus is on a control that
 * takes typed keys.
 *
 * `focus` is 'text' for a text field, 'choice' for a select or a menu, or
 * null for any other control.
 */
export function allowedWhileFocused(combination, focus) {
  const command = combination.mod || combination.ctrl;

  if (focus === 'text') {
    return command && !TEXT_UNDO_KEYS.includes(combination.key);
  }

  if (focus === 'choice') {
    return command || combination.alt;
  }

  return true;
}

function overlaps(a, b) {
  return (
    a.left < b.left + b.width + HINT_MARGIN &&
    b.left < a.left + a.width + HINT_MARGIN &&
    a.top < b.top + b.height + HINT_MARGIN &&
    b.top < a.top + a.height + HINT_MARGIN
  );
}

/**
 * Places the badges of the shortcut view. Each item holds the box of the
 * control a badge labels, as its left, top, right and bottom, and the
 * badge's width and height.
 *
 * A badge is centred on its control's bottom edge, or on its top edge when
 * it would leave the viewport below. It stays inside the viewport's sides.
 *
 * A badge that would overlap an earlier one moves away from its control, 1
 * badge height at a time. Returns the left and top of each badge, in the
 * order of the items.
 */
export function placeHints(items, viewport) {
  const placed = [];

  return items.map(({ box, width, height }) => {
    const left = Math.min(Math.max((box.left + box.right - width) / 2, HINT_MARGIN), viewport.width - width - HINT_MARGIN);
    const below = box.bottom - height / 2;
    const step = below + height <= viewport.height - HINT_MARGIN ? height + HINT_MARGIN : -(height + HINT_MARGIN);
    const badge = { left: left, top: step > 0 ? below : box.top - height / 2, width: width, height: height };

    while (placed.some((other) => overlaps(other, badge))) {
      badge.top += step;
    }

    placed.push(badge);

    return { left: badge.left, top: badge.top };
  });
}
