<?php

declare(strict_types=1);

namespace DrevOps\App\Parser;

use DrevOps\App\Model\ContentModel;
use DrevOps\App\Model\Entity;
use DrevOps\App\Model\Field;
use Symfony\Component\Finder\Finder;
use Symfony\Component\Yaml\Yaml;

/**
 * Parses an exported Drupal configuration directory into a ContentModel.
 *
 * Reads bundle definitions, field storages and field instances offline (no
 * running site or database) and derives entities, their fields and the
 * entity-reference relationships between them.
 *
 * @package DrevOps\App\Parser
 */
class ConfigParser {

  /**
   * Bundle-config filename prefix mapped to Drupal entity type.
   */
  const BUNDLE_PREFIXES = [
    'node.type.' => 'node',
    'taxonomy.vocabulary.' => 'taxonomy_term',
    'media.type.' => 'media',
    'paragraphs.paragraphs_type.' => 'paragraph',
    'block_content.type.' => 'block_content',
  ];

  /**
   * Field types that reference another entity.
   */
  const REFERENCE_TYPES = ['entity_reference', 'entity_reference_revisions'];

  /**
   * Entity-type ordering used to lay the diagram out deterministically.
   */
  const ENTITY_TYPE_ORDER = ['node', 'taxonomy_term', 'media', 'paragraph', 'block_content', 'user', 'external'];

  /**
   * Whether to inject curated base fields.
   */
  protected bool $includeBaseFields;

  /**
   * ConfigParser constructor.
   *
   * @param bool $include_base_fields
   *   Whether to inject curated base (system) fields per entity type.
   */
  public function __construct(bool $include_base_fields = TRUE) {
    $this->includeBaseFields = $include_base_fields;
  }

  /**
   * Parse a configuration directory into a content model.
   *
   * @param string $dir
   *   Path to an exported Drupal configuration directory.
   *
   * @return \DrevOps\App\Model\ContentModel
   *   The parsed content model.
   *
   * @throws \InvalidArgumentException
   *   When the directory does not exist.
   */
  public function parse(string $dir): ContentModel {
    if (!is_dir($dir)) {
      throw new \InvalidArgumentException(sprintf('Configuration directory "%s" does not exist.', $dir));
    }

    $files = $this->readFiles($dir);
    $model = new ContentModel();

    foreach ($files as $filename => $data) {
      $entity = $this->matchBundle($filename, $data);

      if ($entity instanceof Entity) {
        $model->addEntity($entity);
      }
    }

    $storages = $this->collectStorages($files);

    foreach ($files as $filename => $data) {
      if (str_starts_with($filename, 'field.field.')) {
        $this->addFieldInstance($model, $data, $storages);
      }
    }

    $this->resolveTargets($model);

    if ($this->includeBaseFields) {
      $this->injectBaseFields($model);
    }

    $this->sortModel($model);

    return $model;
  }

  /**
   * Read and parse every YAML file in the directory.
   *
   * @param string $dir
   *   Directory to scan.
   *
   * @return array<string, array<string, mixed>>
   *   Parsed data keyed by filename, sorted by name for determinism.
   */
  protected function readFiles(string $dir): array {
    $finder = new Finder();
    $finder->files()->name('*.yml')->depth('== 0')->in($dir)->sortByName();

    $files = [];
    foreach ($finder as $file) {
      $parsed = Yaml::parseFile($file->getPathname());

      if (is_array($parsed)) {
        /** @var array<string, mixed> $parsed */
        $files[$file->getFilename()] = $parsed;
      }
    }

    return $files;
  }

