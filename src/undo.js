/**
 * Undo, redo and the version history of the open diagram.
 *
 * Each edit records a step with checkpoint(). A display change that moves
 * nodes runs through untracked(), so undo leaves its moves alone. The history
 * is kept in memory and starts over with each diagram that is opened,
 * imported or started. While it is paused, nothing is recorded and the
 * diagram stays at its current version.
 */

import { History, applyPartial, snapshotGraph } from './history.js';
import { shortcutLabel } from './keyboard.js';
import { getBuilder, getController, bump, revise } from './store.js';
import { $ } from './dom.js';

let diagramHistory = null;
// The words that end the Undo and Redo titles while the history is paused,
// or null while it records.
let paused = null;
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
  const idle = paused ? verb + ' is off ' + paused : 'Nothing to ' + verb.toLowerCase();

  button.disabled = !!paused || !label;
  // SlButton does not reflect its title property, so set the attribute.
  button.setAttribute('title', label && !paused ? verb + ': ' + label + ' (' + shortcutLabel(button) + ')' : idle);
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
  paused = null;
  diagramHistory = new History({ snapshot: snapshot, apply: restore });
  diagramHistory.reset(label);
  update();
}

/**
 * Records the edits made since the last version as 1 step under `label`.
 * Edits recorded in a row with the same `coalesce` key make 1 step.
 */
export function checkpoint(label, coalesce) {
  if (!paused && diagramHistory && diagramHistory.record(label, coalesce)) {
    update();
  }
}

/**
 * Runs a display change, then adopts the node positions it leaves without a
 * step, so no undo reverts them.
 */
export function untracked(change) {
  change();

  if (diagramHistory && !paused) {
    diagramHistory.rebase();
  }
}

/**
 * Returns the label and time of each version of the open diagram, from the
 * version it was opened as, the index of the current version and whether
 * the history is paused.
 */
export function historyState() {
  if (!diagramHistory) {
    return { versions: [], index: 0, paused: !!paused };
  }

  return { versions: diagramHistory.versions(), index: diagramHistory.index, paused: !!paused };
}

/**
 * Pauses the history, with `reason` ending the titles of the Undo and Redo
 * buttons, or resumes it when `reason` is null. While paused, checkpoint()
 * and untracked() record nothing, so the history keeps the version current
 * at the pause.
 */
export function pauseHistory(reason) {
  paused = reason || null;
  update();
}

/**
 * Brings the open diagram to the version at `index`.
 */
export function goToVersion(index) {
  if (paused || !diagramHistory || index === diagramHistory.index) {
    return;
  }

  // The versions hold the diagram's own positions, so an explore view, which
  // moves the nodes it shows, ends first.
  getController().clearExplore();

  if (!diagramHistory.goTo(index)) {
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
