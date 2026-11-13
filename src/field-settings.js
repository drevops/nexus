/**
 * Values of the descriptions and field settings read from config: help text,
 * default values and allowed values.
 *
 * An allowed value is `{ value, label }`, both strings. The Inspector edits
 * the list as 1 `value|label` line per value, the format Drupal's own field
 * settings form uses. A line without `|` uses the value as its label.
 */

/**
 * Returns `value` when it is text with more than whitespace, or an empty
 * string, so blank text counts as missing.
 */
export function settingText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : '';
}

/**
 * Returns the allowed values in `raw` as a list of `{ value, label }`.
 *
 * Accepts a list of `{ value, label }` items or a map of value to label, and
 * drops items without a value. Anything else gives an empty list.
 */
export function allowedValueList(raw) {
  if (Array.isArray(raw)) {
    return raw.filter((item) => item && typeof item === 'object' && hasValue(item.value)).map((item) => allowedValue(item.value, item.label));
  }

  if (raw && typeof raw === 'object') {
    return Object.keys(raw)
      .filter(hasValue)
      .map((value) => allowedValue(value, raw[value]));
  }

  return [];
}

/**
 * Returns the allowed values as Inspector text, 1 `value|label` line each.
 */
export function allowedValuesText(list) {
  return list.map((item) => (item.label === item.value ? item.value : item.value + '|' + item.label)).join('\n');
}

/**
 * Parses Inspector text into allowed values, skipping lines with no value.
 */
export function parseAllowedValues(text) {
  return String(text)
    .split(/\r\n|\r|\n/)
    .map((line) => {
      const bar = line.indexOf('|');

      return bar === -1 ? allowedValue(line.trim(), '') : allowedValue(line.slice(0, bar).trim(), line.slice(bar + 1).trim());
    })
    .filter((item) => item.value !== '');
}

/**
 * Returns a display label per allowed value: the label with its value in
 * brackets, or the value alone when the 2 match.
 */
export function allowedValueLabels(list) {
  return list.map((item) => (item.label === item.value ? item.value : item.label + ' (' + item.value + ')'));
}

function allowedValue(value, label) {
  const text = String(value);

  return { value: text, label: isScalar(label) && String(label) !== '' ? String(label) : text };
}

function hasValue(value) {
  return isScalar(value) && String(value) !== '';
}

function isScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
