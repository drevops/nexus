/**
 * Checks Nexus diagram documents before they're opened in Nexus.
 *
 * Usage: npm run check-diagram -- <file.nexus.json> ...
 *
 * Prints each document's errors and warnings. Exits with 1 when any document
 * is unreadable, isn't JSON or has an error, and with 2 when no file is given.
 * Warnings alone exit with 0.
 */

import { readFileSync } from 'node:fs';
import { checkDiagram } from './lib/diagram-check.mjs';

function report(file) {
  let doc;

  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(file + ': error: ' + e.message);

    return false;
  }

  const { errors, warnings } = checkDiagram(doc);

  for (const { path, message } of errors) {
    console.log(file + ': error: ' + path + ' ' + message);
  }

  for (const { path, message } of warnings) {
    console.log(file + ': warning: ' + path + ' ' + message);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log(file + ': OK');
  }

  return errors.length === 0;
}

function main(files) {
  if (files.length === 0) {
    console.error('Usage: npm run check-diagram -- <file.nexus.json> ...');

    return 2;
  }

  const results = files.map(report);

  return results.every(Boolean) ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
