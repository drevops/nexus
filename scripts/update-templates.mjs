/**
 * Rebuilds the saved-diagram document of each content-model template.
 *
 * Usage: npm run update-templates [-- <id> ...]
 *
 * Each source of a template is cloned at its tag into a temporary folder. The
 * config files the parser reads are merged and drawn into
 * templates/<id>.nexus.json, and the clones are deleted.
 *
 * The command fails when a template's bundles no longer match the counts in
 * src/templates.js, and prints the counts to use.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { TEMPLATES, templatePath, templateTitle } from '../src/templates.js';
import { bundleCounts, isModelConfig } from '../src/parser.js';
import { buildDocument, mergeConfig, readConfigFolder, renderCounts, renderDocument } from './lib/template-sources.mjs';

// The vendored UMD build exports nothing to an ES module import and sets
// globalThis.jsyaml instead.
await import('../assets/vendor/js-yaml.min.js');

const ROOT = join(import.meta.dirname, '..');
const TMP = join(ROOT, '.artifacts', 'tmp');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// A blobless, sparse clone downloads only the listed paths at the tag.
function fetchSource(source, dir) {
  git(['clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', source.ref, source.repo, dir]);
  git(['sparse-checkout', 'set', ...source.paths], dir);

  return git(['rev-parse', 'HEAD'], dir);
}

function buildTemplate(template, clones) {
  if (template.sources.length === 0) {
    throw new Error(template.id + ' has no sources to build from');
  }

  const origins = [];

  template.sources.forEach((source, index) => {
    const dir = join(clones, template.id, String(index));
    const commit = fetchSource(source, dir);

    console.log('Fetched ' + source.name + ' ' + source.ref + ' at ' + commit.slice(0, 12));

    for (const path of source.paths) {
      const files = readConfigFolder(join(dir, path)).filter((file) => isModelConfig(file.name));

      origins.push({ origin: source.name + ' ' + source.ref + ' ' + path, files });
    }
  });

  const { files, shadowed } = mergeConfig(origins);

  for (const { name, kept, skipped } of shadowed) {
    console.log('Kept ' + name + ' from ' + kept + ' over ' + skipped);
  }

  const parsed = {};

  for (const [name, { content }] of files) {
    try {
      parsed[name] = globalThis.jsyaml.load(content);
    } catch (e) {
      throw new Error(name + ' is not valid YAML: ' + e.message);
    }
  }

  writeFileSync(join(ROOT, templatePath(template)), renderDocument(buildDocument(parsed, templateTitle(template))));

  return Object.keys(parsed);
}

function main(ids) {
  const unknown = ids.filter((id) => !TEMPLATES.some((template) => template.id === id));

  if (unknown.length > 0) {
    throw new Error('Unknown template: ' + unknown.join(', '));
  }

  const selected = ids.length > 0 ? TEMPLATES.filter((template) => ids.includes(template.id)) : TEMPLATES;
  let stale = false;

  mkdirSync(TMP, { recursive: true });

  const clones = mkdtempSync(join(TMP, 'update-templates-'));

  try {
    for (const template of selected) {
      const names = buildTemplate(template, clones);
      const counts = bundleCounts(names);

      console.log(templateTitle(template) + ': ' + names.length + ' model files, ' + renderCounts(counts));

      if (!isDeepStrictEqual(counts, template.counts)) {
        stale = true;
        console.error('Set the counts of ' + template.id + ' in src/templates.js to ' + renderCounts(counts));
      }
    }
  } finally {
    rmSync(clones, { recursive: true, force: true });
  }

  return stale ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
