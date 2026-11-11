import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const E2E_DIR = join(ROOT, 'tests', 'e2e');
const WORKFLOW = readFileSync(join(ROOT, '.github', 'workflows', 'test-nodejs.yml'), 'utf8');
const SPECS = readdirSync(E2E_DIR)
  .filter((name) => name.endsWith('.spec.js'))
  .sort();

// The runner numbers the E2E job's matrix lists.
function workflowRunners() {
  const match = WORKFLOW.match(/runner: \[([\d, ]+)\]/);

  return match ? match[1].split(',').map((runner) => Number(runner.trim())) : [];
}

// The '@runner-N' tag of each top-level describe in a spec file.
function specRunners(name) {
  const source = readFileSync(join(E2E_DIR, name), 'utf8');

  return [...source.matchAll(/^test\.describe\('[^']+', \{ tag: '@runner-(\d+)' \}, \(\) => \{$/gm)].map((match) => Number(match[1]));
}

test('runs the E2E job on 2 runners', () => {
  assert.deepEqual(workflowRunners(), [1, 2]);
  assert.match(WORKFLOW, /npm run test-e2e -- --grep @runner-\$\{\{ matrix\.runner \}\}/);
});

test('wraps every e2e spec file in 1 describe tagged with a runner the workflow runs', () => {
  const runners = workflowRunners();

  for (const name of SPECS) {
    const tags = specRunners(name);

    assert.equal(tags.length, 1, name + ' has ' + tags.length + ' tagged top-level describes');
    assert.ok(runners.includes(tags[0]), name + ' is tagged for runner ' + tags[0] + ', which the workflow does not run');
  }
});

test('leaves no runner without spec files', () => {
  const used = new Set(SPECS.flatMap(specRunners));

  for (const runner of workflowRunners()) {
    assert.ok(used.has(runner), 'no spec file is tagged @runner-' + runner);
  }
});
