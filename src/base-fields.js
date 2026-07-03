/**
 * Curated Drupal base (system) fields per entity type.
 *
 * These are not present in exported field configuration.
 */

import { Field, KIND_SYSTEM } from './model.js';

const DEFINITIONS = {
  node: [
    { name: 'title', label: 'Title', fieldType: 'string', required: true },
    { name: 'uid', label: 'Author', fieldType: 'entity_reference' },
    { name: 'status', label: 'Published', fieldType: 'boolean' },
    { name: 'created', label: 'Authored on', fieldType: 'created' },
  ],
  taxonomy_term: [
    { name: 'name', label: 'Name', fieldType: 'string', required: true },
    { name: 'description', label: 'Description', fieldType: 'text_long' },
  ],
  media: [
    { name: 'name', label: 'Name', fieldType: 'string', required: true },
    { name: 'status', label: 'Published', fieldType: 'boolean' },
  ],
  block_content: [{ name: 'info', label: 'Block description', fieldType: 'string', required: true }],
  user: [
    { name: 'name', label: 'Username', fieldType: 'string', required: true },
    { name: 'mail', label: 'Email', fieldType: 'email' },
    { name: 'roles', label: 'Roles', fieldType: 'entity_reference' },
    { name: 'status', label: 'Status', fieldType: 'boolean' },
  ],
};

export function baseFieldsForEntityType(entityType) {
  const definitions = DEFINITIONS[entityType] || [];

  return definitions.map((definition) => new Field(definition.name, definition.label, definition.fieldType, KIND_SYSTEM, definition.required || false));
}
