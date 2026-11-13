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
    version: '2.2.9',
    summary: 'Byte site template: blog, pages, media',
    icon: 'droplet',
    color: '#0678be',
    counts: { node: 2, taxonomy_term: 1, media: 5, user: 1 },
    sources: [
      {
        name: 'Drupal core',
        repo: 'https://git.drupalcode.org/project/drupal.git',
        ref: '11.4.12',
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
        ref: '2.2.9',
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
    version: '1.14.0',
    summary: 'Government design system',
    icon: 'landmark',
    color: '#00698f',
    counts: { node: 3, taxonomy_term: 3, media: 6, paragraph: 31, block_content: 5 },
    sources: [
      {
        name: 'CivicTheme',
        repo: 'https://git.drupalcode.org/project/civictheme.git',
        ref: '1.14.0',
        paths: ['config/install', 'config/optional'],
      },
    ],
  },
  {
    id: 'umami',
    label: 'Umami',
    version: '11.4.12',
    summary: 'Food magazine demo: recipes, articles, pages',
    icon: 'chef-hat',
    color: '#008068',
    counts: { node: 3, taxonomy_term: 2, media: 5, block_content: 4, user: 1 },
    sources: [
      {
        name: 'Umami',
        repo: 'https://git.drupalcode.org/project/drupal.git',
        ref: '11.4.12',
        paths: ['core/profiles/demo_umami/config/install'],
      },
    ],
  },
  {
    id: 'thunder',
    label: 'Thunder',
    version: '8.4.7',
    summary: 'Publishing distribution: articles, paragraphs, media',
    icon: 'zap',
    color: '#3d4fb8',
    counts: { node: 3, taxonomy_term: 2, media: 7, paragraph: 9, user: 1 },
    sources: [
      {
        name: 'Thunder',
        repo: 'https://github.com/thunder/thunder-distribution.git',
        ref: '8.4.7',
        paths: ['config/install', 'config/optional', 'modules/thunder_xymatic/config/install'],
      },
    ],
  },
  {
    id: 'open-social',
    label: 'Open Social',
    version: '13.1.0',
    summary: 'Community and intranet: topics, events, courses',
    icon: 'users',
    color: '#1f80aa',
    counts: { node: 8, taxonomy_term: 11, media: 1, paragraph: 20, block_content: 9, user: 1 },
    sources: [
      {
        name: 'Open Social',
        repo: 'https://github.com/goalgorilla/open_social.git',
        ref: '13.1.0',
        paths: [
          'modules/social_features/social_core/config/install',
          'modules/social_features/social_node/config/install',
          'modules/social_features/social_profile/config/install',
          'modules/social_features/social_profile/modules/social_profile_fields/config/install',
          'modules/social_features/social_profile/modules/social_profile_organization_tag/config/install',
          'modules/social_features/social_user/config/install',
          'modules/social_features/social_embed/config/install',
          'modules/social_features/social_follow_user/config/install',
          'modules/social_features/social_tagging/config/install',
          'modules/custom/social_media_system/config/install',
          'modules/social_features/social_event/config/install',
          'modules/social_features/social_event/modules/social_event_type/config/install',
          'modules/social_features/social_event/modules/social_event_managers/config/install',
          'modules/social_features/social_event/modules/social_event_an_enroll/config/install',
          'modules/social_features/social_event/modules/social_event_invite/config/install',
          'modules/social_features/social_event/modules/social_event_max_enroll/config/install',
          'modules/social_features/social_topic/config/install',
          'modules/social_features/social_page/config/install',
          'modules/social_features/social_album/config/install',
          'modules/social_features/social_content_report/config/install',
          'modules/social_features/social_group/modules/social_group_flexible_group/config/install',
          'modules/social_features/social_featured_content/config/install',
          'modules/social_features/social_featured_items/config/install',
          'modules/social_features/social_landing_page/config/install',
          'modules/social_features/social_content_block/config/install',
          'modules/social_features/social_content_block/modules/social_content_block_landing_page/config/install',
          'modules/social_features/social_content_block/modules/social_event_content_block/config/install',
          'modules/social_features/social_content_block/modules/social_event_content_block/config/optional',
          'modules/social_features/social_content_block/modules/social_group_content_block/config/install',
          'modules/social_features/social_follow_taxonomy/modules/social_follow_tag/config/install',
          'modules/social_features/social_follow_taxonomy/modules/social_follow_landing_page/config/install',
          'modules/features/social_course/config/install',
          'modules/systems/kpi_analytics/config/install',
        ],
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
