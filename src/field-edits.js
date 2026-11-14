/**
 * Edits of a live field node, shared by the Inspector and the Fields table.
 *
 * Each edit writes the node, notifies the store and records 1 history step,
 * and returns whether the node changed. A value equal to the node's current
 * one records nothing. A text edit made with `typing` joins the step of the
 * typed edits to the same value before it, so typing into 1 control makes 1
 * step.
 */

import { cardinalityLabel, kindForCardinality } from './model.js';
import { settingText } from './field-settings.js';
import { describeNode } from './history.js';
import { checkpoint } from './undo.js';
import { getController, bump } from './store.js';

// Allowed values are a list, so values compare by their JSON.
function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function coalesceKey(key, node, typing) {
  return typing ? key + ':' + node.id() : null;
}

export function setFieldLabel(node, label, typing = false) {
  if (node.data('label') === label) {
    return false;
  }

  node.data('label', label);
  bump();
  checkpoint('Relabelled ' + describeNode(node), coalesceKey('label', node, typing));

  return true;
}

export function setFieldType(node, fieldType) {
  if (node.data('fieldType') === fieldType) {
    return false;
  }

  node.data('fieldType', fieldType);
  bump();
  checkpoint('Changed the type of ' + describeNode(node));
  getController().revealFields([node.id()]);

  return true;
}

// The ref edges and their proxy edges each hold a copy of the cardinality
// label.
export function setFieldCardinality(node, cardinality) {
  const current = node.data('cardinality') != null ? node.data('cardinality') : 1;

  if (current === cardinality) {
    return false;
  }

  node.data('cardinality', cardinality);
  node.data('kind', kindForCardinality(cardinality));
  node.connectedEdges('[group="ref"]').data('cardinality', cardinalityLabel(cardinality));
  getController().syncReferences();
  bump();
  checkpoint('Changed the cardinality of ' + describeNode(node));

  return true;
}

export function setFieldRequired(node, required) {
  if (!!node.data('required') === required) {
    return false;
  }

  node.data('required', required);
  bump();
  checkpoint('Made ' + describeNode(node) + (required ? ' required' : ' optional'));

  return true;
}

/**
 * Sets a description or field setting of a node, or removes its key when the
 * value is blank, so a cleared setting matches one never set. `action` opens
 * the history label, such as 'Edited the help text of'.
 */
export function setSetting(node, key, value, action, typing = false) {
  const blank = Array.isArray(value) ? value.length === 0 : typeof value === 'string' ? settingText(value) === '' : value === null;

  if (sameValue(node.data(key), blank ? undefined : value)) {
    return false;
  }

  if (blank) {
    node.removeData(key);
  } else {
    node.data(key, value);
  }

  bump();
  checkpoint(action + ' ' + describeNode(node), coalesceKey(key, node, typing));

  return true;
}

/**
 * Sets whether a field is translatable, or clears it with null when the
 * source doesn't say.
 */
export function setFieldTranslatable(node, translatable) {
  const current = typeof node.data('translatable') === 'boolean' ? node.data('translatable') : null;

  if (current === translatable) {
    return false;
  }

  if (translatable === null) {
    node.removeData('translatable');
  } else {
    node.data('translatable', translatable);
  }

  bump();

  if (translatable === null) {
    checkpoint('Cleared whether ' + describeNode(node) + ' is translatable');
  } else {
    checkpoint('Made ' + describeNode(node) + (translatable ? ' translatable' : ' not translatable'));
  }

  return true;
}
