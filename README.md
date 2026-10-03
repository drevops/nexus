<p align="center">
  <img width="200" height="200" src="https://placehold.jp/000000/ffffff/200x200.png?text=nexus&css=%7B%22border-radius%22%3A%22%20100px%22%7D" alt="nexus logo">
</p>

<h1 align="center">Nexus</h1>

<div align="center">

Draw a Drupal site's content model as an interactive diagram - entirely in your browser.

[![GitHub Issues](https://img.shields.io/github/issues/drevops/nexus.svg)](https://github.com/drevops/nexus/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/drevops/nexus.svg)](https://github.com/drevops/nexus/pulls)
[![Test Node.js](https://github.com/drevops/nexus/actions/workflows/test-nodejs.yml/badge.svg)](https://github.com/drevops/nexus/actions/workflows/test-nodejs.yml)
[![Release](https://github.com/drevops/nexus/actions/workflows/release.yml/badge.svg)](https://github.com/drevops/nexus/actions/workflows/release.yml)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/drevops/nexus)
![LICENSE](https://img.shields.io/github/license/drevops/nexus)
![Renovate](https://img.shields.io/badge/renovate-enabled-green?logo=renovatebot)

</div>

---

Nexus is a static web app. Drop a Drupal **exported configuration folder** onto the page and it reconstructs the site's logical content model - bundles, fields and entity-reference relationships - and draws it on an infinite, pannable canvas. **Everything runs client-side: your configuration never leaves the browser.** Nothing is uploaded to any server, which makes it safe to point at client work.

**[Open the app →](https://drevops.github.io/nexus/)**

## Features

- **100% client-side.** Parsing and rendering happen in the browser; no backend, no upload, no install.
- **Drop a folder.** Choose or drag a config sync directory (or a module's `config/install`). Reads only `*.yml` locally.
- **Faithful visual language.** Bundles as coloured boxes; single / multi / system / calculated fields and Event / API / Callback annotations, each with their own shape (see the [legend](#the-visual-language)).
- **Browsable.** Starts as an entity-only overview, with tools to reveal fields, filter by entity type, focus an entity, read a searchable field table and toggle machine names.
- **Customisable & remembered.** Recolour entity types from a picker; choices persist in your browser and apply to every diagram you open.
- **Export.** Save the whole canvas as **PNG** or **SVG**, or the field table as **CSV** - all client-side.

## Usage

1. Open the app (or run it locally - see [`CONTRIBUTING.md`](CONTRIBUTING.md)).
2. **Choose a config folder** or drag one onto the drop zone - the folder of `*.yml` files exported from a Drupal site (its config sync directory), or a module's `config/install`. Or click **Try the example**.
3. Explore with the toolbar; export as PNG, SVG or CSV.

Add an `annotations.yml` file to the folder to overlay [events, APIs and callbacks](#annotation-overlay).

## The visual language

The page renders a legend describing every symbol. Nexus derives entities, fields and references from configuration; Event, API, Callback and Calculated symbols come from an optional [annotation overlay](#annotation-overlay).

| Symbol | Meaning | Source |
|--------|---------|--------|
| Rounded rectangle (coloured by type) | An entity bundle - content type, vocabulary, media, paragraph, block, user | Config |
| Ellipse, solid border | Single-value field | Config |
| Ellipse, double border | Multi-value field | Config |
| Ellipse, dashed border | System (base) field | Curated per entity type |
| Ellipse, yellow fill | Calculated field | Annotation |
| Diamond | Event | Annotation |
| Hexagon | API | Annotation |
| Rectangle with a method | Callback | Annotation |

## Navigating the diagram

The diagram opens as an entity-only overview. The toolbar offers:

- **Zoom / Fit / Reset** and wheel-zoom with drag-to-pan (infinite canvas).
- **Show fields** - reveal every field ellipse for the full model.
- **Layout: LR / TB** - switch the flow direction.
- **Machine names** - show each bundle/field machine name in monospace beneath its symbol.
- **Entities** - an index with per-type filters and field counts; click a bundle to focus it or open its fields.
- **Table** - a searchable table of all fields (or one entity's) with type, cardinality, requiredness and references.
- **Legend** and **Settings** (entity colours).
- **PNG / SVG / CSV** - export the whole canvas or the field table.

## Annotation overlay

Some architecture is not expressed in Drupal configuration - integration callbacks, external APIs and domain events. Include a YAML overlay named `annotations.yml` in the folder (or as the example ships one):

```yaml
title: 'Example content model'
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

- `nodes` add Event (`event`), API (`api`) or Callback (`callback`) nodes; `attach` draws an edge from an existing entity, `method` labels a callback.
- `edges` draw explicit links between any two nodes.
- `computed_fields` add calculated fields to an entity, keyed by its `entity_type.bundle` id.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for local development setup, the linting and testing commands, the Netlify previews for pull requests, and how a release deploys to GitHub Pages.

## Updating

To pull the latest infrastructure from the template into this project, ask Claude Code to "update scaffold" - see [`AGENTS.md`](AGENTS.md) for details.

## Privacy

Nexus has no backend. The configuration you import and the diagrams you build stay in your browser (in memory and `localStorage`) and are never uploaded to or processed by any server. Nexus is provided as is, without warranty of any kind, and the authors accept no responsibility or liability for any data you load into it or create with it.

## License

Nexus is free software, released under the [GNU General Public License, version 2](LICENSE) (GPL-2.0-or-later), matching the Drupal ecosystem it serves.

---
_Rendered with [Cytoscape.js](https://js.cytoscape.org/) and [Dagre](https://github.com/dagrejs/dagre); YAML via [js-yaml](https://github.com/nodeca/js-yaml)._

_This repository was created using the [Scaffold](https://getscaffold.dev/) project template_
