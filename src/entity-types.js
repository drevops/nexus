/**
 * The built-in entity types, in diagram order.
 *
 * Each record holds the type's machine name and label, its default colour and
 * symbol, and the base name of bundles created on the canvas.
 */

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

/**
 * Returns the built-in entity type with the given machine name, or null.
 */
export function findEntityType(type) {
  return BY_TYPE.get(type) || null;
}
