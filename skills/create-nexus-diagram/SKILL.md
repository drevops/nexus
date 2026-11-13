---
name: create-nexus-diagram
description: Use when turning any description of a Drupal content model - a screenshot or photo of a diagram or whiteboard, a spreadsheet, a Word or PDF spec, a site map, a pasted list of content types and fields - into a Nexus diagram document (.nexus.json) that opens in Nexus at https://nexus.drevops.com. Triggers on "make a Nexus diagram from this", "convert this to .nexus.json", "import this content model into Nexus", "draw this content model in Nexus".
---

# Create a Nexus diagram

[Nexus](https://nexus.drevops.com) draws a Drupal content model as a diagram. It opens a `.nexus.json` document with **Open a saved diagram**, so whatever the source is, the job is to write that document. The format is defined by a JSON Schema:

- Published: `https://nexus.drevops.com/schema/nexus.schema.json`
- In the repository: [`schema/nexus.schema.json`](https://github.com/drevops/nexus/blob/main/schema/nexus.schema.json)

The schema is the contract. Follow this skill to fill it in from a source that wasn't written for Nexus.

## Steps

1. **Read the whole source first.** List every bundle, every field and every relationship before you write any JSON. In an image, read every label, arrow and legend. When you can't read something, don't guess: leave it out and say so in your report, or record it in a `note`.
2. **Map each bundle to an entity type** (see [Entity types](#entity-types)).
3. **Map each field to a field type, a kind and a cardinality** (see [Field types](#field-types) and [Kind and cardinality](#kind-and-cardinality)).
4. **Name everything** (see [Names and ids](#names-and-ids)).
5. **Connect the references** (see [References](#references)).
6. **Record descriptions and field settings** the source gives (see [Descriptions and field settings](#descriptions-and-field-settings)).
7. **Add annotations** for events, APIs and callbacks the source shows (see [Annotations](#annotations)).
8. **Write the document** (see [Write the document](#write-the-document)).
9. **Check it** (see [Check the document](#check-the-document)) and fix every error.
10. **Report** the filename, what you assumed and what you couldn't read (see [Report back](#report-back)).

## Entity types

| Entity type | Label | Use it for |
|-------------|-------|------------|
| `node` | Content type | Pages, articles, events, products - anything an editor creates as a page |
| `taxonomy_term` | Vocabulary | Tags, categories, topics, locations - lists of terms used to classify |
| `media` | Media | Images, documents, videos, audio, remote videos |
| `paragraph` | Paragraph | Reusable components embedded in a page: text blocks, galleries, cards, accordions |
| `block_content` | Block | Custom blocks placed in regions, such as a footer or a promo banner |
| `user` | User | User accounts and profiles |
| `external` | External entity | Records that live in another system, such as a CRM contact |

Any other Drupal entity type, such as `commerce_product`, is fine. Add it to `customTypes` with a label, so the legend names it:

```json
"customTypes": [{ "type": "commerce_product", "label": "Product" }]
```

## Field types

Use the Drupal field type the source names. When it names none, pick from this table:

| Field type | Use it for |
|------------|------------|
| `string` | A short single line of text: a name, a code, a subtitle |
| `string_long` | Plain text over several lines, without formatting |
| `text_long` | Formatted text |
| `text_with_summary` | A body with a separate summary or teaser |
| `boolean` | Yes or no: a checkbox, a flag, "featured" |
| `integer` | A whole number: a count, a year, a weight |
| `decimal` | A number with a fraction: a price, a measurement |
| `datetime` | A date, or a date and time |
| `link` | A URL, or a link with a title |
| `email` | An email address |
| `list_string` | A choice from a fixed set of options: a select list, radios |
| `image` | An image stored on the bundle itself |
| `file` | An attachment or a download stored on the bundle itself |
| `entity_reference` | A link to another entity: tags, media, related content, an author |
| `entity_reference_revisions` | Paragraphs: components embedded in the bundle |

Other Drupal field types, such as `telephone`, `address` or `daterange`, are fine when the source calls for them. A computed value, such as an age or a duration, takes the field type `computed` and the kind `calculated`.

## Kind and cardinality

Every field has a `kind`, and `cardinality` says how many values it holds:

| The source says | `kind` | `cardinality` |
|-----------------|--------|---------------|
| 1 value | `single` | `1` |
| Up to N values, N above 1 | `multi` | N |
| Many, unlimited, a list, a plural name such as "Tags" | `multi` | `-1` |
| A base field of the entity type, from the following list | `system` | `1` |
| A value worked out from other fields | `calculated` | `1` |

Set `required: true` when the source marks a field as required: an asterisk, "required", "mandatory".

Drupal gives each built-in entity type base fields that no export lists. Nexus adds these when it imports configuration, so add them too, with the kind `system`, unless the source lists its own:

- `node`: `title` Title (`string`, required), `uid` Author (`entity_reference`), `status` Published (`boolean`), `created` Authored on (`created`)
- `taxonomy_term`: `name` Name (`string`, required), `description` Description (`text_long`)
- `media`: `name` Name (`string`, required), `status` Published (`boolean`)
- `block_content`: `info` Block description (`string`, required)
- `user`: `name` Username (`string`, required), `mail` Email (`email`), `roles` Roles (`entity_reference`), `status` Status (`boolean`)

## Names and ids

- **Machine names** - `entityType`, `bundle`, `name`, `fieldType`, `targetType` and `targetBundles` - use lowercase letters, digits and underscores only. Keep the machine names the source shows. Otherwise derive them from the label: "Blog post" becomes `blog_post`.
- **Configured fields** start with `field_`, as Drupal names them: "Featured image" becomes `field_featured_image`. Base fields keep their own names, such as `title`.
- **Labels** are what the source calls the thing, such as `Blog post`.
- **Ids** join names. An entity's id is `<entityType>.<bundle>`, such as `node.blog_post`. A field's id is `field:<entity id>:<name>`, such as `field:node.blog_post:field_tags`. An annotation's id is the `id` you give it.
- **Each id is unique.** 1 entity per entity type and bundle, 1 field per name in each entity, and no annotation id that matches another id in the diagram.

## References

A field that points to other entities - tags, media, related content, paragraphs - is a reference:

- `fieldType` is `entity_reference`, or `entity_reference_revisions` for paragraphs.
- `targetType` is the entity type it points to, such as `taxonomy_term`.
- `targetBundles` lists the bundles it points to, such as `["tags"]`.
- Every target must be an entity in the document, or Nexus draws no arrow for it. When the source draws an arrow to a bundle it says nothing else about, add that bundle as an entity with no fields.
- To point to every bundle of a type, leave `targetBundles` empty and add an entity with the bundle `*` and a label such as `Any Media`.
- A field with no target leaves out `targetType` or sets it to `null`.

## Descriptions and field settings

Content model specs often describe each bundle and explain each field. Nexus shows these in its Inspector, its tooltips and its Fields table:

| Key | On | What it holds |
|-----|----|---------------|
| `description` | An entity | What the bundle is for, such as "Time-limited news and announcements" |
| `description` | A field | The help text editors see under the field, such as "Use the speaker's full name" |
| `defaultValue` | A field | The value a new item starts with, as text, such as `draft` or `now` |
| `allowedValues` | A field | The options a `list_string` field offers, in order: `[{ "value": "keynote", "label": "Keynote" }]`. Leave out `label` when it matches the value |
| `translatable` | A field | `true` when the field's value can differ per language, `false` when it can't |

Every one is optional. Leave a key out when the source doesn't say, rather than writing an empty string, an empty list or a guess. Copy the text as the source writes it, markup included.

## Annotations

Annotations draw what Drupal configuration leaves out: events, external APIs and callbacks.

- `annotations.nodes` holds 1 item per annotation, with an `id`, a `kind` (`event`, `api` or `callback`) and a `label`. An item can also have a `note` and a `method`, which is a second line of text such as an HTTP verb.
- `annotations.edges` holds 1 item per edge: `from` and `to` are the ids of any 2 nodes in the diagram, and `label` is optional. An edge from an entity to an event ties the event to that entity.

Leave `annotations` out when the source shows none.

## Write the document

- Start with `"$schema": "https://nexus.drevops.com/schema/nexus.schema.json"` and `"nexus": 1`.
- Set `title` to the name of the site or model the source describes.
- List the entities in the order the source presents them, and the fields of each in the source's order.
- Put anything the source says that the diagram can't show - a business rule, an open question - in the `note` of the entity, field or annotation it belongs to. Help text, defaults, allowed values and translatability have their own keys (see [Descriptions and field settings](#descriptions-and-field-settings)).
- **Leave out `layout` and `ui`.** Nexus lays the diagram out when it opens.
- Leave out `colors` and `symbols` unless the user asks for them.
- Don't invent bundles or fields the source doesn't show. Beyond the source, add only the base fields from [Kind and cardinality](#kind-and-cardinality) and the entities your references need.
- Save the document under a filename made from the title and ending in `.nexus.json`, such as `events-site.nexus.json`. When you can't save files, reply with the whole document in a single JSON code block instead.

This is a complete document for a small events site:

```json
{
  "$schema": "https://nexus.drevops.com/schema/nexus.schema.json",
  "nexus": 1,
  "title": "Events site",
  "entities": [
    {
      "entityType": "node",
      "bundle": "event",
      "label": "Event",
      "description": "A conference, meetup or workshop.",
      "fields": [
        { "name": "title", "label": "Title", "fieldType": "string", "kind": "system", "cardinality": 1, "required": true },
        { "name": "uid", "label": "Author", "fieldType": "entity_reference", "kind": "system", "cardinality": 1 },
        { "name": "status", "label": "Published", "fieldType": "boolean", "kind": "system", "cardinality": 1 },
        { "name": "created", "label": "Authored on", "fieldType": "created", "kind": "system", "cardinality": 1 },
        {
          "name": "field_date",
          "label": "Date",
          "fieldType": "datetime",
          "kind": "single",
          "cardinality": 1,
          "required": true,
          "description": "The day the event starts.",
          "translatable": false
        },
        {
          "name": "field_format",
          "label": "Format",
          "fieldType": "list_string",
          "kind": "single",
          "cardinality": 1,
          "defaultValue": "in_person",
          "allowedValues": [
            { "value": "in_person", "label": "In person" },
            { "value": "online", "label": "Online" }
          ]
        },
        {
          "name": "field_venue",
          "label": "Venue",
          "fieldType": "entity_reference",
          "kind": "single",
          "cardinality": 1,
          "targetType": "taxonomy_term",
          "targetBundles": ["venues"]
        },
        {
          "name": "field_image",
          "label": "Image",
          "fieldType": "entity_reference",
          "kind": "single",
          "cardinality": 1,
          "targetType": "media",
          "targetBundles": ["image"]
        },
        {
          "name": "field_sections",
          "label": "Sections",
          "fieldType": "entity_reference_revisions",
          "kind": "multi",
          "cardinality": -1,
          "targetType": "paragraph",
          "targetBundles": ["text"]
        },
        { "name": "field_tickets", "label": "Tickets", "fieldType": "link", "kind": "single", "cardinality": 1, "note": "Links to the ticketing site." }
      ]
    },
    {
      "entityType": "taxonomy_term",
      "bundle": "venues",
      "label": "Venues",
      "fields": [
        { "name": "name", "label": "Name", "fieldType": "string", "kind": "system", "cardinality": 1, "required": true },
        { "name": "description", "label": "Description", "fieldType": "text_long", "kind": "system", "cardinality": 1 },
        { "name": "field_address", "label": "Address", "fieldType": "string_long", "kind": "single", "cardinality": 1 }
      ]
    },
    {
      "entityType": "media",
      "bundle": "image",
      "label": "Image",
      "fields": [
        { "name": "name", "label": "Name", "fieldType": "string", "kind": "system", "cardinality": 1, "required": true },
        { "name": "status", "label": "Published", "fieldType": "boolean", "kind": "system", "cardinality": 1 },
        { "name": "field_media_image", "label": "Image", "fieldType": "image", "kind": "single", "cardinality": 1, "required": true }
      ]
    },
    {
      "entityType": "paragraph",
      "bundle": "text",
      "label": "Text",
      "fields": [{ "name": "field_body", "label": "Body", "fieldType": "text_long", "kind": "single", "cardinality": 1, "required": true }]
    }
  ],
  "annotations": {
    "nodes": [
      { "id": "event_published", "kind": "event", "label": "EventPublished" },
      { "id": "ticketing_api", "kind": "api", "label": "Ticketing API" }
    ],
    "edges": [
      { "from": "node.event", "to": "event_published" },
      { "from": "event_published", "to": "ticketing_api", "label": "notifies" }
    ]
  }
}
```

## Check the document

In a clone of the [Nexus repository](https://github.com/drevops/nexus), after `npm ci`, run:

```bash
npm run check-diagram -- path/to/diagram.nexus.json
```

The command checks the document against the schema and the rules the schema can't express. It prints each problem with the JSON Pointer of the part it's about. Fix every error. A warning means the document opens but draws less than it says, such as a reference to an entity the document doesn't define. Fix each warning, or say in your report why it stays.

Without the repository, validate the document against the published schema with any JSON Schema draft 2020-12 validator, then go through these checks yourself:

- No 2 entities share an entity type and bundle.
- No 2 fields of an entity share a name.
- No annotation id matches an entity id, a field id or another annotation id.
- Every reference target - `<targetType>.<bundle>` for each target bundle, or `<targetType>.*` when `targetBundles` is empty - is an entity in the document.
- Every annotation edge's `from` and `to` is the id of an entity, a field or an annotation in the document.
- Every entity type is a built-in one or listed in `customTypes`.

## Report back

Tell the user:

- The file you wrote, and that they open it at https://nexus.drevops.com with **Open a saved diagram**. A document you replied with instead goes into the **Paste the diagram** box under **Create with AI** there.
- Each assumption you made, such as a field type you picked or a bundle you added for a reference.
- Anything in the source you couldn't read or place, and where it was.
