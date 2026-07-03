<?php

declare(strict_types=1);

namespace DrevOps\App\Model;

/**
 * An entity bundle (content type, vocabulary, media type, etc.).
 *
 * @package DrevOps\App\Model
 */
class Entity {

  /**
   * Drupal entity type, e.g. 'node', 'taxonomy_term', 'media'.
   */
  protected string $entityType;

  /**
   * Bundle machine name.
   */
  protected string $bundle;

  /**
   * Human-readable label.
   */
  protected string $label;

  /**
   * Fields on this bundle.
   *
   * @var array<int, \DrevOps\App\Model\Field>
   */
  protected array $fields = [];

  /**
   * Entity constructor.
   *
   * @param string $entity_type
   *   Drupal entity type.
   * @param string $bundle
   *   Bundle machine name.
   * @param string $label
   *   Human-readable label.
   */
  public function __construct(string $entity_type, string $bundle, string $label) {
    $this->entityType = $entity_type;
    $this->bundle = $bundle;
    $this->label = $label;
  }

  /**
   * Get the unique identifier for this entity ("entity_type.bundle").
   */
  public function id(): string {
    return $this->entityType . '.' . $this->bundle;
  }

  /**
   * Get the entity type.
   */
  public function getEntityType(): string {
    return $this->entityType;
  }

  /**
   * Get the bundle machine name.
   */
  public function getBundle(): string {
    return $this->bundle;
  }

  /**
   * Get the human-readable label.
   */
  public function getLabel(): string {
    return $this->label;
  }

  /**
   * Get the fields on this bundle.
   *
   * @return array<int, \DrevOps\App\Model\Field>
   *   The fields.
   */
  public function getFields(): array {
    return $this->fields;
  }

  /**
   * Append a field to this bundle.
   *
   * @param \DrevOps\App\Model\Field $field
   *   The field to add.
   */
  public function addField(Field $field): void {
    $this->fields[] = $field;
  }

  /**
   * Replace the fields on this bundle.
   *
   * @param array<int, \DrevOps\App\Model\Field> $fields
   *   The fields.
   */
  public function setFields(array $fields): void {
    $this->fields = array_values($fields);
  }

}
