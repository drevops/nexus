<?php

declare(strict_types=1);

namespace DrevOps\App\Tests\Unit;

use DrevOps\App\Annotation\AnnotationLoader;
use DrevOps\App\Model\ContentModel;
use DrevOps\App\Model\Entity;
use DrevOps\App\Model\Field;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Tests applying an annotation overlay to a content model.
 */
#[CoversClass(AnnotationLoader::class)]
#[CoversClass(ContentModel::class)]
#[CoversClass(Entity::class)]
#[CoversClass(Field::class)]
final class AnnotationLoaderTest extends TestCase {

  /**
   * Build a model with a single node.article entity.
   */
  protected function model(): ContentModel {
    $model = new ContentModel('Original title');
    $model->addEntity(new Entity('node', 'article', 'Article'));

    return $model;
  }

  /**
   * Collect node payloads keyed by identifier from a rendered graph.
   *
   * @param array<string, mixed> $data
   *   The graph data.
   *
   * @return array<string, array<string, mixed>>
   *   Node "data" payloads keyed by node id.
   */
  protected function nodesById(array $data): array {
    $result = [];
    $nodes = is_array($data['nodes']) ? $data['nodes'] : [];

    foreach ($nodes as $node) {
      $result[(string) $node['data']['id']] = $node['data'];
    }

    return $result;
  }

  public function testAppliesOverlay(): void {
    $model = $this->model();
    (new AnnotationLoader())->apply($model, dirname(__DIR__) . '/Fixtures/annotations.yml');

    $this->assertSame('Annotated model', $model->getTitle());

    $data = $model->toArray();
    $nodes = $this->nodesById($data);

    $this->assertArrayHasKey('create_program', $nodes);
    $this->assertSame('callback', $nodes['create_program']['kind']);
    $this->assertSame('POST', $nodes['create_program']['method']);
    $this->assertSame('api', $nodes['omny_api']['kind']);
    $this->assertSame('event', $nodes['clip_created']['kind']);

    // The "attach" produces an edge from the entity to the callback node.
    $attach = array_filter($data['edges'], static fn (array $e): bool => ($e['data']['source'] ?? '') === 'node.article' && ($e['data']['target'] ?? '') === 'create_program');
    $this->assertCount(1, $attach);

    // The explicit edge is present.
    $emits = array_filter($data['edges'], static fn (array $e): bool => ($e['data']['source'] ?? '') === 'omny_api' && ($e['data']['target'] ?? '') === 'clip_created');
    $this->assertCount(1, $emits);
  }

  public function testAddsCalculatedField(): void {
    $model = $this->model();
    (new AnnotationLoader())->apply($model, dirname(__DIR__) . '/Fixtures/annotations.yml');

    $article = $model->getEntity('node.article');
    $this->assertInstanceOf(Entity::class, $article);

    $computed = array_filter($article->getFields(), static fn (Field $f): bool => $f->getKind() === Field::KIND_CALCULATED);
    $this->assertCount(1, $computed);
    $this->assertSame('computed_url', array_values($computed)[0]->getName());
  }

  public function testMissingFileThrows(): void {
    $this->expectException(\InvalidArgumentException::class);
    (new AnnotationLoader())->apply($this->model(), dirname(__DIR__) . '/Fixtures/no-such-file.yml');
  }

}
