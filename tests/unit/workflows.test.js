import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The vendored UMD build exports nothing to an ES module import and sets
// globalThis.jsyaml instead.
await import('../../assets/vendor/js-yaml.min.js');

const ROOT = join(import.meta.dirname, '..', '..');
const DIR = join(ROOT, '.github', 'workflows');

const WORKFLOWS = readdirSync(DIR)
  .filter((name) => name.endsWith('.yml'))
  .sort()
  .map((name) => ({ name: name, source: readFileSync(join(DIR, name), 'utf8'), workflow: globalThis.jsyaml.load(readFileSync(join(DIR, name), 'utf8')) }));

// Every step of every job, with the workflow and job it belongs to.
const STEPS = WORKFLOWS.flatMap(({ name, workflow }) =>
  Object.entries(workflow.jobs).flatMap(([job, definition]) => (definition.steps || []).map((step) => ({ where: name + ' ' + job, step: step }))),
);

test('grants no permissions at the workflow level', () => {
  WORKFLOWS.forEach(({ name, workflow }) => assert.deepEqual(workflow.permissions, {}, name));
});

test('declares the permissions of every job', () => {
  WORKFLOWS.forEach(({ name, workflow }) =>
    Object.entries(workflow.jobs).forEach(([job, definition]) => assert.equal(typeof definition.permissions, 'object', name + ' ' + job)),
  );
});

test('pins every action to a commit', () => {
  STEPS.filter(({ step }) => step.uses).forEach(({ where, step }) => assert.match(step.uses, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, where));
});

test('checks out code without keeping the token', () => {
  STEPS.filter(({ step }) => String(step.uses).startsWith('actions/checkout@')).forEach(({ where, step }) =>
    assert.equal(step.with && step.with['persist-credentials'], false, where),
  );
});

test('installs dependencies without running their scripts', () => {
  const installs = STEPS.filter(({ step }) => /\bnpm (?:ci|install|i)\b/.test(step.run || ''));

  assert.ok(installs.length > 0);
  installs.forEach(({ where, step }) => assert.match(step.run, /--ignore-scripts/, where));
  assert.match(readFileSync(join(ROOT, '.npmrc'), 'utf8'), /^ignore-scripts=true$/m);
});

test('opens no debugging session', () => {
  WORKFLOWS.forEach(({ name, source }) => assert.doesNotMatch(source, /tmate/, name));
});

test('releases only a version tag', async (t) => {
  const release = WORKFLOWS.find(({ name }) => name === 'release.yml').workflow;
  const steps = release.jobs.build.steps;
  const check = steps.findIndex((step) => step.name === 'Check the tag');
  const pattern = new RegExp(steps[check].run.match(/=~ (\S+) \]\]/)[1]);

  assert.deepEqual(release.on, { push: { tags: ['*'] } });
  assert.ok(check < steps.findIndex((step) => step.name === 'Stamp the release version'), 'the tag is stamped before it is checked');

  for (const [tag, expected] of dataProviderTags()) {
    await t.test(tag, () => {
      assert.equal(pattern.test(tag), expected);
    });
  }
});

function dataProviderTags() {
  return [
    ['1.2.3', true],
    ['25.11.0', true],
    ['1.2.3-rc.1', true],
    ['v1.2.3', false],
    ['1.2', false],
    ["1.2.3';alert(1);'", false],
    ['1.2.3\nexport const X = 1', false],
    ['latest', false],
  ];
}

test('builds only a tagged commit on main', () => {
  const steps = WORKFLOWS.find(({ name }) => name === 'release.yml').workflow.jobs.build.steps;
  const checkout = steps.find((step) => String(step.uses).startsWith('actions/checkout@'));
  const onMain = steps.findIndex((step) => step.name === 'Check the tag is on main');

  assert.equal(checkout.with['fetch-depth'], 0);
  assert.match(steps[onMain].run, /git merge-base --is-ancestor "\$\{GITHUB_SHA\}" origin\/main/);
  assert.ok(onMain < steps.findIndex((step) => step.name === 'Assemble static site'), 'the site is assembled before the tag is checked');
});

test('attaches the provenance bundle to the release files after attesting them', () => {
  const steps = WORKFLOWS.find(({ name }) => name === 'release.yml').workflow.jobs.build.steps;
  const attest = steps.findIndex((step) => step.id === 'attest');
  const bundle = steps.findIndex((step) => step.name === 'Add the provenance bundle to the release files');

  assert.ok(attest >= 0 && attest < bundle, 'the bundle is copied before it is made');
  assert.equal(steps[bundle].env.BUNDLE, '${{ steps.attest.outputs.bundle-path }}');
  assert.match(steps[bundle].run, /release\/nexus-\$\{TAG\}\.intoto\.jsonl/);
  assert.ok(bundle < steps.findIndex((step) => step.name === 'Upload release files'), 'the bundle is uploaded before it is copied');
});

