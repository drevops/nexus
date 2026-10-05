<p align="center">
  <img width="200" height="200" src="logo.svg" alt="Nexus logo">
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

Nexus is a static web app. Drop a Drupal **exported configuration folder** onto the page and it reconstructs the site's logical content model - bundles, fields and entity-reference relationships - and draws it on an infinite, pannable canvas. From there you can edit the model, or start one from scratch, and save it as a document to open again later. **Everything runs client-side: your configuration never leaves the browser.** None of it is uploaded to any server, which makes it safe to point at client work.

**[Open the app →](https://nexus.drevops.com/)**

![The bundled example content model drawn in Nexus as an overview of its entity types and the references between them](screenshot.png)

## Features

- **100% client-side.** Parsing and rendering happen in the browser; no backend, no upload, no install.
- **Drop a folder.** Choose or drag a config sync directory (or a module's `config/install`). Nexus reads only its YAML files, locally.
- **Faithful visual language.** Each entity type has its own colour and shape, and single / multi / system / calculated fields and Event / API / Callback annotations each have their own symbol (see the [legend](#the-visual-language)).
- **Browsable.** Opens with every field and machine name on show, with tools to collapse it to an entity-only overview, filter by entity type, find and focus an entity, and read a searchable field table.
- **Editable.** Add entities, fields, references, events, APIs and callbacks in Edit mode, rename machine names and attach notes - or build a model from scratch.
- **Saved as a document.** Save the diagram, layout and all, as a `.nexus.json` file and open it again later.
- **Customisable & remembered.** Switch between light and dark themes, recolour entity types, swap their symbols or add types of your own; the choices persist in your browser and apply to every diagram you open.
- **Export.** Export the whole canvas as **PNG** or **SVG**, or the field table as **CSV** - all client-side.

## Installation

There's nothing to install: [open the app](https://nexus.drevops.com/) in a modern browser.

To host your own copy, serve `index.html`, `src/`, `assets/` and `templates/` from any static web server. Opening `index.html` straight from disk won't work, because browsers don't load ES modules over `file://`.

## Usage

1. Open the app (or your own copy - see [Installation](#installation)).
2. **Choose a config folder** or drag one onto the drop zone - the folder of `*.yml` files exported from a Drupal site (its config sync directory), or a module's `config/install`. Or click **Try the example**, **Open a saved diagram** or **Start from scratch**.
3. Explore with the toolbar, switch to **Edit** to change the model, then **Save** it or export it as PNG, SVG or CSV.

Add an `annotations.yml` file to the folder to overlay [events, APIs and callbacks](#annotation-overlay).

## The visual language

The page renders a legend describing every symbol. Nexus derives entities, fields and references from configuration. Event, API, Callback and Calculated symbols come from an optional [annotation overlay](#annotation-overlay), and Edit mode can add events, APIs and callbacks too.

| Symbol | Meaning | Source |
|--------|---------|--------|
| Colored shape, set per entity type | An entity bundle - content type, vocabulary, media, paragraph, block, user or external entity | Config |
| Faded copy of an entity, dashed border | A proxy: a reference's target, drawn beside the field that references it | Config |
| Ellipse, solid border | Single-value field | Config |
| Ellipse, double border | Multi-value field | Config |
| Ellipse, dashed border | System (base) field | Curated per entity type |
| Ellipse, yellow fill | Calculated field | Annotation |
| Diamond | Event | Annotation |
| Hexagon | API | Annotation |
| Rectangle with a method | Callback | Annotation |

By default, content types are rounded rectangles, vocabularies are tags, media are barrels, paragraphs are cut rectangles, blocks are rectangles, users are ellipses and external entities are hexagons; **Settings** changes the color and shape of any type. A field label ending in `*` marks a required field, and reference arrows carry the field's cardinality: `1`, `1..N` for a limit of N, or `1..n` for unlimited.

## Navigating the diagram

The diagram opens laid out left to right, with every field, proxy and machine name on show. The toolbar offers:

- **Find entity** - type a name, then press Enter or the search button to fade everything else and zoom to the matches.
- **Fields** - hide the fields to collapse the diagram to an entity-only overview, or show them again.
- **Proxies** - draw each reference as a faded copy of its target beside the field, or as an edge to the entity itself.
- **Machine names** - show each bundle/field machine name in monospace beneath its symbol.
- **Layout: LR / TB** - switch the flow direction; **Tidy** re-runs the layout.
- **Entities** - an index with per-type filters and field counts; click a bundle to focus it or open its fields.
- **Table** - a searchable table of all fields (or a single entity's) with type, cardinality, requiredness and references.
- **Legend** - what each symbol means.
- **PNG / SVG / CSV** - export the whole canvas or the field table.

The top-right corner holds the About box, a link to this repository, the light/dark theme toggle and **Settings**, where you choose each entity type's colour and symbol or add types of your own. The status bar holds the zoom controls - **Reset**, **Fit**, zoom out, zoom in and a zoom-level menu - and the mouse wheel zooms while dragging the canvas pans. Click a node to focus it and its connections, and right-click an entity to isolate it so it moves together with its fields.

Panels float over the canvas. Drag one by its header, or drop it at the left or right edge (or click its pin) to dock it in a side rail that you can resize.

## Editing

Switch to **Edit** and a palette appears under the toolbar:

- **Content**, **Vocab**, **Media**, **Para**, **Block**, **User** and **External** add an entity. Click one to fill in a form, or drag it onto the canvas to drop one in place.
- **Field** adds a field to an entity and can reuse the definition of a field that already exists. The **+** handles around a selected entity add a field in a single click.
- **Event**, **API** and **Callback** place an annotation: click one and then the canvas, or drag it into place.
- **Connect** lets you drag from a field to an entity to create a reference.

Select a node to edit or delete it in the **Inspector**: an entity's label and machine name; a field's label, machine name, type, cardinality, required flag and references; or an annotation's label, kind and method. Any node can also carry a free-text note, shown as a badge on the canvas.

## Saving diagrams

**Save** downloads the diagram as a `.nexus.json` document holding the model, its layout, the entity colours and symbols, any custom types and the panel arrangement, and **Open** brings it back with every node where you left it. The title box at the top left names the diagram and the files it saves and exports. **New** starts an empty model, and **Import** returns to the import screen to load another config folder.

## Annotation overlay

Some architecture is not expressed in Drupal configuration - integration callbacks, external APIs and domain events. Include a YAML overlay named `annotations.yml` (or `nexus.annotations.yml`) in the folder. This excerpt comes from the one the bundled example ships:

```yaml
title: 'Example content model'
nodes:
  - id: omny_api
    kind: api
    label: 'Omny Studio API'
  - id: create_episodes
    kind: callback
    label: 'Create future episodes'
    method: POST
    attach: node.program
  - id: episode_published
    kind: event
    label: EpisodePublished
    attach: node.episode
edges:
  - { from: episode_published, to: omny_api, label: notifies }
computed_fields:
  node.episode:
    - { name: audio_url, label: 'Audio URL' }
```

- `title` names the diagram.
- `nodes` add Event (`event`), API (`api`) or Callback (`callback`) nodes; a missing or unknown `kind` becomes `event`. `attach` draws an edge from an existing entity, `method` adds a second label line such as an HTTP verb, and `note` adds a note badge.
- `edges` draw explicit links between any 2 nodes.
- `computed_fields` add calculated fields to an existing entity, keyed by its `entity_type.bundle` id.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for local development setup, the linting and testing commands, the Netlify previews for pull requests, how a release deploys to GitHub Pages and how to pull in template updates.

## Privacy

Nexus has no backend. The configuration you import and the diagrams you build stay in your browser's memory and leave it only when you save or export a file; nothing is uploaded to or processed by any server. Your preferences - theme, panel layout, entity colours and symbols, and custom entity types - are kept in the browser's `localStorage`.

The hosted app at [nexus.drevops.com](https://nexus.drevops.com/) counts visits with Google Analytics. It sets Google's cookies and sends Google the usual visit details: the page address, the site that linked you there, your browser and device, and the approximate location Google works out from your IP address. It never sends your configuration, your diagrams or their titles - every hit reports the page title as "Nexus", whatever your diagram is called. A copy you host yourself loads no analytics, because the code ships with an empty measurement ID.

Nexus is provided as is, without warranty of any kind, and the authors accept no responsibility or liability for any data you load into it or create with it.

## License

Nexus is free software, released under the [GNU General Public License, version 2 or later](LICENSE) (GPL-2.0-or-later), matching the Drupal ecosystem it serves.

---
_Rendered with [Cytoscape.js](https://js.cytoscape.org/) and [Dagre](https://github.com/dagrejs/dagre), with a UI built on [Preact](https://preactjs.com/) and [Shoelace](https://shoelace.style/); YAML via [js-yaml](https://github.com/nodeca/js-yaml) and icons from [Lucide](https://lucide.dev/)._

_This repository was created using the [Scaffold](https://getscaffold.dev/) project template_
