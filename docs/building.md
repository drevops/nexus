# Building a model

In Edit mode, you add entities, fields, references and annotations to a diagram, and you change them in the Inspector. This page covers each way to create, rename, move and delete them.

## Before you begin

Switch to Edit mode: click **Edit** in the toolbar, or press `E`. The **Add** bar appears under the toolbar, and every button in it has a keyboard shortcut. Each change you make is 1 step in the [history](history.md), so **Undo** (`Ctrl`+`Z`, or `Cmd`+`Z` on a Mac) takes it back.

## Add an entity

The first 7 buttons of the **Add** bar create an entity of each built-in entity type:

| Button | Adds | Shortcut |
|--------|------|----------|
| **Content** | A content type | `Shift`+`C` |
| **Vocab** | A vocabulary | `Shift`+`V` |
| **Media** | A media type | `Shift`+`M` |
| **Para** | A paragraph type | `Shift`+`P` |
| **Block** | A block type | `Shift`+`B` |
| **User** | A user entity | `Shift`+`U` |
| **External** | An external entity | `Shift`+`X` |

To add an entity from a form:

1. Click the button of its entity type. The **Inspector** opens a form for the new bundle.
2. In **Type**, keep the entity type, or pick another one. The list includes your custom entity types.
3. In **Machine name**, type the bundle's machine name, such as `article`.
4. In **Label**, type its label, such as `Article`.
5. Click **Create entity**.

To place an entity at a spot of your choice, drag its button onto the canvas instead. Nexus creates it where you drop it, with a numbered name such as `content_type_1`, and opens it in the Inspector to rename.

## Add a field

Pick the way that suits the field:

- Select an entity and click 1 of the **+** handles around it. Nexus adds a field named `field_1`, or the next free number, on that side of the entity and opens it in the Inspector.
- Click **Field** in the **Add** bar (`Shift`+`F`), or **Field** in an entity's Inspector, and fill in the **New field** form.
- Drag **Field** from the **Add** bar onto an entity. Nexus adds a numbered field to the entity under the drop point, or to the nearest entity.
- To add several fields at once, click **Bulk** in an entity's Inspector. See [Adding fields in bulk](bulk-fields.md).

The **New field** form has these settings:

| Field | What it sets |
|-------|--------------|
| **On entity** | The entity that gets the field. The form shows it only when you opened it from the **Add** bar |
| **Machine name** | The field's machine name, such as `field_body`. Pick an existing field's machine name from the list to reuse its label, type and cardinality |
| **Label** | The field's label, such as `Body` |
| **Type** | The field type |
| **Cardinality** | How many values the field holds: **Single**, 2 to 10 or **Unlimited** |
| **Link to** | The entity a reference field points to. The form shows it only for the `entity_reference` and `entity_reference_revisions` types |

Click **Create field** to add the field. The **Type** list offers these field types: `string`, `string_long`, `text_long`, `text_with_summary`, `boolean`, `integer`, `decimal`, `datetime`, `link`, `email`, `list_string`, `image`, `file`, `entity_reference` and `entity_reference_revisions`.

## Add a reference

A reference links a field to the entity it points to. Add one in any of these ways:

- Click **Connect** in the **Add** bar (`C`), then drag from a field to the target entity. Click **Connect** again to turn it off.
- Select a reference field and pick an entity in **Add target…** under **References** in the Inspector.
- Click the pencil in the field's **Refs** cell in the [Fields table](fields-table.md#editing-a-cell), and pick the entity.

A field can reference several entities. To remove a reference, click the **×** on its tag under **References** in the Inspector.

## Add an annotation

Annotations show what Drupal configuration leaves out. The **Add** bar has 4:

| Button | Places | Shortcut |
|--------|--------|----------|
| **Event** | An event, drawn as a diamond | `Shift`+`E` |
| **API** | An API, drawn as a hexagon | `Shift`+`A` |
| **Callback** | A callback, drawn as a rounded rectangle with a method | `Shift`+`K` |
| **Note** | A [Note](notes.md) of formatted text | `Shift`+`N` |

Click a button, then click the canvas where the annotation goes, or drag the button onto the canvas. Nexus opens the new annotation in the Inspector, where you set its **Label**, its **Kind** and an optional **Method**, such as `POST`, that shows under the label. An [annotation overlay](annotations.md) adds annotations from a file when you import a config folder.

## Rename an entity or field

Select the node and change **Machine name** in the Inspector. The new name applies when you press `Enter` or leave the box. Nexus turns it into a machine name, in lowercase with underscores, and updates the node's fields and references. A name that's empty or already taken leaves the node as it was.

An entity's type is fixed after you create it. To change it, add a new entity of the right type, copy the fields to it with [Adding fields in bulk](bulk-fields.md#copy-fields-from-another-entity) and delete the old entity.

## Move nodes

Drag a node to move it. To move several nodes together, select them with a box or by holding `Shift` as you click, then drag 1 of them. To move an entity with its fields, right-click the entity to isolate it, then drag any part of the group. See [View and Edit modes](view-and-edit.md#isolate-an-entity).

## Delete a node

Select the node and click the delete button at the foot of the Inspector: **Delete entity**, **Delete field**, **Delete note**, or **Delete** for an event, API or callback. Deleting an entity deletes its fields and the references to it.
