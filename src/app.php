<?php

/**
 * @file
 * Main entry point for the application.
 */

declare(strict_types=1);

use DrevOps\App\Command\GenerateCommand;
use Symfony\Component\Console\Application;

// @codeCoverageIgnoreStart
$application = new Application('Nexus', '@nexus-version@');

$command = new GenerateCommand();
$application->add($command);
$application->setDefaultCommand((string) $command->getName(), TRUE);

$application->run();
// @codeCoverageIgnoreEnd
