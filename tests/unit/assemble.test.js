import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const SITE = join(ROOT, '_site');
const EXAMPLE = join(SITE, 'examples', 'example');

// Local paths an HTML page loads: src and href values, plus the './' strings
// in its import map and inline module imports.
function localReferences(html) {
  const matches = [...html.matchAll(/(?:src|href)="([^"]+)"|["'](\.\/[^"']+)["']/g)];

  return matches
    .map((match) => match[1] ?? match[2])
    .filter((ref) => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(ref))
    .map((ref) => ref.split(/[?#]/)[0]);
}

before(() => {
  execFileSync('npm', ['run', '--silent', 'assemble'], { cwd: ROOT });
});

test('ships every file index.html loads', () => {
  const refs = localReferences(readFileSync(join(SITE, 'index.html'), 'utf8'));

  assert.ok(refs.includes('assets/app.js'));
  assert.ok(refs.includes('./assets/vendor/preact.module.js'));

  for (const ref of refs) {
    assert.ok(existsSync(join(SITE, ref)), ref + ' is missing from _site');
  }
});

test('ships the bundled example', () => {
  const manifest = JSON.parse(readFileSync(join(EXAMPLE, 'manifest.json'), 'utf8'));

  assert.ok(manifest.length > 0);
  assert.ok(existsSync(join(EXAMPLE, 'annotations.yml')));

  for (const name of manifest) {
    assert.ok(existsSync(join(EXAMPLE, 'config', name)), name + ' is missing from _site');
  }
});
