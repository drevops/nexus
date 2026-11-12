/**
 * Reads vendor.json, the record of the third-party builds in assets/vendor/,
 * and compares vendored files with their record and with the published
 * package.
 *
 * Each library in vendor.json names its vendored path (a file or a folder),
 * the npm package and version it comes from, its path inside the package and
 * its SHA-256 digest. A vendored folder may hold a subset of the package
 * folder, and its digest covers every file in it (see vendorDigest()).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');

export const MANIFEST = 'vendor.json';

export function readManifest() {
  return JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8')).libraries;
}

/**
 * Lists the files under a folder as sorted paths relative to it, with '/' as
 * the separator.
 */
export function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1).split('\\').join('/'))
    .sort();
}

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Returns the digest of a file, or of a folder as the digest of its listing:
 * a '<sha256>  <path>' line for each file, in the format sha256sum prints.
 */
export function vendorDigest(path) {
  if (!statSync(path).isDirectory()) {
    return sha256(path);
  }

  const listing = listFiles(path)
    .map((file) => sha256(join(path, file)) + '  ' + file + '\n')
    .join('');

  return createHash('sha256').update(listing).digest('hex');
}

/**
 * Compares a vendored file or folder with its source in an unpacked package.
 * Returns the vendored files missing from the package and those whose bytes
 * differ, as paths relative to the vendored path ('' for a single file).
 */
export function compareWithPackage(vendored, source) {
  const files = statSync(vendored).isDirectory() ? listFiles(vendored) : [''];
  const missing = [];
  const differ = [];

  for (const file of files) {
    const upstream = file ? join(source, file) : source;

    if (!existsSync(upstream)) {
      missing.push(file);
    } else if (sha256(file ? join(vendored, file) : vendored) !== sha256(upstream)) {
      differ.push(file);
    }
  }

  return { missing, differ };
}
