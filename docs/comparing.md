# Compare 2 versions

A comparison shows what changed between 2 versions of a content model, such as the config export on `main` and the one on a branch. The open diagram is the earlier version, and Nexus lists what the other version adds, removes or changes.

## Compare with another version

To compare the open diagram with another version:

1. Click the caret beside **Open** in the toolbar, then **Compare with**.
2. Pick **Saved diagram…** for a `.nexus.json` file, or **Config folder…** for a Drupal config folder. Nexus reads a config folder as an import does, `annotations.yml` included.

Nexus switches to View mode, opens the **Changes** panel and fits the changes in view. When the file can't be read, Nexus shows the reason on the landing screen. Close the landing screen to return to the diagram as it was.

## The Changes panel

The **Changes** panel lists each change under its bundle. Its toolbar button, **Changes** (`6`), shows only while a comparison is open, with a badge that counts the changes.

The top of the panel names the file or folder you compared with and holds the **Stop comparing** button. Under it, 3 counts give the number of added, removed and changed items.

Each change shows its kind, **Added**, **Removed** or **Changed**, then what it is, such as `field Tags`, and its machine name. A changed bundle or field also lists each setting that differs, with its value before and after, such as `Cardinality: 1 → 1..n`.

Click a change to go to it on the canvas. A change on an entity type you've hidden in the [Entities panel](entities-panel.md) can't be reached, and its title says so. When the 2 models have the same bundles, fields and references, the panel reads **No changes.**

## What the comparison checks

Nexus matches bundles by entity type and machine name, and fields by bundle and machine name, so a renamed bundle shows as 1 removed and 1 added. The following table lists what the comparison checks:

| Item | Changed when it differs in |
|------|----------------------------|
| Bundle | Label or description |
| Field | Label, type, cardinality, required, help text, default value, allowed values or translatability |
| Reference | None: each target of a field is added or removed |

Notes, hidden fields and annotations stay out of the comparison. The canvas switches to the **All** detail level and draws added elements in green, changed ones in amber and removed ones faded with a dashed red border. The [Legend](legend.md) lists the 3 colors. Nexus places added bundles to the right of the diagram.

## While a comparison is open

While a comparison is open, Edit mode, **Save**, **Save as**, **Undo**, **Redo**, the diagram's name and the [Fields table](fields-table.md)'s editors are off. The detail levels, display switches and layouts still work.

Click **Stop comparing** in the **Changes** panel to bring the diagram back as it was, with its layout, detail level, display switches and view. The history gains no step. Opening another diagram, or starting another comparison, also ends the comparison.
