/**
 * Builds the synthetic diagram the benchmark loads to find slowdowns that the
 * templates are too small to show.
 *
 * stressDiagram() returns the same saved document on every call: the bundles
 * STRESS_COUNTS lists, with field storages shared across the bundles of each
 * entity type. Each content type references 2 paragraph types and 1
 * vocabulary, and each paragraph type references 1 media type, so every
 * bundle is referenced and the document passes checkDiagram() with no errors
 * or warnings.
 */

export const STRESS_COUNTS = Object.freeze({ node: 100, paragraph: 120, taxonomy_term: 50, media: 30 });

const BUNDLE_PREFIXES = { node: 'content', paragraph: 'component', taxonomy_term: 'vocabulary', media: 'media' };

// Labels of mixed lengths, so some wrap onto several lines.
const LABELS = {
  node: ['Article', 'Landing page', 'Event', 'Campaign with a long running title', 'Profile', 'Resource', 'Location', 'Publication'],
  paragraph: ['Accordion', 'Call to action', 'Card grid with a heading and an introduction', 'Quote', 'Slider', 'Text and image', 'Map'],
  taxonomy_term: ['Topics', 'Regions', 'Audiences of every published resource', 'Formats', 'Industries'],
  media: ['Image', 'Document', 'Remote video', 'Audio file with a transcript'],
};

function bundleName(entityType, index) {
  return BUNDLE_PREFIXES[entityType] + '_' + String(index + 1).padStart(3, '0');
}

function bundleLabel(entityType, index) {
  const labels = LABELS[entityType];

  return labels[index % labels.length] + ' ' + (index + 1);
}

function field(name, label, fieldType, kind, target) {
  const cardinality = kind === 'multi' ? -1 : 1;

  return {
    name: name,
    label: label,
    fieldType: fieldType,
    kind: kind,
    cardinality: cardinality,
    required: false,
    targetType: target ? target.type : null,
    targetBundles: target ? target.bundles : [],
  };
}

function nodeFields(index) {
  const paragraphs = STRESS_COUNTS.paragraph;
  const components = [bundleName('paragraph', (2 * index) % paragraphs), bundleName('paragraph', (2 * index + 1) % paragraphs)];
  const tags = [bundleName('taxonomy_term', index % STRESS_COUNTS.taxonomy_term)];

  return [
    field('title', 'Title', 'string', 'system'),
    field('field_summary', 'Summary', 'string_long', 'single'),
    field('field_body', 'Body', 'text_long', 'single'),
    field('field_featured', 'Featured', 'boolean', 'single'),
    field('field_components', 'Components', 'entity_reference_revisions', 'multi', { type: 'paragraph', bundles: components }),
    field('field_tags', 'Tags', 'entity_reference', 'multi', { type: 'taxonomy_term', bundles: tags }),
  ];
}

function paragraphFields(index) {
  const media = [bundleName('media', index % STRESS_COUNTS.media)];

  return [
    field('field_heading', 'Heading', 'string', 'single'),
    field('field_text', 'Text', 'text_long', 'single'),
    field('field_media', 'Media', 'entity_reference', 'single', { type: 'media', bundles: media }),
  ];
}

const FIELDS = {
  node: nodeFields,
  paragraph: paragraphFields,
  taxonomy_term: () => [field('name', 'Name', 'string', 'system'), field('field_colour', 'Colour', 'string', 'single')],
  media: () => [field('name', 'Name', 'string', 'system'), field('field_media_file', 'File', 'file', 'single')],
};

export function stressDiagram() {
  const entities = Object.entries(STRESS_COUNTS).flatMap(([entityType, count]) =>
    Array.from({ length: count }, (_, index) => ({
      entityType: entityType,
      bundle: bundleName(entityType, index),
      label: bundleLabel(entityType, index),
      fields: FIELDS[entityType](index),
    })),
  );

  return { nexus: 1, title: 'Stress test', entities: entities };
}
