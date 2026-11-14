import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULTS,
  SHIPPED_PATHS,
  addSample,
  benchmarkMarkdown,
  benchmarkRows,
  compareRows,
  formatChange,
  formatValue,
  median,
  readOptions,
  sampleOrder,
  shippedBytes,
} from '../../scripts/lib/benchmark.mjs';
import { BENCHMARK_DIAGRAMS, INTERACTIONS, benchmarkDocument } from '../../scripts/lib/benchmark-page.mjs';
import { stressDiagram } from '../../scripts/lib/stress-diagram.mjs';
import { TEMPLATES } from '../../src/templates.js';

const ROOT = join(import.meta.dirname, '..', '..');

const COMPARE = { threshold: 15, minDiff: 10 };

const ROWS = [
  { id: 'a:load', label: 'A: load', unit: 'ms', gated: true },
  { id: 'a:heap', label: 'A: JS heap', unit: 'bytes', gated: false },
];

test('reads the defaults from no arguments', () => {
  assert.deepEqual(readOptions([]), DEFAULTS);
});

test('reads each option', async (t) => {
  for (const [args, expected] of dataProviderOptions()) {
    await t.test(args.join(' '), () => {
      assert.deepEqual(readOptions(args), { ...DEFAULTS, ...expected });
    });
  }
});

function dataProviderOptions() {
  return [
    [['--base-ref', 'main'], { baseRef: 'main' }],
    [['--base-ref=0123abc'], { baseRef: '0123abc' }],
    [['--runs', '7'], { runs: 7 }],
    [['--runs', '1'], { runs: 1 }],
    [['--throttle', '1'], { throttle: 1 }],
    [['--threshold', '7.5'], { threshold: 7.5 }],
    [['--threshold', '0'], { threshold: 0 }],
    [['--min-diff', '0'], { minDiff: 0 }],
    [['--out', 'reports/perf'], { out: 'reports/perf' }],
    [
      ['--runs', '3', '--throttle', '6', '--threshold', '20', '--min-diff', '25', '--base-ref', 'origin/main'],
      { runs: 3, throttle: 6, threshold: 20, minDiff: 25, baseRef: 'origin/main' },
    ],
  ];
}

test('rejects arguments it cannot use', async (t) => {
  for (const [args, message] of dataProviderBadOptions()) {
    await t.test(args.join(' '), () => {
      assert.throws(() => readOptions(args), message);
    });
  }
});

function dataProviderBadOptions() {
  return [
    [['--runs', '0'], /--runs must be a whole number from 1 to 50, not "0"/],
    [['--runs', '51'], /--runs must be a whole number from 1 to 50/],
    [['--runs', '2.5'], /--runs must be a whole number/],
    [['--runs', 'five'], /--runs must be a whole number/],
    [['--runs', ''], /--runs must be a whole number/],
    [['--runs', ' '], /--runs must be a whole number/],
    [['--throttle', '0'], /--throttle must be a whole number from 1 to 20/],
    [['--throttle', '1e9'], /--throttle must be a whole number from 1 to 20/],
    [['--threshold=-1'], /--threshold must be a number from 0 to 1000/],
    [['--threshold', 'Infinity'], /--threshold must be a number/],
    [['--min-diff', 'NaN'], /--min-diff must be a number/],
    [['--base-ref', ''], /--base-ref needs a value that does not start with "-"/],
    [['--base-ref=--output=x'], /--base-ref needs a value that does not start with "-"/],
    [['--out', '-'], /--out needs a value/],
    [['--runs'], /argument missing/],
    [['--unknown', '1'], /Unknown option '--unknown'/],
    [['main'], /Unexpected argument 'main'/],
  ];
}

test('swaps the side that goes first on every run', async (t) => {
  for (const [runs, sides, expected] of dataProviderSampleOrder()) {
    await t.test(runs + ' runs of ' + sides.join(', '), () => {
      assert.deepEqual(sampleOrder(runs, sides), expected);
    });
  }
});

function dataProviderSampleOrder() {
  return [
    [1, ['base', 'head'], [['base', 'head']]],
    [
      4,
      ['base', 'head'],
      [
        ['base', 'head'],
        ['head', 'base'],
        ['base', 'head'],
        ['head', 'base'],
      ],
    ],
    [2, ['head'], [['head'], ['head']]],
  ];
}

test('leaves the sides it is given alone', () => {
  const sides = ['base', 'head'];

  sampleOrder(2, sides);

  assert.deepEqual(sides, ['base', 'head']);
});

