/**
 * Reads, merges and renders the files of a content-model template.
 *
 * scripts/update-templates.mjs clones each upstream source of a template and
 * uses these helpers to build templates/<id>/ from the sources' config
 * folders.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads the YAML files of a config folder, without its subfolders, as
 * { name, content } records sorted by name.
 */
export function readConfigFolder(dir) {
  if (!existsSync(dir)) {
    throw new Error('Missing config folder: ' + dir);
  }

  const names = readdirSync(dir).filter((name) => name.endsWith('.yml'));

  if (names.length === 0) {
    throw new Error('No YAML files in ' + dir);
  }

  return names.sort().map((name) => ({ name, content: readFileSync(join(dir, name), 'utf8') }));
}

/**
 * Merges the config files of several origins, in order, into 'files': a map
 * of file name to { origin, content }.
 *
 * The first origin to ship a file keeps it, as Drupal keeps config that
 * exists when a later recipe ships it again. 'shadowed' lists each later copy
 * that differs as { name, kept, skipped }, naming both origins.
 */
export function mergeConfig(origins) {
  const files = new Map();
  const shadowed = [];

  for (const { origin, files: originFiles } of origins) {
    for (const { name, content } of originFiles) {
      const existing = files.get(name);

      if (!existing) {
        files.set(name, { origin, content });
        continue;
      }

      if (existing.content !== content) {
        shadowed.push({ name, kept: existing.origin, skipped: origin });
      }
    }
  }

  return { files, shadowed };
}

/**
 * Renders a template's manifest.json: its config file names, sorted.
 */
export function renderManifest(names) {
  return JSON.stringify([...names].sort(), null, 2) + '\n';
}

/**
 * Renders a template's source.json, recording the commit each source's tag
 * resolved to.
 */
export function renderSource(template, commits) {
  const sources = template.sources.map((source, index) => ({ ...source, commit: commits[index] }));

  return JSON.stringify({ template: template.id, version: template.version, sources }, null, 2) + '\n';
}

/**
 * Renders the README.md of a template built from upstream sources.
 */
export function renderReadme(template, commits) {
  const rows = template.sources.map((source, index) => {
    const paths = source.paths.map((path) => '`' + path + '`').join(', ');

    return '| ' + source.name + ' | `' + source.ref + '` | `' + commits[index].slice(0, 12) + '` | ' + paths + ' |';
  });

  return [
    `# ${template.label} ${template.version}`,
    '',
    `The content model of [${template.label}](${template.project}) ${template.version}, offered as a template on the Nexus landing screen.`,
    '',
    `\`npm run update-templates -- ${template.id}\` builds this folder from the sources below. To change it, edit the template in \`src/templates.js\` and run the command again rather than editing these files.`,
    '',
    '## Sources',
    '',
    '| Source | Tag | Commit | Config folders |',
    '|---|---|---|---|',
    ...rows,
    '',
    'The YAML files of every folder listed are merged into `config/` in the order shown, and `manifest.json` lists them. When 2 folders ship the same file, the first copy wins, as it does when Drupal installs them in that order.',
    '',
    '## Licence',
    '',
    'These sources are released under ' + template.licence + ', the licence Nexus uses too.',
    '',
  ].join('\n');
}

/**
 * Renders bundle counts as a JavaScript object literal, such as
 * '{ node: 3, paragraph: 31 }'.
 */
export function renderCounts(counts) {
  const entries = Object.entries(counts).map(([type, count]) => type + ': ' + count);

  return entries.length > 0 ? '{ ' + entries.join(', ') + ' }' : '{}';
}
