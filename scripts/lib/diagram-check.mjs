/**
 * Checks a Nexus diagram document against schema/nexus.schema.json and the
 * rules the schema can't express.
 *
 * checkDiagram() returns { errors, warnings }, each a list of { path,
 * message } with a JSON Pointer path into the document. An error loses data
 * or stops the document opening. A warning flags a part of the document that
 * opens but draws less than it says, such as a reference to an entity the
 * document doesn't define.
 */

import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { findEntityType } from '../../src/entity-types.js';
import { entityNodeId, fieldNodeId } from '../../src/model.js';

export const SCHEMA_PATH = new URL('../../schema/nexus.schema.json', import.meta.url);

export const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

const validate = new Ajv2020({ allErrors: true }).compile(SCHEMA);

function problem(path, message) {
  return { path: path, message: message };
}

function schemaProblem(error) {
  const path = error.instancePath || '/';

  if (error.keyword === 'additionalProperties') {
    return problem(path, 'has the unknown key "' + error.params.additionalProperty + '"');
  }

  if (error.keyword === 'enum') {
    return problem(path, error.message + ': ' + error.params.allowedValues.join(', '));
  }

  return problem(path, error.message);
}

// The ids of the targets a reference field points to: 1 per target bundle,
// or the '<targetType>.*' entity when it lists none.
function referenceTargets(field) {
  const bundles = field.targetBundles && field.targetBundles.length > 0 ? field.targetBundles : ['*'];

  return bundles.map((bundle) => entityNodeId(field.targetType, bundle));
}

function checkEntities(doc, ids, errors) {
  doc.entities.forEach((entity, index) => {
    const id = entityNodeId(entity.entityType, entity.bundle);
    const path = '/entities/' + index;

    if (ids.has(id)) {
      errors.push(problem(path, 'repeats the entity ' + id + ' from ' + ids.get(id)));
      return;
    }

    ids.set(id, path);

    const names = new Map();

    (entity.fields || []).forEach((field, fieldIndex) => {
      const fieldPath = path + '/fields/' + fieldIndex;

      if (names.has(field.name)) {
        errors.push(problem(fieldPath, 'repeats the field ' + field.name + ' from ' + names.get(field.name)));
        return;
      }

      names.set(field.name, fieldPath);
      ids.set(fieldNodeId(id, field.name), fieldPath);
    });
  });
}

function checkAnnotationNodes(nodes, ids, errors) {
  nodes.forEach((node, index) => {
    const path = '/annotations/nodes/' + index;

    if (ids.has(node.id)) {
      errors.push(problem(path, 'reuses the id ' + node.id + ' from ' + ids.get(node.id)));
      return;
    }

    ids.set(node.id, path);
  });
}

function checkReferences(doc, ids, warnings) {
  doc.entities.forEach((entity, index) => {
    (entity.fields || []).forEach((field, fieldIndex) => {
      const path = '/entities/' + index + '/fields/' + fieldIndex;

      if (field.targetType == null) {
        if (field.targetBundles && field.targetBundles.length > 0) {
          warnings.push(problem(path, 'lists targetBundles without a targetType, so it references nothing'));
        }

        return;
      }

      for (const target of referenceTargets(field)) {
        if (!ids.has(target)) {
          warnings.push(problem(path, 'references ' + target + ', which the document does not define, so the reference is not drawn'));
        }
      }
    });
  });
}

function checkAnnotationEdges(edges, ids, warnings) {
  edges.forEach((edge, index) => {
    for (const end of ['from', 'to']) {
      if (!ids.has(edge[end])) {
        warnings.push(problem('/annotations/edges/' + index + '/' + end, 'names ' + edge[end] + ', which is not in the diagram, so the edge is not drawn'));
      }
    }
  });
}

function checkEntityTypes(doc, warnings) {
  const custom = new Set((doc.customTypes || []).map((type) => type.type));
  const reported = new Set();

  doc.entities.forEach((entity, index) => {
    const type = entity.entityType;

    if (findEntityType(type) || custom.has(type) || reported.has(type)) {
      return;
    }

    reported.add(type);
    warnings.push(
      problem(
        '/entities/' + index + '/entityType',
        type + ' is neither a built-in entity type nor in customTypes, so it draws in the fallback colour and symbol',
      ),
    );
  });
}

export function checkDiagram(doc) {
  if (!validate(doc)) {
    return { errors: validate.errors.map(schemaProblem), warnings: [] };
  }

  const errors = [];
  const warnings = [];
  const annotations = doc.annotations || {};
  // Maps each id of the diagram to the path that defines it.
  const ids = new Map();

  checkEntities(doc, ids, errors);
  checkAnnotationNodes(annotations.nodes || [], ids, errors);
  checkReferences(doc, ids, warnings);
  checkAnnotationEdges(annotations.edges || [], ids, warnings);
  checkEntityTypes(doc, warnings);

  return { errors: errors, warnings: warnings };
}
