/**
 * Rebuilds the folder of each content-model template in templates/.
 *
 * Usage: npm run update-templates [-- <id> ...]
 *
 * A template with upstream sources gets each source cloned at its tag, and
 * its config/, manifest.json, source.json and README.md written again from
 * them. A template without sources gets only its manifest.json rebuilt from
 * its config/ folder. The command fails when a template's bundles no longer
 * match the counts in src/templates.js, and prints the counts to use.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { TEMPLATES, templatePath, templateTitle } from '../src/templates.js';
import { bundleCounts } from '../src/parser.js';
import { mergeConfig, readConfigFolder, renderCounts, renderManifest, renderReadme, renderSource } from './lib/template-sources.mjs';

// The vendored UMD build exports nothing to an ES module import and sets
// globalThis.jsyaml instead.
await import('../assets/vendor/js-yaml.min.js');

const ROOT = join(import.meta.dirname, '..');
const CLONES = join(ROOT, '.artifacts', 'tmp', 'update-templates');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// A blobless, sparse clone downloads only the listed paths at the tag.
function fetchSource(source, dir) {
  git(['clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', source.ref, source.repo, dir]);
  git(['sparse-checkout', 'set', ...source.paths], dir);

  return git(['rev-parse', 'HEAD'], dir);
}

function buildFromSources(template) {
  const commits = [];
  const origins = [];

  template.sources.forEach((source, index) => {
    const dir = join(CLONES, template.id, String(index));

    console.log('Fetching ' + source.name + ' ' + source.ref + '…');
    commits.push(fetchSource(source, dir));

    for (const path of source.paths) {
      origins.push({ origin: source.name + ' ' + source.ref + ' ' + path, files: readConfigFolder(join(dir, path)) });
    }
  });

  const { files: merged, shadowed } = mergeConfig(origins);

  for (const { name, kept, skipped } of shadowed) {
    console.log('Kept ' + name + ' from ' + kept + ' over ' + skipped);
  }

  for (const [name, { content }] of merged) {
    try {
      globalThis.jsyaml.load(content);
    } catch (e) {
      throw new Error(name + ' is not valid YAML: ' + e.message);
    }
  }

  const folder = join(ROOT, templatePath(template));
  const config = join(folder, 'config');

  rmSync(config, { recursive: true, force: true });
  mkdirSync(config, { recursive: true });

  for (const [name, { content }] of merged) {
    writeFileSync(join(config, name), content);
  }

  writeFileSync(join(folder, 'manifest.json'), renderManifest(merged.keys()));
  writeFileSync(join(folder, 'source.json'), renderSource(template, commits));
  writeFileSync(join(folder, 'README.md'), renderReadme(template, commits));

  return [...merged.keys()];
}

function buildManifest(template) {
  const folder = join(ROOT, templatePath(template));
  const names = readConfigFolder(join(folder, 'config')).map((file) => file.name);

  writeFileSync(join(folder, 'manifest.json'), renderManifest(names));

  return names;
}

function main(ids) {
  const unknown = ids.filter((id) => !TEMPLATES.some((template) => template.id === id));

  if (unknown.length > 0) {
    throw new Error('Unknown template: ' + unknown.join(', '));
  }

  const selected = ids.length > 0 ? TEMPLATES.filter((template) => ids.includes(template.id)) : TEMPLATES;
  let stale = false;

  rmSync(CLONES, { recursive: true, force: true });

  try {
    for (const template of selected) {
      const names = template.sources.length > 0 ? buildFromSources(template) : buildManifest(template);
      const counts = bundleCounts(names);

      console.log(templateTitle(template) + ': ' + names.length + ' config files, ' + renderCounts(counts));

      if (!isDeepStrictEqual(counts, template.counts)) {
        stale = true;
        console.error('Set the counts of ' + template.id + ' in src/templates.js to ' + renderCounts(counts));
      }
    }
  } finally {
    rmSync(CLONES, { recursive: true, force: true });
  }

  return stale ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
