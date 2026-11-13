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
  { id: 'csv', label: 'Fields CSV', icon: 'table', title: 'Save the fields table as CSV' },
  { id: 'bundles-csv', label: 'Bundles CSV', icon: 'box', title: 'Save the bundles as CSV, 1 row per bundle' },
  { id: 'references-csv', label: 'References CSV', icon: 'link', title: 'Save the references as CSV, 1 row per target bundle' },
  { id: 'md', label: 'Markdown', icon: 'file-text', title: 'Save the content model as Markdown documentation (.md)' },
  { id: 'html', label: 'HTML', icon: 'code', title: 'Save the content model as an HTML report (.html)' },
];

const BY_ID = new Map(SAVE_FORMATS.map((format) => [format.id, format]));

/**
 * Returns the save format with the given id, or null.
 */
export function findSaveFormat(id) {
  return BY_ID.get(id) || null;
}
