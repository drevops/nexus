/**
 * The content-model templates the landing screen offers.
 *
 * Each template ships as a saved diagram, templates/<id>.nexus.json, which
 * 'npm run update-templates' builds from the config folders in 'sources'.
 * 'counts' holds the bundles the diagram draws, by entity type.
 *
 * The sources are listed in the order Drupal installs them, because the first
 * folder to ship a file keeps it. 'version' is the tag of the source named
 * after the template.
 */

import { ENTITY_TYPE_ORDER } from './entity-types.js';

export const TEMPLATES = [
  {
    id: 'drupal-cms',
    label: 'Drupal CMS',
    version: '2.2.2',
    summary: 'Byte site template: blog, pages, media',
    icon: 'droplet',
    color: '#0678be',
    counts: { node: 2, taxonomy_term: 1, media: 5, user: 1 },
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
  {
    id: 'civictheme',
    label: 'CivicTheme',
    version: '1.13.0',
    summary: 'Government design system',
    icon: 'landmark',
    color: '#00698f',
    counts: { node: 3, taxonomy_term: 3, media: 6, paragraph: 31, block_content: 5 },
    sources: [
      {
        name: 'CivicTheme',
        repo: 'https://git.drupalcode.org/project/civictheme.git',
        ref: '1.13.0',
        paths: ['config/install', 'config/optional'],
      },
    ],
  },
];

/**
 * Returns the path of a template's saved diagram, relative to the site root.
 */
export function templatePath(template) {
  return 'templates/' + template.id + '.nexus.json';
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
