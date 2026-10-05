# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

Nexus is a static web app that draws a Drupal site's content model from its exported configuration, entirely in the browser. There's no backend and no build step: `index.html` loads the app's own ES modules and stylesheet from `src/` plus vendored libraries from `assets/vendor/`, and GitHub Pages serves the files as they are at https://nexus.drevops.com.

The project was created from the Scaffold template, which supplies the CI workflows, the linting and test tooling, and the Renovate configuration.

## Application Architecture

- **Entry point:** `index.html` declares an import map for Preact, Preact hooks and htm, loads the classic vendor scripts (Cytoscape, Dagre, cytoscape-dagre, cytoscape-svg, js-yaml) and the Shoelace autoloader, then starts `src/app.js`.
- **Model builder (pure, no DOM):** `src/parser.js` turns parsed config YAML into a `ContentModel` from `src/model.js`; `src/base-fields.js` adds curated system fields and `src/annotations.js` applies the optional `annotations.yml` overlay.
- **Shared definitions (pure):** `src/entity-types.js` lists the built-in entity types in diagram order, each with its label, default color, default symbol and the base name of bundles created on the canvas, and `formatCount()` words a count of each type's bundles. `src/annotations.js` lists the annotation kinds, `src/export-formats.js` lists the export formats in menu order, each with its label, icon and title, `src/names.js` converts between machine names, labels and file names, and `src/model.js` holds the default title, the reference field types and the graph id helpers. Import them from there instead of keeping a local copy, so the copies can't drift apart.
- **Documents:** `src/document.js` converts between the live graph and a saved `.nexus.json` document, and its docblock holds the schema of the saved format.
- **Reference elements:** `src/references.js` derives the render-only elements that draw each reference - a proxy beside the field, the proxy edge joining them and the overview's collapsed edge - from the ref edges of a live graph. `syncReferenceElements()` reconciles them with the graph and keeps a renamed reference's proxy in place. `render.js` runs it at render time and through the controller's `syncReferences()`, which `builder.js` and `inspector.js` call after each edit the elements depend on.
- **Node text:** a Cytoscape label takes 1 style, so `src/render.js` draws each entity's type and each node's machine name in an HTML caption layer: the type on a blank last line reserved inside the entity box, the machine name below the node. `src/label-fit.js` (pure, no DOM) wraps a label the way Cytoscape does and works out how wide a box must be for every line to stay inside its shape, and `render.js` sizes entity boxes with it. Each node's `bounds-expansion` covers its machine name, so layouts, Fit and proxy placement leave room for it.
- **History:** `src/history.js` (pure) snapshots the model elements and node positions of a graph, stores each edit as the change between 2 snapshots and applies either side of a change to undo or redo it. Its `History` class holds the versions of 1 diagram, joins edits recorded with the same coalesce key and jumps to any version in 1 apply. `src/undo.js` owns the open diagram's history and wires the Undo and Redo buttons, the shortcuts and the History panel's jumps. `builder.js`, `inspector.js`, `render.js` and `app.js` record each finished user action with `checkpoint()`, display toggles that re-run the layout go through `untracked()`, and `app.js` starts a new history for every diagram it draws.
- **Layouts:** the toolbar's layout button re-runs the layout picked from its menu, and `render.js` keeps the pick in the `nexusSettings` localStorage entry. LR and TB run Dagre over the whole graph. Columns, the default, runs Dagre on each island of connected elements on its own, sorts the islands by entity type order and label, and places them with `packColumns()` from `src/packing.js`, a pure module that stacks boxes in columns shaped like the canvas.
- **UI (browser only):** `src/render.js` draws the model with Cytoscape, `src/builder.js` adds build-mode editing, `src/inspector.js` and `src/ui.js` are Preact components over Shoelace controls, `src/store.js` is the shared UI store and keeps raised panels in a fixed band of z-indexes, `src/export.js` handles every download (PNG, SVG, CSV and the saved document), `src/dom.js` holds the `$()` element lookup, `src/icons.js` holds inline SVG icons and `src/styles.css` styles the page.
- **Export button:** a Shoelace split button in the toolbar. `src/app.js` fills its menu from `EXPORT_FORMATS`, and choosing a format exports it and makes the main button repeat it; until then the main button opens the menu. `loadExportFormat()` and `saveExportFormat()` in `src/export-formats.js` keep the choice in `localStorage` and ignore a stored id that names no format. The toolbar has no `z-index`, so it forms no stacking context: the hoisted menu keeps Shoelace's own `z-index` and draws over the floating panels, while a panel's select list that opens upward still draws over the toolbar.
- **Logo and favicon:** `logo.svg` is the README logo and `assets/favicon.svg` the browser tab icon; both turn the mark's ink white under a dark colour scheme on their own. The page draws the same mark inline as the `nexus` icon in `src/icons.js`, coloured from `src/styles.css`, because Safari renders an `<img>` SVG in the system colour scheme rather than the app's theme.
- **Version:** `src/version.js` ships as `dev`; the release workflow stamps the release tag into the deployed copy.
- **Vendored libraries:** `assets/vendor/` holds third-party builds. Don't edit, lint or format them.
- **Templates:** `src/templates.js` lists the content-model templates the landing offers - Drupal CMS and CivicTheme - with each one's label, version, summary, mark, bundle counts and upstream sources. Each ships as a saved diagram, `templates/<id>.nexus.json`, with no layout. `src/app.js` draws a row per template, and `loadTemplate()` fetches the diagram and opens it through `showDocument()`, the same path a saved file takes. `scripts/update-templates.mjs` rebuilds the diagrams from the pinned tags: it clones the sources into a temporary folder, merges them in install order so the first copy of a file wins, parses the files `isModelConfig()` in `src/parser.js` accepts and serializes the model with `documentFromGraph()` on a headless graph. Its helpers live in `scripts/lib/template-sources.mjs`. No upstream config is committed.

