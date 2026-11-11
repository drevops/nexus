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

Nexus is a static web app. Drop a Drupal **exported configuration folder** onto the page and it reconstructs the site's logical content model - bundles, fields and entity-reference relationships - and draws it on an infinite, pannable canvas. From there you can edit the model, or start one from scratch or from a template, and save it as a document to open again later. **Everything runs client-side: your configuration never leaves the browser.** None of it is uploaded to any server, which makes it safe to point at client work.

**[Open the app →](https://nexus.drevops.com/)**

To try changes before they're released, open the [development version](https://drevops-nexus.netlify.app). It runs the latest code merged into `main`.

![Nexus in Edit mode on a conference site's content model, with the Inspector open on the Session content type and its fields and references drawn beside it](screenshot.png)

## Features

- **100% client-side.** Parsing and rendering happen in the browser; no backend, no upload, no install.
- **Drop a folder.** Choose or drag a config sync directory (or a module's `config/install`). Nexus reads only its YAML files, locally.
- **Start from a template.** Load the content model of Drupal CMS or CivicTheme in 1 click, each pinned to a release (see [Templates](#templates)).
- **Faithful visual language.** Each entity type has its own colour and shape, and single / multi / system / calculated fields and Event / API / Callback annotations each have their own symbol (see the [legend](#the-visual-language)).
- **Browsable.** Opens with every field and machine name on show, with tools to collapse it to an entity-only overview, filter by entity type, find and focus an entity, and read a searchable field table.
- **Editable.** Add entities, fields, references, events, APIs and callbacks in Edit mode, rename machine names and attach notes - or build a model from scratch.
- **Undo and history.** Undo and redo your edits, and step back to an earlier version of the diagram from the History panel.
- **Keyboard shortcuts.** Most buttons have a keyboard shortcut, and pressing **F1** labels every button on screen with its shortcut at once (see [Keyboard shortcuts](#keyboard-shortcuts)).
- **Saved as a document.** Save the diagram, layout and all, as a `.nexus.json` file and open it again later.
- **Built by an AI agent.** An AI agent can write a diagram from a screenshot, a spreadsheet or a spec (see [Build a diagram with an AI agent](#build-a-diagram-with-an-ai-agent)).
- **Customisable & remembered.** Switch between light and dark themes, recolour entity types, swap their symbols or add types of your own; the choices persist in your browser and apply to every diagram you open.
- **Export.** Export the whole canvas as **PNG** or **SVG**, or the field table as **CSV** - all client-side. The Export button remembers the last format you picked, so the next export takes 1 click.

## Installation

There's nothing to install: [open the app](https://nexus.drevops.com/) in a modern browser.

To host your own copy, serve `index.html`, `src/`, `assets/` and `templates/` from any static web server. Opening `index.html` straight from disk won't work, because browsers don't load ES modules over `file://`.

## Usage

1. Open the app (or your own copy - see [Installation](#installation)). The light/dark theme toggle sits in the top-right corner of the landing screen too, so you can pick a theme before loading anything.
2. **Choose a config folder** or drag one onto the drop zone - the folder of `*.yml` files exported from a Drupal site (its config sync directory), or a module's `config/install`. Or pick one of the [templates](#templates) beside it, **Open a saved diagram** or **Start from scratch**.
3. Explore with the toolbar, switch to **Edit** to change the model, then **Save** it or export it as PNG, SVG or CSV.

Add an `annotations.yml` file to the folder to overlay [events, APIs and callbacks](#annotation-overlay).

## Templates

No config export to hand? The landing screen offers 2 ready-made content models:

| Template | Version | What it draws |
|----------|---------|---------------|
| [Drupal CMS](https://www.drupal.org/project/cms) | 2.2.2 | Drupal CMS with its Byte site template: a utility page, a blog post, tags and 5 media types |
| [CivicTheme](https://www.drupal.org/project/civictheme) | 1.13.0 | The government design system: 3 content types built from 31 paragraph types, plus its media types, vocabularies and blocks |

Each template is drawn from the configuration of an exact release and ships as a saved diagram in `templates/`, so it opens just like a diagram you've saved yourself. Drupal CMS builds its landing pages with Canvas rather than a content type, so those pages don't appear in its diagram. CivicTheme and Drupal CMS are released under GPL-2.0-or-later, like Nexus.

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

By default the diagram opens in View mode with its entities stacked in columns that fill the screen, with every field, proxy and machine name on show. **Settings** changes how every new diagram opens (see [New diagrams](#new-diagrams)). 3 switches at the left end of the status bar choose what the open diagram shows:

- **Fields** - turn it off to collapse the diagram to an entity-only overview.
- **Proxies** - draw each reference as a faded copy of its target beside the field, or as an edge to the entity itself.
- **Machine names** - show each bundle/field machine name in monospace beneath its symbol.

The toolbar offers:

- **Find entity** - type a name, then press Enter or the search button to fade everything else and zoom to the matches. Each match and its fields land in the middle of the part of the canvas the open panels leave free.
- **Layout** - re-run the current layout, or pick another from the arrow beside it: **Columns** stacks each entity and its fields in columns that fill the screen, grouped by entity type, while **LR** and **TB** lay the whole diagram out as 1 flow, left to right or top to bottom. Your pick applies to the open diagram, and the next diagram opens in the layout **Settings** sets.
- **Tidy** - straighten each entity's fields and line the entities up in columns near where they already are, so a diagram you've dragged around or edited gets neat without being rearranged. Drag an entity roughly into place and Tidy slots it in. Fields keep their order, so a field you drag to a new place among its entity's fields stays there. With an entity, or one of its fields or proxies, selected, Tidy straightens only that entity and leaves the rest of the diagram where it is.
- **Entities** - an index with per-type filters and field counts; click a bundle to focus it or open its fields.
- **Table** - a searchable table of all fields (or a single entity's) with type, cardinality, requiredness and references. The eye at the end of a row hides that field and its proxies on the canvas, and a second click shows them again. The field stays in the model and in the table. The target beside the eye goes to the field on the canvas. A hidden field stays hidden when **Fields** is turned back on, and a layout keeps it beside its entity.
- **Legend** - what each symbol means.
- **History** - the versions of the diagram since you opened it, up to your last 200 changes (see [Undo and history](#undo-and-history)).
- **Undo / Redo** - step back and forward through your changes.
- **Export** - export the whole canvas as PNG or SVG, or the field table as CSV. Pick a format from the arrow beside it and the button keeps that format, so the next press exports it straight away.

The top-right corner holds the About box, a link to this repository, the light/dark theme toggle and **Settings**, where you choose each entity type's color and symbol, add types of your own and set how new diagrams open. The right end of the status bar holds the zoom controls: **Reset**, **Fit**, zoom out, zoom in and a zoom-level menu. The mouse wheel or a trackpad pinch zooms the diagram, and a drag with the right mouse button pans it in either mode. The browser's zoom keys, <kbd>Ctrl</kbd> with <kbd>+</kbd>, <kbd>-</kbd> or <kbd>0</kbd>, zoom the diagram and leave the page at its size. A pinch over the toolbar or a panel does nothing. Click a node to focus it and its connections, and right-click an entity to isolate it with its fields. Nodes stay in place in View mode. To move a node, double-click it: Nexus switches to Edit with that node selected.

Panels float over the canvas. Drag one by its header, or drop it at the left or right edge (or click its pin) to dock it in a side rail that you can resize. The pin stands upright in blue on a docked panel and leans over on a floating one. To move a docked panel up or down its rail, or to the other rail, drag the grip at the left of its header. To move a docked panel out onto the canvas, drag the rest of its header.

A docked panel grows only as tall as its content, and you can drag its bottom edge to make it shorter. The Inspector always takes the height of its form, and the other panels in its rail shrink or move further down the rail to make room.

### New diagrams

The **New diagrams** section of **Settings** sets how each diagram opens:

| Setting | Default | What it sets |
|---------|---------|--------------|
| **Layout** | Columns | The layout the diagram is drawn in |
| **Mode** | View | View or Edit |
| **Fields** | On | The **Fields** switch |
| **Proxies** | On | The **Proxies** switch |
| **Machine names** | On | The **Machine names** switch |

The settings apply to every config folder you import, every template and **Start from scratch**. A saved diagram opens with its nodes where you saved them, and the other 4 settings still apply. Edit mode needs fields, so a diagram that opens in Edit mode shows them whatever **Fields** says. A layout picked from the toolbar or a flipped switch changes the open diagram only. **Reset to defaults** restores the settings in this table, along with the colors and symbols.

## Editing

Switch to **Edit** and an amber frame appears inside the canvas edge, so you can tell the modes apart at a glance. To change the frame's color for each mode or turn it off, use the **Mode frame** section of **Settings**. **Reset to defaults** restores it with the type colors and symbols.

Edit mode also shows a palette under the toolbar:

- **Content**, **Vocab**, **Media**, **Para**, **Block**, **User** and **External** add an entity. Each button shows its type's symbol and color from **Settings**. Click one to fill in a form, and the new entity lands in the clear spot nearest the middle of the view. Drag one onto the canvas to drop it in place.
- **Field** adds a field to an entity and can reuse the definition of a field that already exists. The **+** handles around a selected entity add a field in a single click.
- **Event**, **API** and **Callback** place an annotation: click one and then the canvas, or drag it into place.
- **Connect** lets you drag from a field to an entity to create a reference.

In Edit mode, drag a node with the left mouse button to move it. To move several nodes at once, drag on the empty canvas to draw a box around them, then drag any of them. A box selects every node it touches, and each move is 1 step in the history. After you right-click an entity to isolate it, dragging any of its fields moves the entity and all its fields.

Select a node to edit or delete it in the **Inspector**: an entity's label and machine name; a field's label, machine name, type, cardinality, required flag and references; or an annotation's label, kind and method. Any node can also carry a free-text note, shown as a badge on the canvas.

A screen that belongs to an entity shows a breadcrumb at the top of the **Inspector**, such as **Blog post › Featured image**. That covers a field, a new field and the bulk form. Click the entity's name to go back to its form.

To add several fields at once, select an entity and click **Bulk** in the **Inspector**. Type 1 field per line, and the **Inspector** previews each field under the text box:

```text
Body, text_with_summary, required
field_tags, entity_reference, unlimited, taxonomy_term.tags
Summary (field_summary), text_long
```

Start each line with a label, a machine name or both, as `Label (machine_name)`. A label alone gets a `field_` machine name. The rest of the line holds any of these, split by commas or tabs:

- A field type, such as `string` or `entity_reference`.
- A cardinality: `1` to `10`, or `unlimited`.
- `required`.
- The id of each entity a reference field targets, such as `taxonomy_term.tags`.

A machine name that another entity already uses takes that field's label, type and cardinality. While any line has an error, the button counts the lines to fix and adds nothing. Undo removes a whole bulk add in 1 step.

To copy fields from another entity, pick it from **Copy from**. Its fields land in the text box as lines you can edit before you add them. Base fields such as `title` belong to their entity type, so they stay behind, and so do the fields this entity already has.

## Undo and history

**Undo** and **Redo** in the toolbar step back and forward through your changes, and so do `Ctrl+Z` and `Ctrl+Shift+Z` or `Ctrl+Y` (`⌘Z` and `⇧⌘Z` on a Mac). Every change to the diagram counts: adding, renaming and deleting entities, fields, references and annotations, editing them in the Inspector, hiding or showing a field from the **Table**, dragging nodes, **Tidy**, re-running the layout with the **Layout** button and renaming the diagram. Typing into a field is 1 step, however many characters it takes. While a text box has the focus, the shortcuts undo your typing there instead.

**History** opens a panel listing the versions of the diagram since you opened it, newest first, with the time of each change. It keeps your last 200 changes, so in a longer session the oldest ones leave the list. Click a version to go back to it. The versions after it stay in the list, greyed out, so you can jump forward again until your next edit replaces them.

Undo covers what the diagram holds, not how it's shown, so it leaves the **Fields** and **Proxies** switches, the layout you pick from the **Layout** menu and the entity type filters alone, along with your colors, symbols and custom types. The history lives in memory only: it isn't saved with the document, and it starts over when you open, import or start another diagram.

## Saving diagrams

**Save** downloads the diagram as a `.nexus.json` document holding the model, its layout, the fields you've hidden, the entity colours and symbols, any custom types and the panel arrangement, and **Open** brings it back with every node where you left it. The title box at the top left names the diagram and the files it saves and exports. **New** starts an empty model, and **Import** returns to the import screen to load another config folder or template.

## Keyboard shortcuts

Press **F1** and every button on screen shows its keyboard shortcut in a small label. Press F1 again or **Esc** to hide the labels. They also go as soon as you use a shortcut, click, scroll or resize the window, since any of those can move the buttons. On a Mac keyboard whose top row sets the brightness and volume, hold **Fn** as you press F1.

The table uses the Windows and Linux names. A Mac labels the same keys with **⌘** for Ctrl, **⌥** for Alt and **⇧** for Shift, so **Save** reads `⌘S` there.

| Button | Shortcut |
|--------|----------|
| About | `?` |
| Light / dark theme | `D` |
| Settings | `,` |
| New | `Alt+N` |
| Import | `Alt+I` |
| Open | `Ctrl+O` |
| Save | `Ctrl+S` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` or `Ctrl+Y` |
| Export | `Ctrl+E` |
| The arrow beside Export | `Ctrl+Shift+E` |
| View / Edit | `V` / `E` |
| Find entity | `/` |
| Fields | `F` |
| Proxies | `P` |
| Machine names | `M` |
| Layout | `L` |
| The arrow beside Layout | `Shift+L` |
| Tidy | `T` |
| Entities | `1` |
| Table | `2` |
| Legend | `3` |
| History | `4` |
| Content, Vocab, Media, Para, Block, User, External | `Shift+C`, `Shift+V`, `Shift+M`, `Shift+P`, `Shift+B`, `Shift+U`, `Shift+X` |
| Field, Event, API, Callback | `Shift+F`, `Shift+E`, `Shift+A`, `Shift+K` |
| Connect | `C` |
| Reset / Fit | <kbd>0</kbd> or <kbd>Ctrl+0</kbd> / <kbd>Shift+1</kbd> |
| Zoom out / zoom in | <kbd>-</kbd> or <kbd>Ctrl+-</kbd> / <kbd>+</kbd>, <kbd>=</kbd> or <kbd>Ctrl+=</kbd> |
| Zoom level | `Z` |

The palette shortcuts work in Edit mode, where the palette is on screen. One that opens a form puts the cursor in its machine name, so you can type the name straight away. On the landing screen, **Choose a config folder**, **Open a saved diagram** and **Start from scratch** take the shortcuts of **Import**, **Open** and **New**, `D` switches the theme, `1` and `2` load the templates in the order they're listed, and **Esc** closes the screen when there's a diagram behind it.

The shortcuts stay out of your way while you type. A text box, a dropdown or an open menu keeps the plain keys for itself, so typing an `f` into **Find entity** doesn't hide the fields. In a text box only the **Ctrl** shortcuts work, apart from undo and redo, which undo your typing there - so **Ctrl+S** saves the diagram while you're renaming it. Hold a key down and only undo, redo and the zoom keys repeat.

## Annotation overlay

An annotation overlay draws the parts of a site's architecture that Drupal configuration leaves out, such as domain events, external APIs and integration callbacks. It's a YAML file named `annotations.yml` or `nexus.annotations.yml`, anywhere in the config folder you import. Nexus reads 1 overlay per import, so keep 1 in the folder. This one describes a conference site:

```yaml
title: 'Example content model'
nodes:
  - id: ticketing_api
    kind: api
    label: 'Ticketing API'
  - id: sync_registrations
    kind: callback
    label: 'Sync registrations'
    method: POST
    attach: node.event
  - id: session_published
    kind: event
    label: SessionPublished
    attach: node.session
edges:
  - { from: session_published, to: ticketing_api, label: notifies }
computed_fields:
  node.session:
    - { name: duration, label: 'Duration' }
```

Every key is optional. The following table lists what each key draws:

| Key | What it draws |
|-----|---------------|
| `title` | The diagram's title, in place of `Content model` |
| `nodes` | 1 Event, API or Callback node per item |
| `nodes[].id` | The node's id, which `attach` and `edges` refer to. An item without an `id` draws nothing |
| `nodes[].kind` | The node's symbol: `event` (diamond), `api` (hexagon) or `callback` (rounded rectangle). A missing or unknown kind draws an Event |
| `nodes[].label` | The text in the node. Defaults to its `id` |
| `nodes[].attach` | An edge to the node from the node with this id, such as `node.event` |
| `nodes[].method` | A second line of text in the node, such as an HTTP verb |
| `nodes[].note` | A note badge that shows this text |
| `edges` | 1 edge between 2 nodes per item |
| `edges[].from`, `edges[].to` | The ids of the edge's start and end nodes. An item without both draws nothing |
| `edges[].label` | The text on the edge. Defaults to none |
| `computed_fields` | Calculated fields, listed under the id of the entity they belong to, such as `node.session` |
| `computed_fields.<id>[].name` | The field's machine name. An item without a `name` draws nothing |
| `computed_fields.<id>[].label` | The field's label. Defaults to its `name` |

`attach`, `edges` and `computed_fields` find nodes by id:

- An entity's id is its entity type and bundle, joined by a dot: `node.session`.
- A field's id is `field:`, its entity's id, a colon and the field's machine name: `field:node.session:field_speakers`.
- An annotation's id is the `id` it's given in `nodes`. Give each annotation an `id` that no other node has.

An `attach`, an edge or a `computed_fields` entry that names an id the diagram doesn't have draws nothing. `computed_fields` takes entity ids only.

## Build a diagram with an AI agent

An AI agent can turn a content model you hold in another form into a Nexus diagram. The source can be a screenshot or photo of a diagram, a spreadsheet, a Word or PDF spec or a list of content types and fields. The agent writes a `.nexus.json` document, and you open it with **Open a saved diagram**.

This repository gives the agent 2 files:

- The [`create-nexus-diagram` skill](skills/create-nexus-diagram/SKILL.md) holds the steps for mapping a source onto entity types, fields and references. It also covers checking the result and includes a complete example document.
- The [JSON Schema](schema/nexus.schema.json) defines the `.nexus.json` format. The app serves it at `https://nexus.drevops.com/schema/nexus.schema.json`.

Give the skill to your agent in 1 of 2 ways:

- In Claude Code, copy the `skills/create-nexus-diagram` folder into `~/.claude/skills/`, or into `.claude/skills/` in your project.
- In any other agent, attach `SKILL.md` or give the agent its URL: `https://raw.githubusercontent.com/drevops/nexus/main/skills/create-nexus-diagram/SKILL.md`.

Then hand the agent your source and ask for a Nexus diagram. The agent leaves the layout out, so Nexus lays the diagram out when you open it.

To check a document before you open it, run this command in a clone of this repository:

```bash
npm run check-diagram -- path/to/diagram.nexus.json
```

The command prints each error and warning with the JSON Pointer of the part it's about, and `OK` for a document with neither. An error marks a break in the format or a part of the model that gets lost, such as 2 entities with the same id. A warning marks a part that opens but isn't drawn, such as a reference to an entity the document doesn't define. The command exits with 1 when any document has an error.

## Built with

Nexus has no backend and no build step. The page loads its own ES modules from `src/` and these libraries from `assets/vendor/`:

- [Preact](https://preactjs.com/) and [htm](https://github.com/developit/htm) render the interface.
- [Shoelace](https://shoelace.style/) supplies the buttons, menus and form controls.
- [Cytoscape.js](https://js.cytoscape.org/) draws the diagram, with [Dagre](https://github.com/dagrejs/dagre) and [cytoscape-dagre](https://github.com/cytoscape/cytoscape.js-dagre) for the layouts and [cytoscape-svg](https://github.com/kinimesi/cytoscape-svg) for the SVG export.
- [js-yaml](https://github.com/nodeca/js-yaml) reads the configuration files.

The icons come from [Lucide](https://lucide.dev/).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for local development setup, the linting and testing commands, the Netlify previews for pull requests, how a release deploys to GitHub Pages and how to pull in template updates.

## Privacy

Nexus has no backend. The configuration you import and the diagrams you build stay in your browser's memory and leave it only when you save or export a file; nothing is uploaded to or processed by any server. Your preferences - theme, panel layout, the settings new diagrams open with, entity colours and symbols, custom entity types and the last export format - are kept in the browser's `localStorage`.

Nexus is provided as is, without warranty of any kind, and the authors accept no responsibility or liability for any data you load into it or create with it.

## License

Nexus is free software, released under the [GNU General Public License, version 2 or later](LICENSE) (GPL-2.0-or-later), matching the Drupal ecosystem it serves.

---
_This repository was created using the [Scaffold](https://getscaffold.dev/) project template_
