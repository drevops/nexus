import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { TEMPLATES, templatePath } from '../../src/templates.js';

const ROOT = join(import.meta.dirname, '..', '..');
const SITE = join(ROOT, '_site');

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

test('ships every template', () => {
  for (const template of TEMPLATES) {
    const folder = join(SITE, templatePath(template));
    const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'));

    assert.ok(manifest.length > 0, template.id + ' lists no config');
    assert.equal(existsSync(join(folder, 'annotations.yml')), template.annotations, template.id + ' ships the wrong annotations');

    for (const name of manifest) {
      assert.ok(existsSync(join(folder, 'config', name)), template.id + ': ' + name + ' is missing from _site');
    }
  }
});
