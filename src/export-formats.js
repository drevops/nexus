/**
 * The export formats the toolbar offers, in menu order, and the stored choice
 * among them.
 *
 * Each record holds the format's id, its label, the name of its icon and a
 * title that says what it exports.
 */

const STORAGE_KEY = 'nexusExportFormat';

export const EXPORT_FORMATS = [
  { id: 'png', label: 'PNG', icon: 'image', title: 'Export the diagram as a PNG image' },
  { id: 'svg', label: 'SVG', icon: 'file-down', title: 'Export the diagram as a scalable SVG' },
  { id: 'csv', label: 'CSV', icon: 'table', title: 'Export the fields table as CSV' },
];

const BY_ID = new Map(EXPORT_FORMATS.map((format) => [format.id, format]));

/**
 * Returns the export format with the given id, or null.
 */
export function findExportFormat(id) {
  return BY_ID.get(id) || null;
}

/**
 * Returns the export format stored in a window's localStorage, or null when
 * none is stored, the stored id names no format or the storage is blocked.
 */
export function loadExportFormat(win) {
  try {
    return findExportFormat(win.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Stores an export format in a window's localStorage.
 */
export function saveExportFormat(win, format) {
  try {
    win.localStorage.setItem(STORAGE_KEY, format.id);
  } catch {
    // Storage may be blocked or full, so the format is not kept.
  }
}
