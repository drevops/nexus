<?php

declare(strict_types=1);

namespace DrevOps\App\Renderer;

use DrevOps\App\Model\ContentModel;

/**
 * Renders a content model as a single, self-contained HTML page.
 *
 * All CSS, JavaScript and vendor libraries are inlined so the output is one
 * file that renders offline with no network access at view time.
 *
 * @package DrevOps\App\Renderer
 */
class HtmlRenderer {

  /**
   * Vendor scripts, inlined in dependency order.
   *
   * Cytoscape must come first so cytoscape-dagre can auto-register the dagre
   * layout against the global; dagre must precede its adapter.
   */
  const VENDOR_SCRIPTS = ['cytoscape.min.js', 'dagre.min.js', 'cytoscape-dagre.js'];

  /**
   * Absolute path to the resources directory.
   */
  protected string $resourceDir;

  /**
   * HtmlRenderer constructor.
   *
   * @param string|null $resource_dir
   *   Path to the resources directory; defaults to the packaged one.
   */
  public function __construct(?string $resource_dir = NULL) {
    $this->resourceDir = $resource_dir ?? dirname(__DIR__, 2) . '/resources';
  }

  /**
   * Render the model to a self-contained HTML document.
   *
   * @param \DrevOps\App\Model\ContentModel $model
   *   The content model to render.
   *
   * @return string
   *   The complete HTML document.
   */
  public function render(ContentModel $model): string {
    $template = $this->read($this->resourceDir . '/template.html');
    $title = htmlspecialchars($model->getTitle(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

    return strtr($template, [
      '{{ title }}' => $title,
      '{{ styles }}' => $this->read($this->resourceDir . '/diagram.css'),
      '{{ vendor }}' => $this->readVendor(),
      '{{ model }}' => $this->encode($model->toArray()),
      '{{ script }}' => $this->read($this->resourceDir . '/diagram.js'),
    ]);
  }

  /**
   * Encode the model as JSON safe to embed inside a script element.
   *
   * @param array<string, mixed> $data
   *   The model data.
   *
   * @return string
   *   The JSON string, with tags hex-escaped to prevent element breakout.
   */
  protected function encode(array $data): string {
    $json = json_encode($data, JSON_HEX_TAG | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    if ($json === FALSE) {
      throw new \RuntimeException('Unable to encode the content model as JSON.');
    }

    return $json;
  }

  /**
   * Concatenate the vendor scripts in dependency order.
   */
  protected function readVendor(): string {
    $parts = [];

    foreach (self::VENDOR_SCRIPTS as $name) {
      $parts[] = $this->read($this->resourceDir . '/vendor/' . $name);
    }

    return implode("\n;\n", $parts);
  }

  /**
   * Read a resource file.
   *
   * @param string $path
   *   Absolute path to the file.
   *
   * @return string
   *   File contents.
   *
   * @throws \RuntimeException
   *   When the file cannot be read.
   */
  protected function read(string $path): string {
    $contents = file_get_contents($path);

    if ($contents === FALSE) {
      throw new \RuntimeException(sprintf('Unable to read resource "%s".', $path));
    }

    return $contents;
  }

}
