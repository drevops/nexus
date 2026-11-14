/**
 * The icon each panel draws before its title.
 *
 * Each panel takes the icon of the toolbar button that toggles it. The
 * Inspector has no toggle and takes the icon of the Edit button, since Edit
 * mode is where it opens.
 */

export const PANEL_ICONS = {
  entities: 'box',
  table: 'table',
  legend: 'info',
  history: 'history',
  checks: 'list-checks',
  changes: 'git-compare',
  inspector: 'pencil',
};
