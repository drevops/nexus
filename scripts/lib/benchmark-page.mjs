/**
 * The browser side of the benchmark: the diagrams it opens, the interactions
 * it times and measureDiagram(), which takes 1 sample of 1 diagram.
 *
 * The functions passed to page.evaluate() and page.addInitScript() run in the
 * page and reach nothing outside their own body. They drive the app through
 * its controls and read the graph through window.__nexus, so they work on any
 * copy of the app that has those controls.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES, templatePath } from '../../src/templates.js';
import { stressDiagram } from './stress-diagram.mjs';

const STRESS_ID = 'stress';

// The template ids to load, and whether each runs the interactions too. The
// stress diagram comes last.
const TEMPLATE_DIAGRAMS = [
  { id: 'civictheme', interactions: true },
  { id: 'open-social', interactions: false },
];

export const BENCHMARK_DIAGRAMS = Object.freeze([
  ...TEMPLATE_DIAGRAMS.map((entry) => ({ ...entry, label: TEMPLATES.find((template) => template.id === entry.id).label })),
  { id: STRESS_ID, label: 'Stress test', interactions: true },
]);

// Each runs once per sample, in this order, on the same page, so every
// interaction starts from the state the one before left.
export const INTERACTIONS = Object.freeze([
  { id: 'layout-lr', label: 'layout LR' },
  { id: 'layout-tb', label: 'layout TB' },
  { id: 'layout-columns', label: 'layout Columns' },
  { id: 'tidy', label: 'Tidy up' },
  { id: 'fields-off', label: 'Fields off' },
  { id: 'fields-on', label: 'Fields on' },
  { id: 'proxies-off', label: 'Proxies off' },
  { id: 'proxies-on', label: 'Proxies on' },
  { id: 'undo', label: 'undo a move of every node' },
  { id: 'redo', label: 'redo a move of every node' },
]);

const VIEWPORT = { width: 1440, height: 900 };

const LOAD_TIMEOUT = 120000;

/**
 * The saved document a benchmark diagram opens, read from the templates of
 * the copy at `root`.
 */
export function benchmarkDocument(root, id) {
  if (id === STRESS_ID) {
    return stressDiagram();
  }

  return JSON.parse(readFileSync(join(root, templatePath({ id: id })), 'utf8'));
}

// Records when the first diagram is drawn, or the error the landing shows,
// and every long task until then.
function watchLoad() {
  const state = { drawn: null, error: null, longTasks: [] };

  window.__benchmark = state;
  new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => state.longTasks.push({ start: entry.startTime, duration: entry.duration }));
  }).observe({ type: 'longtask', buffered: true });

  // The time is taken a frame after the graph exists, once it has painted.
  const poll = () => {
    const error = document.getElementById('landing-error-text');

    if (error && error.textContent.trim()) {
      state.error = error.textContent.trim();
      return;
    }

    if (window.__nexus && window.__nexus.cy.nodes('[group="entity"]').nonempty()) {
      requestAnimationFrame(() => {
        state.drawn = performance.now();
      });
      return;
    }

    requestAnimationFrame(poll);
  };

  requestAnimationFrame(poll);
}

// Total blocking time: the part over 50 ms of each long task that started
// before the diagram was drawn.
function loadTimes() {
  const { drawn, longTasks } = window.__benchmark;
  const blocking = longTasks.filter((task) => task.start < drawn).reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0);

  return { load: drawn, blocking: blocking };
}

// Runs 1 interaction and returns the milliseconds until the frame after it
// has painted. A precondition that doesn't hold throws, so a benchmark never
// times a control that did nothing.
async function runInteraction(id) {
  const byId = (elementId) => document.getElementById(elementId);

  const pickLayout = (value) => () => {
    const menu = byId('layout-menu');
    const item = menu.querySelector('sl-menu-item[value="' + value + '"]');

    if (!item) {
      throw new Error('The layout menu has no "' + value + '" item');
    }

    menu.dispatchEvent(new CustomEvent('sl-select', { detail: { item: item } }));
  };

  const setSwitch = (elementId, checked) => () => {
    const toggle = byId(elementId);

    if (toggle.checked === checked) {
      throw new Error('#' + elementId + ' is already ' + (checked ? 'on' : 'off'));
    }

    toggle.checked = checked;
    toggle.dispatchEvent(new Event('sl-change', { bubbles: true }));
  };

  // SlButton's click() clicks its inner button, which stays disabled until
  // the host's next render, so the event goes to the host.
  const press = (elementId) => () => {
    if (byId(elementId).disabled) {
      throw new Error('#' + elementId + ' is disabled');
    }

    byId(elementId).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  // Fields show at the All detail level and hide at the Entities level. A
  // copy without detail levels has a Fields switch instead.
  const showFields = (on) => () => {
    const levels = byId('detail-levels');

    if (!levels) {
      setSwitch('fields-toggle', on)();
      return;
    }

    const level = on ? 'all' : 'entities';
    const button = levels.querySelector('[data-level="' + level + '"]');

    if (button.classList.contains('is-active')) {
      throw new Error('The ' + level + ' detail level is already on');
    }

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  const actions = {
    'layout-lr': pickLayout('lr'),
    'layout-tb': pickLayout('tb'),
    'layout-columns': pickLayout('columns'),
    tidy: press('tidy'),
    'fields-off': showFields(false),
    'fields-on': showFields(true),
    'proxies-off': setSwitch('proxy-toggle', false),
    'proxies-on': setSwitch('proxy-toggle', true),
    undo: press('undo'),
    redo: press('redo'),
  };

  if (!actions[id]) {
    throw new Error('Unknown interaction "' + id + '"');
  }

  // Moving every node gives undo the largest edit a diagram can have.
  if (id === 'undo') {
    const { checkpoint } = await import('./src/undo.js');
    const cy = window.__nexus.cy;

    cy.batch(() => cy.nodes().forEach((node) => node.position({ x: node.position('x') + 40, y: node.position('y') + 40 })));
    checkpoint('Moved every node');
  }

  const start = performance.now();

  actions[id]();
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

  return performance.now() - start;
}

/**
 * Opens `url`, a link that carries a diagram, in a fresh browser context with
 * the CPU slowed down `throttle` times, and measures it.
 *
 * Returns `{ load, blocking, heap, interactions }`: the milliseconds from
 * navigation to the drawn diagram, the total blocking time until then, the
 * JS heap in bytes after a garbage collection and the milliseconds of each
 * interaction, keyed by id, when `interactions` is true. Throws when the page
 * reports an error or the diagram doesn't open.
 */
export async function measureDiagram(browser, url, { interactions, throttle }) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const errors = [];

  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    page.on('pageerror', (error) => errors.push(error.message));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.addInitScript(watchLoad);
    await page.goto(url);
    await page.waitForFunction(() => window.__benchmark.drawn !== null || window.__benchmark.error !== null, null, { timeout: LOAD_TIMEOUT });

    const error = await page.evaluate(() => window.__benchmark.error);

    if (error) {
      throw new Error('The diagram did not open: ' + error);
    }

    const { load, blocking } = await page.evaluate(loadTimes);

    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    const times = {};

    for (const interaction of interactions ? INTERACTIONS : []) {
      times[interaction.id] = await page.evaluate(runInteraction, interaction.id);
    }

    if (errors.length) {
      throw new Error('The page reported an error: ' + errors.join('; '));
    }

    return { load: load, blocking: blocking, heap: usedSize, interactions: times };
  } finally {
    await context.close();
  }
}
