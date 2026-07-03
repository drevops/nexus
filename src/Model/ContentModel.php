<?php

declare(strict_types=1);

namespace DrevOps\App\Model;

/**
 * The whole content model: a set of entities and their derived relationships.
 *
 * The toArray() output is the graph structure consumed by the front-end: a
 * flat list of Cytoscape nodes (one per entity, one per field) and edges (one
 * per "entity has field" link, one per reference to a target bundle).
 *
 * @package DrevOps\App\Model
 */
class ContentModel {

  /**
   * Diagram title.
   */
  protected string $title;

  /**
   * Entities keyed by their identifier ("entity_type.bundle").
   *
   * @var array<string, \DrevOps\App\Model\Entity>
   */
  protected array $entities = [];

  /**
   * Extra graph nodes contributed by an annotation overlay.
   *
   * @var array<int, array<string, mixed>>
   */
  protected array $extraNodes = [];

  /**
   * Extra graph edges contributed by an annotation overlay.
   *
   * @var array<int, array<string, mixed>>
   */
  protected array $extraEdges = [];

  /**
   * ContentModel constructor.
   *
   * @param string $title
   *   Diagram title.
   */
  public function __construct(string $title = 'Content model') {
    $this->title = $title;
  }

  /**
   * Get the diagram title.
   */
  public function getTitle(): string {
    return $this->title;
  }

  /**
   * Set the diagram title.
   *
   * @param string $title
   *   Diagram title.
   */
  public function setTitle(string $title): void {
    $this->title = $title;
  }

  /**
   * Add an entity, keyed by its identifier.
   *
   * @param \DrevOps\App\Model\Entity $entity
   *   The entity to add.
   */
  public function addEntity(Entity $entity): void {
    $this->entities[$entity->id()] = $entity;
  }

  /**
   * Whether an entity with the given identifier exists.
   *
   * @param string $id
   *   The entity identifier.
   */
  public function hasEntity(string $id): bool {
    return isset($this->entities[$id]);
  }

  /**
   * Get an entity by identifier.
   *
   * @param string $id
   *   The entity identifier.
   *
   * @return \DrevOps\App\Model\Entity|null
   *   The entity, or NULL if not found.
   */
  public function getEntity(string $id): ?Entity {
    return $this->entities[$id] ?? NULL;
  }

  /**
   * Get all entities.
   *
   * @return array<string, \DrevOps\App\Model\Entity>
   *   Entities keyed by identifier.
   */
  public function getEntities(): array {
    return $this->entities;
  }

  /**
   * Replace all entities, preserving the given order.
   *
   * @param array<int|string, \DrevOps\App\Model\Entity> $entities
   *   The entities.
   */
  public function setEntities(array $entities): void {
    $this->entities = [];
    foreach ($entities as $entity) {
      $this->addEntity($entity);
    }
  }

  /**
   * Add an extra graph node (e.g. an annotation event, API or callback).
   *
   * @param array<string, mixed> $data
   *   Cytoscape node "data" payload; must contain at least an "id".
   */
  public function addExtraNode(array $data): void {
    $this->extraNodes[] = ['data' => $data];
  }

  /**
   * Add an extra graph edge contributed by an annotation overlay.
   *
   * @param array<string, mixed> $data
   *   Cytoscape edge "data" payload; must contain "id", "source", "target".
   */
  public function addExtraEdge(array $data): void {
    $this->extraEdges[] = ['data' => $data];
  }

  /**
   * Build the {meta, nodes, edges} structure consumed by the front-end.
   *
   * @return array<string, mixed>
   *   The graph data.
   */
  public function toArray(): array {
    $nodes = [];
    $edges = [];
    $edge_index = 0;

    foreach ($this->entities as $entity) {
      $nodes[] = [
        'data' => [
          'id' => $entity->id(),
          'group' => 'entity',
          'entityType' => $entity->getEntityType(),
          'bundle' => $entity->getBundle(),
          'label' => $entity->getLabel(),
        ],
      ];

      foreach ($entity->getFields() as $field) {
        $field_id = 'field:' . $entity->id() . ':' . $field->getName();

        $nodes[] = [
          'data' => [
            'id' => $field_id,
            'group' => 'field',
            'kind' => $field->getKind(),
            'label' => $field->getLabel(),
            'fieldType' => $field->getFieldType(),
            'required' => $field->isRequired(),
            'entity' => $entity->id(),
          ],
        ];

        $edges[] = [
          'data' => [
            'id' => 'e' . $edge_index++,
            'source' => $entity->id(),
            'target' => $field_id,
            'group' => 'has',
          ],
        ];

        if (!$field->isReference()) {
          continue;
        }

        $target_type = (string) $field->getTargetType();
        $bundles = $field->getTargetBundles();
        $target_ids = $bundles === [] ? [$target_type . '.*'] : array_map(static fn (string $bundle): string => $target_type . '.' . $bundle, $bundles);

        foreach ($target_ids as $target_id) {
          $edges[] = [
            'data' => [
              'id' => 'e' . $edge_index++,
              'source' => $field_id,
              'target' => $target_id,
              'group' => 'ref',
              'cardinality' => $field->getKind() === Field::KIND_MULTI ? '1..n' : '1',
            ],
          ];
        }
      }
    }

    return [
      'meta' => [
        'title' => $this->title,
        'entityCount' => count($this->entities),
      ],
      'nodes' => array_merge($nodes, $this->extraNodes),
      'edges' => array_merge($edges, $this->extraEdges),
    ];
  }

}
