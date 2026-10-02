# Contributing

Thank you for considering a contribution to Nexus. This guide covers setting up a local environment, running the linting and tests, previewing a pull request on Netlify, and how a release reaches GitHub Pages.

## Local setup

Nexus has no build step: it's static ES modules plus vendored libraries under `assets/vendor/`. Browsers won't load ES modules over `file://`, so run the bundled dev server and open http://127.0.0.1:8000:

    npm install
    npm start

## Linting and tests

    npm run lint
    npm run test

`npm run lint` checks the code with ESLint and Prettier, and `npm run lint-fix` fixes what it can. `npm run test` runs both suites, which you can also run on their own:

- `npm run test-unit` - Node's built-in test runner over the pure model modules (the parser, model, annotations and document), plus a check that `npm run assemble` ships every file the app loads.
- `npm run test-e2e` - Playwright drives the app end to end: upload, render and export. It needs its browser installed once with `npx playwright install chromium`.
- `npm run test-coverage` - the unit tests with c8 coverage, written to `.logs/`.

## How the code is organized

- `assets/{parser,model,base-fields,annotations}.js` - the offline model builder (pure, dependency-free).
- `assets/render.js` - the Cytoscape renderer.
- `assets/{app,export}.js` - folder loading and PNG/SVG/CSV export.

## Previews on Netlify

Every pull request gets a live preview, so you can click through a change before it merges. The `Deploy to Netlify` job in `.github/workflows/test-nodejs.yml` waits for every other job in that workflow, so it runs only once linting, the unit tests on each Node version and the end-to-end suite have all passed. It builds `_site/` with `npm run assemble`, the same step a release uses, then uploads it to the Netlify project:

- A pull request deploys to its own address, `https://deploy-preview-<number>--<project>.netlify.app`, and the job posts that link as a comment on the pull request. Later pushes update the same address and the same comment.
- A push to `main` deploys to the project's main address, `https://<project>.netlify.app`, so it always shows the latest merged code.

Scheduled runs never deploy. Pull requests from forks don't either, because GitHub doesn't pass repository secrets to them. A new push to a pull request cancels the run it replaces, so an older build can't overwrite a newer preview. To see exactly what gets published, run `npm run assemble` and look in `_site/`.

The job needs 2 repository settings, under **Settings → Secrets and variables → Actions**:

| Name                   | Kind     | Value                                                         |
|------------------------|----------|---------------------------------------------------------------|
| `NETLIFY_PROJECT_NAME` | Variable | The Netlify project's name, for example `drevops-nexus`.      |
| `NETLIFY_AUTH_TOKEN`   | Secret   | A Netlify personal access token that can deploy that project. |

Without the variable the job is skipped, and without the token its deploy step is. The workflow uploads the assembled files itself, so the Netlify project shouldn't build from this repository as well: keep it unlinked from Git, or stop its builds.

## Releasing

Every push to `main` updates a draft release that lists the pull requests merged since the last one. Publishing that draft creates its tag and triggers `.github/workflows/release.yml`, which assembles `index.html`, `assets/` and `examples/` with `npm run assemble`, stamps the release tag as the app version and deploys the site to GitHub Pages. Pushes to `main` never touch GitHub Pages: they run the tests and update the Netlify project's main address. Pages needs enabling once, with "GitHub Actions" as the source.
