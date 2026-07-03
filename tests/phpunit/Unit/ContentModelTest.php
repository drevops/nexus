<?php

declare(strict_types=1);

namespace DrevOps\App\Tests\Unit;

use DrevOps\App\Model\ContentModel;
use DrevOps\App\Model\Entity;
use DrevOps\App\Model\Field;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Tests the graph structure produced by ContentModel::toArray().
 */
#[CoversClass(ContentModel::class)]
#[CoversClass(Entity::class)]
#[CoversClass(Field::class)]
final class ContentModelTest extends TestCase {

  /**
   * Filter the edges of a graph by their group.
   *
   * @param array<string, mixed> $data
   *   The graph data.
   * @param string $group
   *   The edge group to keep.
   *
   * @return array<int, array<string, mixed>>
   *   Matching edges, re-indexed.
   */
  protected function edgesByGroup(array $data, string $group): array {
    $edges = is_array($data['edges']) ? $data['edges'] : [];

    return array_values(array_filter($edges, static fn (array $edge): bool => ($edge['data']['group'] ?? '') === $group));
  }

  public function testToArrayBuildsNodesAndEdges(): void {
    $model = new ContentModel('My model');

    $article = new Entity('node', 'article', 'Article');
    $article->addField(new Field('field_summary', 'Summary', 'string', Field::KIND_SINGLE));
    $article->addField(new Field('field_tags', 'Tags', 'entity_reference', Field::KIND_MULTI, FALSE, 'taxonomy_term', ['tags']));
    $model->addEntity($article);
    $model->addEntity(new Entity('taxonomy_term', 'tags', 'Tags'));

    $data = $model->toArray();

    $this->assertSame('My model', $data['meta']['title']);
    $this->assertSame(2, $data['meta']['entityCount']);

    // 2 entities + 2 fields.
    $this->assertCount(4, $data['nodes']);
    // 2 "has" edges + 1 "ref" edge.
    $this->assertCount(3, $data['edges']);

    $node_ids = array_map(static fn (array $node): string => (string) $node['data']['id'], $data['nodes']);
    $this->assertContains('node.article', $node_ids);
    $this->assertContains('field:node.article:field_summary', $node_ids);
    $this->assertContains('field:node.article:field_tags', $node_ids);

    $ref = $this->edgesByGroup($data, 'ref')[0];
    $this->assertSame('field:node.article:field_tags', $ref['data']['source']);
    $this->assertSame('taxonomy_term.tags', $ref['data']['target']);
    $this->assertSame('1..n', $ref['data']['cardinality']);
  }

  public function testSingleReferenceCardinalityLabel(): void {
    $model = new ContentModel();
    $article = new Entity('node', 'article', 'Article');
    $article->addField(new Field('field_image', 'Image', 'entity_reference', Field::KIND_SINGLE, FALSE, 'media', ['image']));
    $model->addEntity($article);

    $ref = $this->edgesByGroup($model->toArray(), 'ref')[0];
    $this->assertSame('1', $ref['data']['cardinality']);
    $this->assertSame('media.image', $ref['data']['target']);
  }

  public function testOpenEndedReferenceTargetsAnyNode(): void {
    $model = new ContentModel();
    $page = new Entity('node', 'page', 'Page');
    $page->addField(new Field('field_components', 'Components', 'entity_reference_revisions', Field::KIND_MULTI, FALSE, 'paragraph', []));
    $model->addEntity($page);

    $ref = $this->edgesByGroup($model->toArray(), 'ref')[0];
    $this->assertSame('paragraph.*', $ref['data']['target']);
  }

}
