# Layouts and lines

A layout places every entity and field on the canvas, and the line style sets how the lines between them are drawn. This page covers the 3 layouts, **Tidy up** and the 3 line styles.

## Pick a layout

The **Layout** button in the toolbar names the layout the open diagram uses, such as **Layout: Columns**. It's a split button:

- Click the main button (`L`) to run the layout again.
- Click the caret beside it (`Shift`+`L`) to pick another layout from the menu. Nexus runs the layout you pick straight away.

The menu offers these layouts:

| Layout | What it does |
|--------|--------------|
| **Left to right (LR)** | Lays the whole diagram out in ranks from left to right |
| **Top to bottom (TB)** | Lays the whole diagram out in ranks from top to bottom |
| **Columns** | Lays out each group of connected entities on its own, then stacks the groups in columns that fill the screen, in entity type order and then by label |

A layout you pick lasts for the open diagram only. Every new diagram starts with the layout on the **New diagrams** tab of [Settings](settings.md#new-diagrams), which is **Columns** by default.

Each layout run sets the zoom to 100% and centers the diagram. A saved diagram opens with the positions it was saved with. Nexus also runs the layout again when a [detail level](navigating.md#detail-levels) or the **Proxies** switch changes what the canvas shows.

Running the layout from the main button is a step in the [history](history.md), so **Undo** puts the nodes back. Picking a layout from the menu and the layout runs after a display change aren't steps.

## Tidy up

**Tidy up** (`T`) cleans up the diagram without starting over. It straightens each entity with its fields, keeps the fields in their order and lines the entities up in columns near where they already are. The view stays where it is.

**Tidy up** can work on 1 entity, its fields and their proxies alone. It does so when the Inspector shows the entity or 1 of its fields, or when you've focused the entity or a field in View mode. The button's title names the entity it's about to tidy.

Each tidy is 1 step in the history.

## Pick a line style

The **Lines** dropdown (`Alt`+`L`) names the line style, such as **Lines: Right-angled**. Pick a style from its menu:

| Style | How it draws each line |
|-------|------------------------|
| **Right-angled** | At right angles, each line turning halfway to its target. This is the default |
| **Merged** | At right angles, merging the lines that leave a node into 1 line |
| **Straight** | Straight from its source to its target. Lines that share both ends bow apart |

The line style is a display preference, so it applies to every diagram and stays in your browser. A saved diagram, a link and the history leave it alone, and **Reset all to defaults** in Settings doesn't change it. PNG and SVG exports draw the lines in the style you picked.
