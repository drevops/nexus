# Contributing

Thank you for considering a contribution to Nexus. This guide covers setting up a local environment, running the linting and tests, previewing a pull request on Netlify, how a release reaches GitHub Pages, how the published site counts visits, and pulling in updates from the project template.

## Local setup

Nexus has no build step: it's static ES modules in `src/` plus vendored libraries under `assets/vendor/`. Browsers won't load ES modules over `file://`, so run the bundled dev server and open http://127.0.0.1:8000:

    npm install
    npm start

Set `PORT` to serve on another port, for example `PORT=8001 npm start`.

## Linting and tests

    npm run lint
    npm run test

`npm run lint` checks the code with ESLint and Prettier, and `npm run lint-fix` fixes what it can. `npm run test` runs both suites, which you can also run on their own:

- `npm run test-unit` - Node's built-in test runner over the pure model modules (the parser, model, annotations and document) and the analytics loader, plus checks that `npm run assemble` ships every file the app loads, that the release workflow stamps only constants the source exports and rejects a malformed measurement ID, and that the page's Nexus mark matches `logo.svg`.
- `npm run test-e2e` - Playwright drives the app end to end in Chromium: importing, rendering, editing, saving and exporting. It needs its browser installed once with `npx playwright install chromium`. The suite starts the dev server on port 8000, or reuses one already listening there - so if another checkout is serving that port, stop it first or the tests run against that checkout's code.
- `npm run test-coverage` - the unit tests with c8 coverage, written to `.logs/`.

## How the code is organized

The app's own code lives in `src/`. The third-party builds it loads live in `assets/vendor/`. Don't edit those.

- `src/{parser,model,base-fields,annotations,document}.js` - the offline model builder and the saved `.nexus.json` format (pure, dependency-free).
- `src/render.js` - the Cytoscape renderer.
- `src/{builder,inspector,ui,store}.js` - edit mode, the Preact panels and the state they share.
- `src/{app,export}.js` - the entry point (folder loading, saved documents, the theme and the status bar) and PNG/SVG/CSV export.
- `src/icons.js` - inline SVG icons, including the Nexus mark.
- `src/version.js` - the version string, `dev` until a release stamps it.
- `src/styles.css` - the page's styles.

The Nexus mark lives in 3 places: `logo.svg` for the README, `assets/favicon.svg` for the browser tab and the `nexus` icon in `src/icons.js` for the page. The 2 files switch to white ink in a dark colour scheme by themselves, while the page's copy takes its colours from `src/styles.css` so it follows the app's theme toggle. A change to the mark's shapes goes into all 3, and `npm run test-unit` fails while `src/icons.js` and `logo.svg` differ.

## Previews on Netlify

Once the repository settings below are in place, every pull request from a branch of this repository gets a live preview, so you can click through a change before it merges. The `Deploy to Netlify` job in `.github/workflows/test-nodejs.yml` waits for every other job in that workflow, so it runs only once linting, the unit tests on each Node version and the end-to-end suite have all passed. It builds `_site/` with `npm run assemble`, the same step a release uses, then uploads it to the Netlify project:

- A pull request deploys to its own address, `https://deploy-preview-<number>--drevops-nexus.netlify.app`, and the job posts that link as a comment on the pull request. Later pushes update the same address and the same comment.
- A push to `main` deploys to the project's main address, `https://drevops-nexus.netlify.app`, so it always shows the latest merged code.

Scheduled runs never deploy. Pull requests from forks don't either, because GitHub doesn't pass repository secrets to them. A manual run from the Actions tab does deploy: from `main` to the main address, and from any other branch to a one-off draft address that the job prints in its log. To see exactly what gets published, run `npm run assemble` and look in `_site/`.

A new push to a pull request cancels the run it replaces, so an older build can't overwrite a newer preview. Pushes and manual runs on `main` wait for each other instead, so the newest commit always deploys last.

The job needs 2 repository settings, under **Settings → Secrets and variables → Actions**:

| Name                 | Kind     | Value                                                         |
|----------------------|----------|---------------------------------------------------------------|
| `NETLIFY_SITE_ID`    | Variable | The Netlify project's ID, a UUID (not its name).              |
| `NETLIFY_AUTH_TOKEN` | Secret   | A Netlify personal access token that can deploy that project. |

Without the variable the job is skipped, and without the token its deploy step is. The workflow uploads the assembled files itself, so the Netlify project shouldn't build from this repository as well: keep it unlinked from Git, or stop its builds.

## Releasing

Every push to `main` updates a draft release that lists the pull requests merged since the last one. Publishing that draft creates its tag and triggers `.github/workflows/release.yml`, which assembles `index.html`, `src/`, `assets/` and `examples/` with `npm run assemble`, stamps the release tag as the app version and deploys the site to GitHub Pages, which serves it at https://nexus.drevops.com. Pushes to `main` never touch GitHub Pages: they run the tests and update the Netlify project's main address.

GitHub Pages needs setting up once, under **Settings → Pages**: choose "GitHub Actions" as the source, enter `nexus.drevops.com` as the custom domain, and tick **Enforce HTTPS** once GitHub has issued the certificate. The domain resolves through a `CNAME` record for `nexus` in the `drevops.com` DNS zone that points at `drevops.github.io`. The repository has no `CNAME` file, because Pages ignores one when a workflow does the deploying. The old address, https://drevops.github.io/nexus/, redirects to the new one.

## Analytics

The published site counts visits with Google Analytics. `src/analytics-id.js` ships with an empty measurement ID, so a local copy, the tests and the Netlify previews load no analytics. A release stamps the ID into the deployed copy, the same way it stamps the version, from 1 repository setting under **Settings → Secrets and variables → Actions**:

| Name                  | Kind     | Value                                                                                       |
|-----------------------|----------|---------------------------------------------------------------------------------------------|
| `GOOGLE_ANALYTICS_ID` | Variable | The measurement ID of the GA4 web data stream for `nexus.drevops.com`, like `G-XXXXXXXXXX`. |

Without the variable, the release skips the stamp and the site loads no analytics. A value that isn't shaped like a measurement ID fails the release instead, because a stray quote would break the stamped module and switch analytics off without an error anyone would see.

`index.html` starts `src/analytics.js` from its own module, never through `src/app.js`, so an ad blocker that blocks the analytics files can't stop the app - an end-to-end test blocks them and loads a diagram to prove it. Every hit reports the page title as "Nexus", because the browser tab shows the open diagram's title, and that's often a client's name.

## Updating from the template

Nexus was created from the [Scaffold](https://getscaffold.dev/) project template. To pull the template's latest infrastructure into this project, ask Claude Code to "update scaffold" - see [`AGENTS.md`](AGENTS.md) for details.
