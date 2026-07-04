/**
 * Content model: entities, their fields, and the graph they produce.
 *
 * toArray() returns the { meta, nodes, edges } structure consumed by the
 * renderer (Cytoscape elements).
 */

export const KIND_SINGLE = 'single';
export const KIND_MULTI = 'multi';
export const KIND_SYSTEM = 'system';
export const KIND_CALCULATED = 'calculated';

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
    this.fields = [];
  }

  id() {
    return this.entityType + '.' + this.bundle;
  }

  addField(field) {
    this.fields.push(field);
  }

  setFields(fields) {
    this.fields = [...fields];
  }
}

/**
 * The whole content model.
 */
export class ContentModel {
  constructor(title = 'Content model') {
    this.title = title;
    // A Map preserves insertion order, which the deterministic sort relies on.
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
    let edgeIndex = 0;

    for (const entity of this.entities.values()) {
      nodes.push({
        data: {
          id: entity.id(),
          group: 'entity',
          entityType: entity.entityType,
          bundle: entity.bundle,
          label: entity.label,
        },
      });

      for (const fieldItem of entity.fields) {
        const fieldId = 'field:' + entity.id() + ':' + fieldItem.name;

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
            entity: entity.id(),
          },
        });

        edges.push({ data: { id: 'e' + (edgeIndex++), source: entity.id(), target: fieldId, group: 'has' } });

        if (!fieldItem.isReference()) {
          continue;
        }

        const targetType = String(fieldItem.targetType);
        const bundles = fieldItem.targetBundles;
        const targetIds = bundles.length === 0 ? [targetType + '.*'] : bundles.map((bundle) => targetType + '.' + bundle);

        for (const targetId of targetIds) {
          edges.push({
            data: {
              id: 'e' + (edgeIndex++),
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
