/**
 * Undo, redo and the version history of the open diagram.
 *
 * Each edit records a step with checkpoint(). A display change that moves
 * nodes runs through untracked(), so undo leaves its moves alone. The history
 * is kept in memory and starts over with each diagram that is opened,
 * imported or started.
 */

import { History, applyPartial, snapshotGraph } from './history.js';
import { getBuilder, getController, bump, revise } from './store.js';
import { $ } from './dom.js';

const SHORTCUTS = /Mac|iPhone|iPad/.test(navigator.platform) ? { undo: '⌘Z', redo: '⇧⌘Z' } : { undo: 'Ctrl+Z', redo: 'Ctrl+Y' };

// Input types that hold no text, so the shortcuts work while 1 has focus.
const TEXTLESS_INPUTS = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'];

let diagramHistory = null;
let showTitle = () => {};

function snapshot() {
  return snapshotGraph(getController().cy, $('diagram-title').value);
}

function restore(partial) {
  const controller = getController();

  // The sync places a re-added proxy only beside a shown field, so the
  // visibility is brought up to date first.
  applyPartial(controller.cy, partial, () => {
    controller.refresh(false);
    controller.syncReferences();
  });

  if ('title' in partial) {
    showTitle(partial.title);
  }

  controller.clearFocus();
  controller.rebuildCaptions();
  controller.rebuildNotes();
  getBuilder().refreshSelection();
}

function syncButton(id, verb, label, shortcut) {
  const button = $(id);

  button.disabled = !label;
  // SlButton does not reflect its title property, so set the attribute.
  button.setAttribute('title', label ? verb + ': ' + label + ' (' + shortcut + ')' : 'Nothing to ' + verb.toLowerCase());
}

function update() {
  const { versions, index } = historyState();

  syncButton('undo', 'Undo', index > 0 ? versions[index].label : null, SHORTCUTS.undo);
  syncButton('redo', 'Redo', index < versions.length - 1 ? versions[index + 1].label : null, SHORTCUTS.redo);
  bump();
}

/**
 * Starts the history of the diagram just drawn, with the diagram as its
 * first version under `label`.
 */
export function resetHistory(label) {
  diagramHistory = new History({ snapshot: snapshot, apply: restore });
  diagramHistory.reset(label);
  update();
}

/**
 * Records the edits made since the last version as 1 step under `label`.
 * Edits recorded in a row with the same `coalesce` key make 1 step.
 */
export function checkpoint(label, coalesce) {
  if (diagramHistory && diagramHistory.record(label, coalesce)) {
    update();
  }
}

/**
 * Runs a display change, then adopts the node positions it leaves without a
 * step, so no undo reverts them.
 */
export function untracked(change) {
  change();

  if (diagramHistory) {
    diagramHistory.rebase();
  }
}

/**
 * Returns the label and time of each version of the open diagram, from the
 * version it was opened as, and the index of the current version.
 */
export function historyState() {
  if (!diagramHistory) {
    return { versions: [], index: 0 };
  }

  return { versions: diagramHistory.versions(), index: diagramHistory.index };
}

/**
 * Brings the open diagram to the version at `index`.
 */
export function goToVersion(index) {
  if (!diagramHistory || !diagramHistory.goTo(index)) {
    return;
  }

  revise();
  update();
}

export function undo() {
  goToVersion(historyState().index - 1);
}

export function redo() {
  goToVersion(historyState().index + 1);
}

// Whether the event comes from a field that edits text, which keeps its own
// undo. Shoelace controls hold their native input in a shadow root.
function fromTextField(evt) {
  const target = evt.composedPath()[0];

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || target.tagName === 'TEXTAREA') {
    return true;
  }

  return target.tagName === 'INPUT' && !TEXTLESS_INPUTS.includes(target.type);
}

// Whether a diagram is open with no landing screen, loader or dialog over it.
function diagramInFront() {
  return !!diagramHistory && $('landing').hidden && $('loader').hidden && !document.querySelector('sl-dialog[open]');
}

// The command a key press asks for, or null. Cmd or Ctrl with Z undoes and
// adds Shift to redo; Ctrl+Y redoes too, while Cmd+Y stays the browser's.
function commandFor(evt) {
  if (evt.altKey || !(evt.ctrlKey || evt.metaKey)) {
    return null;
  }

  // A non-Latin layout reports another letter in `key`, so the physical key
  // decides there.
  const letter = /^[a-z]$/i.test(evt.key) ? evt.key.toLowerCase() : evt.code.replace(/^Key/, '').toLowerCase();

  if (letter === 'z') {
    return evt.shiftKey ? redo : undo;
  }

  if (letter === 'y' && evt.ctrlKey && !evt.metaKey && !evt.shiftKey) {
    return redo;
  }

  return null;
}

function onKeydown(evt) {
  const command = commandFor(evt);

  if (!command || evt.defaultPrevented || fromTextField(evt) || !diagramInFront()) {
    return;
  }

  evt.preventDefault();
  command();
}

/**
 * Wires the undo and redo buttons and shortcuts. `onTitle(title)` shows the
 * diagram title a version restores.
 */
export function initUndo(onTitle) {
  showTitle = onTitle;
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  document.addEventListener('keydown', onKeydown);
  update();
}
