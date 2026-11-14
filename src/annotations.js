/**
 * Applies an optional annotation overlay onto a content model.
 *
 * Adds the parts of the visual language that cannot be derived from Drupal
 * configuration: Event / API / Callback / Note nodes, explicit edges, and
 * calculated fields. Input is the already-parsed overlay object.
 *
 * A Note node draws its `note` as Markdown (see src/note-markdown.js) instead
 * of a note badge.
 */

import { Field, KIND_CALCULATED } from './model.js';

export const ANNOTATION_FILES = ['annotations.yml', 'nexus.annotations.yml'];

export const ANNOTATION_KINDS = [
  { kind: 'event', label: 'Event' },
  { kind: 'api', label: 'API' },
  { kind: 'callback', label: 'Callback' },
  { kind: 'note', label: 'Note' },
];

export const NOTE_KIND = 'note';

export function applyAnnotations(model, data) {
  if (!data || typeof data !== 'object') {
    return;
  }

  if (typeof data.title === 'string') {
    model.setTitle(data.title);
  }

  let edgeIndex = 0;
  const addEdge = (source, target, label) => {
    model.addExtraEdge({ id: 'a' + edgeIndex++, source, target, group: 'annotation', label });
  };

  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || node.id == null) {
      continue;
    }

    const id = String(node.id);
    let kind = node.kind != null ? String(node.kind) : 'event';
    kind = ANNOTATION_KINDS.some((entry) => entry.kind === kind) ? kind : 'event';

    const payload = { id, group: 'annotation', kind, label: node.label != null ? String(node.label) : id };
    if (node.method != null) {
      payload.method = String(node.method);
    }
    if (node.note != null) {
      payload.note = String(node.note);
    }
    model.addExtraNode(payload);

    if (typeof node.attach === 'string') {
      addEdge(node.attach, id, '');
    }
  }

  const edges = Array.isArray(data.edges) ? data.edges : [];
  for (const edge of edges) {
    if (!edge || typeof edge !== 'object' || edge.from == null || edge.to == null) {
      continue;
    }

    addEdge(String(edge.from), String(edge.to), edge.label != null ? String(edge.label) : '');
  }

  const groups = data.computed_fields && typeof data.computed_fields === 'object' ? data.computed_fields : {};
  for (const [entityId, fields] of Object.entries(groups)) {
    const entity = model.getEntity(String(entityId));

    if (!entity || !Array.isArray(fields)) {
      continue;
    }

    for (const field of fields) {
      if (!field || typeof field !== 'object' || field.name == null) {
        continue;
      }

      const name = String(field.name);
      const label = field.label != null ? String(field.label) : name;
      entity.addField(new Field(name, label, 'computed', KIND_CALCULATED));
    }
  }
}
