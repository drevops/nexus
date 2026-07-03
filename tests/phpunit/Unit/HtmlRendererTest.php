<?php

declare(strict_types=1);

namespace DrevOps\App\Tests\Unit;

use DrevOps\App\Model\ContentModel;
use DrevOps\App\Model\Entity;
use DrevOps\App\Model\Field;
use DrevOps\App\Renderer\HtmlRenderer;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Tests rendering a content model to a self-contained HTML page.
 */
#[CoversClass(HtmlRenderer::class)]
#[CoversClass(ContentModel::class)]
#[CoversClass(Entity::class)]
#[CoversClass(Field::class)]
final class HtmlRendererTest extends TestCase {

  /**
   * Build a small model with one entity, one field and a reference target.
   */
  protected function model(string $title = 'Test model'): ContentModel {
    $model = new ContentModel($title);
    $article = new Entity('node', 'article', 'Article');
    $article->addField(new Field('field_tags', 'Tags', 'entity_reference', Field::KIND_MULTI, FALSE, 'taxonomy_term', ['tags']));
    $model->addEntity($article);
    $model->addEntity(new Entity('taxonomy_term', 'tags', 'Tags'));

    return $model;
  }

  public function testRendersDocument(): void {
    $html = (new HtmlRenderer())->render($this->model());

    $this->assertStringContainsString('<!DOCTYPE html>', $html);
    $this->assertStringContainsString('<title>Test model</title>', $html);
    $this->assertStringContainsString('id="cy"', $html);
    $this->assertStringContainsString('node.article', $html);
    $this->assertStringContainsString('taxonomy_term.tags', $html);
  }

  public function testIsSelfContained(): void {
    $html = (new HtmlRenderer())->render($this->model());

    // No external scripts or stylesheets: everything is inlined.
    $this->assertStringNotContainsString('<script src', $html);
    $this->assertStringNotContainsString('<link ', $html);

    // Vendor libraries are present inline.
    $this->assertStringContainsString('cytoscape', $html);
    $this->assertStringContainsString('dagre', $html);
  }

  public function testEscapesModelForScriptEmbed(): void {
    $html = (new HtmlRenderer())->render($this->model('Safe <b> title'));

    // The title is HTML-escaped in the document head.
    $this->assertStringContainsString('Safe &lt;b&gt; title', $html);
    // The embedded JSON hex-escapes angle brackets.
    $this->assertStringContainsString('Safe \\u003Cb\\u003E title', $html);
    // Raw markup from the data never appears unescaped anywhere.
    $this->assertStringNotContainsString('Safe <b> title', $html);
  }

}
