/**
 * The content-model templates the landing screen offers.
 *
 * Each template's files live in templates/<id>/: a config/ folder of exported
 * YAML, a manifest.json listing that folder and, when 'annotations' is set,
 * an annotations.yml overlay. 'counts' holds the bundles the config defines,
 * by entity type.
 *
 * A template with 'sources' is rebuilt from them by
 * 'npm run update-templates', which merges the listed config folders of each
 * repository at its tag and records what it fetched in source.json. Its
 * 'version' is the tag of its first source.
 */

import { ENTITY_TYPE_ORDER } from './entity-types.js';

export const TEMPLATES = [
  {
    id: 'radio-station',
    label: 'Radio station',
    version: null,
    summary: 'Programs, episodes, events and news',
    icon: 'radio',
    color: '#d9480f',
    annotations: true,
    counts: { node: 7, taxonomy_term: 9, media: 6, paragraph: 4, block_content: 1 },
    project: null,
    licence: null,
    sources: [],
  },
];

/**
 * Returns the path of a file in a template's folder, relative to the site
 * root.
 */
export function templatePath(template, file = '') {
  return 'templates/' + template.id + '/' + file;
}

/**
 * Returns a template's label followed by its version, such as
 * 'CivicTheme 1.13.0'.
 */
export function templateTitle(template) {
  return template.version ? template.label + ' ' + template.version : template.label;
}

/**
 * Returns the badge shown beside a template's label: its version, or
 * 'Example' for a template without one.
 */
export function templateBadge(template) {
  return template.version || 'Example';
}

/**
 * Picks the bundle counts a template's landing row shows: its content types,
 * then its 2 largest other bundle types, with ties in diagram order.
 */
export function summaryCounts(template) {
  const counts = ENTITY_TYPE_ORDER.filter((type) => template.counts[type] > 0).map((type) => ({ type, count: template.counts[type] }));
  const contentTypes = counts.filter((entry) => entry.type === 'node');
  const others = counts.filter((entry) => entry.type !== 'node').sort((a, b) => b.count - a.count);

  return [...contentTypes, ...others].slice(0, 3);
}
