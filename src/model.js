/**
 * Content model: entities, their fields, and the graph they produce.
 *
 * toArray() returns { meta, nodes, edges }, with nodes and edges as Cytoscape
 * element definitions.
 */

export const KIND_SINGLE = 'single';
export const KIND_MULTI = 'multi';
export const KIND_SYSTEM = 'system';
export const KIND_CALCULATED = 'calculated';

export const DEFAULT_TITLE = 'Content model';

export const REFERENCE_FIELD_TYPES = ['entity_reference', 'entity_reference_revisions'];

export function kindForCardinality(cardinality) {
  return cardinality === 1 ? KIND_SINGLE : KIND_MULTI;
}

/**
 * Graph ids: an entity node is '<entityType>.<bundle>' and a field node is
 * 'field:<entityId>:<name>'. Each field has a 'has:' edge from its entity and
 * 1 'ref:' edge per reference target.
 *
 * Each reference is also drawn as a 'proxy:' node joined to its field by a
 * 'pe:' edge, and as a 'c:' edge from the field's entity to the target.
 *
 * Saved layouts key positions by node id, so the node id formats are part of
 * the saved document format.
 */
export function entityNodeId(entityType, bundle) {
  return entityType + '.' + bundle;
}

export function fieldNodeId(entityId, name) {
  return 'field:' + entityId + ':' + name;
}

export function hasEdgeId(fieldId) {
  return 'has:' + fieldId;
}

export function refEdgeId(fieldId, targetId) {
  return 'ref:' + fieldId + '>' + targetId;
}

export function proxyNodeId(fieldId, targetId) {
  return 'proxy:' + fieldId + '>' + targetId;
}

export function proxyEdgeId(fieldId, targetId) {
  return 'pe:' + fieldId + '>' + targetId;
}

export function collapsedEdgeId(entityId, targetId) {
  return 'c:' + entityId + '>' + targetId;
}

/**
 * Human label for a Drupal storage cardinality: 1 is single-valued, -1 is
 * unlimited, any other N caps the number of values at N.
 */
export function cardinalityLabel(cardinality) {
  if (cardinality === -1) {
    return '1..n';
  }

  if (cardinality > 1) {
    return '1..' + cardinality;
  }

  return '1';
}

/**
 * Splits a machine name or field type after each underscore run between 2
 * words: 'entity_reference_revisions' gives 'entity_', 'reference_' and
 * 'revisions'. The segments join back to the original text, and a missing or
 * empty value gives none.
 */
export function identifierSegments(value) {
  if (value == null || value === '') {
    return [];
  }

  return String(value).split(/(?<=[^_]_+)(?=[^_])/);
}

const FIT_PASSES = 4;

/**
 * Shrinks `fontSize` until text whose width at a size is `measure(size)` fits
 * `availableWidth`, in steps rounded down to 0.01px. Returns null when the
 * text already fits, or when no size from `minFontSize` up fits within
 * FIT_PASSES passes.
 */
export function fitFontSize(measure, availableWidth, fontSize, minFontSize) {
  let width = measure(fontSize);

  if (width <= availableWidth) {
    return null;
  }

  let size = fontSize;

  // Glyph spacing varies with font size, so each guess is rescaled from the
  // width measured at the previous one.
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    size = Math.floor(((size * availableWidth) / width) * 100) / 100;

    if (size < minFontSize) {
      return null;
    }

    width = measure(size);

    if (width <= availableWidth) {
      return size;
    }
  }

  return null;
}

/**
 * A single field on an entity bundle.
 */
export class Field {
  constructor(name, label, fieldType, kind, required = false, targetType = null, targetBundles = [], cardinality = 1) {
    this.name = name;
    this.label = label;
    this.fieldType = fieldType;
    this.kind = kind;
    this.required = required;
    this.targetType = targetType;
    this.targetBundles = [...targetBundles];
    this.cardinality = cardinality;
    this.note = '';
  }

  isReference() {
    return this.targetType !== null && this.targetType !== undefined;
  }
}

/**
 * An entity bundle (content type, vocabulary, media type, ...).
 */
export class Entity {
  constructor(entityType, bundle, label) {
    this.entityType = entityType;
    this.bundle = bundle;
    this.label = label;
    this.note = '';
    this.fields = [];
  }

  id() {
    return entityNodeId(this.entityType, this.bundle);
  }

  addField(field) {
    this.fields.push(field);
  }

  setFields(fields) {
    this.fields = [...fields];
  }
}

export class ContentModel {
  constructor(title = DEFAULT_TITLE) {
    this.title = title;
    this.entities = new Map();
    this.extraNodes = [];
    this.extraEdges = [];
  }

  getTitle() {
    return this.title;
  }

  setTitle(title) {
    this.title = title;
  }

  addEntity(entity) {
    this.entities.set(entity.id(), entity);
  }

  hasEntity(id) {
    return this.entities.has(id);
  }

  getEntity(id) {
    return this.entities.get(id) || null;
  }

  getEntities() {
    return [...this.entities.values()];
  }

  setEntities(entities) {
    this.entities = new Map();
    for (const entity of entities) {
      this.addEntity(entity);
    }
  }

  addExtraNode(data) {
    this.extraNodes.push({ data });
  }

  addExtraEdge(data) {
    this.extraEdges.push({ data });
  }

  toArray() {
    const nodes = [];
    const edges = [];

    for (const entity of this.entities.values()) {
      nodes.push({
        data: {
          id: entity.id(),
          group: 'entity',
          entityType: entity.entityType,
          bundle: entity.bundle,
          label: entity.label,
          note: entity.note || '',
        },
      });

      for (const fieldItem of entity.fields) {
        const fieldId = fieldNodeId(entity.id(), fieldItem.name);

        nodes.push({
          data: {
            id: fieldId,
            group: 'field',
            name: fieldItem.name,
            kind: fieldItem.kind,
            cardinality: fieldItem.cardinality,
            label: fieldItem.label,
            fieldType: fieldItem.fieldType,
            required: fieldItem.required,
            note: fieldItem.note || '',
            entity: entity.id(),
          },
        });

        edges.push({ data: { id: hasEdgeId(fieldId), source: entity.id(), target: fieldId, group: 'has' } });

        if (!fieldItem.isReference()) {
          continue;
        }

        const targetType = String(fieldItem.targetType);
        const bundles = fieldItem.targetBundles.length === 0 ? ['*'] : fieldItem.targetBundles;

        for (const bundle of bundles) {
          const targetId = entityNodeId(targetType, bundle);

          edges.push({
            data: {
              id: refEdgeId(fieldId, targetId),
              source: fieldId,
              target: targetId,
              group: 'ref',
              cardinality: cardinalityLabel(fieldItem.cardinality),
            },
          });
        }
      }
    }

    return {
      meta: { title: this.title, entityCount: this.entities.size },
      nodes: [...nodes, ...this.extraNodes],
      edges: [...edges, ...this.extraEdges],
    };
  }
}
