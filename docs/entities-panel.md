# Entities panel

The **Entities** panel lists every entity in the diagram and lets you hide whole entity types from the canvas. Use it to jump to an entity by name or to thin out a crowded diagram.

## Open the panel

Click **Entities** in the toolbar, or press `1`. [Getting started](getting-started.md#arrange-the-panels) explains how to move, dock and resize a panel.

## Show or hide entity types

The top of the panel has a checkbox for each entity type in the diagram, with the type's color. Clear a checkbox to hide every entity of that type, with its fields, from the canvas. Tick it again to show them.

Nexus runs the layout again after each change. The checkboxes change only what the canvas shows: the history, a saved diagram and a link leave them out, and each diagram opens with every type shown.

While a type is hidden, the [Fields table](fields-table.md) and the [Checks](checks.md) panel can't take you to its entities. The PNG, SVG, Mermaid and DOT exports draw only the types the canvas shows, while the other exports keep every entity. See [Exporting](exporting.md).

## Find an entity in the list

Below the checkboxes, the panel lists each entity with its entity type and its number of fields:

- Click an entity's name to focus it on the canvas, as a click on the entity does in View mode.
- Click **fields** at the end of its row to open the [Fields table](fields-table.md) with only that entity's fields.
