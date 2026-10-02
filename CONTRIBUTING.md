# Contributing

Thank you for considering a contribution to Nexus. This guide covers setting up a local environment, running the linting and tests, and how a release reaches GitHub Pages.

## Local setup

Nexus has no build step: it's static ES modules plus vendored libraries under `assets/vendor/`. Browsers won't load ES modules over `file://`, so run the bundled dev server and open http://127.0.0.1:8000:

    npm install
    npm start

## Linting and tests

    npm run lint
    npm run test

`npm run lint` checks the code with ESLint and Prettier, and `npm run lint-fix` fixes what it can. `npm run test` runs both suites, which you can also run on their own:

- `npm run test-unit` - Node's built-in test runner over the pure model modules: the parser, model, annotations and document.
- `npm run test-e2e` - Playwright drives the app end to end: upload, render and export. It needs its browser installed once with `npx playwright install chromium`.
- `npm run test-coverage` - the unit tests with c8 coverage, written to `.logs/`.

## How the code is organized

- `assets/{parser,model,base-fields,annotations}.js` - the offline model builder (pure, dependency-free).
- `assets/render.js` - the Cytoscape renderer.
- `assets/{app,export}.js` - folder loading and PNG/SVG/CSV export.

[`docs/architecture/README.md`](docs/architecture/README.md) walks through every module and the main flows. It's maintained by the `update-architecture-docs` skill, so ask your AI agent to "update architecture docs" after a structural change.

## Releasing

Every push to `main` updates a draft release that lists the pull requests merged since the last one. Publishing that draft creates its tag and triggers `.github/workflows/release.yml`, which assembles `index.html`, `assets/` and `examples/`, stamps the release tag as the app version and deploys the site to GitHub Pages. Pushes to `main` only run the tests; they never deploy. Pages needs enabling once, with "GitHub Actions" as the source.
