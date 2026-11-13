/**
 * Minimal parsed-config fixture (mirrors the shape js-yaml produces), covering
 * single/multi/reference/revisions/open-ended/list fields across bundle types,
 * with descriptions and field settings set, blank or missing.
 */
export const configMin = {
  'node.type.article.yml': { name: 'Article', type: 'article', description: 'Long-form news.' },
  'node.type.page.yml': { name: 'Page', type: 'page' },
  'taxonomy.vocabulary.tags.yml': { name: 'Tags', vid: 'tags', description: '' },
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
    description: '',
    required: false,
    translatable: false,
    default_value: [],
    field_type: 'entity_reference',
    settings: { handler_settings: { target_bundles: { tags: 'tags' } } },
  },

  'field.storage.node.field_summary.yml': { entity_type: 'node', field_name: 'field_summary', type: 'string', cardinality: 1 },
  'field.field.node.article.field_summary.yml': {
    entity_type: 'node',
    bundle: 'article',
    field_name: 'field_summary',
    label: 'Summary',
    description: 'A short summary.',
    required: true,
    translatable: true,
    default_value: [{ value: 'Read on' }],
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

  'field.storage.node.field_layout.yml': {
    entity_type: 'node',
    field_name: 'field_layout',
    type: 'list_string',
    settings: {
      allowed_values: [
        { value: 'wide', label: 'Wide' },
        { value: 'narrow', label: 'Narrow' },
      ],
      allowed_values_function: '',
    },
    cardinality: 1,
  },
  'field.field.node.page.field_layout.yml': {
    entity_type: 'node',
    bundle: 'page',
    field_name: 'field_layout',
    label: 'Layout',
    description: 'Pick a <b>layout</b>.',
    required: false,
    translatable: true,
    default_value: [{ value: 'wide' }],
    field_type: 'list_string',
    settings: {},
  },
};