  /**
   * Match a bundle-definition file to an Entity.
   *
   * @param string $filename
   *   Config filename.
   * @param array<string, mixed> $data
   *   Parsed config data.
   *
   * @return \DrevOps\App\Model\Entity|null
   *   The entity, or NULL if the file is not a bundle definition.
   */
  protected function matchBundle(string $filename, array $data): ?Entity {
    foreach (self::BUNDLE_PREFIXES as $prefix => $entity_type) {
      if (!str_starts_with($filename, $prefix)) {
        continue;
      }

      $bundle = substr($filename, strlen($prefix), -strlen('.yml'));

      if (str_contains($bundle, '.')) {
        return NULL;
      }

      $label = $data['name'] ?? $data['label'] ?? $this->humanize($bundle);

      return new Entity($entity_type, $bundle, (string) $label);
    }

    return NULL;
  }

  /**
   * Collect field storage definitions keyed by "entity_type.field_name".
   *
   * @param array<string, array<string, mixed>> $files
   *   Parsed files keyed by filename.
   *
   * @return array<string, array{type: string, cardinality: int, target_type: string|null}>
   *   Storage metadata keyed by storage identifier.
   */
  protected function collectStorages(array $files): array {
    $storages = [];

    foreach ($files as $filename => $data) {
      if (!str_starts_with($filename, 'field.storage.')) {
        continue;
      }

      $entity_type = isset($data['entity_type']) ? (string) $data['entity_type'] : '';
      $field_name = isset($data['field_name']) ? (string) $data['field_name'] : '';

      if ($entity_type === '' || $field_name === '') {
        continue;
      }

      $settings = is_array($data['settings'] ?? NULL) ? $data['settings'] : [];
      $target_type = isset($settings['target_type']) ? (string) $settings['target_type'] : NULL;

      $storages[$entity_type . '.' . $field_name] = [
        'type' => isset($data['type']) ? (string) $data['type'] : 'string',
        'cardinality' => isset($data['cardinality']) ? (int) $data['cardinality'] : 1,
        'target_type' => $target_type,
      ];
    }

    return $storages;
  }

  /**
   * Build a Field from a field-instance config and attach it to its entity.
   *
   * @param \DrevOps\App\Model\ContentModel $model
   *   The content model being built.
   * @param array<string, mixed> $data
   *   Parsed field-instance config.
   * @param array<string, array{type: string, cardinality: int, target_type: string|null}> $storages
   *   Storage metadata keyed by storage identifier.
   */
  protected function addFieldInstance(ContentModel $model, array $data, array $storages): void {
    $entity_type = isset($data['entity_type']) ? (string) $data['entity_type'] : '';
    $bundle = isset($data['bundle']) ? (string) $data['bundle'] : '';
    $field_name = isset($data['field_name']) ? (string) $data['field_name'] : '';

    if ($entity_type === '' || $bundle === '' || $field_name === '') {
      return;
    }

    if (!in_array($entity_type, self::ENTITY_TYPE_ORDER, TRUE)) {
      return;
    }

    $entity_id = $entity_type . '.' . $bundle;
    $entity = $model->getEntity($entity_id);

    if (!$entity instanceof Entity) {
      $entity = new Entity($entity_type, $bundle, $this->humanize($bundle));
      $model->addEntity($entity);
    }

    $storage = $storages[$entity_type . '.' . $field_name] ?? [
      'type' => isset($data['field_type']) ? (string) $data['field_type'] : 'string',
      'cardinality' => 1,
      'target_type' => NULL,
    ];

    $field_type = isset($data['field_type']) ? (string) $data['field_type'] : $storage['type'];
    $is_reference = in_array($field_type, self::REFERENCE_TYPES, TRUE);
    $cardinality = $storage['cardinality'];
    $kind = $cardinality === 1 ? Field::KIND_SINGLE : Field::KIND_MULTI;
    $label = isset($data['label']) ? (string) $data['label'] : $field_name;
    $required = (bool) ($data['required'] ?? FALSE);

    $target_type = $is_reference ? $storage['target_type'] : NULL;
    $target_bundles = $is_reference ? $this->extractTargetBundles($data) : [];

    $entity->addField(new Field($field_name, $label, $field_type, $kind, $required, $target_type, $target_bundles));
  }

