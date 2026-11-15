# Saving and opening

Nexus keeps the open diagram in your browser's memory only, so save it as a `.nexus.json` file to keep it. This page covers saving a diagram, opening it again and everything the **Open** menu opens.

## Save a diagram

Click **Save** in the toolbar, or press `Ctrl`+`S` (`Cmd`+`S` on a Mac). Your browser downloads the diagram as a `.nexus.json` file named after the diagram, such as `umami-11-4-12.nexus.json`. A diagram with no name saves as `content-model.nexus.json`.

Nothing saves on its own, and closing the tab loses any change you haven't saved. Save often, or before you click **New** or open another diagram.

A `.nexus.json` file holds:

- The diagram's name
- Every entity with its fields, descriptions, field settings, notes and hidden fields
- The references and annotations
- The position of every node
- The colors and symbols of the entity types, and your custom entity types
- The places of your panels

The history and the view settings, such as the detail level and the switches, stay out of the file. The [Nexus JSON Schema](https://nexus.drevops.com/schema/nexus.schema.json) defines the format.

To save the diagram in another format, use the caret beside **Save** (`Ctrl`+`Shift`+`S`). See [Exporting](exporting.md).

## Open a saved diagram

Click **Open** in the toolbar, or press `Ctrl`+`O` (`Cmd`+`O` on a Mac), and pick a `.nexus.json` file. On the landing screen, **Open a saved diagram** does the same.

The diagram replaces the open diagram, and its history starts over. It opens with its saved positions, colors, symbols and panel places. The detail level, the switches and the mode come from the **New diagrams** tab of [Settings](settings.md#new-diagrams), as for any new diagram. Nexus places any node the file has no position for.

When the file isn't a diagram Nexus can read, the landing screen shows `Could not open that diagram:` and the reason, and the open diagram stays as it was.

## The Open menu

Click the caret beside **Open** (`Shift`+`O`) to open the menu:

| Item | What it does |
|------|--------------|
| **Saved diagram…** | Opens a `.nexus.json` file, as the **Open** button does |
| **Config folder or template…** | Returns to the landing screen, where you can import a config folder or open a [template](templates.md) |
| **CSV file…** | Opens a CSV file of fields as a diagram. See [Import a CSV](csv-import.md) |
| **CSV template** | Downloads `nexus-template.csv`, an example to fill in and import |
| **Create with AI…** | Opens the [Create with AI](create-with-ai.md) dialog |
| **Compare with** | Compares the open diagram with a **Saved diagram…** or a **Config folder…**. See [Compare 2 versions](comparing.md) |

## Import a config folder

To draw a site's model from its exported configuration, go to the landing screen and drop the folder on the dropzone, or click **Choose a config folder** (`Alt`+`I`). Nexus reads only the YAML files in the folder, plus an [annotation overlay](annotations.md) when the folder has one. The diagram takes its name from the overlay's `title`, or `Content model` without one.
