# History

Nexus records each change you make to a diagram as a version, so you can undo it, redo it or jump back to any earlier version. This page covers the **Undo** and **Redo** buttons and the **History** panel.

## Undo and redo

Click **Undo** (`Ctrl`+`Z`, or `Cmd`+`Z` on a Mac) to take back the last change, and **Redo** (`Ctrl`+`Shift`+`Z` or `Ctrl`+`Y`, or `Cmd`+`Shift`+`Z` on a Mac) to make it again. Hold the keys down to step through several changes. Each button's title names the change it undoes or redoes, such as `Added field “Field 1”`.

Inside a text box, these keys undo and redo your typing instead.

## The History panel

Click **History** in the toolbar, or press `4`, to open the panel. It lists every version of the open diagram, newest first, each with what changed and the time it changed. The current version is marked, and versions you've undone show above it.

Click a version to return to it, in 1 step however far back it is. The versions after it stay in the list until your next change, so you can still jump forward to them. A change made after you undo drops the undone versions.

## What counts as a change

Each finished action is 1 version. Adding a field, renaming a machine name, dragging nodes and hiding a field are versions. So are running the layout from the **Layout** button, tidying up and renaming the diagram. Typing into 1 text box in the Inspector makes 1 version, however many keys you press. Each edit in the [Fields table](fields-table.md) is a version of its own.

These don't add a version, because they change only the view:

- Panning, zooming, focusing and searching
- Picking a layout from the **Layout** menu
- The detail levels, the **Proxies** and **Machine names** switches and the entity type checkboxes
- The [explore view](explore.md) and the line style

## Limits

The history keeps the last 200 changes. It lives in your browser's memory only, so it starts over each time you open, import or start a diagram, and a saved diagram doesn't carry it.

While you [compare 2 versions](comparing.md), the history is paused: **Undo**, **Redo** and the versions in the panel are off until you stop comparing.
