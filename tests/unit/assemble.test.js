import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const SITE = join(ROOT, '_site');
const EXAMPLE = join(SITE, 'templates', 'radio-station');

// Local paths an HTML page loads: src and href values, plus the './' strings
// in its import map and inline module imports.
function localReferences(html) {
  const matches = [...html.matchAll(/(?:src|href)="([^"]+)"|["'](\.\/[^"']+)["']/g)];

  return matches
    .map((match) => match[1] ?? match[2])
    .filter((ref) => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(ref))
    .map((ref) => ref.split(/[?#]/)[0]);
}

// Relative specifiers of static imports, re-exports and dynamic imports.
function relativeImports(source) {
  const matches = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.\.?\/[^"']+)["']/g)];

  return matches.map((match) => match[1].split(/[?#]/)[0]);
}

before(() => {
  execFileSync('npm', ['run', '--silent', 'assemble'], { cwd: ROOT });
});

test('ships every file index.html loads', () => {
  const refs = localReferences(readFileSync(join(SITE, 'index.html'), 'utf8'));

  assert.ok(refs.includes('src/app.js'));
  assert.ok(refs.includes('./assets/vendor/preact.module.js'));
  assert.ok(refs.includes('assets/favicon.svg'));

  const pending = refs.map((ref) => join(SITE, ref));
  const shipped = new Set();

  while (pending.length > 0) {
    const file = pending.pop();

    if (shipped.has(file)) {
      continue;
    }

    assert.ok(file.startsWith(SITE + sep) && existsSync(file), relative(SITE, file) + ' is missing from _site');
    shipped.add(file);

    if (file.endsWith('.js')) {
      pending.push(...relativeImports(readFileSync(file, 'utf8')).map((spec) => join(dirname(file), spec)));
    }
  }

  assert.ok(shipped.has(join(SITE, 'src', 'parser.js')));
});

test('ships the bundled example', () => {
  const manifest = JSON.parse(readFileSync(join(EXAMPLE, 'manifest.json'), 'utf8'));

  assert.ok(manifest.length > 0);
  assert.ok(existsSync(join(EXAMPLE, 'annotations.yml')));

  for (const name of manifest) {
    assert.ok(existsSync(join(EXAMPLE, 'config', name)), name + ' is missing from _site');
  }
});
