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
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/drevops/nexus/badge)](https://scorecard.dev/viewer/?uri=github.com/drevops/nexus)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/16651/badge)](https://www.bestpractices.dev/projects/16651)

</div>

---

## Why

A Drupal content model has a shape of its own. Entity types hold bundles, and bundles hold fields. Some fields come with the entity type, and entity references tie bundles together with a cardinality. Teams that plan or document a Drupal site hit 2 problems:

1. **There's no established way to draw a Drupal content model.** ER diagrams, UML and whiteboards have no symbol for a bundle, a base field, a paragraph or a reference's cardinality. Each team invents a notation of its own, and the next team has to learn it.
2. **There's no easy way to build the diagram from a site that exists.** The model is spread across the site's exported configuration, 1 YAML file per bundle, field storage and field instance. Drawing it means reading those files by hand, and the drawing goes stale when the site changes.

Nexus answers both. It gives a Drupal content model 1 [visual language](#the-visual-language): a color and shape per entity type and a symbol per kind of field. It also reads a site's exported configuration and draws the model from it, so the diagram follows the site's own config. When the model lives in a spreadsheet, a screenshot or a spec instead, an [AI agent](#build-a-diagram-with-an-ai-agent) can write the diagram.

Nexus reads the fields of content types, vocabularies, media, paragraphs, blocks and users. It skips fields on other entity types. It draws base fields from a curated list per entity type. Review a diagram of a site with custom entity types for what it leaves out.

## What Nexus is

Nexus is a static web app. Give it a Drupal config sync directory or a module's `config/install`, and it draws the site's bundles, fields and entity references. You can also start from a [template](#templates), from scratch or from a document an AI agent wrote, then edit the model and save it as a `.nexus.json` document. **Everything runs in your browser, so your configuration never leaves it.**

**[Open the app →](https://nexus.drevops.com/)**

![Nexus in Edit mode on a conference site's content model, with the Inspector open on the Session content type and its fields and references drawn beside it](screenshot.png)

## Features

- **Client-side.** Nexus parses and draws in the browser, with no backend, upload or install.
- **Reads exported config.** Nexus reads only the YAML files of the folder you give it.
- **Descriptions and field settings.** Bundle descriptions, help text, default values, allowed values and translatability show in tooltips, the Inspector, the Fields table and its CSV. Tooltips and the Fields table draw basic formatting in help text and descriptions, such as `<em>` and `<strong>`, and drop scripts and other markup.
- **Shared fields.** The Fields table and its CSV count the bundles of an entity type that have each field. The field Inspector lists the other bundles with the label each one gives the field.
- **Templates.** The content models of Drupal CMS, CivicTheme, the Umami demo, Thunder and Open Social open in 1 click.
- **CSV import.** Write a content model in a spreadsheet with 1 row per field and open it as a diagram. See [Import a CSV](#import-a-csv).
- **Editable.** Add and change entities, fields, references and annotations, with undo and history.
- **Notes on the canvas.** A Note holds text in Markdown, anywhere on the diagram. See [Notes](#notes).
- **Field editing in the Fields table.** Click a cell to change a field's label, machine name, type, cardinality, references, help text, default value, allowed values or translatability. Tick **Req** to make a field required.
- **Checks.** The Checks panel lists the problems in the model after every edit, such as a reference with no target or a field name with 2 types. Click a problem to go to it.
- **Saved as a document.** A `.nexus.json` document holds the model and its layout, and a [JSON Schema](schema/nexus.schema.json) defines the format.
- **Exports.** PNG and SVG images of the diagram, and CSV files of its fields, bundles and references. A Markdown page documents each bundle, its fields and notes, with an optional Mermaid diagram. A standalone HTML report holds the same documentation and opens in any browser.
- **Shared as a link.** **Copy link** puts the whole diagram inside a link. See [Shared links](#shared-links).
- **Built by AI agents.** An agent can write a diagram from a screenshot, a spreadsheet or a spec.

## Build a diagram with an AI agent

An AI agent can turn a content model you hold in another form into a Nexus diagram. The source can be a screenshot or photo of a diagram, a spreadsheet, a Word or PDF spec or a list of content types and fields. The agent follows the `create-nexus-diagram` skill and writes a `.nexus.json` document that Nexus opens.

The site serves 3 files for agents:

- The [`create-nexus-diagram` skill](skills/create-nexus-diagram/SKILL.md), at `https://nexus.drevops.com/skills/create-nexus-diagram/SKILL.md`, maps a source onto entity types, fields and references. It includes a complete example document.
- The [JSON Schema](schema/nexus.schema.json), at `https://nexus.drevops.com/schema/nexus.schema.json`, defines the `.nexus.json` format.
- [`llms.txt`](llms.txt), at `https://nexus.drevops.com/llms.txt`, links both, so an agent given only the site's address finds them.

An agent that can read web pages, such as Claude Code, Codex or Cursor, needs only a prompt that links the skill. To keep the skill in a project for Claude Code, download it into `.claude/skills/`:

```bash
curl -sSL --create-dirs -o .claude/skills/create-nexus-diagram/SKILL.md https://nexus.drevops.com/skills/create-nexus-diagram/SKILL.md
```

To use the skill in every Claude Code project, put `SKILL.md` in `~/.claude/skills/create-nexus-diagram/` instead.

**Create with AI** in the app copies the prompt, the skill or this command for you, and opens the document the agent writes. The agent leaves the layout out, so Nexus lays the diagram out when it opens. To check a document from the command line, see [Check a diagram document](CONTRIBUTING.md#check-a-diagram-document).

## Templates

Nexus ships 5 ready-made content models:

| Template | Version | What it draws |
|----------|---------|---------------|
| [Drupal CMS](https://www.drupal.org/project/cms) | 2.2.2 | Drupal CMS with its Byte site template: a utility page, a blog post, tags and 5 media types |
| [CivicTheme](https://www.drupal.org/project/civictheme) | 1.13.0 | The government design system: 3 content types built from 31 paragraph types, plus its media types, vocabularies and blocks |
| [Umami](https://www.drupal.org/docs/umami-drupal-demonstration-installation-profile) | 11.4.12 | Drupal core's food magazine demo: articles, recipes, pages, 2 vocabularies, 5 media types and 4 block types |
| [Thunder](https://www.thunder.org) | 8.4.7 | The Drupal distribution for professional publishers: 3 content types built from 9 paragraph types, plus 7 media types, channels and tags |
| [Open Social](https://www.drupal.org/project/social) | 13.1.0 | The community and intranet distribution: topics, events, pages, albums, landing pages and courses, with 20 paragraph types, 11 vocabularies, 1 media type and 9 block types |

Each template is drawn from the configuration of an exact release. Drupal CMS builds its landing pages with Canvas, so its diagram has no landing page content type. Umami ships with Drupal core, so its version is the core release it comes from. Open Social keeps groups, profiles and posts in entity types that Nexus doesn't draw, so the diagram leaves out their fields. A field that references a group points to a placeholder entity.

## Import a CSV

A CSV file can hold a content model with 1 row per field. To start from an example, pick **Open > CSV template** in the toolbar and fill the file in with any spreadsheet app.

To open a CSV file as a diagram, pick **Open > CSV file…** in the toolbar or drop the file on the landing screen. Nexus lays the diagram out and titles it after the filename.

The import reads cells separated by commas, semicolons or tabs, taking the separator the header row uses most. It matches these columns by their header, in any order and case:

| Column | What it holds | When the cell is empty |
|--------|---------------|------------------------|
| Entity type | The entity type's machine name, label or bundle noun, such as `node`, `Content type` or `Paragraph type`. Any other value adds a custom entity type | The row is an error |
| Bundle | The bundle's machine name | The machine name of **Entity** |
| Entity | The bundle's label | The label from another row of the bundle, or a label made from the bundle's machine name |
| Field | The field's label | A label made from the field's machine name |
| Machine name | The field's machine name | `field_` and the machine name of **Field** |
| Field type | The Drupal field type, such as `string` or `entity_reference_revisions` | `entity_reference` on a row with references, `string` on any other row |
| Cardinality | `1`, a number above 1, `1..5` or `1..n` for unlimited | `1` |
| Required | `yes` or `no` | `no` |
| References | The entities the field references, separated by `;`. Write each as `Tags (taxonomy_term.tags)`, as an entity id or as the label of an entity in the file. `media.*` or `media` references every media type | None |
| Help text | The field's help text | None |
| Default | The field's default value | None |
| Allowed values | The field's allowed values, separated by `;`, each written as `Wide (wide)` or `wide\|Wide` | None |
| Translatable | `yes` or `no` | Unknown |

A row with an entity type and a bundle but no field adds a bundle with no fields. A base field, such as `title` on a content type, imports as a system field. A reference to an entity the file doesn't have adds that entity to the diagram, as a config import does. The import ignores any other column.

**Save as > CSV > Fields** writes the Fields table with the same columns and a **Used in** column. A CSV saved that way imports as the same entities, fields and references. Notes, bundle descriptions, hidden fields, annotations and the layout stay out of the CSV.

When a row has a problem, Nexus opens nothing and lists the first 5 problems with their row numbers. The header is row 1.

## The visual language

Nexus draws entities, fields and references from configuration. Events, APIs, callbacks and calculated fields come from an [annotation overlay](#annotation-overlay).

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
| Rounded rectangle with a method | Callback | Annotation |
| Yellow rectangle with formatted text | Note | Annotation |

Content types are rounded rectangles, vocabularies are tags, media are barrels, paragraphs are cut rectangles, blocks are rectangles, users are ellipses and external entities are hexagons. A field label ending in `*` marks a required field. A reference arrow carries the field's cardinality: `1`, `1..N` for a limit of N or `1..n` for unlimited.

## Notes

A Note holds text anywhere on the diagram. To add one, switch to **Edit**, click **Note** in the **Add** bar (<kbd>Shift</kbd>+<kbd>N</kbd>) and click the canvas. Write the text in the Inspector. The Note grows to fit it and wraps lines at 240 pixels.

A Note reads this Markdown:

| Markdown | Draws |
|----------|-------|
| `# Heading`, `## Heading`, `### Heading` | A heading. Levels 4 to 6 draw as level 3 |
| `**bold**` | **Bold** text |
| `*italic*` or `_italic_` | *Italic* text |
| `__underline__` | Underlined text |
| `~~strikethrough~~` | ~~Struck-through~~ text |
| `` `code` `` | Code |
| `[label](https://example.com)` | A link. Hover over it to see its address |
| A blank line | A new paragraph |

A backslash keeps the next punctuation mark as written, so `\*` draws `*`. An underscore inside a word stays as written, so `field_tags_more` draws as typed. HTML shows as written, and a link never opens a page. PNG and SVG exports show each Note's text without formatting.

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
| `nodes` | 1 Event, API, Callback or Note node per item |
| `nodes[].id` | The node's id, which `attach` and `edges` refer to. An item without an `id` draws nothing |
| `nodes[].kind` | The node's symbol: `event` (diamond), `api` (hexagon), `callback` (rounded rectangle) or `note` (a [Note](#notes)). A missing or unknown kind draws an Event |
| `nodes[].label` | The text in the node. Defaults to its `id`. A Note doesn't draw it |
| `nodes[].attach` | An edge to the node from the node with this id, such as `node.event` |
| `nodes[].method` | A second line of text in the node, such as an HTTP verb |
| `nodes[].note` | A note badge that shows this text. A Note draws this text as its Markdown instead |
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

## Shared links

**Copy link** in the Save menu puts the whole diagram inside the link, after `#doc=`. The diagram travels in the link itself. Anyone who opens the link sees the same model, layout and colors. Add `&focus=<entity id>`, such as `&focus=node.event`, to center the diagram on 1 bundle.

### Link protection

Nexus compresses the diagram with `deflate`, which ends the data with an Adler-32 checksum of the diagram. A chat app or a bad copy can change a character of the link, and the checksum then stops matching. Nexus shows "Could not open that diagram: The link is incomplete or damaged." and opens nothing.

The checksum catches only accidental damage, because anyone can write a new link with a matching checksum. Treat a link like a file from the person who sent it. Nexus reads every link's diagram as data and runs none of it:

- Labels, notes and descriptions are drawn as text, so markup in them shows as written. A Note formats only its [Markdown](#notes).
- An entity type's color, symbol and name go through the checks listed under [Security](#security). Any other value falls back to the default.
- The Content Security Policy runs only Nexus's own scripts, so a link can't run code in your browser.
- Unpacking stops at 5 MB, so a crafted link can't fill the page's memory.
- A `focus` that names anything but an entity is ignored.
- Opening a link changes none of your stored settings, and the link carries no panel layout.

### Link limits

A link has these limits:

- Copy link hands out links of up to 32,000 characters, counting the page address. For a bigger diagram, the dialog shows the link's length and offers **Save .nexus.json** instead.
- Each character of a link holds about 10 bytes of diagram, and each node's position adds about 17 characters. The CivicTheme template, with 49 entities and 270 fields, makes a link of about 14,000 characters with its layout.
- Chat apps, ticket trackers and email clients can cut or wrap a long link. If a link fails to open, send the `.nexus.json` file.
- A link someone else built can be longer than 32,000 characters and still opens. Its diagram can unpack to at most 5 MB.

## Privacy

Nexus has no backend. The configuration you import and the diagrams you build stay in your browser's memory. They leave it only when you save or export a file, or copy a link, which carries the diagram inside it. Your preferences, such as the theme, the panel layout and the entity colors, stay in the browser's `localStorage`.

Nexus is provided as is, without warranty of any kind, and the authors accept no responsibility or liability for any data you load into it or create with it.

## Security

Nexus opens files from anywhere: config folders, `.nexus.json` documents, links and replies pasted into **Create with AI**. It reads each one as data and runs none of it:

- Text from a file is drawn as text, so markup in a label shows as written.
- An entity type's color must be a 6- or 8-digit hex value, its symbol 1 of the listed shapes and its name a machine name. Any other value falls back to the default. The same checks apply to the settings stored in your browser.
- A Content Security Policy in `index.html` lets the page run only its own scripts and fetch only its own files and the `data:` icons Shoelace draws.

The page sets no cookies and keeps only your preferences in `localStorage` (see [Privacy](#privacy)).

Each library in `assets/vendor/` is the published npm build that [`vendor.json`](vendor.json) names, byte for byte. CI checks the files against npm on every run.

[`SECURITY.md`](SECURITY.md) explains how to report a vulnerability and how to verify a release.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) to run Nexus locally, run the tests, host your own copy or check a diagram document.

## License

Nexus is free software, released under the [GNU General Public License, version 2 or later](LICENSE) (GPL-2.0-or-later), matching the Drupal ecosystem it serves. CivicTheme, Drupal CMS, Drupal core's Umami demo, Thunder and Open Social, which the templates draw, are released under the same license.

---
_This repository was created using the [Scaffold](https://getscaffold.dev/) project template_
