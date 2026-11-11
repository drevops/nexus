/**
 * A Nexus document holding every key documentFromGraph() writes, in the form
 * it writes them.
 */
export const savedDocument = {
  nexus: 1,
  title: 'Saved model',
  colors: { node: '#112233' },
  symbols: { node: 'diamond' },
  customTypes: [{ type: 'gadget', label: 'Gadget' }],
  entities: [
    {
      entityType: 'node',
      bundle: 'article',
      label: 'Article',
      note: 'Long-form content.',
      fields: [
        {
          name: 'field_tags',
          label: 'Tags',
          fieldType: 'entity_reference',
          kind: 'multi',
          cardinality: 3,
          required: true,
          note: 'Up to 3 tags.',
          targetType: 'taxonomy_term',
          targetBundles: ['tags'],
          hidden: false,
        },
        {
          name: 'field_media',
          label: 'Media',
          fieldType: 'entity_reference',
          kind: 'single',
          cardinality: 1,
          required: false,
          note: '',
          targetType: 'media',
          targetBundles: [],
          hidden: true,
        },
      ],
    },
    { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', note: '', fields: [] },
    { entityType: 'media', bundle: '*', label: 'Any Media', note: '', fields: [] },
  ],
  annotations: {
    nodes: [
      { id: 'sync', kind: 'api', label: 'Sync API', note: 'Runs nightly.' },
      { id: 'publish', kind: 'callback', label: 'Publish', method: 'POST' },
    ],
    edges: [{ from: 'sync', to: 'node.article', label: 'fills' }],
  },
  layout: {
    'node.article': { x: 0, y: 0 },
    'field:node.article:field_tags': { x: 200, y: -40 },
    'field:node.article:field_media': { x: 200, y: 40 },
    'taxonomy_term.tags': { x: 400, y: -40 },
    'media.*': { x: 400, y: 40 },
    sync: { x: -200, y: 0 },
    publish: { x: -200, y: 100 },
  },
  ui: { panels: { legend: { open: true, dock: null, pos: { right: 16, bottom: 16 }, height: 260 } }, dockWidth: { left: 320, right: 340 } },
};
