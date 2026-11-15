/**
 * Builds src/manual.js, the in-app manual, from the Markdown pages in docs/.
 *
 * Usage: npm run build-manual
 *
 * Exits with 1 and lists every problem when a page breaks the rules in
 * scripts/lib/manual.mjs.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { manualModule } from './lib/manual.mjs';

const ROOT = join(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'src', 'manual.js');

try {
  writeFileSync(OUTPUT, await manualModule(join(ROOT, 'docs'), ROOT));
  console.log('Wrote ' + OUTPUT);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
