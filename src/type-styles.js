/**
 * The symbols an entity type can take and the checks on entity type styles.
 *
 * Colours, symbols and custom types come from stored settings and from opened
 * documents, and colours and symbols are written into SVG markup, so each one
 * is checked before it is used. A colour is a 6- or 8-digit hex value, a
 * symbol is a key of SYMBOLS and an entity type is a machine name.
 */

// A small library of UML-ish node shapes, keyed for settings/persistence; the
// value is the Cytoscape shape that draws it.
export const SYMBOLS = {
  rounded: { shape: 'round-rectangle', label: 'Rounded rectangle' },
  rectangle: { shape: 'rectangle', label: 'Rectangle' },
  ellipse: { shape: 'ellipse', label: 'Ellipse' },
  diamond: { shape: 'diamond', label: 'Diamond' },
  hexagon: { shape: 'hexagon', label: 'Hexagon' },
  tag: { shape: 'tag', label: 'Tag' },
  barrel: { shape: 'barrel', label: 'Barrel' },
  cut: { shape: 'cut-rectangle', label: 'Cut rectangle' },
  rhomboid: { shape: 'rhomboid', label: 'Parallelogram' },
  pentagon: { shape: 'pentagon', label: 'Pentagon' },
  octagon: { shape: 'octagon', label: 'Octagon' },
};

const HEX_COLOR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

const TYPE_NAME = /^[a-z0-9_]+$/;

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function isSymbol(value) {
  return typeof value === 'string' && Object.hasOwn(SYMBOLS, value);
}

export function isTypeName(value) {
  return typeof value === 'string' && TYPE_NAME.test(value);
}

// Object.fromEntries() defines own properties, so a '__proto__' key can't
// change the prototype of the result.
function entriesWhere(map, isValid) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return {};
  }

  return Object.fromEntries(Object.entries(map).filter(([type, value]) => isTypeName(type) && isValid(value)));
}

/**
 * Returns the entries of a map of entity type to colour whose key is a
 * machine name and whose value is a hex colour.
 */
export function typeColors(map) {
  return entriesWhere(map, isHexColor);
}

/**
 * Returns the entries of a map of entity type to symbol whose key is a
 * machine name and whose value is a key of SYMBOLS.
 */
export function typeSymbols(map) {
  return entriesWhere(map, isSymbol);
}

/**
 * Returns the custom types of a list as `{ type, label }` objects, keeping
 * those with a machine name and a string label, the first of each type only.
 */
export function customTypeList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  const seen = new Set();

  return list
    .filter((item) => item && isTypeName(item.type) && typeof item.label === 'string' && !seen.has(item.type) && seen.add(item.type))
    .map((item) => ({ type: item.type, label: item.label }));
}