test('takes the median of any number of values', async (t) => {
  for (const [values, expected] of dataProviderMedian()) {
    await t.test(JSON.stringify(values), () => {
      assert.equal(median(values), expected);
    });
  }
});

function dataProviderMedian() {
  return [
    [[], null],
    [[4], 4],
    [[3, 1], 2],
    [[5, 1, 3], 3],
    [[10, 2, 8, 4], 6],
    [[7, 7, 7, 100, 1], 7],
  ];
}

test('leaves the values it takes the median of in their order', () => {
  const values = [3, 1, 2];

  median(values);

  assert.deepEqual(values, [3, 1, 2]);
});

test('lists the rows of each diagram and the bytes shipped', () => {
  const rows = benchmarkRows(
    [
      { id: 'a', label: 'A', interactions: true },
      { id: 'b', label: 'B', interactions: false },
    ],
    [{ id: 'tidy', label: 'Tidy up' }],
  );

  assert.deepEqual(rows, [
    { id: 'a:load', label: 'A: load', unit: 'ms', gated: true },
    { id: 'a:blocking', label: 'A: blocking time', unit: 'ms', gated: false },
    { id: 'a:heap', label: 'A: JS heap', unit: 'bytes', gated: false },
    { id: 'a:tidy', label: 'A: Tidy up', unit: 'ms', gated: true },
    { id: 'b:load', label: 'B: load', unit: 'ms', gated: true },
    { id: 'b:blocking', label: 'B: blocking time', unit: 'ms', gated: false },
    { id: 'b:heap', label: 'B: JS heap', unit: 'bytes', gated: false },
    { id: 'bytes', label: 'Bytes shipped', unit: 'bytes', gated: false },
  ]);
});

test('adds each measurement to the samples of its row', () => {
  const samples = { bytes: [100] };

  addSample(samples, 'a', { load: 10, blocking: 2, heap: 1000, interactions: { tidy: 5 } });
  addSample(samples, 'a', { load: 12, blocking: 0, heap: 1100, interactions: { tidy: 6 } });
  addSample(samples, 'b', { load: 3, blocking: 1, heap: 500, interactions: {} });

  assert.deepEqual(samples, {
    bytes: [100],
    'a:load': [10, 12],
    'a:blocking': [2, 0],
    'a:heap': [1000, 1100],
    'a:tidy': [5, 6],
    'b:load': [3],
    'b:blocking': [1],
    'b:heap': [500],
  });
});

test('gives every row of the benchmark a value from a measurement', () => {
  const samples = { bytes: [1] };

  BENCHMARK_DIAGRAMS.forEach((diagram) =>
    addSample(samples, diagram.id, {
      load: 1,
      blocking: 1,
      heap: 1,
      interactions: diagram.interactions ? Object.fromEntries(INTERACTIONS.map((interaction) => [interaction.id, 1])) : {},
    }),
  );

  assert.deepEqual(
    Object.keys(samples).sort(),
    benchmarkRows(BENCHMARK_DIAGRAMS, INTERACTIONS)
      .map((row) => row.id)
      .sort(),
  );
});

test('compares the median of the head with the base', async (t) => {
  for (const [name, row, base, head, expected] of dataProviderCompare()) {
    await t.test(name, () => {
      const [result] = compareRows([row], base === null ? null : { [row.id]: base }, { [row.id]: head }, COMPARE);

      assert.deepEqual({ base: result.base, head: result.head, status: result.status, regression: result.regression }, expected);
    });
  }
});

function dataProviderCompare() {
  const [gated, bytes] = ROWS;

  return [
    ['a gated row past both limits regresses', gated, [100, 100, 100], [120, 116, 130], { base: 100, head: 120, status: 'slower', regression: true }],
    ['a row at exactly the threshold is the same', gated, [100], [115], { base: 100, head: 115, status: 'same', regression: false }],
    ['a large change under the minimum difference is the same', gated, [20], [29], { base: 20, head: 29, status: 'same', regression: false }],
    ['a change of exactly the minimum difference is the same', gated, [50], [60], { base: 50, head: 60, status: 'same', regression: false }],
    ['a faster head is faster', gated, [200], [100], { base: 200, head: 100, status: 'faster', regression: false }],
    ['a slower ungated row is slower without a regression', bytes, [1000], [2000], { base: 1000, head: 2000, status: 'slower', regression: false }],
    ['a byte row needs no minimum difference', bytes, [100], [116], { base: 100, head: 116, status: 'slower', regression: false }],
    ['a row the base has no values for is n/a', gated, [], [100], { base: null, head: 100, status: 'n/a', regression: false }],
    ['a benchmark without a base is n/a', gated, null, [100], { base: null, head: 100, status: 'n/a', regression: false }],
    ['a base of 0 compares by the minimum difference', gated, [0], [50], { base: 0, head: 50, status: 'slower', regression: true }],
    ['outliers do not move the median', gated, [100, 100, 900], [100, 105, 2], { base: 100, head: 100, status: 'same', regression: false }],
  ];
}

