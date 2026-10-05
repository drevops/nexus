import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const WORKFLOW = readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');

// Every 'export const NAME = ...' line the workflow writes over an assembled
// module, with the module's path relative to the repository root.
function stamps(workflow) {
  return [...workflow.matchAll(/export const (\w+) = [^\n]*>\s*_site\/(\S+)/g)].map((match) => ({ name: match[1], path: match[2] }));
}

test('stamps the version', () => {
  const stamped = stamps(WORKFLOW).map((stamp) => stamp.path + ':' + stamp.name);

  assert.deepEqual(stamped, ['src/version.js:VERSION']);
});

test('stamps only constants the source modules export', () => {
  for (const { name, path } of stamps(WORKFLOW)) {
    assert.ok(existsSync(join(ROOT, path)), path + ' does not exist');
    assert.match(readFileSync(join(ROOT, path), 'utf8'), new RegExp('^export const ' + name + ' = ', 'm'), path + ' does not export ' + name);
  }
});
