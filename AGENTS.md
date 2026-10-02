# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

Nexus is a static web app that draws a Drupal site's content model from its exported configuration, entirely in the browser. There's no backend and no build step: `index.html` loads ES modules from `assets/` plus vendored libraries from `assets/vendor/`, and GitHub Pages serves the files as they are.

The project was created from the Scaffold template, which supplies the CI workflows, the linting and test tooling, and the Renovate configuration.

## Application Architecture

- **Entry point:** `index.html` declares an import map for Preact, Preact hooks and htm, loads the classic vendor scripts (Cytoscape, Dagre, cytoscape-dagre, cytoscape-svg, js-yaml) and the Shoelace autoloader, then starts `assets/app.js`.
- **Model builder (pure, no DOM):** `assets/parser.js` turns parsed config YAML into a `ContentModel` from `assets/model.js`; `assets/base-fields.js` adds curated system fields and `assets/annotations.js` applies the optional `annotations.yml` overlay.
- **Documents:** `assets/document.js` converts between the live graph and a saved `.nexus.json` document.
- **UI (browser only):** `assets/render.js` draws the model with Cytoscape, `assets/builder.js` adds build-mode editing, `assets/inspector.js` and `assets/ui.js` are Preact components over Shoelace controls, `assets/store.js` is the shared UI store, `assets/export.js` handles PNG and SVG export, and `assets/icons.js` holds inline SVG icons.
- **Version:** `assets/version.js` ships as `dev`; the release workflow stamps the release tag into the deployed copy.
- **Vendored libraries:** `assets/vendor/` holds third-party builds. Don't edit, lint or format them.
- **Example:** `examples/example/` is the bundled demo configuration, loaded through its `manifest.json`.

## Commands

```bash
# Serve the app at http://127.0.0.1:8000 (ES modules don't load over file://)
npm start

# Copy the files that ship (index.html, assets/, examples/) into _site/
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
- `tests/e2e/app.spec.js` drives the app with Playwright against `tests/server.mjs`, a dependency-free static server on port 8000, with config fixtures in `tests/e2e/fixtures/`. Code inside `page.evaluate()` runs in the browser, not in Node.
- Coverage counts only the modules the unit tests load (`"all": false` in `.c8rc.json`), so browser-only modules don't count against the CI threshold.

## Coding Conventions

- ES modules with single quotes and 2-space indentation; Prettier formats with `printWidth: 160`.
- `camelCase` for variables, functions and properties.
- All files must end with a newline character.

## CI/CD

- `.github/workflows/test-nodejs.yml` - lint, unit tests with coverage on Node 22 and 24, a Playwright end-to-end job, and a Netlify deploy that runs once both pass: each pull request to its own preview, `main` to the project's main URL. The deploy reads the `NETLIFY_PROJECT_NAME` variable and the `NETLIFY_AUTH_TOKEN` secret and is skipped without them. A new push to a pull request cancels its superseded run, while runs for `main` queue so they deploy in order
- `.github/workflows/release.yml` - on a published release, assembles `index.html`, `assets/` and `examples/` into `_site` with `npm run assemble`, stamps the version and deploys to GitHub Pages
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
