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
 * repository at its tag and records what it fetched in source.json. The
 * sources are listed in the order Drupal installs them, because the first
 * folder to ship a file keeps it. 'version' is the tag of the source named
 * after the template.
 */

import { ENTITY_TYPE_ORDER } from './entity-types.js';

export const TEMPLATES = [
  {
    id: 'civictheme',
    label: 'CivicTheme',
    version: '1.13.0',
    summary: 'Government design system',
    icon: 'landmark',
    color: '#00698f',
    annotations: false,
    counts: { node: 3, taxonomy_term: 3, media: 6, paragraph: 31, block_content: 5 },
    project: 'https://www.drupal.org/project/civictheme',
    licence: 'GPL-2.0-or-later',
    sources: [
      {
        name: 'CivicTheme',
        repo: 'https://git.drupalcode.org/project/civictheme.git',
        ref: '1.13.0',
        paths: ['config/install', 'config/optional'],
      },
    ],
  },
  {
    id: 'drupal-cms',
    label: 'Drupal CMS',
    version: '2.2.2',
    summary: 'Byte site template: blog, pages, media',
    icon: 'droplet',
    color: '#0678be',
    annotations: false,
    counts: { node: 2, taxonomy_term: 1, media: 5 },
    project: 'https://www.drupal.org/project/cms',
    licence: 'GPL-2.0-or-later',
    sources: [
      {
        name: 'Drupal core',
        repo: 'https://git.drupalcode.org/project/drupal.git',
        ref: '11.4.8',
        paths: [
          'core/recipes/document_media_type/config',
          'core/recipes/image_media_type/config',
          'core/recipes/local_video_media_type/config',
          'core/recipes/remote_video_media_type/config',
          'core/recipes/user_picture/config',
        ],
      },
      {
        name: 'Drupal CMS',
        repo: 'https://git.drupalcode.org/project/drupal_cms.git',
        ref: '2.2.2',
        paths: ['recipes/drupal_cms_site_template_base/config', 'recipes/drupal_cms_forms/config', 'recipes/drupal_cms_search/config'],
      },
      {
        name: 'Byte site template',
        repo: 'https://git.drupalcode.org/project/byte.git',
        ref: '1.1.0',
        paths: ['config'],
      },
    ],
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
  return template.label + ' ' + template.version;
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
