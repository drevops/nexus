# Adding fields in bulk

The bulk fields form adds several fields to 1 entity in 1 step, from lines of text you type or paste, or from another entity's fields. Use it to type up a content type from a spec, or to give 2 bundles the same fields.

## Open the form

1. In Edit mode, select the entity that gets the fields.
2. In the **Inspector**, click **Bulk** beside **Fields**.

The form's title reads **Add fields to** and the entity's label. A breadcrumb above it leads back to the entity.

## Write 1 field per line

Type or paste the fields into **Fields, 1 per line**. Split the parts of a line with commas or tabs, so a range copied from a spreadsheet works as is:

```text
Body
field_tags, entity_reference, unlimited, taxonomy_term.tags
Summary (field_summary), text_long, required
```

The first part names the field in 1 of 3 ways:

| You write | Machine name | Label |
|-----------|--------------|-------|
| `Summary (field_summary)` | `field_summary` | `Summary` |
| `field_tags` | `field_tags` | `Tags` |
| `Main image` | `field_main_image` | `Main image` |

Each other part is 1 of these, in any order:

- A field type, such as `string` or `entity_reference`. The type defaults to `string`.
- A cardinality: a number from 1 to 10, or `unlimited` or `-1`. The cardinality defaults to 1.
- `required`, which makes the field required.
- The id of a target entity, such as `taxonomy_term.tags`, for a reference field. An entity's id is its entity type and machine name, joined by a dot.

When a machine name matches a field on another entity, the line takes that field's label, type and cardinality, unless the line sets them. Nexus skips blank lines and lines that start with `#`.

## Check the lines

Under the box, Nexus lists each line as it reads it: the label, the machine name, the type, the cardinality, `required` and the targets. A line it can't use shows as `Line`, its number and the reason. These are the reasons a line fails:

- The first part has no letter or digit to make a machine name from.
- A later part isn't a field type, a cardinality, `required` or an entity id.
- The line has 2 field types or 2 cardinalities.
- The cardinality is outside 1 to 10.
- The target entity isn't on the canvas, or the field type isn't a reference type.
- The entity already has the machine name, or an earlier line uses it.

The field types you can write are the types of the **New field** form and any type already in the diagram.

## Copy fields from another entity

To start from the fields of another bundle, pick it in **Copy from**. The list shows each entity that has fields of its own, with the number of those fields. Nexus adds a line for each field to the box, skipping base fields and the machine names this entity already has or the box already lists. A message under the list says how many fields it copied and skipped.

The copied lines keep each field's type, cardinality, required flag and references, and you can edit them before you add them.

## Add the fields

The button under the list reads **Add 3 fields**, with the number of fields the box holds. While a line has a problem, it reads **Fix 1 line**, with the number of lines to fix, and stays off until you fix them.

Click the button to add the fields. Nexus places them in a column to the right of the entity, opens the entity in the Inspector again and records the whole set as 1 step in the [history](history.md).
