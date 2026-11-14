/**
 * The explore bar in the status bar: the entity an explore view starts from,
 * its depth and direction, and the button that clears it.
 *
 * The bar shows while the open diagram's controller reports an explore view
 * (see exploring() in src/render.js) and changes it through the controller.
 */

import { EXPLORE_DEPTHS, EXPLORE_DIRECTIONS, exploreSummary } from './explore.js';
import { getController, subscribe } from './store.js';
import { $ } from './dom.js';

let shownKey = null;

function fillControls() {
  const depths = EXPLORE_DEPTHS.map((depth) => {
    const option = document.createElement('sl-option');
    const text = depth === 1 ? '1 reference' : depth + ' references';

    option.setAttribute('value', String(depth));
    option.setAttribute('title', 'Show the entities up to ' + text + ' away');
    option.textContent = text;

    return option;
  });
  const directions = EXPLORE_DIRECTIONS.map((direction) => {
    const button = document.createElement('sl-radio-button');

    button.setAttribute('value', direction.id);
    button.setAttribute('title', direction.title);
    button.textContent = direction.label;

    return button;
  });

  $('explore-depth').append(...depths);
  $('explore-direction').append(...directions);
}

// Brings the bar in line with the controller's explore view. The store
// notifies on every panel move, so the bar is redrawn only when the view or
// its entity's label changed.
function showExplore() {
  const controller = getController();
  const view = controller ? controller.exploring() : null;
  const key = view ? JSON.stringify(view) : '';

  if (key === shownKey) {
    return;
  }

  shownKey = key;
  $('explore-bar').hidden = !view;

  if (!view) {
    return;
  }

  const summary = exploreSummary(view.label, view);
  const entity = $('explore-entity');

  entity.textContent = view.label;
  entity.setAttribute('title', 'Showing ' + summary);
  $('explore-depth').value = String(view.depth);
  $('explore-direction').value = view.direction;
}

export function initExploreBar() {
  fillControls();

  // Shoelace reads the select's value as text.
  $('explore-depth').addEventListener('sl-change', (evt) => getController().setExplore({ depth: Number(evt.target.value) }));
  $('explore-direction').addEventListener('sl-change', (evt) => getController().setExplore({ direction: evt.target.value }));
  $('explore-clear').addEventListener('click', () => getController().clearExplore());

  subscribe(showExplore);
  showExplore();
}
