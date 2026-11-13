/**
 * The bundles of a saved Nexus document, grouped and ordered for the text
 * exports.
 *
 * `documentOutline()` takes the object `documentFromGraph()` returns and gives
 * its entities grouped by entity type: built-in types in diagram order, then
 * the document's custom types in their order, then any other type by machine
 * name. Each group's bundles are sorted by label, then by machine name.
 */

import { ENTITY_TYPE_ORDER, findEntityType, pluralLabel } from './entity-types.js';
import { entityNodeId, DEFAULT_TITLE } from './model.js';
import { humanize } from './names.js';

const WILDCARD = '*';

function fieldTargets(field) {
  if (!field.targetType) {
    return [];
  }

  const bundles = Array.isArray(field.targetBundles) && field.targetBundles.length > 0 ? field.targetBundles : [WILDCARD];

  return bundles.map((bundle) => entityNodeId(String(field.targetType), String(bundle)));
}

// Fills in what documentToModel() fills in for a missing value.
function outlineField(field) {
  const cardinality = field.cardinality != null ? field.cardinality : field.kind === 'multi' ? -1 : 1;

  return {
    name: String(field.name ?? ''),
    label: String(field.label || field.name || ''),
    fieldType: String(field.fieldType ?? ''),
    kind: field.kind,
    cardinality: cardinality,
    required: !!field.required,
    note: String(field.note ?? ''),
    targets: fieldTargets(field),
  };
}

function outlineEntity(entity) {
  const bundle = String(entity.bundle ?? '');

  return {
    id: entityNodeId(String(entity.entityType), bundle),
    entityType: String(entity.entityType),
    bundle: bundle,
    label: String(entity.label || bundle),
    note: String(entity.note ?? ''),
    fields: (Array.isArray(entity.fields) ? entity.fields : []).map(outlineField),
  };
}

function compareEntities(a, b) {
  return a.label.localeCompare(b.label) || a.bundle.localeCompare(b.bundle);
}

/**
 * Returns the title, the groups of entities by type and lookups over them.
 *
 * `groups` holds `{ type, label, heading, entities }` per entity type in use.
 * `entity(id)` returns an outlined entity or null, `typeLabel(type)` the
 * label of any type, and `referencedBy(id)` each `{ entity, field }` whose
 * field references the entity, in outline order.
 */
export function documentOutline(doc) {
  const customTypes = (Array.isArray(doc.customTypes) ? doc.customTypes : []).filter((custom) => custom && typeof custom.type === 'string');
  const byId = new Map();

  (Array.isArray(doc.entities) ? doc.entities : []).forEach((entity) => {
    const outlined = outlineEntity(entity);
    byId.set(outlined.id, outlined);
  });

  const typeLabel = (type) => {
    const custom = customTypes.find((entry) => entry.type === type);

    if (custom) {
      return custom.label || humanize(type);
    }

    const builtIn = findEntityType(type);

    return builtIn ? builtIn.label : humanize(type);
  };

  const entities = [...byId.values()];
  const known = ENTITY_TYPE_ORDER.concat(customTypes.map((custom) => custom.type));
  const others = [...new Set(entities.map((entity) => entity.entityType))].filter((type) => !known.includes(type)).sort();

  const groups = [...new Set(known.concat(others))]
    .map((type) => ({
      type: type,
      label: typeLabel(type),
      heading: pluralLabel(type) || typeLabel(type),
      entities: entities.filter((entity) => entity.entityType === type).sort(compareEntities),
    }))
    .filter((group) => group.entities.length > 0);

  const ordered = groups.flatMap((group) => group.entities);

  return {
    title: typeof doc.title === 'string' && doc.title.trim() !== '' ? doc.title : DEFAULT_TITLE,
    groups: groups,
    entities: ordered,
    entity: (id) => byId.get(id) || null,
    typeLabel: typeLabel,
    referencedBy: (id) => ordered.flatMap((entity) => entity.fields.filter((field) => field.targets.includes(id)).map((field) => ({ entity, field }))),
  };
}

/**
 * Returns the paragraphs of a note, each a list of its trimmed lines. Blank
 * lines separate paragraphs and never appear in one.
 */
export function noteParagraphs(note) {
  const paragraphs = [];
  let current = [];

  String(note ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (line !== '') {
        current.push(line);
      } else if (current.length > 0) {
        paragraphs.push(current);
        current = [];
      }
    });

  if (current.length > 0) {
    paragraphs.push(current);
  }

  return paragraphs;
}

/**
 * Returns the text a reference target is shown with when the document has
 * no entity for it: 'Any <type label>' for every bundle of a type, otherwise
 * its id.
 */
export function missingTargetLabel(outline, id) {
  const index = id.indexOf('.');

  if (index > 0 && id.slice(index + 1) === WILDCARD) {
    return 'Any ' + outline.typeLabel(id.slice(0, index));
  }

  return id;
}
