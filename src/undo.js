/**
 * Undo, redo and the version history of the open diagram.
 *
 * Each edit records a step with checkpoint(). A display change that moves
 * nodes runs through untracked(), so undo leaves its moves alone. The history
 * is kept in memory and starts over with each diagram that is opened,
 * imported or started.
 */

import { History, applyPartial, snapshotGraph } from './history.js';
import { shortcutLabel } from './keyboard.js';
import { getBuilder, getController, bump, revise } from './store.js';
import { $ } from './dom.js';

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

function syncButton(id, verb, label) {
  const button = $(id);

  button.disabled = !label;
  // SlButton does not reflect its title property, so set the attribute.
  button.setAttribute('title', label ? verb + ': ' + label + ' (' + shortcutLabel(button) + ')' : 'Nothing to ' + verb.toLowerCase());
}

function update() {
  const { versions, index } = historyState();

  syncButton('undo', 'Undo', index > 0 ? versions[index].label : null);
  syncButton('redo', 'Redo', index < versions.length - 1 ? versions[index + 1].label : null);
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

/**
 * Wires the undo and redo buttons. `onTitle(title)` shows the diagram title a
 * version restores.
 */
export function initUndo(onTitle) {
  showTitle = onTitle;
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  update();
}
