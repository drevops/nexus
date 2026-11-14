# Import a CSV

A CSV file can hold a content model with 1 row per field, so you can write a model in any spreadsheet app and open it as a diagram. This page covers the columns Nexus reads and what happens when a row has a problem.

## Open a CSV file

To start from an example, pick **Open** > **CSV template** in the toolbar and fill the file in with any spreadsheet app. The template opens with no errors or warnings.

To open a CSV file as a diagram, pick **Open** > **CSV file…** in the toolbar or drop the file on the landing screen. Nexus lays the diagram out and titles it after the filename. The diagram replaces the open diagram, and its history starts over.

## Columns

The import reads cells separated by commas, semicolons or tabs, taking the separator the header row uses most. It matches these columns by their header, in any order and case:

| Column | What it holds | When the cell is empty |
|--------|---------------|------------------------|
| Entity type | The entity type's machine name, label or bundle noun, such as `node`, `Content type` or `Paragraph type`. Any other value adds a custom entity type, and `Product (commerce_product)` adds one with its label and machine name | The row is an error |
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

A row with an entity type and a bundle but no field adds a bundle with no fields. In **References** and **Allowed values**, write `\;` for a `;` inside an item and `\\` for a `\`. A base field, such as `title` on a content type, imports as a system field. A reference to an entity the file doesn't have adds that entity to the diagram, as a config import does. The import ignores any other column.

## Export and import again

**Save as** > **CSV** > **Fields** writes the Fields table with the same columns and a **Used in** column, plus a row for each bundle with no fields. A CSV saved that way imports as the same entities, fields and references. Notes, bundle descriptions, hidden fields, annotations and the layout stay out of the CSV.

## Fix a CSV with problems

When a row has a problem, Nexus opens nothing and lists the first 5 problems with their row numbers on the landing screen. The header is row 1. A quoted cell with no closing quote is reported at the row the cell starts on.
