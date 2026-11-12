import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, compareWithPackage, listFiles, readManifest, sha256, vendorDigest } from '../../scripts/lib/vendor.mjs';

const VENDOR = join(ROOT, 'assets', 'vendor');

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'vendor');

test('records every vendored library with its package, version and source', () => {
  readManifest().forEach((library) => {
    assert.match(library.path, /^assets\/vendor\//, library.path);
    assert.match(library.package, /^(?:@[a-z0-9-]+\/)?[a-z0-9.-]+$/, library.path);
    assert.match(library.version, /^\d+\.\d+\.\d+$/, library.path);
    assert.equal(typeof library.source, 'string', library.path);
    assert.match(library.sha256, /^[0-9a-f]{64}$/, library.path);
  });
});

test('matches each vendored library to its recorded digest', async (t) => {
  for (const library of readManifest()) {
    await t.test(library.path, () => {
      assert.equal(vendorDigest(join(ROOT, library.path)), library.sha256);
    });
  }
});

test('records every file in assets/vendor exactly once', () => {
  const paths = readManifest().map((library) => library.path.slice('assets/vendor/'.length));
  const unowned = listFiles(VENDOR).filter((file) => paths.filter((path) => file === path || file.startsWith(path + '/')).length !== 1);

  assert.deepEqual(unowned, []);
});

test('loads vendored files in index.html only from recorded libraries', () => {
  const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const loaded = [...index.matchAll(/["'](?:\.\/)?(assets\/vendor\/[^"']+)["']/g)].map((match) => match[1]);
  const recorded = readManifest().map((library) => library.path);

  assert.ok(loaded.length > 0);
  loaded.forEach((path) => assert.ok(recorded.some((owner) => path === owner || path.startsWith(owner + '/')), path));
});

test('digests a folder as the listing sha256sum prints', () => {
  const dir = join(FIXTURES, 'vendored');
  const listing = ['lib/added.js', 'lib/changed.js', 'same.js'].map((file) => sha256(join(dir, file)) + '  ' + file + '\n').join('');

  assert.deepEqual(listFiles(dir), ['lib/added.js', 'lib/changed.js', 'same.js']);
  assert.equal(vendorDigest(dir), createHash('sha256').update(listing).digest('hex'));
});

test('digests a file as its SHA-256', () => {
  const file = join(FIXTURES, 'vendored', 'same.js');

  assert.equal(vendorDigest(file), createHash('sha256').update('export const same = 1;\n').digest('hex'));
});

test('compares vendored files with their package', async (t) => {
  for (const [name, vendored, source, expected] of dataProviderComparisons()) {
    await t.test(name, () => {
      assert.deepEqual(compareWithPackage(join(FIXTURES, vendored), join(FIXTURES, source)), expected);
    });
  }
});

function dataProviderComparisons() {
  return [
    ['a matching file', 'vendored/same.js', 'package/same.js', { missing: [], differ: [] }],
    ['a changed file', 'vendored/lib/changed.js', 'package/lib/changed.js', { missing: [], differ: [''] }],
    ['a file the package lacks', 'vendored/lib/added.js', 'package/lib/added.js', { missing: [''], differ: [] }],
    ['a folder, ignoring package files it leaves out', 'vendored', 'package', { missing: ['lib/added.js'], differ: ['lib/changed.js'] }],
  ];
}
