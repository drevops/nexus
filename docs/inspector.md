# Inspector

The **Inspector** panel shows the settings of the node you select in Edit mode and changes them as you type. This page lists the form for each kind of node and every field in it.

## Open the Inspector

The Inspector has no toolbar button. It opens on its own in Edit mode when you:

- Click a node on the canvas, or double-click a node in View mode.
- Add a node from the **Add** bar, or click **Field** or **Bulk** in an entity's form.
- Click a problem in the [Checks](checks.md) panel.

The Inspector closes when you switch to View mode or click the **×** in its header. Like any panel, it floats or docks. See [Getting started](getting-started.md#arrange-the-panels).

Each change you make in the Inspector shows on the canvas straight away and is a step in the [history](history.md). Typing into 1 box makes 1 step.

## Entity form

Select an entity to see its form:

| Field | What it holds |
|-------|---------------|
| **Label** | The bundle's label |
| **Type** | The entity type, which you can't change |
| **Machine name** | The bundle's machine name. A new name applies when you press `Enter` or leave the box, and updates the entity's fields and references |
| **Description** | The bundle's description, as Drupal shows it to editors |
| **Note** | A [note badge](notes.md#attach-a-note-to-a-node) on the entity |
| **Fields** | The entity's fields. Click 1 to open it. **Bulk** opens the [bulk fields form](bulk-fields.md) and **Field** the **New field** form |

The form ends with 2 buttons. **Explore from here** starts the [explore view](explore.md) from the entity, and **Delete entity** deletes the entity with its fields.

## Field form

Select a field to see its form:

| Field | What it holds |
|-------|---------------|
| **Label** | The field's label |
| **Machine name** | The field's machine name. A new name applies when you press `Enter` or leave the box, and updates the field's references |
| **Type** | The field type |
| **Cardinality** | How many values the field holds: **Single**, 2 to 10 or **Unlimited** |
| **Required** | Whether the field must have a value |
| **Translatable** | **Yes** or **No**. Clear it when the source doesn't say |
| **Help text** | The help text editors see under the field |
| **Default value** | The value a new item starts with |
| **Allowed values** | The values a list field offers, 1 per line as `value\|label`. A line without a label uses its value. The box shows for `list_*` fields and fields that already have values. A field whose values come from a PHP function shows the function, as `From name()`, in place of the box |
| **References** | The entities a reference field points to, as tags. Click a tag's **×** to remove the reference, and pick an entity in **Add target…** to add one. The section shows for reference fields only |
| **Also used in** | The other bundles of the entity type that have a field with this machine name, each with the label it gives the field. Click a bundle to open it |
| **Note** | A note badge on the field |

**Delete field** at the foot of the form deletes the field.

## Note and annotation forms

A [Note](notes.md) has a **Text** box for its Markdown, with a reminder of the syntax under it, and a **Delete note** button.

An event, API or callback has a **Label**, a **Kind** and a **Method**. **Kind** switches it between **Event**, **API** and **Callback**, and **Method** shows under the label. The form ends with a **Note** and a **Delete** button.

## Forms for new nodes

The buttons of the **Add** bar open forms that create a node. [Building a model](building.md) covers the forms for a new entity and a new field, and [Adding fields in bulk](bulk-fields.md) covers the bulk fields form.

A form for a new node takes the keyboard focus as it opens, so what you type fills the form and doesn't run keyboard shortcuts.

## The breadcrumb

On a field, a new field form opened from an entity or the bulk fields form, a breadcrumb above the form names the entity it belongs to. Click the entity's name to go back to its form.
