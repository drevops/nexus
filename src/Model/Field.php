<?php

declare(strict_types=1);

namespace DrevOps\App\Model;

/**
 * A single field on an entity bundle.
 *
 * The kind determines how the field is drawn in the diagram's visual language:
 * a single or multi-value ellipse, a dashed system-field ellipse, or a
 * calculated-field ellipse.
 *
 * @package DrevOps\App\Model
 */
class Field {

  const KIND_SINGLE = 'single';

  const KIND_MULTI = 'multi';

  const KIND_SYSTEM = 'system';

  const KIND_CALCULATED = 'calculated';

  /**
   * Field machine name.
   */
  protected string $name;

  /**
   * Human-readable label.
   */
  protected string $label;

  /**
   * Drupal field type, e.g. 'entity_reference', 'string', 'text_long'.
   */
  protected string $fieldType;

  /**
   * One of the KIND_* constants.
   */
  protected string $kind;

  /**
   * Whether the field is required.
   */
  protected bool $required;

  /**
   * Referenced entity type for reference fields, NULL otherwise.
   */
  protected ?string $targetType;

  /**
   * Referenced bundle machine names; empty means an open-ended reference.
   *
   * @var array<int, string>
   */
  protected array $targetBundles;

  /**
   * Field constructor.
   *
   * @param string $name
   *   Field machine name.
   * @param string $label
   *   Human-readable label.
   * @param string $field_type
   *   Drupal field type.
   * @param string $kind
   *   One of the KIND_* constants.
   * @param bool $required
   *   Whether the field is required.
   * @param string|null $target_type
   *   Referenced entity type, or NULL for non-reference fields.
   * @param array<int, string> $target_bundles
   *   Referenced bundle machine names.
   */
  public function __construct(string $name, string $label, string $field_type, string $kind, bool $required = FALSE, ?string $target_type = NULL, array $target_bundles = []) {
    $this->name = $name;
    $this->label = $label;
    $this->fieldType = $field_type;
    $this->kind = $kind;
    $this->required = $required;
    $this->targetType = $target_type;
    $this->targetBundles = array_values($target_bundles);
  }

  /**
   * Get the field machine name.
   */
  public function getName(): string {
    return $this->name;
  }

  /**
   * Get the human-readable label.
   */
  public function getLabel(): string {
    return $this->label;
  }

  /**
   * Get the Drupal field type.
   */
  public function getFieldType(): string {
    return $this->fieldType;
  }

  /**
   * Get the field kind (one of the KIND_* constants).
   */
  public function getKind(): string {
    return $this->kind;
  }

  /**
   * Whether the field is required.
   */
  public function isRequired(): bool {
    return $this->required;
  }

  /**
   * Get the referenced entity type, or NULL.
   */
  public function getTargetType(): ?string {
    return $this->targetType;
  }

  /**
   * Get the referenced bundle machine names.
   *
   * @return array<int, string>
   *   Bundle machine names; empty for open-ended references.
   */
  public function getTargetBundles(): array {
    return $this->targetBundles;
  }

  /**
   * Whether this field references another entity type.
   */
  public function isReference(): bool {
    return $this->targetType !== NULL;
  }

}
