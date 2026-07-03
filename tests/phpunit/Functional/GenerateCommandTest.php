<?php

declare(strict_types=1);

namespace DrevOps\App\Tests\Functional;

use AlexSkrypnyk\PhpunitHelpers\Traits\ApplicationTrait;
use DrevOps\App\Command\GenerateCommand;
use org\bovigo\vfs\vfsStream;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;

/**
 * Functional tests for the generate command.
 */
#[CoversClass(GenerateCommand::class)]
#[Group('command')]
final class GenerateCommandTest extends TestCase {

  use ApplicationTrait;

  /**
   * Path to the minimal fixture configuration directory.
   */
  protected function fixtureDir(): string {
    return dirname(__DIR__) . '/Fixtures/config-min';
  }

  public function testGeneratesDiagram(): void {
    $root = vfsStream::setup('out');
    $out = vfsStream::url('out') . '/content-model.html';

    $this->applicationInitFromCommand(GenerateCommand::class);
    $output = $this->applicationRun(['config-dir' => $this->fixtureDir(), '--output' => $out]);

    $this->assertStringContainsString('Wrote content-model diagram', $output);
    $this->assertStringContainsString('entities', $output);
    $this->assertTrue($root->hasChild('content-model.html'));

    $html = file_get_contents($out);
    $this->assertIsString($html);
    $this->assertStringContainsString('<!DOCTYPE html>', $html);
    $this->assertStringContainsString('node.article', $html);
    $this->assertStringContainsString('taxonomy_term.tags', $html);
  }

  public function testGeneratesWithAnnotationsAndTitle(): void {
    vfsStream::setup('out');
    $out = vfsStream::url('out') . '/annotated.html';

    $this->applicationInitFromCommand(GenerateCommand::class);
    $this->applicationRun([
      'config-dir' => $this->fixtureDir(),
      '--output' => $out,
      '--annotations' => dirname(__DIR__) . '/Fixtures/annotations.yml',
      '--title' => 'Custom title',
    ]);

    $html = file_get_contents($out);
    $this->assertIsString($html);
    $this->assertStringContainsString('<title>Custom title</title>', $html);
    $this->assertStringContainsString('create_program', $html);
  }

  public function testHonoursNoBaseFieldsOption(): void {
    vfsStream::setup('out');
    $out = vfsStream::url('out') . '/no-base.html';

    $this->applicationInitFromCommand(GenerateCommand::class);
    $this->applicationRun(['config-dir' => $this->fixtureDir(), '--output' => $out, '--no-base-fields' => TRUE]);

    $html = file_get_contents($out);
    $this->assertIsString($html);
    // The curated base field "title" must not be present as a field node.
    $this->assertStringNotContainsString('field:node.article:title', $html);
    $this->assertStringContainsString('field:node.article:field_summary', $html);
  }

  public function testFailsOnMissingDirectory(): void {
    $this->applicationInitFromCommand(GenerateCommand::class);
    $output = $this->applicationRun(['config-dir' => '/no/such/config-dir'], [], TRUE);

    $this->assertStringContainsString('does not exist', $output);
  }

}
