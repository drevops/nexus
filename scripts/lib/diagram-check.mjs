/**
 * Checks a Nexus diagram document against schema/nexus.schema.json and the
 * rules the schema can't express.
 *
 * checkDiagram() returns { errors, warnings }, each a list of { path,
 * message } with a JSON Pointer path into the document. An error loses data
 * or stops the document opening. A warning flags a part of the document that
 * opens but draws less than it says, such as an annotation edge to an id the
 * document doesn't define.
 *
 * Once the document's entities, fields and annotation ids are sound, the
 * rules of checkModel() in src/model-checks.js run too, at the path of the
 * entity or field each problem is on.
 */

import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { findEntityType } from '../../src/entity-types.js';
import { entityNodeId, fieldNodeId } from '../../src/model.js';
import { LEVEL_ERROR, checkModel } from '../../src/model-checks.js';

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

function checkTargetTypes(doc, warnings) {
  doc.entities.forEach((entity, index) => {
    (entity.fields || []).forEach((field, fieldIndex) => {
      if (field.targetType == null && field.targetBundles && field.targetBundles.length > 0) {
        warnings.push(problem('/entities/' + index + '/fields/' + fieldIndex, 'lists targetBundles without a targetType, so it references nothing'));
      }
    });
  });
}

function checkModelRules(doc, ids, errors, warnings) {
  for (const { level, message, id } of checkModel(doc)) {
    (level === LEVEL_ERROR ? errors : warnings).push(problem(ids.get(id), message));
  }
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
  checkTargetTypes(doc, warnings);
  checkAnnotationEdges(annotations.edges || [], ids, warnings);
  checkEntityTypes(doc, warnings);

  // A repeated entity or field id would give 2 problems the same path.
  if (errors.length === 0) {
    checkModelRules(doc, ids, errors, warnings);
  }

  return { errors: errors, warnings: warnings };
}
