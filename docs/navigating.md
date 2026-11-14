# Moving around the canvas

Pan, zoom and find your way around a diagram of any size. This page covers the mouse and zoom controls, **Find entity**, the detail levels and switches that decide what the canvas shows, tooltips and the hover highlight.

## Pan and zoom

Right-drag anywhere on the canvas to pan, in either mode. Scroll the mouse wheel, or pinch on a trackpad, over the canvas to zoom in and out at the pointer.

The zoom controls sit at the right end of the status bar:

| Control | Shortcut | What it does |
|---------|----------|--------------|
| Reset view | `0` | Clears the focus and sets the zoom to 100% |
| Fit to view | `Shift`+`1` | Fits the whole diagram in view |
| Zoom out | `-` | Zooms out 1 step |
| Zoom in | `+` or `=` | Zooms in 1 step |
| Zoom level menu | `Z` | Opens a menu of **Fit**, **25%**, **50%**, **75%**, **100%**, **150%**, **200%** and **300%**. The button shows the current zoom |

Your browser's zoom keys zoom the diagram instead of the page: `Ctrl`+`+` and `Ctrl`+`-` zoom in and out, and `Ctrl`+`0` resets the view. On a Mac, use `Cmd` in place of `Ctrl`. A pinch outside the canvas does nothing, so the toolbar and panels stay the same size.

## Find an entity

To find an entity by name:

1. Click **Find entity…** in the toolbar, or press `/`.
2. Type part of the entity's label or machine name.
3. Press `Enter`, or click the search button beside the box.

Nexus keeps every matching entity and the nodes around it, fades the rest and centers the matches at 100% in the part of the canvas no floating panel covers. To clear the search, click the **×** in the box, or empty the box and press `Enter`.

## Detail levels

The 4 buttons at the left end of the status bar set how many fields the canvas shows. Each level shows every field the level before it shows:

| Level | What the canvas shows |
|-------|-----------------------|
| **Entities** | The entities only, with 1 line between each pair that reference each other |
| **References** | The entities with their reference fields |
| **Configurable** | Every field but the base fields |
| **All** | Every field, base fields included |

Click a button to pick its level, or press `F` to step to the next level. A diagram opens at the level set on the **New diagrams** tab of [Settings](settings.md#new-diagrams), which is **All** by default. A level you pick lasts for the open diagram only.

Turning **Proxies** on at the **Entities** level moves the canvas to **References**, and switching to Edit mode at the **Entities** level moves it to **All**.

## Proxies and machine names

2 switches beside the detail levels change how the canvas draws what it shows:

- **Proxies** (`P`): when on, each reference draws as a proxy, a faded copy of its target beside the field. When off, each reference draws as a line from the field to the target entity.
- **Machine names** (`M`): when on, each node shows its machine name under it.

Both switches start each diagram at the values on the **New diagrams** tab of [Settings](settings.md#new-diagrams). Both are on by default.

## Tooltips

Rest the pointer on a node to see its tooltip:

- An entity's tooltip shows its label, its entity type, its machine name and its description.
- A field's tooltip shows its label, its kind, its field type, the entities it references and its help text.
- An annotation's tooltip shows its label, its kind and its method.

Descriptions and help text show basic formatting, such as bold and lists. A link shows as text with a dotted underline and never opens a page.

## Hover highlight

Rest the pointer on a node for a quarter of a second to light up what it connects to, while the rest of the diagram fades:

- On an entity, the highlight covers its fields and every reference from its fields or to the entity, with the entities at each end.
- On a field, it covers the field's entity and the field's own references.
- On a proxy, it covers the 1 reference the proxy draws.

The highlight clears when the pointer leaves the node, and when you press a mouse button or a key, pan or zoom. It never shows while you hold a mouse button down. To turn it off, switch off **Highlight connections** on the **Hover highlight** tab of [Settings](settings.md#hover-highlight).
