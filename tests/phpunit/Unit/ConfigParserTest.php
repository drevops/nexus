<?php

declare(strict_types=1);

namespace DrevOps\App\Tests\Unit;

use DrevOps\App\Model\ContentModel;
use DrevOps\App\Model\Entity;
use DrevOps\App\Model\Field;
use DrevOps\App\Parser\BaseFields;
use DrevOps\App\Parser\ConfigParser;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Tests parsing an exported Drupal configuration directory.
 */
#[CoversClass(ConfigParser::class)]
#[CoversClass(BaseFields::class)]
#[CoversClass(Entity::class)]
#[CoversClass(Field::class)]
#[CoversClass(ContentModel::class)]
final class ConfigParserTest extends TestCase {

  /**
   * Path to the minimal fixture configuration directory.
   */
  protected function fixtureDir(): string {
    return dirname(__DIR__) . '/Fixtures/config-min';
  }

  /**
   * Find a field by machine name on an entity, failing if it is absent.
   */
  protected function field(Entity $entity, string $name): Field {
    foreach ($entity->getFields() as $field) {
      if ($field->getName() === $name) {
        return $field;
      }
    }

    $this->fail(sprintf('Field "%s" not found on "%s".', $name, $entity->id()));
  }

  public function testParsesBundles(): void {
    $model = (new ConfigParser())->parse($this->fixtureDir());

    // 2 node + 1 vocabulary + 1 media + 2 paragraph = 6 defined bundles, plus
    // the synthetic "paragraph.*" open-ended target = 7.
    $this->assertCount(7, $model->getEntities());

    $this->assertTrue($model->hasEntity('node.article'));
    $this->assertTrue($model->hasEntity('node.page'));
    $this->assertTrue($model->hasEntity('taxonomy_term.tags'));
    $this->assertTrue($model->hasEntity('media.image'));
    $this->assertTrue($model->hasEntity('paragraph.text'));
    $this->assertTrue($model->hasEntity('paragraph.gallery'));
    $this->assertTrue($model->hasEntity('paragraph.*'));

    $article = $model->getEntity('node.article');
    $this->assertInstanceOf(Entity::class, $article);
    $this->assertSame('Article', $article->getLabel());

    $any = $model->getEntity('paragraph.*');
    $this->assertInstanceOf(Entity::class, $any);
    $this->assertSame('Any Paragraph', $any->getLabel());
  }

  public function testFieldCardinalityAndReferences(): void {
    $model = (new ConfigParser())->parse($this->fixtureDir());
    $article = $model->getEntity('node.article');
    $this->assertInstanceOf(Entity::class, $article);

    $tags = $this->field($article, 'field_tags');
    $this->assertSame(Field::KIND_MULTI, $tags->getKind());
    $this->assertTrue($tags->isReference());
    $this->assertSame('taxonomy_term', $tags->getTargetType());
    $this->assertSame(['tags'], $tags->getTargetBundles());

    $summary = $this->field($article, 'field_summary');
    $this->assertSame(Field::KIND_SINGLE, $summary->getKind());
    $this->assertFalse($summary->isReference());
    $this->assertTrue($summary->isRequired());

    $image = $this->field($article, 'field_image');
    $this->assertSame(Field::KIND_SINGLE, $image->getKind());
    $this->assertSame('media', $image->getTargetType());
    $this->assertSame(['image'], $image->getTargetBundles());

    $sections = $this->field($article, 'field_sections');
    $this->assertSame(Field::KIND_MULTI, $sections->getKind());
    $this->assertSame('entity_reference_revisions', $sections->getFieldType());
    $this->assertSame('paragraph', $sections->getTargetType());
    $this->assertSame(['text', 'gallery'], $sections->getTargetBundles());
  }

  public function testOpenEndedReference(): void {
    $model = (new ConfigParser())->parse($this->fixtureDir());
    $page = $model->getEntity('node.page');
    $this->assertInstanceOf(Entity::class, $page);

    $components = $this->field($page, 'field_components');
    $this->assertTrue($components->isReference());
    $this->assertSame('paragraph', $components->getTargetType());
    $this->assertSame([], $components->getTargetBundles());
    $this->assertTrue($model->hasEntity('paragraph.*'));
  }

  public function testBaseFieldsInjected(): void {
    $model = (new ConfigParser())->parse($this->fixtureDir());
    $article = $model->getEntity('node.article');
    $this->assertInstanceOf(Entity::class, $article);

    $title = $this->field($article, 'title');
    $this->assertSame(Field::KIND_SYSTEM, $title->getKind());
    $this->assertTrue($title->isRequired());

    $names = array_map(static fn (Field $field): string => $field->getName(), $article->getFields());
    $this->assertSame(['title', 'uid', 'status', 'created'], array_slice($names, 0, 4));

    $term = $model->getEntity('taxonomy_term.tags');
    $this->assertInstanceOf(Entity::class, $term);
    $term_names = array_map(static fn (Field $field): string => $field->getName(), $term->getFields());
    $this->assertContains('name', $term_names);
  }

  public function testBaseFieldsCanBeDisabled(): void {
    $model = (new ConfigParser(FALSE))->parse($this->fixtureDir());
    $article = $model->getEntity('node.article');
    $this->assertInstanceOf(Entity::class, $article);

    $names = array_map(static fn (Field $field): string => $field->getName(), $article->getFields());
    $this->assertSame(['field_image', 'field_sections', 'field_summary', 'field_tags'], $names);
  }

  public function testDeterministicOutput(): void {
    $first = (new ConfigParser())->parse($this->fixtureDir())->toArray();
    $second = (new ConfigParser())->parse($this->fixtureDir())->toArray();

    $this->assertSame($first, $second);
  }

  public function testInvalidDirectoryThrows(): void {
    $this->expectException(\InvalidArgumentException::class);
    (new ConfigParser())->parse($this->fixtureDir() . '/does-not-exist');
  }

}
