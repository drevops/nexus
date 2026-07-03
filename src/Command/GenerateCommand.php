<?php

declare(strict_types=1);

namespace DrevOps\App\Command;

use DrevOps\App\Annotation\AnnotationLoader;
use DrevOps\App\Parser\ConfigParser;
use DrevOps\App\Renderer\HtmlRenderer;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * Generates an HTML content-model diagram from exported Drupal configuration.
 *
 * @package DrevOps\App\Command
 */
class GenerateCommand extends Command {

  /**
   * {@inheritdoc}
   */
  protected function configure(): void {
    $this
      ->setName('generate')
      ->setDescription('Generate an HTML content-model diagram from exported Drupal configuration.')
      ->setHelp('Reads an exported Drupal configuration directory (YAML) offline and writes a single, self-contained HTML page that draws the content model on an infinite canvas.')
      ->addArgument('config-dir', InputArgument::REQUIRED, 'Path to an exported Drupal configuration directory.')
      ->addOption('output', 'o', InputOption::VALUE_REQUIRED, 'Path to the HTML file to write.', 'content-model.html')
      ->addOption('title', 't', InputOption::VALUE_REQUIRED, 'Diagram title.')
      ->addOption('annotations', 'a', InputOption::VALUE_REQUIRED, 'Path to an optional annotation overlay YAML file.')
      ->addOption('no-base-fields', NULL, InputOption::VALUE_NONE, 'Do not inject curated base (system) fields.');
  }

  /**
   * {@inheritdoc}
   */
  protected function execute(InputInterface $input, OutputInterface $output): int {
    $config_dir = (string) $input->getArgument('config-dir');
    $output_path = (string) $input->getOption('output');
    $title = $input->getOption('title');
    $annotations = $input->getOption('annotations');
    $include_base_fields = $input->getOption('no-base-fields') !== TRUE;

    try {
      $model = (new ConfigParser($include_base_fields))->parse($config_dir);

      if (is_string($annotations) && $annotations !== '') {
        (new AnnotationLoader())->apply($model, $annotations);
      }

      // An explicit --title wins over any title set by the annotation overlay.
      if (is_string($title) && $title !== '') {
        $model->setTitle($title);
      }
      elseif ($model->getTitle() === 'Content model') {
        $model->setTitle('Content model: ' . basename($config_dir));
      }

      $data = $model->toArray();
      $html = (new HtmlRenderer())->render($model);
      $this->writeFile($output_path, $html);
    }
    catch (\InvalidArgumentException | \RuntimeException $exception) {
      $output->writeln('<error>' . $exception->getMessage() . '</error>');

      return Command::FAILURE;
    }

    $nodes = is_array($data['nodes']) ? count($data['nodes']) : 0;
    $edges = is_array($data['edges']) ? count($data['edges']) : 0;

    $output->writeln(sprintf('<info>Wrote content-model diagram to %s</info>', $output_path));
    $output->writeln(sprintf('%d entities, %d nodes, %d edges.', $model->getEntities() === [] ? 0 : count($model->getEntities()), $nodes, $edges));

    return Command::SUCCESS;
  }

  /**
   * Write a file, creating parent directories as needed.
   *
   * @param string $path
   *   Destination path.
   * @param string $contents
   *   File contents.
   *
   * @throws \RuntimeException
   *   When the directory cannot be created or the file cannot be written.
   */
  protected function writeFile(string $path, string $contents): void {
    $dir = dirname($path);

    if ($dir !== '' && !is_dir($dir) && !mkdir($dir, 0777, TRUE) && !is_dir($dir)) {
      throw new \RuntimeException(sprintf('Unable to create directory "%s".', $dir));
    }

    if (file_put_contents($path, $contents) === FALSE) {
      throw new \RuntimeException(sprintf('Unable to write file "%s".', $path));
    }
  }

}
