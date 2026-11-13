/**
 * Finds the latest release of each template source, writes new tags and
 * counts into src/templates.js and describes the change for a pull request.
 */

import { ENTITY_TYPE_ORDER } from '../../src/entity-types.js';
import { templatePath } from '../../src/templates.js';
import { renderCounts } from './template-sources.mjs';

const STABLE_TAG = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Reads the output of 'git ls-remote --tags --refs' and returns the stable
 * release tags in it, such as '11.4.12'.
 *
 * Pre-releases ('12.0.0-beta1') and legacy contrib tags ('8.x-1.0') are
 * left out.
 */
export function stableTags(output) {
  return output
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[1] || '')
    .filter((ref) => ref.startsWith('refs/tags/'))
    .map((ref) => ref.slice('refs/tags/'.length))
    .filter((tag) => STABLE_TAG.test(tag));
}

/**
 * Compares 2 stable tags by major, minor and patch number, returning a
 * negative number, 0 or a positive number.
 */
export function compareVersions(a, b) {
  const left = a.match(STABLE_TAG);
  const right = b.match(STABLE_TAG);

  if (!left || !right) {
    throw new Error('Not a stable version: ' + (left ? b : a));
  }

  for (let part = 1; part <= 3; part++) {
    const diff = Number(left[part]) - Number(right[part]);

    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

/**
 * Returns the highest of the stable tags, or 'current' when it is higher or
 * none of the tags is stable, so a source never moves to an older release.
 */
export function latestTag(tags, current) {
  const stable = tags.filter((tag) => STABLE_TAG.test(tag)).sort(compareVersions);
  const latest = stable[stable.length - 1];

  if (!latest) {
    return current;
  }

  if (STABLE_TAG.test(current) && compareVersions(current, latest) >= 0) {
    return current;
  }

  return latest;
}

/**
 * Returns the tag of the source named after the template, which is the
 * template's version.
 */
export function ownRef(template, refs) {
  const index = template.sources.findIndex((source) => source.name === template.label);

  if (index === -1) {
    throw new Error(template.id + ' has no source named ' + template.label);
  }

  return refs[index];
}

/**
 * Orders bundle counts by entity type, in diagram order, with unknown types
 * last.
 */
export function orderCounts(counts) {
  const rank = (type) => (ENTITY_TYPE_ORDER.includes(type) ? ENTITY_TYPE_ORDER.indexOf(type) : ENTITY_TYPE_ORDER.length);
  const types = Object.keys(counts).sort((a, b) => rank(a) - rank(b));

  return Object.fromEntries(types.map((type) => [type, counts[type]]));
}

// The lines of 1 template's entry in TEMPLATES, from its id to the next
// entry or the end of the list.
function templateBlock(text, id) {
  const start = text.indexOf("\n    id: '" + id + "',\n");

  if (start === -1) {
    throw new Error('No template ' + id + ' in src/templates.js');
  }

  const ends = ["\n  {\n    id: '", '\n];\n'].map((marker) => text.indexOf(marker, start + 1)).filter((index) => index !== -1);

  return { start, end: Math.min(...ends) };
}

function replaceOnce(block, pattern, value, what) {
  const matches = block.match(new RegExp(pattern.source, 'gm')) || [];

  if (matches.length !== 1) {
    throw new Error('Expected 1 ' + what + ' line, found ' + matches.length);
  }

  return block.replace(new RegExp(pattern.source, 'm'), (match, head, tail) => head + value + tail);
}

/**
 * Rewrites the version, the tag of each source, in order, and the bundle
 * counts of 1 template in the source of src/templates.js.
 *
 * The entry must hold 1 version line, 1 counts line and 1 ref line per
 * source, as Prettier formats them, or the rewrite throws.
 */
export function rewriteTemplates(text, id, { version, refs, counts }) {
  const { start, end } = templateBlock(text, id);
  let block = text.slice(start, end);

  try {
    block = replaceOnce(block, /^( {4}version: ')[^'\n]*(',)$/, version, 'version');
    block = replaceOnce(block, /^( {4}counts: )\{[^}\n]*\}(,)$/, renderCounts(orderCounts(counts)), 'counts');

    const refLines = block.match(/^ {8}ref: '[^'\n]*',$/gm) || [];

    if (refLines.length !== refs.length) {
      throw new Error('Expected ' + refs.length + ' ref lines, found ' + refLines.length);
    }

    let index = 0;

    block = block.replace(/^( {8}ref: ')[^'\n]*(',)$/gm, (match, head, tail) => head + refs[index++] + tail);
  } catch (e) {
    throw new Error(id + ' in src/templates.js: ' + e.message);
  }

  return text.slice(0, start) + block + text.slice(end);
}

/**
 * Names a template update for a commit and pull request title.
 *
 * The title names the template's own release when it moved, and the other
 * sources that moved otherwise.
 */
export function changeTitle(template, refs) {
  const own = ownRef(template, refs);

  if (own !== template.version) {
    return 'Updated the ' + template.label + ' template to ' + own + '.';
  }

  const moved = template.sources.map((source, index) => (source.ref === refs[index] ? null : source.name + ' ' + refs[index])).filter(Boolean);

  if (moved.length === 0) {
    return 'Rebuilt the ' + template.label + ' template.';
  }

  return 'Updated the ' + template.label + ' template sources to ' + moved.join(', ') + '.';
}

// Each entity of a document as JSON, keyed by entity type and bundle.
function entityMap(doc) {
  return new Map((doc ? doc.entities : []).map((entity) => [entity.entityType + '.' + entity.bundle, JSON.stringify(entity)]));
}

function fieldCount(doc) {
  return (doc ? doc.entities : []).reduce((total, entity) => total + entity.fields.length, 0);
}

/**
 * Describes a template update as a Markdown pull request body: the sources,
 * the bundle counts and the bundles added and removed.
 *
 * 'before' is the diagram the template shipped, or null when there was none.
 */
export function changeSummary(template, refs, before, after) {
  const lines = ['Rebuilds `' + templatePath(template) + '` from the upstream tags below.', '', '## Sources', ''];

  lines.push('| Source | Before | After |', '| --- | --- | --- |');

  template.sources.forEach((source, index) => {
    const ref = refs[index] === source.ref ? '`' + refs[index] + '`' : '**`' + refs[index] + '`**';

    lines.push('| [' + source.name + '](' + source.repo.replace(/\.git$/, '') + ') | `' + source.ref + '` | ' + ref + ' |');
  });

  const beforeMap = entityMap(before);
  const afterMap = entityMap(after);
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  const lists = [
    ['Added', keys.filter((key) => !beforeMap.has(key))],
    ['Removed', keys.filter((key) => !afterMap.has(key))],
    ['Changed', keys.filter((key) => beforeMap.has(key) && afterMap.has(key) && beforeMap.get(key) !== afterMap.get(key))],
  ];

  lines.push('', '## Diagram', '');
  lines.push('- Bundles: ' + beforeMap.size + ' → ' + afterMap.size);
  lines.push('- Fields: ' + fieldCount(before) + ' → ' + fieldCount(after));

  for (const [label, list] of lists) {
    if (list.length > 0) {
      lines.push('- ' + label + ': ' + list.map((key) => '`' + key + '`').join(', '));
    }
  }

  return lines.join('\n') + '\n';
}