test('queues only the deploy, so every tag publishes its release', () => {
  const release = WORKFLOWS.find(({ name }) => name === 'release.yml').workflow;

  assert.equal(release.concurrency, undefined);
  assert.equal(release.jobs.build.concurrency, undefined);
  assert.equal(release.jobs.publish.concurrency, undefined);
  assert.deepEqual(release.jobs.deploy.concurrency, { group: 'pages', 'cancel-in-progress': false });
});

test('deploys the site only after the release is published', () => {
  const jobs = WORKFLOWS.find(({ name }) => name === 'release.yml').workflow.jobs;

  assert.equal(jobs.publish.needs, 'build');
  assert.equal(jobs.deploy.needs, 'publish');
  assert.deepEqual(jobs.publish.permissions, { contents: 'write' });
  assert.equal(jobs.build.permissions.contents, 'read');
  assert.equal(jobs.deploy.permissions.contents, undefined);
});

test('runs Scorecard only on the default branch and CodeQL on pull requests too', () => {
  const audit = WORKFLOWS.find(({ name }) => name === 'audit.yml').workflow;
  const scorecard = audit.jobs.audit.steps.find((step) => String(step.uses).startsWith('ossf/scorecard-action@'));

  assert.ok('pull_request' in audit.on);
  assert.equal(audit.jobs.audit.if, "${{ github.event_name != 'pull_request' }}");
  assert.doesNotMatch(String(audit.jobs.security.if), /pull_request/);
  assert.equal(scorecard.with.publish_results, true);
});

test('keeps the files OpenSSF Scorecard reads in source archives', async (t) => {
  const ignored = readFileSync(join(ROOT, '.gitattributes'), 'utf8')
    .split('\n')
    .filter((line) => /\bexport-ignore\b/.test(line))
    .map((line) => line.trim().split(/\s+/)[0]);

  for (const path of ['/.github', '/renovate.json', '/tests', '/package.json', '/SECURITY.md']) {
    await t.test(path, () => {
      assert.ok(!ignored.some((pattern) => path === pattern || path.startsWith(pattern + '/')), path + ' is export-ignored');
    });
  }
});

test('runs the benchmark with read access only', () => {
  const benchmark = WORKFLOWS.find(({ name }) => name === 'benchmark.yml').workflow;

  assert.deepEqual(benchmark.jobs.benchmark.permissions, { contents: 'read' });
  assert.ok('pull_request' in benchmark.on);
  assert.ok('push' in benchmark.on);
});

test('compares the head with a base commit the benchmark checks out', () => {
  const steps = WORKFLOWS.find(({ name }) => name === 'benchmark.yml').workflow.jobs.benchmark.steps;
  const checkout = steps.find((step) => String(step.uses).startsWith('actions/checkout@'));
  const run = steps.find((step) => step.name === 'Run the benchmark');

  assert.equal(checkout.with['fetch-depth'], 0);
  assert.equal(run.env.BASE_SHA, '${{ steps.base.outputs.sha }}');
  assert.match(run.run, /^npm run benchmark -- .*--base-ref "\$BASE_SHA"/);
});

test('passes event values to the benchmark scripts through the environment', () => {
  const benchmark = WORKFLOWS.find(({ name }) => name === 'benchmark.yml').workflow;

  Object.entries(benchmark.jobs).forEach(([job, definition]) =>
    definition.steps.filter((step) => step.run).forEach((step) => assert.doesNotMatch(step.run, /\$\{\{/, job + ': ' + step.name)),
  );
});

test('posts the benchmark report without checking out or running the code', () => {
  const report = WORKFLOWS.find(({ name }) => name === 'benchmark.yml').workflow.jobs.report;

  assert.equal(report.needs, 'benchmark');
  assert.deepEqual(report.permissions, { actions: 'read', issues: 'write', 'pull-requests': 'write' });
  report.steps.forEach((step) => {
    assert.equal(step.uses, undefined, step.name);
    assert.doesNotMatch(step.run, /\b(?:npm|npx|node)\b/, step.name);
  });
});

test('reports a regression too, but not for a pull request from a fork', () => {
  const report = WORKFLOWS.find(({ name }) => name === 'benchmark.yml').workflow.jobs.report;

  assert.match(report.if, /!cancelled\(\)/);
  assert.match(report.if, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
});

test('finds the comment it posted by the marker the report starts with', async () => {
  const { REPORT_MARKER } = await import('../../scripts/lib/benchmark.mjs');
  const post = WORKFLOWS.find(({ name }) => name === 'benchmark.yml').workflow.jobs.report.steps.find((step) => step.name === 'Post the report');

  assert.equal(post.env.MARKER, REPORT_MARKER);
  assert.match(post.run, /select\(\.user\.login == \\"github-actions\[bot\]\\"/);
});
