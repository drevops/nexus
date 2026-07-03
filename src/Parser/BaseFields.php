<?php

declare(strict_types=1);

namespace DrevOps\App\Parser;

use DrevOps\App\Model\Field;

/**
 * Provides curated Drupal base (system) fields per entity type.
 *
 * Base fields are not present in exported field configuration, but they are
 * shown in the reference diagrams as dashed "system field" nodes. This class
 * supplies a small, well-known set per entity type so the generated diagram
 * resembles the hand-drawn originals.
 *
 * @package DrevOps\App\Parser
 */
class BaseFields {

  /**
   * Build the base fields for an entity type.
   *
   * @param string $entity_type
   *   Drupal entity type.
   *
   * @return array<int, \DrevOps\App\Model\Field>
   *   Base fields, or an empty array for entity types without a curated set.
   */
  public static function forEntityType(string $entity_type): array {
    $definitions = self::definitions();
    $entity_definitions = $definitions[$entity_type] ?? [];

    $fields = [];
    foreach ($entity_definitions as $definition) {
      $fields[] = new Field(
        $definition['name'],
        $definition['label'],
        $definition['field_type'],
        Field::KIND_SYSTEM,
        $definition['required'] ?? FALSE,
      );
    }

    return $fields;
  }

  /**
   * The curated base-field definitions per entity type.
   *
   * @return array<string, array<int, array{name: string, label: string, field_type: string, required?: bool}>>
   *   Definitions keyed by entity type.
   */
  protected static function definitions(): array {
    return [
      'node' => [
        ['name' => 'title', 'label' => 'Title', 'field_type' => 'string', 'required' => TRUE],
        ['name' => 'uid', 'label' => 'Author', 'field_type' => 'entity_reference'],
        ['name' => 'status', 'label' => 'Published', 'field_type' => 'boolean'],
        ['name' => 'created', 'label' => 'Authored on', 'field_type' => 'created'],
      ],
      'taxonomy_term' => [
        ['name' => 'name', 'label' => 'Name', 'field_type' => 'string', 'required' => TRUE],
        ['name' => 'description', 'label' => 'Description', 'field_type' => 'text_long'],
      ],
      'media' => [
        ['name' => 'name', 'label' => 'Name', 'field_type' => 'string', 'required' => TRUE],
        ['name' => 'status', 'label' => 'Published', 'field_type' => 'boolean'],
      ],
      'block_content' => [
        ['name' => 'info', 'label' => 'Block description', 'field_type' => 'string', 'required' => TRUE],
      ],
      'user' => [
        ['name' => 'name', 'label' => 'Username', 'field_type' => 'string', 'required' => TRUE],
        ['name' => 'mail', 'label' => 'Email', 'field_type' => 'email'],
        ['name' => 'roles', 'label' => 'Roles', 'field_type' => 'entity_reference'],
        ['name' => 'status', 'label' => 'Status', 'field_type' => 'boolean'],
      ],
    ];
  }

}
