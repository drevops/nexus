# Exporting

Nexus saves a diagram as images, spreadsheets, documentation and diagram text, so you can put your content model in a ticket, a wiki or a README. This page covers every format in the **Save as** menu and what each one holds.

## Save in another format

Click the caret beside **Save** in the toolbar, or press `Ctrl`+`Shift`+`S` (`Cmd`+`Shift`+`S` on a Mac), to open the **Save as** menu. Pick a format, and your browser downloads the file. **CSV** opens a submenu of 3 files.

Each file is named after the diagram, in lowercase with hyphens, so a diagram named `Umami 11.4.12` saves its PNG as `umami-11-4-12.png`:

| Menu item | File | What it holds |
|-----------|------|---------------|
| **CSV** > **Bundles** | `<name>-bundles.csv` | 1 row per bundle |
| **CSV** > **Fields** | `<name>-fields.csv` | The [Fields table](fields-table.md), 1 row per field |
| **CSV** > **References** | `<name>-references.csv` | 1 row per reference target |
| **Graphviz DOT** | `<name>.dot` | The diagram as Graphviz DOT text |
| **HTML** | `<name>.html` | A standalone HTML report of the content model |
| **JSON** | `<name>.nexus.json` | The saved diagram, as **Save** writes it. See [Saving and opening](saving.md) |
| **Markdown** | `<name>.md` | Markdown documentation of the content model |
| **Mermaid** | `<name>.mmd` | The diagram as Mermaid text |
| **PNG** | `<name>.png` | An image of the whole diagram |
| **SVG** | `<name>.svg` | A scalable image of the whole diagram |

The **Save as** menu is off while you [compare 2 versions](comparing.md).

## What each export draws

The PNG, SVG, Mermaid and DOT exports draw what the canvas shows. The [detail level](navigating.md#detail-levels), the **Proxies** and **Machine names** switches, the entity types you hide, hidden fields and the [explore view](explore.md) all shape them.

The CSV, Markdown, HTML and JSON exports hold the whole model, including hidden fields and the entity types the canvas hides.

## PNG and SVG

PNG and SVG draw the whole diagram on a white background, including the parts out of view. The PNG is drawn at twice the canvas's size, so it stays sharp when you zoom in. Both draw the lines in your [line style](layouts.md#pick-a-line-style), and each [Note](notes.md) shows its text without formatting.

## CSV

Every CSV file starts with a header row. A spreadsheet runs a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return as a formula. So Nexus puts a `'` before such a cell, unless it's a number, and the spreadsheet shows it as text.

The fields CSV has the columns of the Fields table, a **Used in** column and a row for each bundle with no fields. It keeps the diagram's order, whatever the table's filters and sort. A fields CSV opens back in Nexus as the same entities, fields and references. See [Import a CSV](csv-import.md).

The bundles CSV has the columns `entity_type`, `bundle`, `label`, `description`, `fields`, `referenced_by` and `note`. Its field count leaves out base fields, and it has no row for an `Any <type>` placeholder.

The references CSV has the columns `source_entity_type`, `source_bundle`, `field`, `field_label`, `target_entity_type`, `target_bundle`, `cardinality` and `required`. A field that targets every bundle of a type has `*` as its target bundle.

## Markdown

The Markdown export documents each bundle, its fields and notes, with an optional Mermaid diagram at the top. It starts with a contents list, then groups the bundles by entity type and sorts them by label. Each bundle has its machine name, its description and a table of its fields.

The links in the contents work on GitHub. The **Markdown export** tab of [Settings](settings.md#markdown-export) sets when the diagram is included: for up to 50 entities, which is the default, always or never.

## HTML

The HTML export holds the same documentation as the Markdown export as a standalone page that opens in any browser. The page loads nothing and runs no script, and it has no diagram. Its headings have the same anchors as the Markdown export's.

## Mermaid and Graphviz DOT

Mermaid and Graphviz DOT text keeps the diagram in a README, a pull request or a wiki. Both draw the nodes and edges the canvas shows, in its shapes and colors. DOT keeps each node where the canvas has it, and Mermaid lays the diagram out itself. The Mermaid file uses node shapes that need Mermaid 11.3 or later.

A diagram past Mermaid's 50,000-character limit gets short node ids, then loses machine names and type captions until it fits. A note at the top of the file says what changed. For a site with more than about 100 entities, pick DOT.
