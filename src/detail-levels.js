/**
 * The detail levels of a diagram: which fields the canvas shows.
 *
 * Each level shows every field the level before it shows. Entities shows no
 * field and draws 1 collapsed edge per pair of referencing entities,
 * References adds the configurable fields of a reference field type,
 * Configurable every field that is not a base field, and All every field.
 */

import { KIND_SYSTEM, REFERENCE_FIELD_TYPES } from './model.js';

// In the order the shortcut cycles them.
export const DETAIL_LEVELS = Object.freeze([
  { id: 'entities', label: 'Entities', title: 'Show only the entities, with 1 line between each pair that reference each other' },
  { id: 'references', label: 'References', title: 'Show the entities with their reference fields' },
  { id: 'configurable', label: 'Configurable', title: 'Show every configurable field, without base fields' },
  { id: 'all', label: 'All', title: 'Show every field, including base fields' },
]);

export const DEFAULT_LEVEL = 'all';

const SHOWS = {
  entities: () => false,
  references: (field) => field.kind !== KIND_SYSTEM && REFERENCE_FIELD_TYPES.includes(field.fieldType),
  configurable: (field) => field.kind !== KIND_SYSTEM,
  all: () => true,
};

/**
 * Returns the level with the id, or null for an id that names none.
 */
export function detailLevel(id) {
  return DETAIL_LEVELS.find((level) => level.id === id) || null;
}

/**
 * Returns the level after the one with the id, wrapping from the last to the
 * first. An unknown id is read as DEFAULT_LEVEL.
 */
export function nextLevel(id) {
  const index = DETAIL_LEVELS.indexOf(detailLevel(id) || detailLevel(DEFAULT_LEVEL));

  return DETAIL_LEVELS[(index + 1) % DETAIL_LEVELS.length];
}

/**
 * Whether the level shows any field.
 */
export function showsFields(id) {
  return id !== 'entities';
}

/**
 * Whether the level shows the field, given its `kind` and `fieldType`. An
 * unknown level shows every field.
 */
export function levelShowsField(id, field) {
  return (Object.hasOwn(SHOWS, id) ? SHOWS[id] : SHOWS[DEFAULT_LEVEL])(field);
}

/**
 * Returns the first level that shows the field.
 */
export function lowestLevelFor(field) {
  return DETAIL_LEVELS.find((level) => levelShowsField(level.id, field));
}

/**
 * The title of a field's go-to button while the level hides the field: it
 * names the level and the first level that shows the field.
 */
export function levelHidesTitle(id, field) {
  return 'Fields: ' + detailLevel(id).label + ' hides this field. Pick ' + lowestLevelFor(field).label + ' to go to it';
}
