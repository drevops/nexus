/**
 * A Mermaid flowchart of a document outline from `documentOutline()`.
 *
 * Each entity is a node in a subgraph of its entity type, and each reference
 * is an edge from the field's entity to the target, labelled with the field
 * and its cardinality. A target the document has no entity for is a node
 * outside the subgraphs.
 *
 * Node ids are generated, so no machine name has to fit Mermaid's id syntax.
 */

import { cardinalityLabel } from './model.js';
import { missingTargetLabel } from './document-outline.js';

const ENTITIES = { '"': '#quot;', '#': '#35;', '&': '#amp;', '<': '#lt;', '>': '#gt;', '|': '#124;' };

/**
 * Returns text for a quoted Mermaid label: quotes, '#', '&', '<', '>' and '|'
 * become entity codes, and line breaks become spaces. An edge label sits
 * between 2 '|', so a bare one would end it.
 */
export function mermaidText(value) {
  return String(value ?? '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/["#&<>|]/g, (c) => ENTITIES[c]);
}

function node(id, label) {
  return id + '["' + mermaidText(label) + '"]';
}

/**
 * Returns the flowchart as Mermaid source, without a code fence.
 */
export function mermaidFlowchart(outline) {
  const lines = ['flowchart LR'];
  const ids = new Map();

  outline.groups.forEach((group, index) => {
    lines.push('  subgraph t' + (index + 1) + '["' + mermaidText(group.heading) + '"]');

    group.entities.forEach((entity) => {
      const id = 'e' + (ids.size + 1);

      ids.set(entity.id, id);
      lines.push('    ' + node(id, entity.label));
    });

    lines.push('  end');
  });

  const edges = [];
  let missing = 0;

  outline.entities.forEach((entity) => {
    entity.fields.forEach((field) => {
      field.targets.forEach((target) => {
        if (!ids.has(target)) {
          const id = 'x' + ++missing;

          ids.set(target, id);
          lines.push('  ' + node(id, missingTargetLabel(outline, target)));
        }

        edges.push('  ' + ids.get(entity.id) + ' -->|"' + mermaidText(field.label + ' (' + cardinalityLabel(field.cardinality) + ')') + '"| ' + ids.get(target));
      });
    });
  });

  return lines.concat(edges).join('\n');
}
