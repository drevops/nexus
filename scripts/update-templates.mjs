/**
 * Rebuilds the saved-diagram document of each content-model template.
 *
 * Usage: npm run update-templates [-- [--latest] [--pr <dir>] [--list] <id> ...]
 *
 * Each source of a template is cloned at its tag into a temporary folder. The
 * config files the parser reads are merged and drawn into
 * templates/<id>.nexus.json, and the clones are deleted. The bundle counts and
 * the size of the rebuilt diagram are written into src/templates.js.
 *
 * --latest moves each source to its latest stable tag first and writes the
 * new tags and version into src/templates.js.
 *
 * --pr writes a pull request title to <dir>/title.txt and a Markdown body to
 * <dir>/body.md.
 *
 * --list prints the ids of the selected templates as a JSON array and builds
 * nothing.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { TEMPLATES, templatePath, templateTitle } from '../src/templates.js';
import { isModelConfig } from '../src/parser.js';
import { buildDocument, documentCounts, mergeConfig, readConfigFolder, renderCounts, renderDocument } from './lib/template-sources.mjs';
import { changeSummary, changeTitle, latestTag, ownRef, rewriteTemplates, stableTags } from './lib/template-versions.mjs';

// The vendored UMD build exports nothing to an ES module import and sets
// globalThis.jsyaml instead.
await import('../assets/vendor/js-yaml.min.js');

const ROOT = join(import.meta.dirname, '..');
const TMP = join(ROOT, '.artifacts', 'tmp');
const TEMPLATES_MODULE = join(ROOT, 'src', 'templates.js');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
}

// A blobless, sparse clone downloads only the listed paths at the tag.
function fetchSource(source, dir) {
  git(['clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', source.ref, source.repo, dir]);
  git(['sparse-checkout', 'set', ...source.paths], dir);

  return git(['rev-parse', 'HEAD'], dir);
}

function latestRefs(template) {
  return template.sources.map((source) => {
    const ref = latestTag(stableTags(git(['ls-remote', '--tags', '--refs', source.repo])), source.ref);

    console.log(source.name + ': ' + (ref === source.ref ? source.ref + ' is the latest' : source.ref + ' -> ' + ref));

    return ref;
  });
}

function readDocument(template) {
  const path = join(ROOT, templatePath(template));

  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
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

  const doc = buildDocument(parsed, templateTitle(template));
  const text = renderDocument(doc);

  writeFileSync(join(ROOT, templatePath(template)), text);

  return { doc, size: Buffer.byteLength(text) };
}

function updateTemplate(template, clones, latest) {
  const refs = latest ? latestRefs(template) : template.sources.map((source) => source.ref);
  const version = ownRef(template, refs);
  const target = { ...template, version, sources: template.sources.map((source, index) => ({ ...source, ref: refs[index] })) };
  const before = readDocument(template);
  const { doc: after, size } = buildTemplate(target, clones);
  const counts = documentCounts(after);

  console.log(templateTitle(target) + ': ' + after.entities.length + ' entities, ' + renderCounts(counts));

  const text = readFileSync(TEMPLATES_MODULE, 'utf8');
  const rewritten = rewriteTemplates(text, template.id, { version, refs, counts, size });

  if (rewritten !== text) {
    writeFileSync(TEMPLATES_MODULE, rewritten);
    console.log('Updated ' + template.id + ' in src/templates.js');
  }

  return { title: changeTitle(template, refs), body: changeSummary(template, refs, before, after) };
}

function main(argv) {
  const { values, positionals: ids } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { latest: { type: 'boolean' }, list: { type: 'boolean' }, pr: { type: 'string' } },
  });
  const unknown = ids.filter((id) => !TEMPLATES.some((template) => template.id === id));

  if (unknown.length > 0) {
    throw new Error('Unknown template: ' + unknown.join(', '));
  }

  const selected = ids.length > 0 ? TEMPLATES.filter((template) => ids.includes(template.id)) : TEMPLATES;

  if (values.list) {
    console.log(JSON.stringify(selected.map((template) => template.id)));

    return;
  }

  const changes = [];

  mkdirSync(TMP, { recursive: true });

  const clones = mkdtempSync(join(TMP, 'update-templates-'));

  try {
    for (const template of selected) {
      changes.push(updateTemplate(template, clones, values.latest === true));
    }
  } finally {
    rmSync(clones, { recursive: true, force: true });
  }

  if (values.pr) {
    mkdirSync(values.pr, { recursive: true });
    writeFileSync(join(values.pr, 'title.txt'), changes.map((change) => change.title).join(' ') + '\n');
    writeFileSync(join(values.pr, 'body.md'), changes.map((change) => change.body).join('\n'));
  }
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
