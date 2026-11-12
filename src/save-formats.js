/**
 * The formats the Save menu offers, in menu order. The Save button itself
 * saves the first.
 *
 * Each record holds the format's id, its label, the name of its icon and a
 * title that says what it saves.
 */

export const SAVE_FORMATS = [
  { id: 'json', label: 'JSON', icon: 'download', title: 'Save the diagram as a Nexus document (.nexus.json)' },
  { id: 'png', label: 'PNG', icon: 'image', title: 'Save the diagram as a PNG image' },
  { id: 'svg', label: 'SVG', icon: 'file-down', title: 'Save the diagram as a scalable SVG' },
  { id: 'csv', label: 'CSV', icon: 'table', title: 'Save the fields table as CSV' },
];

const BY_ID = new Map(SAVE_FORMATS.map((format) => [format.id, format]));

/**
 * Returns the save format with the given id, or null.
 */
export function findSaveFormat(id) {
  return BY_ID.get(id) || null;
}
