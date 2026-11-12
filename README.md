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

## Why

A Drupal content model has a shape of its own. Entity types hold bundles, and bundles hold fields. Some fields come with the entity type, and entity references tie bundles together with a cardinality. Teams that plan or document a Drupal site hit 2 problems:

1. **There's no established way to draw a Drupal content model.** ER diagrams, UML and whiteboards have no symbol for a bundle, a base field, a paragraph or a reference's cardinality. Each team invents a notation of its own, and the next team has to learn it.
2. **There's no easy way to build the diagram from a site that exists.** The model is spread across the site's exported configuration, 1 YAML file per bundle, field storage and field instance. Drawing it means reading those files by hand, and the drawing goes stale when the site changes.

Nexus answers both. It gives a Drupal content model 1 visual language: a color and shape per entity type and a symbol per kind of field. It also reads a site's exported configuration and draws the model from it, so the diagram matches the site.

## What Nexus is

Nexus is a static web app. Drop a Drupal **exported configuration folder** onto the page, and Nexus draws the site's bundles, fields and entity references on a pannable canvas. You can also start from a template or from scratch, edit the model and save it to open again later. **Everything runs in your browser, so your configuration never leaves it.**

**[Open the app →](https://nexus.drevops.com/)**

![Nexus in Edit mode on a conference site's content model, with the Inspector open on the Session content type and its fields and references drawn beside it](screenshot.png)

## Features

- **Client-side.** Nexus parses and draws in the browser, with no backend, upload or install.
- **Reads exported config.** Choose or drag a config sync directory or a module's `config/install`. Nexus reads only its YAML files.
- **Templates.** Open the content model of Drupal CMS or CivicTheme in 1 click (see [Templates](#templates)).
- **A visual language for Drupal.** Each entity type has its own color and shape, and each kind of field and annotation has its own symbol (see [The visual language](#the-visual-language)).
- **Browse and edit.** Collapse the diagram to an entity overview, filter it, find an entity or read a field table. Switch to Edit mode to add entities, fields, references and annotations, with undo and history.
- **Save and export.** Save the diagram as a `.nexus.json` document, or export it as PNG, SVG or CSV.
- **AI agents.** An agent can write a diagram from a screenshot, a spreadsheet or a spec (see [Build a diagram with an AI agent](#build-a-diagram-with-an-ai-agent)).

## Get started

Open [nexus.drevops.com](https://nexus.drevops.com/) in a modern browser. On the landing screen, pick a starting point:

- **Choose a config folder**, or drag one onto the drop zone. Use the folder of `*.yml` files a Drupal site exports (its config sync directory) or a module's `config/install`.
- A [template](#templates).
- **Open a saved diagram**.
- **Start from scratch**.
- [**Create with AI**](#build-a-diagram-with-an-ai-agent).

Explore the diagram with the toolbar, switch to **Edit** to change the model, then click **Save**. To draw events, APIs and callbacks from a config folder, add an [`annotations.yml`](#annotation-overlay) file to it.

## Templates

The landing screen offers 2 ready-made content models:

| Template | Version | What it draws |
|----------|---------|---------------|
| [Drupal CMS](https://www.drupal.org/project/cms) | 2.2.2 | Drupal CMS with its Byte site template: a utility page, a blog post, tags and 5 media types |
| [CivicTheme](https://www.drupal.org/project/civictheme) | 1.13.0 | The government design system: 3 content types built from 31 paragraph types, plus its media types, vocabularies and blocks |

Each template is drawn from the configuration of an exact release. Drupal CMS builds its landing pages with Canvas, so its diagram has no landing page content type.

## The visual language

The **Legend** panel lists every symbol. Nexus draws entities, fields and references from configuration. Events, APIs, callbacks and calculated fields come from an [annotation overlay](#annotation-overlay). Edit mode can also add events, APIs and callbacks.

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

Content types are rounded rectangles, vocabularies are tags, media are barrels, paragraphs are cut rectangles, blocks are rectangles, users are ellipses and external entities are hexagons. **Settings** changes the color and shape of any type. A field label ending in `*` marks a required field. A reference arrow carries the field's cardinality: `1`, `1..N` for a limit of N or `1..n` for unlimited.

## Work with a diagram

A diagram opens in View mode, laid out in columns, with every field, proxy and machine name on show.

### View the diagram

3 switches at the left end of the status bar choose what the diagram shows:

- **Fields** - turn it off for an entity-only overview.
- **Proxies** - draw each reference as a faded copy of its target beside the field, or as an edge to the entity itself.
- **Machine names** - show each machine name beneath its symbol.

The toolbar holds these tools:

- **Find entity** fades everything but the matches and zooms to them.
- **Layout** re-runs the layout. Its arrow picks **Columns**, **LR** (left to right) or **TB** (top to bottom).
- **Tidy up** straightens each entity's fields and lines the entities up near where they are. With an entity, field or proxy selected, it tidies only that entity.
- **Entities** opens an index of bundles with per-type filters.
- **Table** opens a searchable table of fields. Its eye button hides a field and its proxies on the canvas.
- **Legend** lists the symbols, and **History** lists the versions of the diagram.

The mouse wheel or a trackpad pinch zooms, and a right-button drag pans. Click a node to focus it with its connections. Right-click an entity to isolate it with its fields. Double-click a node to switch to Edit mode with that node selected.

Panels float over the canvas. Drag a panel by its header, or click its pin to dock it in a side rail.

### Edit the model

Click **Edit** to edit the model. An amber frame marks Edit mode, and a palette appears under the toolbar:

- **Content**, **Vocab**, **Media**, **Para**, **Block**, **User** and **External** add an entity. Click one to fill in a form, or drag it onto the canvas.
- **Field** adds a field to an entity. The **+** handles around a selected entity do the same in 1 click.
- **Event**, **API** and **Callback** add an annotation.
- **Connect** creates a reference when you drag from a field to an entity.

Select a node to edit or delete it in the **Inspector**. Any node can carry a free-text note. Drag a node to move it, or drag on the empty canvas to select several nodes.

To add several fields at once, select an entity and click **Bulk** in the **Inspector**. Type 1 field per line:

```text
Body, text_with_summary, required
field_tags, entity_reference, unlimited, taxonomy_term.tags
Summary (field_summary), text_long
```

Start each line with a label, a machine name or both, as `Label (machine_name)`. After it, add any of a field type, a cardinality (`1` to `10` or `unlimited`), `required` and the ids of the entities a reference targets. **Copy from** fills the box with another entity's fields.

### Undo and history

**Undo** and **Redo** step through your changes, as do <kbd>Ctrl+Z</kbd> and <kbd>Ctrl+Shift+Z</kbd> or <kbd>Ctrl+Y</kbd> (<kbd>⌘Z</kbd> and <kbd>⇧⌘Z</kbd> on a Mac). Undo covers edits, hidden fields, moved nodes, **Tidy up**, the **Layout** button and the diagram's title. A layout picked from the **Layout** menu, the switches, the filters and **Settings** stay as they are.

The **History** panel lists your last 200 changes. Click a version to go back to it. The history lives in memory, so it starts over when you open another diagram.

### Save and export

**Save** downloads a `.nexus.json` document with the model, its layout, hidden fields, entity colors and symbols, custom types and panel arrangement. **Open** brings the document back with every node in place. The title box at the top left names the diagram and its files.

The arrow beside **Save** opens **Save as**, which saves the document as **JSON**, the canvas as **PNG** or **SVG** or the field table as **CSV**. The arrow beside **Open** offers **Saved diagram…**, **Config folder or template…** and **Create with AI…**.

### Settings

**Settings**, in the top-right corner, holds these choices:

- Each entity type's color and symbol, and types of your own.
- The color of the mode frame for each mode, or no frame.
- **New diagrams**: the layout, the mode and the 3 switches each new diagram opens with.

**Reset to defaults** restores them all. Your browser keeps the settings and applies them to every diagram you open. The top-right corner also holds the light/dark theme toggle.

### Keyboard shortcuts

Press <kbd>F1</kbd> to label every button on screen with its keyboard shortcut. Press <kbd>F1</kbd> again or <kbd>Esc</kbd> to hide the labels. On a Mac keyboard whose top row sets the brightness, hold <kbd>Fn</kbd> as you press <kbd>F1</kbd>.

A Mac labels <kbd>Ctrl</kbd> as <kbd>⌘</kbd>. A text box, a dropdown or an open menu keeps the plain keys for itself, so typing an `f` into **Find entity** doesn't hide the fields. The browser's zoom keys zoom the diagram.

## Annotation overlay

An annotation overlay draws the parts of a site that Drupal configuration leaves out, such as domain events, external APIs and integration callbacks. It's a YAML file named `annotations.yml` or `nexus.annotations.yml`, anywhere in the config folder you import. Nexus reads 1 overlay per import, so keep 1 in the folder. This one describes a conference site:

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

An AI agent can turn a content model you hold in another form into a Nexus diagram. The source can be a screenshot or photo of a diagram, a spreadsheet, a Word or PDF spec or a list of content types and fields. The agent follows the `create-nexus-diagram` skill and writes a `.nexus.json` document.

To hand the skill to your agent, click **Create with AI** on the landing screen, or **Create with AI…** in the menu beside **Open**. Then pick the tab that matches your agent:

| Tab | Use it for |
|-----|------------|
| **Prompt** | An agent that can read web pages, such as Claude Code, Codex or Cursor. The prompt links the skill this site serves |
| **Skill** | A chat that can't read web pages. Copy the whole skill, or download it as `SKILL.md` |
| **Install** | Keeping the skill in a project. The command downloads it into `.claude/skills/create-nexus-diagram/`, where Claude Code reads it |

To use the skill in every Claude Code project, put `SKILL.md` in `~/.claude/skills/create-nexus-diagram/`. Then hand the agent your source and ask for a Nexus diagram.

To open the diagram the agent writes:

1. Paste the document into **Paste the diagram**. The agent's whole reply works too, when it holds the document in a code block.
2. Click **Open diagram**. When the document can't open, the dialog stays open and shows the reason.

A document the agent saved as a file opens with **Open a saved diagram**. Nexus lays it out when it opens.

The site serves 3 files for agents:

- The [`create-nexus-diagram` skill](skills/create-nexus-diagram/SKILL.md), at `https://nexus.drevops.com/skills/create-nexus-diagram/SKILL.md`, maps a source onto entity types, fields and references. It includes a complete example document.
- The [JSON Schema](schema/nexus.schema.json), at `https://nexus.drevops.com/schema/nexus.schema.json`, defines the `.nexus.json` format.
- [`llms.txt`](llms.txt), at `https://nexus.drevops.com/llms.txt`, links both, so an agent given only the site's address finds them.

To check a document from the command line, see [Check a diagram document](CONTRIBUTING.md#check-a-diagram-document).

## Privacy

Nexus has no backend. The configuration you import and the diagrams you build stay in your browser's memory. They leave it only when you save or export a file. Your preferences, such as the theme, the panel layout and the entity colors, stay in the browser's `localStorage`.

Nexus is provided as is, without warranty of any kind, and the authors accept no responsibility or liability for any data you load into it or create with it.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) to run Nexus locally, run the tests, host your own copy or check a diagram document.

## License

Nexus is free software, released under the [GNU General Public License, version 2 or later](LICENSE) (GPL-2.0-or-later), matching the Drupal ecosystem it serves. CivicTheme and Drupal CMS, which the templates draw, are released under the same license.

---
_This repository was created using the [Scaffold](https://getscaffold.dev/) project template_
