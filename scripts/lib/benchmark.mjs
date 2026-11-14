/**
 * The Node side of the benchmark: options, sample order, medians, the bytes a
 * copy of the app ships, the comparison of a base with a head and the
 * Markdown report.
 *
 * A row is 1 measured value: `{ id, label, unit, gated }`, with `unit` 'ms'
 * or 'bytes'. Samples map each row id to the values its runs measured. A
 * gated row fails the benchmark when the head is slower than the base by
 * more than the threshold and the minimum difference.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

// The folders whose size is reported as the bytes the app ships.
export const SHIPPED_PATHS = Object.freeze(['src', 'assets/vendor']);

export const DEFAULTS = Object.freeze({ baseRef: null, runs: 5, throttle: 4, threshold: 15, minDiff: 10, out: '.artifacts/benchmark' });

const LIMITS = {
  runs: { min: 1, max: 50, integer: true },
  throttle: { min: 1, max: 20, integer: true },
  threshold: { min: 0, max: 1000, integer: false },
  minDiff: { min: 0, max: 60000, integer: false },
};

const FLAGS = { 'base-ref': 'baseRef', runs: 'runs', throttle: 'throttle', threshold: 'threshold', 'min-diff': 'minDiff', out: 'out' };

function readNumber(flag, key, text) {
  const value = Number(text);
  const { min, max, integer } = LIMITS[key];

  if (text.trim() === '' || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
    throw new Error('--' + flag + ' must be ' + (integer ? 'a whole number' : 'a number') + ' from ' + min + ' to ' + max + ', not "' + text + '"');
  }

  return value;
}

/**
 * Reads the command line arguments into complete options.
 *
 * Throws an error that names the argument on an unknown flag, a positional
 * argument or a value out of range.
 */
export function readOptions(args) {
  const { values } = parseArgs({ args: args, options: Object.fromEntries(Object.keys(FLAGS).map((flag) => [flag, { type: 'string' }])), strict: true });
  const options = { ...DEFAULTS };

  for (const [flag, text] of Object.entries(values)) {
    const key = FLAGS[flag];

    if (key in LIMITS) {
      options[key] = readNumber(flag, key, text);
    } else if (text === '' || text.startsWith('-')) {
      throw new Error('--' + flag + ' needs a value that does not start with "-"');
    } else {
      options[key] = text;
    }
  }

  return options;
}

/**
 * The order of the sides in each run. The side that goes first swaps every
 * run, so a machine that warms up or slows down during the benchmark weighs
 * on both sides alike.
 */
export function sampleOrder(runs, sides) {
  return Array.from({ length: runs }, (_, run) => (run % 2 === 0 ? [...sides] : [...sides].reverse()));
}

/**
 * The total size of the files under SHIPPED_PATHS in a copy of the app. A
 * path the copy doesn't have counts as 0.
 */
export function shippedBytes(root) {
  return SHIPPED_PATHS.reduce((total, path) => {
    let names;

    try {
      names = readdirSync(join(root, path), { recursive: true });
    } catch {
      return total;
    }

    return total + names.map((name) => statSync(join(root, path, name))).reduce((sum, stat) => sum + (stat.isFile() ? stat.size : 0), 0);
  }, 0);
}

