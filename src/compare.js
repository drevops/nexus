/**
 * Comparing the open diagram with another version of its content model.
 *
 * The open diagram is the before side and the compared model the after side.
 * A comparison draws the changes on the canvas, lists them in the Changes
 * panel and pauses the history. The diagram can't be edited or saved while
 * a comparison is on, and stopComparison() brings it back as it was.
 */

import { diffModels } from './model-diff.js';
import { pauseHistory } from './undo.js';
import { closePanel, getController, getState, openPanel, setComparison, subscribe } from './store.js';
import { $ } from './dom.js';

// The controls that edit or save the diagram, off while comparing.
const LOCKED_CONTROLS = ['mode-build', 'doc-save', 'save-choose'];

/**
 * Compares the open diagram with the model data `after`, named `source` in
 * the Changes panel, and returns the changes. A comparison already on stops
 * first.
 */
export function startComparison(after, source) {
  const controller = getController();

  if (!controller) {
    return [];
  }

  stopComparison();

  // Edit mode would edit a graph that holds the compared model too.
  if (getState().editMode) {
    $('mode-view').click();
  }

  const changes = diffModels(controller.modelData(), after);

  // An explore view moves the nodes it shows, so it ends while the history
  // still records, and the comparison starts from the diagram's own layout.
  controller.clearExplore();
  pauseHistory('while comparing');
  controller.startComparison(changes, after);
  setComparison({ source, changes });
  openPanel('changes');

  // The Changes panel covers part of the canvas once it has drawn, so the
  // fit waits a frame.
  if (changes.length) {
    requestAnimationFrame(() => {
      if (getState().comparison && getController() === controller) {
        controller.fitOpenArea();
      }
    });
  }

  return changes;
}

/**
 * Brings the diagram back as it was before the comparison, if one is on.
 */
export function stopComparison() {
  const controller = getController();

  if (!controller || !getState().comparison) {
    return;
  }

  controller.stopComparison();
  setComparison(null);
  pauseHistory(null);
}

/**
 * Returns whether the canvas can go to a change: a reference is reached
 * through its field, and an entity of a hidden type can't be.
 */
export function canFocusChange(change) {
  const controller = getController();

  return !!controller && controller.canFocusProblem(focusId(change));
}

/**
 * Focuses the element of a change on the canvas.
 */
export function focusChange(change) {
  if (canFocusChange(change)) {
    getController().focusProblem(focusId(change));
  }
}

function focusId(change) {
  return change.element === 'reference' ? change.fieldId : change.id;
}

// The comparison the controls were last synced with.
let synced;

// The store notifies on every panel move, and writing to the toolbar's
// controls re-lays it out, so the controls change only with the comparison.
function syncControls() {
  const comparison = getState().comparison;

  if (comparison === synced) {
    return;
  }

  synced = comparison;

  // The layout is saved with the panel open, so a reload or a new diagram
  // can show the panel with no comparison.
  if (!comparison && getState().panels.changes.open) {
    closePanel('changes');
  }

  const toggle = $('changes-toggle');
  const badge = toggle.querySelector('.changes-badge');

  LOCKED_CONTROLS.forEach((id) => {
    $(id).disabled = !!comparison;
  });
  $('diagram-title').readonly = !!comparison;
  $('stage-root').toggleAttribute('data-comparing', !!comparison);
  toggle.hidden = !comparison;
  badge.textContent = comparison ? String(comparison.changes.length) : '';
  badge.title = comparison ? comparison.changes.length + (comparison.changes.length === 1 ? ' change' : ' changes') : '';
}

export function initCompare() {
  subscribe(syncControls);
  syncControls();
}
