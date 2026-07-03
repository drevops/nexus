/**
 * Minimal parsed-config fixture (mirrors the shape js-yaml produces), covering
 * single/multi/reference/revisions/open-ended fields across bundle types.
 */
export const configMin = {
  'node.type.article.yml': { name: 'Article', type: 'article' },
  'node.type.page.yml': { name: 'Page', type: 'page' },
  'taxonomy.vocabulary.tags.yml': { name: 'Tags', vid: 'tags' },
  'media.type.image.yml': { id: 'image', label: 'Image' },
  'paragraphs.paragraphs_type.text.yml': { id: 'text', label: 'Text' },
  'paragraphs.paragraphs_type.gallery.yml': { id: 'gallery', label: 'Gallery' },

  'field.storage.node.field_tags.yml': {
    entity_type: 'node',
    field_name: 'field_tags',
    type: 'entity_reference',
    settings: { target_type: 'taxonomy_term' },
    cardinality: -1,
  },
  'field.field.node.article.field_tags.yml': {
    entity_type: 'node',
    bundle: 'article',
    field_name: 'field_tags',
    label: 'Tags',
    required: false,
    field_type: 'entity_reference',
    settings: { handler_settings: { target_bundles: { tags: 'tags' } } },
  },

  'field.storage.node.field_summary.yml': { entity_type: 'node', field_name: 'field_summary', type: 'string', cardinality: 1 },
  'field.field.node.article.field_summary.yml': {
    entity_type: 'node',
    bundle: 'article',
    field_name: 'field_summary',
    label: 'Summary',
    required: true,
    field_type: 'string',
  },

  'field.storage.node.field_image.yml': {
    entity_type: 'node',
    field_name: 'field_image',
    type: 'entity_reference',
    settings: { target_type: 'media' },
    cardinality: 1,
  },
  'field.field.node.article.field_image.yml': {
    entity_type: 'node',
    bundle: 'article',
    field_name: 'field_image',
    label: 'Image',
    required: false,
    field_type: 'entity_reference',
    settings: { handler_settings: { target_bundles: { image: 'image' } } },
  },

  'field.storage.node.field_sections.yml': {
    entity_type: 'node',
    field_name: 'field_sections',
    type: 'entity_reference_revisions',
    settings: { target_type: 'paragraph' },
    cardinality: -1,
  },
  'field.field.node.article.field_sections.yml': {
    entity_type: 'node',
    bundle: 'article',
    field_name: 'field_sections',
    label: 'Sections',
    required: false,
    field_type: 'entity_reference_revisions',
    settings: { handler_settings: { target_bundles: { text: 'text', gallery: 'gallery' } } },
  },

  'field.storage.node.field_components.yml': {
    entity_type: 'node',
    field_name: 'field_components',
    type: 'entity_reference_revisions',
    settings: { target_type: 'paragraph' },
    cardinality: -1,
  },
  'field.field.node.page.field_components.yml': {
    entity_type: 'node',
    bundle: 'page',
    field_name: 'field_components',
    label: 'Components',
    required: false,
    field_type: 'entity_reference_revisions',
    settings: { handler_settings: { target_bundles: null } },
  },
};
