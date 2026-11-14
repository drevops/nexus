/**
 * The settings a new diagram opens with: its layout, the detail level, the
 * Proxies and Machine names switches, and the View or Edit mode.
 *
 * The Settings panel sets them and render.js stores them in the browser with
 * the other settings. They apply to every diagram drawn from scratch and to
 * every saved document opened, which keeps its own node positions.
 */

import { DEFAULT_LEVEL, detailLevel } from './detail-levels.js';

export const DIAGRAM_DEFAULTS = Object.freeze({ layout: 'columns', level: DEFAULT_LEVEL, proxies: true, machineNames: true, mode: 'view' });

// The modes a diagram can open in, in the order the Settings panel lists them.
export const MODES = Object.freeze([
  { id: 'view', label: 'View' },
  { id: 'edit', label: 'Edit' },
]);

const SWITCHES = ['proxies', 'machineNames'];

/**
 * Returns the defaults with each valid value of `stored` in their place. A
 * layout outside `layoutIds`, a mode outside MODES, a level outside
 * DETAIL_LEVELS or a switch that is not a boolean keeps its default.
 *
 * A boolean `fields` reads as the All or Entities level while no valid
 * level is stored.
 */
export function readDiagramDefaults(stored, layoutIds) {
  const source = stored && typeof stored === 'object' ? stored : {};
  const valid = {
    layout: (value) => layoutIds.includes(value),
    level: (value) => typeof value === 'string' && detailLevel(value) !== null,
    mode: (value) => MODES.some((mode) => mode.id === value),
  };

  SWITCHES.forEach((key) => {
    valid[key] = (value) => typeof value === 'boolean';
  });

  const defaults = { ...DIAGRAM_DEFAULTS };

  if (Object.hasOwn(source, 'fields') && typeof source.fields === 'boolean') {
    defaults.level = source.fields ? 'all' : 'entities';
  }

  return Object.fromEntries(Object.keys(defaults).map((key) => [key, Object.hasOwn(source, key) && valid[key](source[key]) ? source[key] : defaults[key]]));
}
