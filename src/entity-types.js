/**
 * The built-in entity types, in diagram order.
 *
 * Each record holds the type's machine name and label, its default colour and
 * symbol, and the base name of bundles created on the canvas.
 */

import { machineName } from './names.js';

export const ENTITY_TYPES = [
  { type: 'node', label: 'Content type', color: '#d9e2f3', symbol: 'rounded', bundleBase: 'content_type' },
  { type: 'taxonomy_term', label: 'Vocabulary', color: '#9fc5e8', symbol: 'tag', bundleBase: 'vocabulary' },
  { type: 'media', label: 'Media', color: '#f6b26b', symbol: 'barrel', bundleBase: 'media_type' },
  { type: 'paragraph', label: 'Paragraph', color: '#cdbdec', symbol: 'cut', bundleBase: 'paragraph' },
  { type: 'block_content', label: 'Block', color: '#b6d7a8', symbol: 'rectangle', bundleBase: 'block' },
  { type: 'user', label: 'User', color: '#ea9999', symbol: 'ellipse', bundleBase: 'user' },
  { type: 'external', label: 'External entity', color: '#ea9999', symbol: 'hexagon', bundleBase: 'external_entity' },
];

export const ENTITY_TYPE_ORDER = ENTITY_TYPES.map((entry) => entry.type);

const BY_TYPE = new Map(ENTITY_TYPES.map((entry) => [entry.type, entry]));

const COUNT_NOUNS = new Map([
  ['node', ['content type', 'content types']],
  ['taxonomy_term', ['vocabulary', 'vocabularies']],
  ['media', ['media type', 'media types']],
  ['paragraph', ['paragraph type', 'paragraph types']],
  ['block_content', ['block type', 'block types']],
  ['user', ['user type', 'user types']],
  ['external', ['external entity type', 'external entity types']],
]);

/**
 * Returns the built-in entity type with the given machine name, or null.
 */
export function findEntityType(type) {
  return BY_TYPE.get(type) || null;
}

/**
 * Returns the built-in entity type a name stands for, or null. The name can
 * be the type's machine name, its label or the singular noun of its bundles,
 * such as 'paragraph type', compared as machine names, so case, spaces and
 * punctuation don't count.
 */
export function findEntityTypeByName(name) {
  const key = machineName(name);

  return ENTITY_TYPES.find((entry) => [entry.type, entry.label, COUNT_NOUNS.get(entry.type)[0]].some((alias) => machineName(alias) === key)) || null;
}

/**
 * Formats a count of bundles of a built-in entity type, such as
 * '9 vocabularies' or '1 media type'.
 */
export function formatCount(type, count) {
  const nouns = COUNT_NOUNS.get(type);

  if (!nouns) {
    throw new Error('Unknown entity type: ' + type);
  }

  return count + ' ' + nouns[count === 1 ? 0 : 1];
}

/**
 * Returns the plural name of a built-in entity type's bundles, capitalised,
 * such as 'Vocabularies', or null for any other type.
 */
export function pluralLabel(type) {
  const nouns = COUNT_NOUNS.get(type);

  if (!nouns) {
    return null;
  }

  return nouns[1].charAt(0).toUpperCase() + nouns[1].slice(1);
}
