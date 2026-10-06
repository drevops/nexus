/**
 * Keyboard shortcuts and the shortcut view.
 *
 * A control takes the shortcut its `data-shortcut` attribute names, in the
 * syntax of `src/shortcuts.js`. The shortcut clicks the control, or focuses
 * it when it is a text field, so it runs the control's own code.
 *
 * F1 toggles the shortcut view, which labels every control on screen with
 * its shortcut. Escape, a pointer press, a resize, a scroll, the window
 * losing focus or a shortcut closes it.
 */

import { allowedWhileFocused, formatShortcut, matchShortcut, placeHints } from './shortcuts.js';
import { $ } from './dom.js';

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);

const VIEW_SHORTCUT = 'F1';

// Input types that hold no text, so a key press on 1 runs the shortcuts.
const TEXTLESS_INPUTS = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'];

const CHOICE_CONTROLS = 'select, [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"]';

let viewOpen = false;

/**
 * Returns the label of an element's shortcut on this platform, such as '⌘S'
 * on a Mac or 'Ctrl+S' elsewhere.
 */
export function shortcutLabel(element) {
  return formatShortcut(element.dataset.shortcut, MAC);
}

// Classifies the control a key press comes from: 'text' edits text, 'choice'
// is a select or a menu, and anything else is null. Shoelace controls hold
// their native input in a shadow root.
function focusKind(evt) {
  const target = evt.composedPath()[0];

  if (!(target instanceof HTMLElement)) {
    return null;
  }

  if (target.isContentEditable) {
    return 'text';
  }

  if (target.matches(CHOICE_CONTROLS)) {
    return 'choice';
  }

  if (target.tagName !== 'TEXTAREA' && (target.tagName !== 'INPUT' || TEXTLESS_INPUTS.includes(target.type))) {
    return null;
  }

  // A Shoelace select shows its value in a read-only text input.
  return target.readOnly ? 'choice' : 'text';
}

function covered() {
  return !$('loader').hidden || !!document.querySelector('sl-dialog[open]');
}

// The landing screen makes the regions under it inert.
function available(element) {
  return element.getClientRects().length > 0 && !element.closest('[inert]');
}

function shortcutFor(evt) {
  for (const element of document.querySelectorAll('[data-shortcut]')) {
    const combination = matchShortcut(element.dataset.shortcut, evt);

    if (combination && available(element)) {
      return { element: element, combination: combination };
    }
  }

  return null;
}

// A text field takes the focus with its text selected, so typing replaces
// the text.
function run(element) {
  if (element.matches('sl-input, input')) {
    element.focus();
    element.select();
    return;
  }

  element.click();
}

// The part of an element's box that its scrolling ancestors leave in view.
function visibleBox(element) {
  let { left, top, right, bottom } = element.getBoundingClientRect();

  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);

    if (style.overflowX === 'visible' && style.overflowY === 'visible') {
      continue;
    }

    const clip = parent.getBoundingClientRect();

    left = Math.max(left, clip.left);
    top = Math.max(top, clip.top);
    right = Math.min(right, clip.right);
    bottom = Math.min(bottom, clip.bottom);
  }

  return { left: left, top: top, right: right, bottom: bottom };
}

function showView() {
  if (covered()) {
    return;
  }

  const hints = [];

  for (const element of document.querySelectorAll('[data-shortcut]')) {
    const box = available(element) ? visibleBox(element) : null;

    if (!box || box.right <= box.left || box.bottom <= box.top) {
      continue;
    }

    const badge = document.createElement('kbd');

    badge.className = 'shortcut-hint' + (element.disabled ? ' is-disabled' : '');
    badge.dataset.for = element.id;
    badge.textContent = shortcutLabel(element);
    hints.push({ box: box, badge: badge });
  }

  const layer = $('shortcut-hints');

  layer.replaceChildren(...hints.map((hint) => hint.badge));
  layer.hidden = false;
  viewOpen = true;

  // A badge has a size only once it is in the layout.
  const items = hints.map((hint) => ({ box: hint.box, width: hint.badge.offsetWidth, height: hint.badge.offsetHeight }));
  const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };

  placeHints(items, viewport).forEach((place, i) => {
    hints[i].badge.style.left = place.left + 'px';
    hints[i].badge.style.top = place.top + 'px';
  });
}

function hideView() {
  if (!viewOpen) {
    return;
  }

  const layer = $('shortcut-hints');

  layer.hidden = true;
  layer.replaceChildren();
  viewOpen = false;
}

function onKeydown(evt) {
  if (evt.isComposing || evt.defaultPrevented) {
    return;
  }

  if (matchShortcut(VIEW_SHORTCUT, evt)) {
    // The browser opens its help on F1 unless the page takes the key.
    evt.preventDefault();

    if (evt.repeat) {
      return;
    }

    if (viewOpen) {
      hideView();
    } else {
      showView();
    }

    return;
  }

  if (viewOpen && evt.key === 'Escape') {
    evt.preventDefault();
    hideView();
    return;
  }

  const shortcut = covered() ? null : shortcutFor(evt);

  if (!shortcut || !allowedWhileFocused(shortcut.combination, focusKind(evt))) {
    return;
  }

  evt.preventDefault();

  if (evt.repeat && !shortcut.element.hasAttribute('data-shortcut-repeat')) {
    return;
  }

  hideView();
  run(shortcut.element);
}

/**
 * Runs the shortcut of each control and toggles the shortcut view on F1.
 */
export function initShortcuts() {
  // A Shoelace select stops the key presses it gets from propagating, so the
  // shortcuts are read in the capture phase.
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('pointerdown', hideView, true);
  document.addEventListener('scroll', hideView, true);
  window.addEventListener('resize', hideView);
  window.addEventListener('blur', hideView);
}
