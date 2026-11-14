import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');
const HEAD = INDEX.slice(0, INDEX.indexOf('</head>'));

// The site-relative path of every module a module imports statically,
// directly or through other modules.
function importGraph(path, seen = new Set()) {
  if (seen.has(path)) {
    return seen;
  }

  seen.add(path);

  const source = readFileSync(join(ROOT, path), 'utf8');

  for (const [, specifier] of source.matchAll(/^(?:import|export)\s[^;]*?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
    importGraph(relative(ROOT, resolve(ROOT, dirname(path), specifier)), seen);
  }

  return seen;
}

test('starts src/boot.js from the head, after Shoelace sets its base path and before the app', () => {
  const boot = INDEX.indexOf('<script type="module" src="src/boot.js"></script>');

  assert.ok(boot > -1 && boot < HEAD.length, 'src/boot.js is not a module script in the head');
  assert.ok(boot > INDEX.indexOf('setBasePath('), 'src/boot.js runs before Shoelace has its base path');
  assert.ok(boot < INDEX.indexOf('<script type="module" src="src/app.js"></script>'), 'src/boot.js runs after the app');
});

test('preloads exactly the modules of its own that src/boot.js imports', () => {
  const preloaded = [...HEAD.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((match) => match[1]);
  const own = [...importGraph('src/boot.js')].filter((path) => path.startsWith('src/') && path !== 'src/boot.js');

  assert.deepEqual(preloaded, [...preloaded].sort(), 'the preloads are not in alphabetical order');
  assert.deepEqual([...preloaded].sort(), own.sort());
});

test('keeps the diagram libraries and the app out of the modules src/boot.js loads', () => {
  const graph = [...importGraph('src/boot.js')];

  assert.ok(graph.includes('assets/vendor/shoelace/components/button/button.js'), 'src/boot.js does not load the Shoelace button');
  assert.deepEqual(
    graph.filter((path) => ['src/app.js', 'src/render.js', 'src/ui.js', 'src/store.js'].includes(path)),
    [],
  );
});
