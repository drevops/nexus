# The visual language

Nexus gives a Drupal content model 1 set of symbols: a color and shape per entity type and a symbol per kind of field. This page explains what each shape, border and line on the canvas means.

## Symbols

Nexus draws entities, fields and references from configuration. Events, APIs, callbacks and calculated fields come from an [annotation overlay](annotations.md).

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

## Entity shapes

Content types are rounded rectangles, vocabularies are tags, media are barrels, paragraphs are cut rectangles, blocks are rectangles, users are ellipses and external entities are hexagons. You can change the color and shape of each entity type on the **Entity types** tab of [Settings](settings.md#entity-types).

Each entity shows its entity type in italics under its label. When **Machine names** is on, each node shows its machine name below it.

## Fields and references

A field label ending in `*` marks a required field. A reference arrow carries the field's cardinality: `1`, `1..N` for a limit of N or `1..n` for unlimited.

At the **Entities** [detail level](navigating.md#detail-levels), the canvas hides the fields and draws 1 line between each pair of entities that reference each other.

The [Legend](legend.md) panel lists the symbols of the open diagram, with the colors your settings give each entity type.
