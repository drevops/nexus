<p align="center">
  <img width="200" height="200" src="https://placehold.jp/000000/ffffff/200x200.png?text=nexus&css=%7B%22border-radius%22%3A%22%20100px%22%7D" alt="nexus logo">
</p>

<h1 align="center">Nexus</h1>

<div align="center">

Draw a Drupal site's content model as an interactive diagram - entirely in your browser.

[![Test](https://github.com/drevops/nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/drevops/nexus/actions/workflows/ci.yml)
[![Pages](https://github.com/drevops/nexus/actions/workflows/pages.yml/badge.svg)](https://github.com/drevops/nexus/actions/workflows/pages.yml)
![LICENSE](https://img.shields.io/github/license/drevops/nexus)

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
- **Export.** Save the whole canvas as **PNG** or **PDF**, client-side.

## Usage

1. Open the app (or run it locally - see [Development](#development)).
2. **Choose a config folder** or drag one onto the drop zone - the folder of `*.yml` files exported from a Drupal site (its config sync directory), or a module's `config/install`. Or click **Try the example**.
3. Explore with the toolbar; export as PNG or PDF.

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
- **PNG / PDF** - export the whole canvas.

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

## Development

No build step - it is static ES modules plus vendored libraries under `assets/vendor/`. ES modules require HTTP (not `file://`), so use the dev server:

```bash
npm install       # dev dependencies (Playwright) for the tests
npm start         # serve at http://127.0.0.1:8000
npm run test:unit # Node's built-in test runner - the parser/model/annotations
npm run test:e2e  # Playwright - the app end to end (upload, render, export)
npm test          # both
```

- `assets/{parser,model,base-fields,annotations}.js` - the offline model builder (pure, dependency-free).
- `assets/render.js` - the Cytoscape renderer.
- `assets/{app,export}.js` - folder loading and PNG/PDF export.

## Deployment

Pushing to `main` builds and deploys the static site to GitHub Pages via `.github/workflows/pages.yml` (assembles `index.html`, `assets/` and `examples/`). Enable Pages once with the "GitHub Actions" source.

---
_Rendered with [Cytoscape.js](https://js.cytoscape.org/) and [Dagre](https://github.com/dagrejs/dagre); YAML via [js-yaml](https://github.com/nodeca/js-yaml); PDF via [jsPDF](https://github.com/parallax/jsPDF)._
