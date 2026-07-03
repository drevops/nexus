import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..', '..');
const WORKFLOW = readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
const SCRATCH = join(ROOT, '.artifacts', 'tmp', 'release-test-' + process.pid);

// Every 'export const NAME = ...' line the workflow writes over an assembled
// module, with the module's path relative to the repository root.
function stamps(workflow) {
  return [...workflow.matchAll(/export const (\w+) = [^\n]*>\s*_site\/(\S+)/g)].map((match) => ({ name: match[1], path: match[2] }));
}

// The dedented script of the first 'run: |' block at or after the named step.
function stepScript(workflow, name) {
  assert.ok(workflow.includes('- name: ' + name), 'release.yml has no "' + name + '" step');

  const lines = workflow.slice(workflow.indexOf('- name: ' + name)).split('\n');
  const run = lines.findIndex((line) => /^\s*run: \|$/.test(line));
  const indent = lines[run + 1].search(/\S/);
  const script = [];

  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== '' && line.search(/\S/) < indent) {
      break;
    }

    script.push(line.slice(indent));
  }

  return script.join('\n');
}

// Runs the analytics stamp step in a fresh scratch site, the way the runner
// does, and returns its exit status and the path it stamps.
function stampAnalytics(value) {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(join(SCRATCH, '_site', 'src'), { recursive: true });

  const script = stepScript(WORKFLOW, 'Stamp the Google Analytics ID');
  const result = spawnSync('bash', ['-e', '-c', script], { cwd: SCRATCH, env: { ...process.env, GOOGLE_ANALYTICS_ID: value }, encoding: 'utf8' });

  return { status: result.status, file: join(SCRATCH, '_site', 'src', 'analytics-id.js') };
}

after(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

test('stamps the version and the Google Analytics ID', () => {
  const stamped = stamps(WORKFLOW).map((stamp) => stamp.path + ':' + stamp.name);

  assert.deepEqual(stamped.sort(), ['src/analytics-id.js:GOOGLE_ANALYTICS_ID', 'src/version.js:VERSION']);
});

test('stamps only constants the source modules export', () => {
  for (const { name, path } of stamps(WORKFLOW)) {
    assert.ok(existsSync(join(ROOT, path)), path + ' does not exist');
    assert.match(readFileSync(join(ROOT, path), 'utf8'), new RegExp('^export const ' + name + ' = ', 'm'), path + ' does not export ' + name);
  }
});

test('stamps Google Analytics only when the variable is set, reading it from the environment', () => {
  const step = WORKFLOW.slice(WORKFLOW.indexOf('- name: Stamp the Google Analytics ID')).split('- name: ')[1];

  assert.match(step, /^\s*if: vars\.GOOGLE_ANALYTICS_ID != ''$/m);
  assert.match(step, /^\s*GOOGLE_ANALYTICS_ID: \$\{\{ vars\.GOOGLE_ANALYTICS_ID \}\}$/m);
});

test('stamps a measurement ID the analytics module can import', async () => {
  const { status, file } = stampAnalytics('G-TEST123');

  assert.equal(status, 0);

  const { GOOGLE_ANALYTICS_ID } = await import(pathToFileURL(file).href);
  assert.equal(GOOGLE_ANALYTICS_ID, 'G-TEST123');
});

for (const value of ['G-test123', 'UA-12345-1', 'G-', 'TEST123', ' G-TEST123', 'G-TEST123\n', "G-TEST123'; alert(1); '"]) {
  test('fails the release without stamping the malformed ID ' + JSON.stringify(value), () => {
    const { status, file } = stampAnalytics(value);

    assert.equal(status, 1);
    assert.equal(existsSync(file), false);
  });
}
