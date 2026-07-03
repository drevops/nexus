/**
 * Conversions between machine names, labels and file names.
 *
 * Each function accepts any value: null and undefined give an empty string,
 * and anything else is converted with String().
 */

/**
 * Turns a machine name into a label: 'taxonomy_term' gives 'Taxonomy Term'.
 * Underscores and dots become spaces and each word starts with a capital.
 */
export function humanize(value) {
  return String(value ?? '')
    .replace(/[_.]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Turns text into a Drupal machine name, using Drupal's default pattern.
 *
 * Each run of characters outside a-z, 0-9 and '_' becomes 1 underscore, and
 * leading and trailing underscores are trimmed. A valid machine name is
 * returned unchanged, double underscores included.
 */
export function machineName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Turns text into a lowercase, hyphen-separated file name stem: 'My Model'
 * gives 'my-model'. Returns an empty string when no letter or digit remains.
 */
export function fileSlug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
