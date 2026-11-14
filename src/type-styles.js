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

// Each symbol in 1 box of 28 by 20 units, with its outline on half-units, so
// at 28 pixels wide every edge lands on whole pixels, and every size keeps the
// same proportions.
export const SYMBOL_SHAPES = {
  rounded: ['rect', 'x="1.5" y="2.5" width="25" height="15" rx="3.5"'],
  rectangle: ['rect', 'x="1.5" y="2.5" width="25" height="15"'],
  ellipse: ['ellipse', 'cx="14" cy="10" rx="12.5" ry="7.5"'],
  diamond: ['polygon', 'points="14,1.5 26.5,10 14,18.5 1.5,10"'],
  hexagon: ['polygon', 'points="7.5,2.5 20.5,2.5 26.5,10 20.5,17.5 7.5,17.5 1.5,10"'],
  tag: ['polygon', 'points="1.5,2.5 20.5,2.5 26.5,10 20.5,17.5 1.5,17.5"'],
  barrel: ['path', 'd="M2.5,4.5 Q14,0.5 25.5,4.5 L25.5,15.5 Q14,19.5 2.5,15.5 Z"'],
  cut: ['polygon', 'points="6.5,2.5 21.5,2.5 26.5,6.5 26.5,13.5 21.5,17.5 6.5,17.5 1.5,13.5 1.5,6.5"'],
  rhomboid: ['polygon', 'points="6.5,2.5 26.5,2.5 21.5,17.5 1.5,17.5"'],
  pentagon: ['polygon', 'points="14,1.5 26.5,8.5 22.5,18.5 5.5,18.5 1.5,8.5"'],
  octagon: ['polygon', 'points="8.5,1.5 19.5,1.5 26.5,6.5 26.5,13.5 19.5,18.5 8.5,18.5 1.5,13.5 1.5,6.5"'],
};

export const SYMBOL_BOX = { width: 28, height: 20 };

const SYMBOL_STROKE = '#5b6470';

const DEFAULT_SYMBOL_WIDTH = 26;

/**
 * Returns the SVG of a symbol filled with a colour, `width` pixels wide and
 * as tall as the 28 by 20 box allows. An unknown symbol draws as a rounded
 * rectangle and a colour that isn't a hex value draws no fill, since the
 * markup goes into innerHTML.
 */
export function symbolSvg(key, color, width = DEFAULT_SYMBOL_WIDTH) {
  const [tag, geometry] = isSymbol(key) ? SYMBOL_SHAPES[key] : SYMBOL_SHAPES.rounded;
  const height = Math.round((width * SYMBOL_BOX.height) / SYMBOL_BOX.width);
  const fill = isHexColor(color) ? color : 'none';

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${SYMBOL_BOX.width} ${SYMBOL_BOX.height}"><${tag} ${geometry} fill="${fill}" stroke="${SYMBOL_STROKE}" stroke-linejoin="round"/></svg>`;
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
