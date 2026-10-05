# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

Nexus is a static web app that draws a Drupal site's content model from its exported configuration, entirely in the browser. There's no backend and no build step: `index.html` loads the app's own ES modules and stylesheet from `src/` plus vendored libraries from `assets/vendor/`, and GitHub Pages serves the files as they are at https://nexus.drevops.com.

The project was created from the Scaffold template, which supplies the CI workflows, the linting and test tooling, and the Renovate configuration.

## Application Architecture

- **Entry point:** `index.html` declares an import map for Preact, Preact hooks and htm, loads the classic vendor scripts (Cytoscape, Dagre, cytoscape-dagre, cytoscape-svg, js-yaml) and the Shoelace autoloader, then starts `src/app.js` and, from a separate inline module, `src/analytics.js`.
- **Model builder (pure, no DOM):** `src/parser.js` turns parsed config YAML into a `ContentModel` from `src/model.js`; `src/base-fields.js` adds curated system fields and `src/annotations.js` applies the optional `annotations.yml` overlay.
- **Shared definitions (pure):** `src/entity-types.js` lists the built-in entity types in diagram order, each with its label, default color, default symbol and the base name of bundles created on the canvas. `src/annotations.js` lists the annotation kinds, `src/names.js` converts between machine names, labels and file names, and `src/model.js` holds the default title, the reference field types and the graph id helpers. Import them from there instead of keeping a local copy, so the copies can't drift apart.
- **Documents:** `src/document.js` converts between the live graph and a saved `.nexus.json` document, and its docblock holds the schema of the saved format.
- **Reference elements:** `src/references.js` derives the render-only elements that draw each reference - a proxy beside the field, the proxy edge joining them and the overview's collapsed edge - from the ref edges of a live graph. `syncReferenceElements()` reconciles them with the graph and keeps a renamed reference's proxy in place. `render.js` runs it at render time and through the controller's `syncReferences()`, which `builder.js` and `inspector.js` call after each edit the elements depend on.
- **UI (browser only):** `src/render.js` draws the model with Cytoscape, `src/builder.js` adds build-mode editing, `src/inspector.js` and `src/ui.js` are Preact components over Shoelace controls, `src/store.js` is the shared UI store and keeps raised panels in a fixed band of z-indexes, `src/export.js` handles every download (PNG, SVG, CSV and the saved document), `src/dom.js` holds the `$()` element lookup, `src/icons.js` holds inline SVG icons and `src/styles.css` styles the page.
- **Logo and favicon:** `logo.svg` is the README logo and `assets/favicon.svg` the browser tab icon; both turn the mark's ink white under a dark colour scheme on their own. The page draws the same mark inline as the `nexus` icon in `src/icons.js`, coloured from `src/styles.css`, because Safari renders an `<img>` SVG in the system colour scheme rather than the app's theme.
- **Version:** `src/version.js` ships as `dev`; the release workflow stamps the release tag into the deployed copy.
- **Analytics:** `src/analytics.js` loads Google Analytics 4 through `gtag.js` and reports every hit with the fixed page title `Nexus`, because `document.title` holds the open diagram's title. `index.html` starts it from its own inline module, never through `src/app.js`, so an ad blocker that blocks the analytics files can't stop the app. `src/analytics-id.js` ships an empty measurement ID, so local runs, tests and Netlify previews load no analytics; the release workflow stamps the `GOOGLE_ANALYTICS_ID` repository variable into the deployed copy.
- **Vendored libraries:** `assets/vendor/` holds third-party builds. Don't edit, lint or format them.
- **Example:** `templates/radio-station/` is the bundled demo configuration, loaded through its `manifest.json`.

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
```

## Testing Patterns

- `tests/unit/*.test.js` use `node:test` and `node:assert` against the pure model modules, with shared fixtures in `tests/fixtures/`.
- `tests/unit/assemble.test.js` runs `npm run assemble` and checks that `_site/` holds every file `index.html` and the bundled example load, so a file the app needs can't be left out of a deploy.
- `tests/unit/analytics.test.js` runs `startAnalytics()` against a fake window: an empty ID loads nothing, and an ID queues the gtag commands as `Arguments` objects with the fixed page title and adds the async `gtag.js` script.
- `tests/unit/release.test.js` checks that every constant `release.yml` stamps is one its source module exports, and runs the Google Analytics stamp step's script against valid and malformed IDs.
- `tests/unit/logo.test.js` checks that the `nexus` icon in `src/icons.js` draws the same shapes as `logo.svg`, that `logo.svg` turns its ink white in a dark colour scheme, and that the README shows it.
- `tests/unit/entity-types.test.js` checks the built-in entity types, and that the edit palette in `index.html` offers a button for each of them, in order.
- `tests/unit/document.test.js` imports the vendored `assets/vendor/cytoscape.min.js`, which sets `globalThis.cytoscape`, and saves headless graphs with `documentFromGraph()`. A headless graph needs `layout: { name: 'preset' }` to keep the positions it's given, and `styleEnabled: true` for `visible()` to honour `display: none`. A styled graph also needs `cy.destroy()` once the test is done, or the test process never exits. Its full document holds every key of the saved format and must survive a save unchanged, so a format change updates that document and the schema in the `src/document.js` docblock together.
- `tests/unit/references.test.js` syncs headless graphs built from a `ContentModel` with `syncReferenceElements()`: the elements and data each reference gets, removal when a reference goes, copied label and cardinality edits, renamed proxies kept in place, and a graph already in sync left untouched.
- `tests/unit/store.test.js` raises panels through the store's actions and checks that the raised panel lands on top and that raised panels never leave 1 band of z-indexes, however often they're raised. Node has no `window`, so the store starts from its default layout.
- `tests/e2e/app.spec.js` drives the app with Playwright against `tests/server.mjs`, a dependency-free static server on port 8000, with config fixtures in `tests/e2e/fixtures/`. Code inside `page.evaluate()` runs in the browser, not in Node.
- Coverage counts only the modules the unit tests load (`"all": false` in `.c8rc.json`), so browser-only modules don't count against the CI threshold.

## Coding Conventions

- ES modules with single quotes and 2-space indentation; Prettier formats with `printWidth: 160`.
- `camelCase` for variables, functions and properties.
- All files must end with a newline character.

## CI/CD

- `.github/workflows/test-nodejs.yml` - lint, unit tests with coverage on Node 22 and 24, a Playwright end-to-end job, and a Netlify deploy that runs once both pass: each pull request to its own preview, `main` to the project's main URL. The deploy reads the `NETLIFY_SITE_ID` variable and the `NETLIFY_AUTH_TOKEN` secret and is skipped without them. A new push to a pull request cancels its superseded run, while runs for `main` queue so they deploy in order
- `.github/workflows/release.yml` - on a published release, assembles `index.html`, `src/`, `assets/` and `templates/` into `_site` with `npm run assemble`, stamps the version and, when the `GOOGLE_ANALYTICS_ID` variable is set, the Google Analytics measurement ID, and deploys to GitHub Pages at https://nexus.drevops.com
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
