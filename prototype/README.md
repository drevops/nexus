# Preact prototype - panels + inspector

A build-free Preact reimplementation of Nexus's **panel windowing** and **build-mode inspector**, so the component approach can be compared against the vanilla version one directory up *before* committing to it. Nothing here is wired into the production app.

## Run it

The prototype is served by the same static dev server as the app:

```
npm start
```

Then open the two side by side:

- Vanilla (production): http://127.0.0.1:8000/index.html
- Preact prototype: http://127.0.0.1:8000/prototype/index.html

In the prototype: tap a node to inspect it, edit a field's label and watch the graph + Entities panel update live, drag panels by their title bar, pin them to a side rail, use **+ Field** and the existing-field autocomplete.

## How it stays build-free

No bundler, no JSX, no transpile step - the same constraint as the rest of Nexus:

- Preact, Preact hooks and [htm](https://github.com/developit/htm) are vendored as ESM in `vendor/`.
- An **import map** in `index.html` resolves the bare `preact` / `preact/hooks` / `htm` specifiers to those files.
- Templates use `htm` tagged template literals (`` html`<${Panel} .../>` ``) instead of JSX, so the browser runs the source directly.
- The shared `../assets/styles.css` and `../assets/icons.js` are reused unchanged, so the only variable in the comparison is the implementation.

## What to read, side by side

| Concern | Vanilla | Preact |
| --- | --- | --- |
| Panel windowing (drag/pin/dock/close) | `assets/panels.js` (175 lines) | `prototype/panels.js` (115 lines) |
| Inspector forms | form functions inside `assets/builder.js` | `prototype/inspector.js` (186 lines) |
| Wiring / state | imperative, spread across `render.js` + `builder.js` | `prototype/app.js` `Chrome` component |

## The honest trade-off

**Where Preact clearly wins (the chrome):**

- **Panels become a pure function of state.** All window state (open, docked side, position, z-order) is one object; the DOM is derived from it. The vanilla version toggles classes, moves nodes between `appendChild` targets and tracks a `positioned` map by hand.
- **The inspector stops being string soup.** Vanilla builds forms as `innerHTML` strings with a `data-*` attribute protocol, then reads them back through delegated `onInspectorInput`/`onInspectorClick` handlers, and re-renders the whole form on a type change. The Preact forms are controlled inputs that write straight through to the Cytoscape node - edit a label once and the graph, the Entities list and the field table all reflect it with no manual refresh call.
- Less incidental code, and the code that remains describes *what* the UI is, not *how* to mutate it.

**What it costs:**

- A framework dependency (~16 KB of Preact + hooks + htm) and an import map to maintain, versus zero runtime deps today.
- A second mental model. Contributors now need to know Preact/htm, hooks rules and the render lifecycle - the state updates render on the next tick, which is a subtle gotcha when driving it from Cytoscape events (see the render-timing note in `app.js`).
- **The canvas gains nothing.** The graph is Cytoscape drawing to `<canvas>`; Preact can't touch it. Only the surrounding chrome benefits, so this is a partial migration by nature.

## Recommendation

For the *diagram* itself, vanilla stays right - it's a canvas, not a DOM tree. But the **inspector + panels are exactly the DOM-heavy, stateful chrome a component layer is good at**, and they're the part that's been growing. If the builder keeps expanding into a fuller editor, adopting this Preact layer for the chrome (while leaving `render.js`/Cytoscape alone) is a reasonable, incremental move. If the builder stays roughly where it is, the vanilla version is not painful enough to justify the new dependency yet.
