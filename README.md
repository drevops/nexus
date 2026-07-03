<p align="center">
  <img width="200" height="200" src="https://placehold.jp/000000/ffffff/200x200.png?text=nexus&css=%7B%22border-radius%22%3A%22%20100px%22%7D" alt="nexus logo">
</p>

<h1 align="center">Nexus</h1>

<div align="center">

Draw a Drupal site's content model as an interactive diagram, straight from its exported configuration.

[![GitHub Issues](https://img.shields.io/github/issues/drevops/nexus.svg)](https://github.com/drevops/nexus/issues)
[![Test PHP](https://github.com/drevops/nexus/actions/workflows/test-php.yml/badge.svg)](https://github.com/drevops/nexus/actions/workflows/test-php.yml)
![LICENSE](https://img.shields.io/github/license/drevops/nexus)
![Renovate](https://img.shields.io/badge/renovate-enabled-green?logo=renovatebot)

</div>

---

Nexus reads an exported Drupal configuration directory (YAML) - offline, with no running site or database - and renders the site's logical content model as a single, self-contained HTML page. The diagram draws on an infinite, pannable canvas in an established visual language: bundles as coloured boxes, fields as ellipses, and entity references as edges.

## Features

- **Offline and config-only.** Point it at an exported config directory; no site bootstrap, database or drush required.
- **Self-contained output.** One HTML file with all styling and libraries inlined - it opens in any browser with no network access.
- **Faithful visual language.** Single/multi/system/calculated fields, and Event/API/Callback annotations, each with their own shape (see the [legend](#the-visual-language)).
- **Browsable.** Starts as an entity-only overview, with tools to reveal fields, filter by entity type, focus an entity, and read a searchable field table.
- **Deterministic.** Stable ordering means the output is diffable and safe to commit.

## How it works

```
exported config (YAML)  ─▶  ConfigParser  ─▶  ContentModel  ─▶  HtmlRenderer  ─▶  self-contained .html
                             (offline)         entities +        (inlines
                                                fields + refs      Cytoscape.js)
```

The model is rendered with [Cytoscape.js](https://js.cytoscape.org/) and a [Dagre](https://github.com/dagrejs/dagre) layout, both vendored under `resources/vendor/` and inlined into the output.

## Requirements

- PHP 8.2+

## Installation

```bash
composer require drevops/nexus
```

## Usage

```bash
vendor/bin/nexus path/to/config/default --output content-model.html
```

Open `path/to/config/sync` (the directory holding `node.type.*.yml`, `field.field.*.yml`, and so on) and Nexus writes the diagram to `content-model.html`.

### Options

| Name | Default | Description |
|------|---------|-------------|
| `config-dir` | (required) | Path to an exported Drupal configuration directory. |
| `-o`, `--output` | `content-model.html` | Path to the HTML file to write. |
| `-t`, `--title` | Derived from the directory | Diagram title. |
| `-a`, `--annotations` | None | Path to an optional [annotation overlay](#annotation-overlay). |
| `--no-base-fields` | Off | Do not inject curated base (system) fields. |

## The visual language

The generated page renders a legend describing every symbol. Nexus derives the entity, field and reference elements from configuration; the Event, API, Callback and Calculated symbols come from an optional [annotation overlay](#annotation-overlay).

| Symbol | Meaning | Source |
|--------|---------|--------|
| Rounded rectangle (coloured by type) | An entity bundle - content type, vocabulary, media, paragraph, block, user | Config |
| Ellipse, solid border | Single-value field | Config |
| Ellipse, double border | Multi-value field (cardinality > 1) | Config |
| Ellipse, dashed border | System (base) field | Curated per entity type |
| Ellipse, yellow fill | Calculated field | Annotation |
| Diamond | Event | Annotation |
| Hexagon | API | Annotation |
| Rectangle with a method | Callback | Annotation |

Entity fill colours: content type (light blue-grey), vocabulary (blue), media (orange), paragraph (white), block (green), user (salmon).

## Navigating the diagram

The page opens as an entity-only overview. The toolbar adds:

- **Zoom / Fit / Reset** and mouse-wheel zoom with drag-to-pan (infinite canvas).
- **Show fields** - reveal every field ellipse for the full, detailed model.
- **Layout: LR / TB** - switch the flow direction.
- **Machine names** - show each bundle/field machine name in monospace beneath its symbol.
- **Settings** - customise the entity-type colours from a colour picker; choices are saved to your browser (localStorage) and reused across every diagram you open.
- **Entities** - an index panel with per-type filters and per-entity field counts; click an entity to focus it, or open its field list.
- **Table** - a searchable table of all fields (or one entity's), with type, cardinality, requiredness and reference targets.
- **Legend** - the visual-language key.

Hover any node for a tooltip, and use the search box to highlight a bundle and its neighbourhood.

## Annotation overlay

Some architecture is not expressed in Drupal configuration - integration callbacks, external APIs and domain events. Supply an optional YAML overlay to add them, and to mark calculated fields:

```yaml
title: 'PBS content model'

nodes:
  - { id: omny_api, kind: api, label: 'Omny Studio API' }
  - { id: create_episodes, kind: callback, label: 'Create future episodes', method: POST, attach: node.program }
  - { id: episode_published, kind: event, label: EpisodePublished, attach: node.episode }

edges:
  - { from: episode_published, to: omny_api, label: notifies }

computed_fields:
  node.episode:
    - { name: audio_url, label: 'Audio URL' }
```

- `nodes` add Event (`event`), API (`api`) or Callback (`callback`) nodes. `attach` draws an edge from an existing entity; `method` labels a callback.
- `edges` draw explicit links between any two nodes.
- `computed_fields` add calculated fields to an existing entity, keyed by its `entity_type.bundle` id.

Render with `--annotations`:

```bash
vendor/bin/nexus examples/pbs/config -a examples/pbs/annotations.yml -o pbs.html
```

## Playground

To see the tool in action without any setup, run:

```bash
playground/run.sh
```

This renders the bundled [PBS example](examples/pbs) and writes a timestamped report to `playground/.output/` (git-ignored). See [`playground/README.md`](playground/README.md).

## Maintenance

```bash
composer install
composer lint
composer test
```

---
_This repository was created using the [Scaffold](https://getscaffold.dev/) project template._