  /**
   * Extract the target bundle machine names from a reference field instance.
   *
   * @param array<string, mixed> $data
   *   Parsed field-instance config.
   *
   * @return array<int, string>
   *   Target bundle machine names; empty for an open-ended reference.
   */
  protected function extractTargetBundles(array $data): array {
    $settings = is_array($data['settings'] ?? NULL) ? $data['settings'] : [];
    $handler_settings = is_array($settings['handler_settings'] ?? NULL) ? $settings['handler_settings'] : [];
    $target_bundles = $handler_settings['target_bundles'] ?? NULL;

    if (!is_array($target_bundles)) {
      return [];
    }

    return array_map('strval', array_keys($target_bundles));
  }

  /**
   * Ensure every referenced target bundle exists as an entity.
   *
   * Creates placeholder entities for open-ended references ("Any <type>"),
   * user references and any target bundle whose own config is absent, so the
   * graph never contains an edge to a missing node.
   *
   * @param \DrevOps\App\Model\ContentModel $model
   *   The content model being built.
   */
  protected function resolveTargets(ContentModel $model): void {
    foreach ($model->getEntities() as $entity) {
      foreach ($entity->getFields() as $field) {
        if (!$field->isReference()) {
          continue;
        }

        $target_type = (string) $field->getTargetType();
        $bundles = $field->getTargetBundles();
        $target_bundles = $bundles === [] ? ['*'] : $bundles;

        foreach ($target_bundles as $bundle) {
          $id = $target_type . '.' . $bundle;

          if ($model->hasEntity($id)) {
            continue;
          }

          $label = $bundle === '*' ? 'Any ' . $this->humanize($target_type) : $this->humanize($bundle);
          $model->addEntity(new Entity($target_type, $bundle, $label));
        }
      }
    }
  }

  /**
   * Prepend curated base fields to every entity.
   *
   * @param \DrevOps\App\Model\ContentModel $model
   *   The content model being built.
   */
  protected function injectBaseFields(ContentModel $model): void {
    foreach ($model->getEntities() as $entity) {
      $base = BaseFields::forEntityType($entity->getEntityType());

      if ($base !== []) {
        $entity->setFields(array_merge($base, $entity->getFields()));
      }
    }
  }

  /**
   * Order entities and fields for deterministic, diffable output.
   *
   * @param \DrevOps\App\Model\ContentModel $model
   *   The content model being built.
   */
  protected function sortModel(ContentModel $model): void {
    $entities = $model->getEntities();

    uasort($entities, function (Entity $a, Entity $b): int {
      $rank = $this->typeRank($a->getEntityType()) <=> $this->typeRank($b->getEntityType());

      return $rank !== 0 ? $rank : strcmp($a->getBundle(), $b->getBundle());
    });

    $model->setEntities($entities);

    foreach ($model->getEntities() as $entity) {
      $fields = $entity->getFields();

      $system = array_values(array_filter($fields, static fn (Field $field): bool => $field->getKind() === Field::KIND_SYSTEM));
      $others = array_values(array_filter($fields, static fn (Field $field): bool => $field->getKind() !== Field::KIND_SYSTEM));

      usort($others, static fn (Field $a, Field $b): int => strcmp($a->getName(), $b->getName()));

      $entity->setFields(array_merge($system, $others));
    }
  }

  /**
   * Get the ordering rank for an entity type.
   *
   * @param string $entity_type
   *   Drupal entity type.
   */
  protected function typeRank(string $entity_type): int {
    $rank = array_search($entity_type, self::ENTITY_TYPE_ORDER, TRUE);

    return $rank === FALSE ? count(self::ENTITY_TYPE_ORDER) : $rank;
  }

  /**
   * Convert a machine name into a human-readable label.
   *
   * @param string $machine_name
   *   Machine name.
   */
  protected function humanize(string $machine_name): string {
    return ucwords(str_replace(['_', '.'], ' ', $machine_name));
  }

}
