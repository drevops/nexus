<?php

declare(strict_types=1);

namespace DrevOps\App\Annotation;

use DrevOps\App\Model\ContentModel;
use DrevOps\App\Model\Entity;
use DrevOps\App\Model\Field;
use Symfony\Component\Yaml\Yaml;

/**
 * Applies an optional annotation overlay onto a content model.
 *
 * The overlay adds the parts of the visual language that cannot be derived
 * from Drupal configuration: standalone Event (diamond), API (hexagon) and
 * Callback (method) nodes, explicit edges between them and the config-derived
 * entities, and calculated fields on existing bundles.
 *
 * Overlay format (YAML):
 * @code
 * title: 'PBS content model'
 * nodes:
 *   - { id: create_program, kind: callback, label: 'Create program', method: POST, attach: node.program }
 *   - { id: omny_api, kind: api, label: 'Omny Studio API' }
 *   - { id: clip_created, kind: event, label: 'ClipCreated' }
 * edges:
 *   - { from: omny_api, to: clip_created, label: emits }
 * computed_fields:
 *   node.episode:
 *     - { name: audio_url, label: 'AudioURL' }
 * @endcode
 *
 * @package DrevOps\App\Annotation
 */
class AnnotationLoader {

  /**
   * Node kinds accepted for standalone annotation nodes.
   */
  const NODE_KINDS = ['event', 'api', 'callback'];

  /**
   * Running counter used to mint unique annotation edge identifiers.
   */
  protected int $edgeIndex = 0;

  /**
   * Apply an annotation overlay file to a content model.
   *
   * @param \DrevOps\App\Model\ContentModel $model
   *   The model to augment.
   * @param string $file
   *   Path to the overlay YAML file.
   *
   * @throws \InvalidArgumentException
   *   When the file does not exist.
   */
  public function apply(ContentModel $model, string $file): void {
    if (!is_file($file)) {
      throw new \InvalidArgumentException(sprintf('Annotation file "%s" does not exist.', $file));
    }

    $data = Yaml::parseFile($file);

    if (!is_array($data)) {
      return;
    }

    if (isset($data['title']) && is_string($data['title'])) {
      $model->setTitle($data['title']);
    }

    $this->applyNodes($model, is_array($data['nodes'] ?? NULL) ? $data['nodes'] : []);
    $this->applyEdges($model, is_array($data['edges'] ?? NULL) ? $data['edges'] : []);
    $this->applyComputedFields($model, is_array($data['computed_fields'] ?? NULL) ? $data['computed_fields'] : []);
  }

  /**
   * Add standalone Event / API / Callback nodes.
   *
   * @param \DrevOps\App\Model\ContentModel $model
   *   The model to augment.
   * @param array<int|string, mixed> $nodes
   *   Node definitions from the overlay.
   */
  protected function applyNodes(ContentModel $model, array $nodes): void {
    foreach ($nodes as $node) {
      if (!is_array($node) || !isset($node['id'])) {
        continue;
      }

      $id = (string) $node['id'];
      $kind = (string) ($node['kind'] ?? 'event');
      $kind = in_array($kind, self::NODE_KINDS, TRUE) ? $kind : 'event';

      $payload = [
        'id' => $id,
        'group' => 'annotation',
        'kind' => $kind,
        'label' => (string) ($node['label'] ?? $id),
      ];

      if (isset($node['method'])) {
        $payload['method'] = (string) $node['method'];
      }

      $model->addExtraNode($payload);

      if (isset($node['attach']) && is_string($node['attach'])) {
        $this->addEdge($model, $node['attach'], $id, '');
      }
    }
  }

  /**
   * Add explicit edges between nodes.
   *
   * @param \DrevOps\App\Model\ContentModel $model
   *   The model to augment.
   * @param array<int|string, mixed> $edges
   *   Edge definitions from the overlay.
   */
  protected function applyEdges(ContentModel $model, array $edges): void {
    foreach ($edges as $edge) {
      if (!is_array($edge) || !isset($edge['from'], $edge['to'])) {
        continue;
      }

      $this->addEdge($model, (string) $edge['from'], (string) $edge['to'], (string) ($edge['label'] ?? ''));
    }
  }

  /**
   * Add calculated fields onto existing entities.
   *
   * @param \DrevOps\App\Model\ContentModel $model
   *   The model to augment.
   * @param array<int|string, mixed> $groups
   *   Computed-field definitions keyed by entity identifier.
   */
  protected function applyComputedFields(ContentModel $model, array $groups): void {
    foreach ($groups as $entity_id => $fields) {
      $entity = $model->getEntity((string) $entity_id);

      if (!$entity instanceof Entity || !is_array($fields)) {
        continue;
      }

      foreach ($fields as $field) {
        if (!is_array($field) || !isset($field['name'])) {
          continue;
        }

        $name = (string) $field['name'];
        $label = (string) ($field['label'] ?? $name);
        $entity->addField(new Field($name, $label, 'computed', Field::KIND_CALCULATED));
      }
    }
  }

  /**
   * Append an annotation edge with a unique identifier.
   *
   * @param \DrevOps\App\Model\ContentModel $model
   *   The model to augment.
   * @param string $source
   *   Source node identifier.
   * @param string $target
   *   Target node identifier.
   * @param string $label
   *   Edge label.
   */
  protected function addEdge(ContentModel $model, string $source, string $target, string $label): void {
    $model->addExtraEdge([
      'id' => 'a' . $this->edgeIndex++,
      'source' => $source,
      'target' => $target,
      'group' => 'annotation',
      'label' => $label,
    ]);
  }

}