export function median(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The rows of a benchmark: the load time, blocking time and heap of each
 * diagram, the time of each interaction on a diagram that has them and the
 * bytes the app ships.
 */
export function benchmarkRows(diagrams, interactions) {
  const rows = diagrams.flatMap((diagram) => [
    { id: diagram.id + ':load', label: diagram.label + ': load', unit: 'ms', gated: true },
    { id: diagram.id + ':blocking', label: diagram.label + ': blocking time', unit: 'ms', gated: false },
    { id: diagram.id + ':heap', label: diagram.label + ': JS heap', unit: 'bytes', gated: false },
    ...(diagram.interactions ? interactions : []).map((interaction) => ({
      id: diagram.id + ':' + interaction.id,
      label: diagram.label + ': ' + interaction.label,
      unit: 'ms',
      gated: true,
    })),
  ]);

  return [...rows, { id: 'bytes', label: 'Bytes shipped', unit: 'bytes', gated: false }];
}

/**
 * Adds the values of 1 diagram's measurement to the samples.
 */
export function addSample(samples, diagramId, measurement) {
  const values = { load: measurement.load, blocking: measurement.blocking, heap: measurement.heap, ...measurement.interactions };

  for (const [key, value] of Object.entries(values)) {
    const id = diagramId + ':' + key;

    samples[id] = [...(samples[id] || []), value];
  }
}

function changeStatus(base, head, unit, options) {
  const diff = head - base;
  const floor = unit === 'ms' ? options.minDiff : 0;
  const limit = (Math.abs(base) * options.threshold) / 100;

  if (diff > limit && diff > floor) {
    return 'slower';
  }

  if (-diff > limit && -diff > floor) {
    return 'faster';
  }

  return 'same';
}

/**
 * Compares the medians of the head with those of the base, or reports the
 * head alone when `base` is null.
 *
 * Each result holds the row with `head`, `min` and `max` of the head's
 * values, the `base` median, the relative `change`, a `status` of 'slower',
 * 'faster', 'same' or 'n/a' and whether the row is a `regression`. A row the
 * base has no values for, because the base predates it or failed it, is
 * 'n/a'.
 */
export function compareRows(rows, base, head, options) {
  return rows.map((row) => {
    const values = head[row.id] || [];
    const result = { ...row, head: median(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
    const baseMedian = base ? median(base[row.id] || []) : null;

    if (baseMedian === null || result.head === null) {
      return { ...result, base: baseMedian, change: null, status: 'n/a', regression: false };
    }

    const status = changeStatus(baseMedian, result.head, row.unit, options);
    const change = baseMedian === 0 ? null : (result.head - baseMedian) / baseMedian;

    return { ...result, base: baseMedian, change: change, status: status, regression: row.gated && status === 'slower' };
  });
}

export function formatValue(value, unit) {
  if (value === null || value === undefined) {
    return 'n/a';
  }

  if (unit === 'bytes') {
    if (Math.abs(value) < 1024) {
      return Math.round(value) + ' B';
    }

    return Math.abs(value) < 1024 * 1024 ? (value / 1024).toFixed(1) + ' KB' : (value / 1024 / 1024).toFixed(1) + ' MB';
  }

  return (Math.abs(value) >= 100 ? String(Math.round(value)) : value.toFixed(1)) + ' ms';
}

export function formatChange(change) {
  if (change === null) {
    return 'n/a';
  }

  const percent = (change * 100).toFixed(1);

  if (Number(percent) === 0) {
    return '0.0%';
  }

  return (change > 0 ? '+' : '') + percent + '%';
}

const RESULT_WORDS = {
  ms: { slower: 'Slower', faster: 'Faster' },
  bytes: { slower: 'Larger', faster: 'Smaller' },
};

function resultText(row) {
  if (row.regression) {
    return '**Regression**';
  }

  return RESULT_WORDS[row.unit][row.status] || '';
}

function tableRow(cells) {
  return '| ' + cells.join(' | ') + ' |';
}

function plural(count, one, many) {
  return count + ' ' + (count === 1 ? one : many);
}

/**
 * The Markdown report of compared rows. `info` holds the `runs`, `throttle`,
 * `threshold` and `minDiff` of the benchmark, the `head` commit and the
 * `base` commit or null.
 */
export function benchmarkMarkdown(compared, info) {
  const runs = 'the median of ' + plural(info.runs, 'run', 'runs') + ' of each scenario, with the CPU slowed down ' + info.throttle + 'x';
  const lines = ['## Performance benchmarks', ''];

  if (!info.base) {
    lines.push('Head `' + info.head + '`: ' + runs + '.', '', '| Scenario | Median | Min | Max |', '| --- | ---: | ---: | ---: |');
    compared.forEach((row) =>
      lines.push(tableRow([row.label, formatValue(row.head, row.unit), formatValue(row.min, row.unit), formatValue(row.max, row.unit)])),
    );

    return lines.join('\n') + '\n';
  }

  const rule = info.threshold + '% and ' + info.minDiff + ' ms';
  const regressions = compared.filter((row) => row.regression);
  const summary = regressions.length
    ? '**' + plural(regressions.length, 'scenario', 'scenarios') + ' regressed:** ' + regressions.map((row) => row.label).join(', ') + '.'
    : 'No scenario regressed.';

  lines.push(
    'Base `' + info.base + '` against head `' + info.head + '`: ' + runs + '.',
    'A load or an interaction regresses when its median is more than ' + rule + ' slower than the base. Blocking time, heap and bytes are for information.',
    '',
    '| Scenario | Base | Head | Change | Result |',
    '| --- | ---: | ---: | ---: | --- |',
  );
  compared.forEach((row) =>
    lines.push(tableRow([row.label, formatValue(row.base, row.unit), formatValue(row.head, row.unit), formatChange(row.change), resultText(row)])),
  );
  lines.push('', summary);

  return lines.join('\n') + '\n';
}
