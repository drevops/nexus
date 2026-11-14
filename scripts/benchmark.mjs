/**
 * Measures how fast the app opens diagrams and runs its interactions in
 * Chromium, and compares the working tree with a base commit.
 *
 * Usage: npm run benchmark -- [--base-ref <ref>] [--runs <n>] [--throttle <n>]
 *        [--threshold <percent>] [--min-diff <ms>] [--out <dir>]
 *
 * The base is exported with 'git archive' into .artifacts/tmp/benchmark/ and
 * both copies open the working tree's diagrams, so only the code differs.
 * Each run measures the base and the head in turn. Writes benchmark.json and
 * benchmark.md to the output folder and prints the report. Exits with 1 when
 * a scenario regressed, no load or interaction could be compared with the
 * base or a measurement failed on the head, and with 2 on a bad argument.
 */

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { documentLink, encodeDocument } from '../src/doc-link.js';
import { createStaticServer } from '../tests/static-server.mjs';
import { BENCHMARK_DIAGRAMS, INTERACTIONS, benchmarkDocument, measureDiagram } from './lib/benchmark-page.mjs';
import {
  addSample,
  benchmarkFailed,
  benchmarkMarkdown,
  benchmarkRows,
  compareRows,
  formatValue,
  readOptions,
  sampleOrder,
  shippedBytes,
} from './lib/benchmark.mjs';

const ROOT = resolve(import.meta.dirname, '..');

const USAGE = 'Usage: npm run benchmark -- [--base-ref <ref>] [--runs <n>] [--throttle <n>] [--threshold <percent>] [--min-diff <ms>] [--out <dir>]';

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function resolveCommit(ref) {
  try {
    return git(['rev-parse', '--verify', '--quiet', ref + '^{commit}']);
  } catch {
    throw new Error('"' + ref + '" is not a commit in this repository');
  }
}

function headCommit() {
  const sha = git(['rev-parse', '--short', 'HEAD']);

  return git(['status', '--porcelain', '--untracked-files=no']) ? sha + ' with local changes' : sha;
}

// Pipes 'git archive' into 'tar', so the working tree and the branch stay as
// they are.
async function exportCommit(sha) {
  const dir = join(ROOT, '.artifacts', 'tmp', 'benchmark', sha);

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  await new Promise((done, fail) => {
    const archive = spawn('git', ['archive', '--format=tar', sha], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    const extract = spawn('tar', ['-x', '-C', dir], { stdio: ['pipe', 'inherit', 'inherit'] });
    let running = 2;
    const exited = (name) => (code) => {
      if (code !== 0) {
        fail(new Error(name + ' exited with ' + code));
      } else if (--running === 0) {
        done();
      }
    };

    archive.stdout.pipe(extract.stdin);
    archive.on('error', fail);
    extract.on('error', fail);
    archive.on('close', exited('git archive'));
    extract.on('close', exited('tar'));
  });

  return dir;
}

async function serve(root) {
  const server = createStaticServer(root);

  await new Promise((done) => server.listen(0, '127.0.0.1', done));

  return { server: server, page: 'http://127.0.0.1:' + server.address().port + '/index.html' };
}

// A diagram the base fails is left out of the base's samples, since the base
// can predate a control it uses. A failure on the head stops the benchmark.
async function measureSides(browser, sides, options) {
  const documents = await Promise.all(BENCHMARK_DIAGRAMS.map((diagram) => encodeDocument(benchmarkDocument(ROOT, diagram.id))));
  const failed = new Set();

  for (const [run, order] of sampleOrder(options.runs, Object.keys(sides)).entries()) {
    for (const name of order) {
      for (const [index, diagram] of BENCHMARK_DIAGRAMS.entries()) {
        const side = sides[name];
        const prefix = '[' + (run + 1) + '/' + options.runs + '] ' + name + ' ' + diagram.label;

        if (failed.has(name + ':' + diagram.id)) {
          continue;
        }

        try {
          const link = documentLink(side.page, documents[index]);
          const measurement = await measureDiagram(browser, link, { interactions: diagram.interactions, throttle: options.throttle });

          addSample(side.samples, diagram.id, measurement);
          console.log(prefix + ': ' + formatValue(measurement.load, 'ms'));
        } catch (e) {
          if (name === 'head') {
            throw new Error(prefix + ': ' + e.message);
          }

          failed.add(name + ':' + diagram.id);
          Object.keys(side.samples)
            .filter((id) => id.startsWith(diagram.id + ':'))
            .forEach((id) => delete side.samples[id]);
          console.log(prefix + ': failed, so it is n/a: ' + e.message);
        }
      }
    }
  }
}

async function benchmark(options) {
  const roots = { head: ROOT };
  const commits = { head: headCommit(), base: null };

  if (options.baseRef) {
    const sha = resolveCommit(options.baseRef);

    roots.base = await exportCommit(sha);
    commits.base = sha.slice(0, 7);
  }

  const sides = {};
  const browser = await chromium.launch();

  try {
    for (const name of Object.keys(roots).sort()) {
      sides[name] = { ...(await serve(roots[name])), samples: { bytes: [shippedBytes(roots[name])] } };
    }

    await measureSides(browser, sides, options);
  } finally {
    await browser.close();
    Object.values(sides).forEach((side) => side.server.close());
  }

  const rows = compareRows(benchmarkRows(BENCHMARK_DIAGRAMS, INTERACTIONS), sides.base ? sides.base.samples : null, sides.head.samples, options);
  const markdown = benchmarkMarkdown(rows, { ...options, ...commits });
  const out = resolve(ROOT, options.out);
  const samples = Object.fromEntries(Object.entries(sides).map(([name, side]) => [name, side.samples]));

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'benchmark.json'), JSON.stringify({ commits: commits, options: options, rows: rows, samples: samples }, null, 2) + '\n');
  writeFileSync(join(out, 'benchmark.md'), markdown);
  console.log('\n' + markdown);

  return benchmarkFailed(rows, Boolean(sides.base)) ? 1 : 0;
}

async function main(args) {
  let options;

  try {
    options = readOptions(args);
  } catch (e) {
    console.error(e.message + '\n' + USAGE);

    return 2;
  }

  try {
    return await benchmark(options);
  } catch (e) {
    console.error(e.message);

    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
