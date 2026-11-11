/**
 * The settings a new diagram opens with: its layout, the Fields, Proxies and
 * Machine names switches, and the View or Edit mode.
 *
 * The Settings panel sets them and render.js stores them in the browser with
 * the other settings. They apply to every diagram drawn from scratch and to
 * every saved document opened, which keeps its own node positions.
 */

export const DIAGRAM_DEFAULTS = Object.freeze({ layout: 'columns', fields: true, proxies: true, machineNames: true, mode: 'view' });

// The modes a diagram can open in, in the order the Settings panel lists them.
export const MODES = Object.freeze([
  { id: 'view', label: 'View' },
  { id: 'edit', label: 'Edit' },
]);

const SWITCHES = ['fields', 'proxies', 'machineNames'];

/**
 * Returns the defaults with each valid value of `stored` in their place. A
 * layout outside `layoutIds`, a mode outside MODES or a switch that is not a
 * boolean keeps its default.
 */
export function readDiagramDefaults(stored, layoutIds) {
  const source = stored && typeof stored === 'object' ? stored : {};
  const valid = {
    layout: (value) => layoutIds.includes(value),
    mode: (value) => MODES.some((mode) => mode.id === value),
  };

  SWITCHES.forEach((key) => {
    valid[key] = (value) => typeof value === 'boolean';
  });

  return Object.fromEntries(
    Object.keys(DIAGRAM_DEFAULTS).map((key) => [key, Object.hasOwn(source, key) && valid[key](source[key]) ? source[key] : DIAGRAM_DEFAULTS[key]]),
  );
}
