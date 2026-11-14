/**
 * Pure helpers for the Help panel, over the pages of src/manual.js.
 *
 * HELP_TARGETS names the manual page, and optionally the section, each
 * panel's and dialog's ? button opens.
 */

export const HELP_TARGETS = {
  entities: { page: 'entities-panel' },
  table: { page: 'fields-table' },
  legend: { page: 'legend' },
  history: { page: 'history' },
  checks: { page: 'checks' },
  changes: { page: 'comparing', anchor: 'the-changes-panel' },
  inspector: { page: 'inspector' },
  settings: { page: 'settings' },
  'link-dialog': { page: 'sharing' },
  'ai-dialog': { page: 'create-with-ai' },
};

/**
 * Returns the help target of a panel or dialog id, or null.
 */
export function helpTarget(id) {
  return Object.hasOwn(HELP_TARGETS, id) ? HELP_TARGETS[id] : null;
}

export function findHelpPage(pages, id) {
  return pages.find((page) => page.id === id) || null;
}

/**
 * Returns the pages that hold every word of the query in their title,
 * summary or text, in manual order. A blank query matches every page.
 */
export function searchManual(pages, query) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return pages;
  }

  return pages.filter((page) => {
    const text = (page.title + ' ' + page.summary + ' ' + page.text).toLowerCase();

    return words.every((word) => text.includes(word));
  });
}

/**
 * Returns the pages before and after a page in manual order, each null at an
 * end or for an unknown page.
 */
export function adjacentPages(pages, id) {
  const at = pages.findIndex((page) => page.id === id);

  if (at < 0) {
    return { previous: null, next: null };
  }

  return { previous: pages[at - 1] || null, next: pages[at + 1] || null };
}