test('gives the change and the range of the head', () => {
  const [result] = compareRows([ROWS[0]], { 'a:load': [100, 200, 300] }, { 'a:load': [250, 150, 450] }, COMPARE);

  assert.deepEqual(result, { ...ROWS[0], head: 250, min: 150, max: 450, base: 200, change: 0.25, status: 'slower', regression: true });
});

test('gives no change against a base of 0', () => {
  const [result] = compareRows([ROWS[0]], { 'a:load': [0] }, { 'a:load': [5] }, COMPARE);

  assert.equal(result.change, null);
});

test('gives no values for a row the head has none for', () => {
  const [result] = compareRows([ROWS[0]], { 'a:load': [1] }, {}, COMPARE);

  assert.deepEqual(result, { ...ROWS[0], head: null, min: null, max: null, base: 1, change: null, status: 'n/a', regression: false });
});

test('formats values by their unit', async (t) => {
  for (const [value, unit, expected] of dataProviderFormatValue()) {
    await t.test(expected, () => {
      assert.equal(formatValue(value, unit), expected);
    });
  }
});

function dataProviderFormatValue() {
  return [
    [null, 'ms', 'n/a'],
    [undefined, 'bytes', 'n/a'],
    [0, 'ms', '0.0 ms'],
    [12.345, 'ms', '12.3 ms'],
    [99.94, 'ms', '99.9 ms'],
    [100, 'ms', '100 ms'],
    [2483.6, 'ms', '2484 ms'],
    [512, 'bytes', '512 B'],
    [1536, 'bytes', '1.5 KB'],
    [2.5 * 1024 * 1024, 'bytes', '2.5 MB'],
  ];
}

test('formats changes as signed percentages', async (t) => {
  for (const [change, expected] of dataProviderFormatChange()) {
    await t.test(expected, () => {
      assert.equal(formatChange(change), expected);
    });
  }
});

function dataProviderFormatChange() {
  return [
    [null, 'n/a'],
    [0, '0.0%'],
    [0.0001, '0.0%'],
    [-0.0001, '0.0%'],
    [0.205, '+20.5%'],
    [-0.043, '-4.3%'],
    [1, '+100.0%'],
  ];
}

test('writes a report that compares the base with the head', () => {
  const rows = compareRows(ROWS, { 'a:load': [100], 'a:heap': [2048] }, { 'a:load': [130], 'a:heap': [1024] }, COMPARE);
  const markdown = benchmarkMarkdown(rows, { ...DEFAULTS, runs: 7, base: 'abc1234', head: 'def5678' });

  assert.equal(
    markdown,
    [
      '## Performance benchmarks',
      '',
      'Base `abc1234` against head `def5678`: the median of 7 runs of each scenario, with the CPU slowed down 4x.',
      'A load or an interaction regresses when its median is more than 15% and 10 ms slower than the base. Blocking time, heap and bytes are for information.',
      '',
      '| Scenario | Base | Head | Change | Result |',
      '| --- | ---: | ---: | ---: | --- |',
      '| A: load | 100 ms | 130 ms | +30.0% | **Regression** |',
      '| A: JS heap | 2.0 KB | 1.0 KB | -50.0% | Smaller |',
      '',
      '**1 scenario regressed:** A: load.',
      '',
    ].join('\n'),
  );
});

test('says when no scenario regressed and words each result', () => {
  const rows = compareRows(
    [...ROWS, { id: 'b:load', label: 'B: load', unit: 'ms', gated: false }, { id: 'c:load', label: 'C: load', unit: 'ms', gated: true }],
    { 'a:load': [100], 'a:heap': [1024], 'b:load': [100], 'c:load': [200] },
    { 'a:load': [101], 'a:heap': [4096], 'b:load': [300], 'c:load': [100] },
    COMPARE,
  );
  const markdown = benchmarkMarkdown(rows, { ...DEFAULTS, runs: 1, base: 'abc1234', head: 'def5678' });

  assert.match(markdown, /the median of 1 run of each scenario/);
  assert.match(markdown, /^\| A: load \| 100 ms \| 101 ms \| \+1\.0% \| {2}\|$/m);
  assert.match(markdown, /^\| A: JS heap \| 1\.0 KB \| 4\.0 KB \| \+300\.0% \| Larger \|$/m);
  assert.match(markdown, /^\| B: load \| 100 ms \| 300 ms \| \+200\.0% \| Slower \|$/m);
  assert.match(markdown, /^\| C: load \| 200 ms \| 100 ms \| -50\.0% \| Faster \|$/m);
  assert.match(markdown, /\nNo scenario regressed\.\n$/);
});