## Commands

```bash
# Serve the app at http://127.0.0.1:8000 (ES modules don't load over file://)
npm start

# Copy the files that ship (index.html, src/, assets/, templates/) into _site/
npm run assemble

# Run all linters (ESLint, Prettier)
npm run lint

# Auto-fix code style issues
npm run lint-fix

# Run all tests (unit, then end-to-end)
npm run test

# Unit tests only (Node's built-in test runner)
npm run test-unit

# End-to-end tests only (Playwright)
npm run test-e2e

# Unit tests with coverage (reports in .logs/)
npm run test-coverage

# Rebuild every template diagram, or 1 of them, from its pinned sources
npm run update-templates
npm run update-templates -- civictheme
```

## Testing Patterns

- `tests/unit/*.test.js` use `node:test` and `node:assert` against the pure model modules, with shared fixtures in `tests/fixtures/`.
- `tests/unit/assemble.test.js` runs `npm run assemble` and checks that `_site/` holds every file `index.html` and the templates load, so a file the app needs can't be left out of a deploy.
- `tests/unit/templates.test.js` checks every template against its saved diagram: `templates/` holds exactly 1 diagram per template, each is titled by the template's label and version and holds no layout or type settings, and `documentToModel()` draws exactly the bundles the template advertises.
- `tests/unit/template-sources.test.js` covers the update script's helpers: reading and merging the config folders in `tests/fixtures/template-sources/` with the first copy of a file winning, and building a diagram from `tests/fixtures/config-min.js` that opens as the model `parseConfig()` draws, then counting its bundles. The helpers import the vendored `assets/vendor/cytoscape.min.js`, which sets `globalThis.cytoscape`.
- `tests/unit/release.test.js` checks that every constant `release.yml` stamps is one its source module exports.
- `tests/unit/logo.test.js` checks that the `nexus` icon in `src/icons.js` draws the same shapes as `logo.svg`, that `logo.svg` turns its ink white in a dark colour scheme, and that the README shows it.
- `tests/unit/entity-types.test.js` checks the built-in entity types, and that the edit palette in `index.html` offers a button for each of them, in order.
- `tests/unit/export-formats.test.js` checks the export formats and runs `loadExportFormat()` and `saveExportFormat()` against fake windows: a stored id that names no format loads nothing, and a storage that throws on access, read or write breaks nothing.
- `tests/unit/icons.test.js` checks the icon lookup and that every `data-icon` in `index.html` names an icon `src/icons.js` draws.
- `tests/unit/document.test.js` imports the vendored `assets/vendor/cytoscape.min.js`, which sets `globalThis.cytoscape`, and saves headless graphs with `documentFromGraph()`. A headless graph needs `layout: { name: 'preset' }` to keep the positions it's given, and `styleEnabled: true` for `visible()` to honour `display: none`. A styled graph also needs `cy.destroy()` once the test is done, or the test process never exits. Its full document holds every key of the saved format and must survive a save unchanged, so a format change updates that document and the schema in the `src/document.js` docblock together.
- `tests/unit/references.test.js` syncs headless graphs built from a `ContentModel` with `syncReferenceElements()`: the elements and data each reference gets, removal when a reference goes, copied label and cardinality edits, renamed proxies kept in place, and a graph already in sync left untouched.
- `tests/unit/label-fit.test.js` measures text with a fake function (10 units a character) and checks that `wrapLabel()` wraps the way Cytoscape does, the room `SHAPE_ROOM` gives each shape at a height, and that `fitWidth()` widens a box until every line clears its shape by exactly the inset. `wrapLabel()` mirrors the wrapping in the vendored Cytoscape build, so a Cytoscape upgrade means checking it again.
- `tests/unit/history.test.js` edits headless graphs the way the builder does. It checks snapshots, changes and their composition, that either side of a change restores the graph and its reference elements exactly, and the `History` rules: undo and redo, dropping undone steps, coalescing and what ends it, rebasing, the step limit and jumps between any 2 versions of a session. Cytoscape keeps the objects it's given, so it also checks that editing a restored graph leaves the stored versions alone.
- `tests/unit/packing.test.js` checks `packColumns()` on small boxes: the arrangement takes the frame's shape, keeps the boxes in order, gives a tall box a column of its own, sizes each column by its widest box and spaces boxes by the gap.
- `tests/unit/store.test.js` raises panels through the store's actions and checks that the raised panel lands on top and that raised panels never leave 1 band of z-indexes, however often they're raised. Node has no `window`, so the store starts from its default layout.
- `tests/e2e/app.spec.js` drives the app with Playwright against `tests/server.mjs`, a dependency-free static server on port 8000, with config fixtures in `tests/e2e/fixtures/`. Code inside `page.evaluate()` runs in the browser, not in Node. A Shoelace dropdown reopened while its close animation runs stays open but hidden, so `exportFrom()` waits for the Export menu to close before it returns. `locator.focus()` leaves a Shoelace button unfocused, so a keyboard test calls the button's own `focus()` through `evaluate()`.
- Coverage counts only the modules the unit tests load (`"all": false` in `.c8rc.json`), so browser-only modules don't count against the CI threshold.

