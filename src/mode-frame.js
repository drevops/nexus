/**
 * Settings of the mode frame, the border drawn inside the canvas edge in the
 * colour of View or Edit mode.
 *
 * The settings are saved under `frame` in the `nexusSettings` entry as
 * `{ enabled, view, edit }`, each colour a 6- or 8-digit hex value.
 */

export const FRAME_DEFAULTS = { enabled: true, view: '#00000000', edit: '#f59e0b' };

const HEX_COLOR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

// A stored colour reaches a CSS custom property, so anything but a hex value
// falls back to the default.
function color(value, fallback) {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback;
}

/**
 * Returns complete frame settings from saved ones, with defaults for each
 * missing or invalid value.
 */
export function frameSettings(saved) {
  const entry = saved && typeof saved === 'object' ? saved : {};

  return {
    enabled: typeof entry.enabled === 'boolean' ? entry.enabled : FRAME_DEFAULTS.enabled,
    view: color(entry.view, FRAME_DEFAULTS.view),
    edit: color(entry.edit, FRAME_DEFAULTS.edit),
  };
}
