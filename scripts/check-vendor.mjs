/**
 * Checks that the vendored libraries are the published npm builds that
 * vendor.json names.
 *
 * Usage: npm run check-vendor
 *
 * Each package is downloaded from the npm registry with 'npm pack' into a
 * temporary folder and unpacked, and every vendored file is compared byte for
 * byte with its source in the package. Prints 1 line per library and exits
 * with 1 when a file is missing from its package or differs from it.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, compareWithPackage, readManifest } from './lib/vendor.mjs';

const TMP = join(ROOT, '.artifacts', 'tmp');

// Downloads and unpacks a package, returning the folder that holds its files.
function unpack(name, version, dir) {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', name + '@' + version, '--json', '--ignore-scripts', '--pack-destination', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const target = mkdtempSync(join(dir, 'package-'));

  execFileSync('tar', ['-xzf', join(dir, packed.filename), '-C', target]);

  return join(target, 'package');
}

function main() {
  mkdirSync(TMP, { recursive: true });

  const dir = mkdtempSync(join(TMP, 'check-vendor-'));
  const packages = {};
  let failed = false;

  try {
    for (const library of readManifest()) {
      const key = library.package + '@' + library.version;
      packages[key] = packages[key] || unpack(library.package, library.version, dir);

      const { missing, differ } = compareWithPackage(join(ROOT, library.path), join(packages[key], library.source));

      if (missing.length === 0 && differ.length === 0) {
        console.log(library.path + ': OK (' + key + ')');
        continue;
      }

      failed = true;
      missing.forEach((file) => console.log(library.path + ': not in ' + key + ': ' + (file || library.source)));
      differ.forEach((file) => console.log(library.path + ': differs from ' + key + ': ' + (file || library.source)));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return failed ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