## Coding Conventions

- ES modules with single quotes and 2-space indentation; Prettier formats with `printWidth: 160`.
- `camelCase` for variables, functions and properties.
- All files must end with a newline character.

## CI/CD

- `.github/workflows/test-nodejs.yml` - lint, unit tests with coverage on Node 22 and 24, a Playwright end-to-end job, and a Netlify deploy that runs once both pass: each pull request to its own preview, `main` to the project's main URL. The deploy reads the `NETLIFY_SITE_ID` variable and the `NETLIFY_AUTH_TOKEN` secret and is skipped without them. A new push to a pull request cancels its superseded run, while runs for `main` queue so they deploy in order
- `.github/workflows/release.yml` - on a published release, assembles `index.html`, `src/`, `assets/` and `templates/` into `_site` with `npm run assemble`, stamps the version and deploys to GitHub Pages at https://nexus.drevops.com
- `.github/workflows/draft-release-notes.yml` - keeps a draft release up to date as pull requests merge
- `.github/workflows/assign-author.yml` - assigns each pull request to its author
- `renovate.json` - Renovate keeps npm packages and the SHA-pinned actions up to date

## Updating from the template

This project was generated from a template and can pull the template's latest infrastructure (CI workflows, linting and test configuration, Docker, and docs) at any time. When you are asked to "update scaffold", fetch the updater skill from the template repository into the local `.claude/skills/` directory, then invoke it:

1. Create the target directory if it does not exist:

   ```bash
   mkdir -p .claude/skills/update-consumer-scaffold
   ```

2. Download the skill:

   ```bash
   curl -sSL https://raw.githubusercontent.com/AlexSkrypnyk/scaffold/main/.scaffold/skills/update-consumer-scaffold/SKILL.md -o .claude/skills/update-consumer-scaffold/SKILL.md
   ```

3. Invoke the `update-consumer-scaffold` skill and follow its steps.

The skill directory is fetched on demand and is git-ignored - it is not committed to the project.
