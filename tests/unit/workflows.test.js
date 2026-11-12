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

  assert.deepEqual(Object.keys(release.on), ['push']);
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

test('deploys the site only after the release is published', () => {
  const jobs = WORKFLOWS.find(({ name }) => name === 'release.yml').workflow.jobs;

  assert.equal(jobs.publish.needs, 'build');
  assert.equal(jobs.deploy.needs, 'publish');
  assert.deepEqual(jobs.publish.permissions, { contents: 'write' });
  assert.equal(jobs.build.permissions.contents, 'read');
  assert.equal(jobs.deploy.permissions.contents, undefined);
});
