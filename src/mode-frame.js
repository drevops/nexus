/**
 * Settings of the mode frame, the border drawn inside the canvas edge in the
 * colour of View or Edit mode.
 *
 * The settings are saved under `frame` in the `nexusSettings` entry as
 * `{ view: { enabled, color }, edit: { enabled, color } }`, each colour a 6-
 * or 8-digit hex value. Settings stored as `{ enabled, view, edit }`, with 1
 * switch and a colour per mode, read as the same frames: a mode with a fully
 * transparent colour is off, and a mode whose colour is missing or invalid
 * takes its default, off when the stored switch is off.
 */

import { isHexColor } from './type-styles.js';

export const FRAME_MODES = ['view', 'edit'];

export const FRAME_DEFAULTS = { view: { enabled: false, color: '#64748b' }, edit: { enabled: true, color: '#f59e0b' } };

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// An 8-digit hex colour ending in 00 draws nothing.
function isTransparent(value) {
  return isHexColor(value) && /^#[0-9a-f]{6}00$/i.test(value);
}

// A stored colour reaches a CSS custom property, so anything but a hex value
// falls back to the default.
function modeFrame(entry, defaults) {
  const saved = isObject(entry) ? entry : {};

  return {
    enabled: typeof saved.enabled === 'boolean' ? saved.enabled : defaults.enabled,
    color: isHexColor(saved.color) ? saved.color : defaults.color,
  };
}

function storedModeFrame(color, enabled, defaults) {
  if (isTransparent(color)) {
    return { enabled: false, color: defaults.color };
  }

  if (isHexColor(color)) {
    return { enabled, color };
  }

  return { enabled: defaults.enabled && enabled, color: defaults.color };
}

/**
 * Returns complete frame settings from saved ones, with defaults for each
 * missing or invalid value.
 */
export function frameSettings(saved) {
  const entry = isObject(saved) ? saved : {};
  const enabled = typeof entry.enabled === 'boolean' ? entry.enabled : true;
  const frames = {};

  FRAME_MODES.forEach((mode) => {
    const value = Object.hasOwn(entry, mode) ? entry[mode] : undefined;

    frames[mode] = isObject(value) ? modeFrame(value, FRAME_DEFAULTS[mode]) : storedModeFrame(value, enabled, FRAME_DEFAULTS[mode]);
  });

  return frames;
}