test('counts every regression', () => {
  const rows = compareRows(
    [ROWS[0], { id: 'b:load', label: 'B: load', unit: 'ms', gated: true }],
    { 'a:load': [100], 'b:load': [100] },
    { 'a:load': [200], 'b:load': [200] },
    COMPARE,
  );

  assert.match(benchmarkMarkdown(rows, { ...DEFAULTS, base: 'abc1234', head: 'def5678' }), /\*\*2 scenarios regressed:\*\* A: load, B: load\.\n$/);
});

test('writes a report of the head alone without a base', () => {
  const rows = compareRows(ROWS, null, { 'a:load': [130, 100, 160], 'a:heap': [1024] }, COMPARE);
  const markdown = benchmarkMarkdown(rows, { ...DEFAULTS, base: null, head: 'def5678 with local changes' });

  assert.equal(
    markdown,
    [
      '## Performance benchmarks',
      '',
      'Head `def5678 with local changes`: the median of 5 runs of each scenario, with the CPU slowed down 4x.',
      '',
      '| Scenario | Median | Min | Max |',
      '| --- | ---: | ---: | ---: |',
      '| A: load | 130 ms | 100 ms | 160 ms |',
      '| A: JS heap | 1.0 KB | 1.0 KB | 1.0 KB |',
      '',
    ].join('\n'),
  );
});

test('counts the bytes of the shipped folders only', (t) => {
  const dir = join(ROOT, '.artifacts', 'tmp', 'benchmark-test-' + process.pid);

  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src', 'nested'), { recursive: true });
  mkdirSync(join(dir, 'assets', 'vendor'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'src', 'app.js'), 'x'.repeat(10));
  writeFileSync(join(dir, 'src', 'nested', 'deep.js'), 'x'.repeat(5));
  writeFileSync(join(dir, 'assets', 'vendor', 'lib.js'), 'x'.repeat(100));
  writeFileSync(join(dir, 'tests', 'ignored.js'), 'x'.repeat(1000));

  assert.deepEqual(SHIPPED_PATHS, ['src', 'assets/vendor']);
  assert.equal(shippedBytes(dir), 115);
});

test('counts a missing shipped folder as 0 bytes', (t) => {
  const dir = join(ROOT, '.artifacts', 'tmp', 'benchmark-empty-' + process.pid);

  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'app.js'), 'x'.repeat(7));

  assert.equal(shippedBytes(dir), 7);
  assert.equal(shippedBytes(join(dir, 'missing')), 0);
});

test('benchmarks templates that exist and the stress diagram last', () => {
  const ids = BENCHMARK_DIAGRAMS.map((diagram) => diagram.id);

  assert.equal(ids.at(-1), 'stress');
  assert.equal(new Set(ids).size, ids.length);
  BENCHMARK_DIAGRAMS.slice(0, -1).forEach((diagram) => assert.equal(diagram.label, TEMPLATES.find((template) => template.id === diagram.id).label));
  assert.ok(BENCHMARK_DIAGRAMS.some((diagram) => diagram.interactions));
});

test('gives each interaction a unique id and a label', () => {
  assert.equal(new Set(INTERACTIONS.map((interaction) => interaction.id)).size, INTERACTIONS.length);
  INTERACTIONS.forEach((interaction) => assert.ok(interaction.label, interaction.id));
});

test('undoes an edit before it redoes it', () => {
  const ids = INTERACTIONS.map((interaction) => interaction.id);

  assert.equal(ids.indexOf('redo'), ids.indexOf('undo') + 1);
});

test('opens each template from its saved diagram and the stress diagram from the generator', () => {
  BENCHMARK_DIAGRAMS.slice(0, -1).forEach((diagram) => assert.ok(benchmarkDocument(ROOT, diagram.id).entities.length > 0, diagram.id));
  assert.deepEqual(benchmarkDocument(ROOT, 'stress'), stressDiagram());
});

test('exits with 2 and the usage on a bad argument', () => {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'benchmark.mjs'), '--runs', '0'], { cwd: ROOT, encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--runs must be a whole number from 1 to 50/);
  assert.match(result.stderr, /Usage: npm run benchmark --/);
});
