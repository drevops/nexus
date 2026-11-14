/**
 * The entries of the Save menu, in menu order, and the formats they save.
 *
 * Each format holds its id, its label, the name of its icon and a title that
 * says what it saves. A submenu entry holds a label, an icon and a title, and
 * its formats in `formats`.
 */

export const SAVE_MENU = [
  { id: 'json', label: 'JSON', icon: 'download', title: 'Save the diagram as a Nexus document (.nexus.json)' },
  { id: 'png', label: 'PNG', icon: 'image', title: 'Save the diagram as a PNG image' },
  { id: 'svg', label: 'SVG', icon: 'file-down', title: 'Save the diagram as a scalable SVG' },
  {
    label: 'CSV',
    icon: 'file-spreadsheet',
    title: 'Save the fields, bundles or references as CSV',
    formats: [
      { id: 'csv', label: 'Fields', icon: 'table', title: 'Save the fields table as CSV' },
      { id: 'bundles-csv', label: 'Bundles', icon: 'box', title: 'Save the bundles as CSV, 1 row per bundle' },
      { id: 'references-csv', label: 'References', icon: 'list', title: 'Save the references as CSV, 1 row per target bundle' },
    ],
  },
  { id: 'md', label: 'Markdown', icon: 'file-text', title: 'Save the content model as Markdown documentation (.md)' },
  { id: 'html', label: 'HTML', icon: 'code', title: 'Save the content model as an HTML report (.html)' },
];

/**
 * Every format of the Save menu in menu order, submenus included. The Save
 * button itself saves the first.
 */
export const SAVE_FORMATS = SAVE_MENU.flatMap((entry) => entry.formats || [entry]);

const BY_ID = new Map(SAVE_FORMATS.map((format) => [format.id, format]));

/**
 * Returns the save format with the given id, or null.
 */
export function findSaveFormat(id) {
  return BY_ID.get(id) || null;
}
