# Contributing

Thank you for considering a contribution to Nexus. This guide covers setting up a local environment, hosting your own copy, running the linting and tests, checking a diagram document, updating the content-model templates and the vendored libraries, previewing a pull request on Netlify, how a release reaches GitHub Pages, and pulling in updates from the project template.

## Local setup

Nexus has no build step: it's static ES modules in `src/` plus vendored libraries under `assets/vendor/`. Browsers won't load ES modules over `file://`, so run the bundled dev server and open http://127.0.0.1:8000:

    npm install
    npm start

Set `PORT` to serve on another port, for example `PORT=8001 npm start`.

To try the latest code merged into `main` without a local setup, open the [development version](https://drevops-nexus.netlify.app) (see [Previews on Netlify](#previews-on-netlify)).

## Host your own copy

To host Nexus yourself, copy the files the site ships into `_site/`:

    npm run assemble

Then serve `_site/` from any static web server.

## Built with

The page loads its own ES modules from `src/` and these libraries from `assets/vendor/`:

- [Preact](https://preactjs.com/) and [htm](https://github.com/developit/htm) render the interface.
- [Shoelace](https://shoelace.style/) supplies the buttons, menus and form controls.
- [Cytoscape.js](https://js.cytoscape.org/) draws the diagram, with [Dagre](https://github.com/dagrejs/dagre) and [cytoscape-dagre](https://github.com/cytoscape/cytoscape.js-dagre) for the layouts and [cytoscape-svg](https://github.com/kinimesi/cytoscape-svg) for the SVG export.
- [js-yaml](https://github.com/nodeca/js-yaml) reads the configuration files.

The icons come from [Lucide](https://lucide.dev/).

[`vendor.json`](vendor.json) records the npm package and version of each library (see [Update a vendored library](#update-a-vendored-library)).

## Linting and tests

    npm run lint
    npm run test

`npm run lint` checks the code with ESLint and Prettier, and `npm run lint-fix` fixes what it can. `npm run test` runs both suites, which you can also run on their own:

- `npm run test-unit` - Node's built-in test runner over the pure model modules (the parser, model, annotations, document, reference elements, edit history, entity types, save formats, keyboard shortcuts, templates, name conversions and the Create with AI prompt), the label fitting that sizes entity boxes and the template update helpers, plus checks that `npm run assemble` ships every file the app loads, the skill and `llms.txt`, that each template's saved diagram carries its version and the bundles its landing row advertises, that the release workflow stamps only constants the source exports, that the page's Nexus mark matches `logo.svg`, that every icon the page names is drawn, that every shortcut on the page parses and none clash, and that the edit palette offers every built-in entity type. They also check that the document schema accepts every saved document and template, and that the `create-nexus-diagram` skill's tables and example match the code. The security tests check that the vendored libraries match `vendor.json` and that the Content Security Policy lists each inline script. They check that `src/` fetches only its own files and evaluates no code from strings. They also check that every workflow grants permissions per job and pins its actions.
- `npm run test-e2e` - Playwright drives the app end to end in Chromium: importing, rendering, editing, saving and exporting. It needs its browser installed once with `npx playwright install chromium`. The suite starts the dev server on port 8000, or reuses one already listening there - so if another checkout is serving that port, stop it first or the tests run against that checkout's code.
- `npm run test-coverage` - the unit tests with c8 coverage, written to `.logs/`.

## How the code is organized

The app's own code lives in `src/`. The third-party builds it loads live in `assets/vendor/`. Don't edit those (see [Update a vendored library](#update-a-vendored-library)).

- `src/{parser,model,base-fields,annotations,document,references,history,entity-types,names}.js` - the offline model builder, the built-in entity types, the name conversions, the saved `.nexus.json` format, the proxies and collapsed edges drawn for each reference and the edit history (pure, dependency-free).
- `src/templates.js` - the content-model templates the landing screen offers, with the upstream sources each one is built from (pure).
- `src/save-formats.js` - the formats the toolbar's Save as menu offers (pure).
- `src/type-styles.js` - the symbols an entity type can take and the checks on the colors, symbols and custom types that come from documents and stored settings (pure).
- `src/agent-skill.js` - the prompt and install command of the Create with AI dialog, and the reading of a pasted reply (pure).
- `src/shortcuts.js` - the keyboard shortcut syntax, the key presses each shortcut matches, its label and where the F1 view draws it (pure).
- `src/render.js` - the Cytoscape renderer, with `src/label-fit.js` working out how wide each entity box must be for its name and type to fit inside its shape (pure).
- `src/{builder,inspector,ui,store,undo,keyboard,dom}.js` - edit mode, the Preact panels, the state they share, undo and redo, the keyboard shortcuts and their F1 view, and the `$()` element lookup.
- `src/ai-dialog.js` - the Create with AI dialog.
- `src/{app,export}.js` - the entry point (folder loading, saved documents, the Open and Save buttons, the theme and the status bar) and every download: the PNG, SVG and CSV exports and the `.nexus.json` document.
- `src/icons.js` - inline SVG icons, including the Nexus mark.
- `src/version.js` - the version string, `dev` until a release stamps it.
- `src/styles.css` - the page's styles.
- `templates/` - 1 saved `.nexus.json` diagram per template.
- `scripts/update-templates.mjs` - rebuilds the template diagrams, with its helpers in `scripts/lib/`.
- `schema/nexus.schema.json` - the JSON Schema of the `.nexus.json` format, shipped with the site.
- `scripts/check-diagram.mjs` - checks documents against the schema and the rules it can't express, with the checks in `scripts/lib/diagram-check.mjs`.
- `skills/create-nexus-diagram/SKILL.md` - the skill an AI agent follows to write a diagram from another source.
- `vendor.json` - the npm package, version and SHA-256 digest of each library in `assets/vendor/`, with `scripts/check-vendor.mjs` checking the files against npm.

`index.html` sets a Content Security Policy that lists a `sha256-` hash for each inline `<script>`. After you change an inline script, `npm run test-unit` fails and prints the hash to put in the policy.

The repository's `.npmrc` sets `ignore-scripts=true`, so `npm install` runs no dependency's install script.

Each built-in entity type, annotation kind, save format and name conversion is defined once: the entity types in `src/entity-types.js`, the annotation kinds in `src/annotations.js`, the save formats in `src/save-formats.js` and the conversions in `src/names.js`. Import them from there rather than copying them into another module, so the copies can't drift apart. Adding an entity type also means adding its button to the edit palette in `index.html`, and `npm run test-unit` fails until you do. In the same way, a new key that `src/annotations.js` reads fails the unit tests until the README's [Annotation overlay](README.md#annotation-overlay) table documents it.

The buttons in the toolbar, the edit palette, the status bar and the landing screen have keyboard shortcuts, each named in its button's `data-shortcut` attribute in the syntax the `src/shortcuts.js` docblock describes. Give a new button a shortcut too, along with an `id`, which the F1 view labels it by. `npm run test-unit` fails while a shortcut doesn't parse, a control with a shortcut has no `id`, or 2 controls on the same screen share a key.

The Nexus mark lives in 3 places: `logo.svg` for the README, `assets/favicon.svg` for the browser tab and the `nexus` icon in `src/icons.js` for the page. The 2 files switch to white ink in a dark color scheme by themselves, while the page's copy takes its colors from `src/styles.css` so it follows the app's theme toggle. A change to the mark's shapes goes into all 3, and `npm run test-unit` fails while `src/icons.js` and `logo.svg` differ.

Every change a user makes to the diagram should be undoable. Once an action has finished changing the graph, record it with `checkpoint(label)` from `src/undo.js`, and pass a coalesce key as well from a text field, so typing makes 1 step. Record in the action itself rather than in the helpers it calls, so 1 action stays 1 step. A display change that moves nodes without changing the model runs through `untracked()` instead, so undo leaves its layout alone.

`schema/nexus.schema.json` defines the saved `.nexus.json` format. A change to what a document holds goes into that schema and into the full document in `tests/fixtures/saved-document.js`. The unit tests open that document into a headless Cytoscape graph, save it again and fail unless the copy matches the original exactly. They also fail while the schema declares a key the full document lacks, or the other way round. A change to the entity types, the builder's field types or the base fields fails them until the `create-nexus-diagram` skill lists it.

## Check a diagram document

To check a `.nexus.json` document before you open it, such as one an AI agent wrote, run this command in a clone of this repository:

    npm run check-diagram -- path/to/diagram.nexus.json

The command prints each error and warning with the JSON Pointer of the part it's about, and `OK` for a document with neither. An error marks a break in the format or a part of the model that gets lost, such as 2 entities with the same id. A warning marks a part that opens but isn't drawn, such as a reference to an entity the document doesn't define. The command exits with 1 when any document has an error.

## Updating the templates

The landing screen's templates are listed in `src/templates.js`, and each ships as a saved diagram, `templates/<id>.nexus.json`. CivicTheme and Drupal CMS are pinned to exact upstream tags and rebuilt from them by 1 command:

    npm run update-templates
    npm run update-templates -- civictheme

With no argument it rebuilds every template. For each upstream source it clones only the listed config folders at the pinned tag into a temporary folder under `.artifacts/tmp/`, then draws the files the parser reads into the template's diagram with the same parser the app uses. The diagram carries no layout, so the app lays it out when it opens, the same as a dropped config folder. The clones are deleted afterward, so no upstream config ends up in the repository.

To move a template to a new release, change the source's `ref` and the template's `version` in `src/templates.js`, run the command and commit the rebuilt diagram with the change. A release that adds or removes bundles makes the command print the counts to put in `src/templates.js`, and `npm run test-unit` fails until they match. The same tests fail while a diagram's title names another version, so the version can't be bumped without rebuilding the diagram.

A template's sources are listed in the order Drupal installs them. A recipe never overwrites config that an earlier one created, so when 2 folders ship the same file the first copy wins, and the command reports each copy it skips. Drupal CMS keeps its content model in recipes rather than 1 config folder, so its template merges Drupal core's media type and user picture recipes, then the Drupal CMS base, forms and search recipes, then the Byte site template that installs them. The rest of its recipe tree adds roles, settings and email config but no bundles or fields, so it's left out.

## Update a vendored library

Each library in `assets/vendor/` is a published npm build, copied byte for byte. [`vendor.json`](vendor.json) records the package, version and path in the package of each one, with the SHA-256 digest of the copy. For a folder such as `assets/vendor/shoelace`, the digest covers every file in it.

To move a library to a new version:

1. Download the package and unpack it:

       npm pack cytoscape@3.31.0
       tar -xzf cytoscape-3.31.0.tgz

2. Copy the file that `source` names in `vendor.json` from `package/` over the vendored file.

    Shoelace's components import chunks whose names change between versions, so replace its whole folder. Copy the loaders and the 5 folders the page uses from `package/cdn/`, then delete the type declarations:

       rm -rf assets/vendor/shoelace
       mkdir assets/vendor/shoelace
       cp -R package/cdn/chunks package/cdn/components package/cdn/themes package/cdn/translations package/cdn/utilities package/cdn/shoelace.js package/cdn/shoelace-autoloader.js assets/vendor/shoelace/
       find assets/vendor/shoelace -name '*.d.ts' -delete

3. Set the library's `version` in `vendor.json`, and its `source` if the path in the package changed.
4. Check the vendored files against npm:

       npm run check-vendor

    Confirm that every library prints `OK`.

5. Run `npm run test-unit`. The vendor test fails and prints the new digest. Put that digest in the library's `sha256` in `vendor.json`, and run the tests again.

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

Every push to `main` updates a draft release that lists the pull requests merged since the last one. A release goes out when a maintainer pushes the draft's tag. Only maintainers and admins can create, move or delete tags.

To publish a release:

1. Open the draft release on GitHub and note its tag, such as `1.2.3`.
2. Fetch `main`, tag its latest commit with that version and push the tag:

       git fetch origin main
       git tag 1.2.3 origin/main
       git push origin 1.2.3

The tag push runs `.github/workflows/release.yml` in 3 jobs:

1. **Build** assembles `index.html`, `llms.txt`, `src/`, `assets/`, `templates/`, `schema/` and `skills/` with `npm run assemble` and stamps the tag as the app version. It packs the site into `nexus-<version>.tar.gz`, lists the checksum of every file in `checksums.txt` and attests the provenance of both files.
2. **Publish** attaches both files to the draft with the same tag, or to a new draft when none matches, and publishes it.
3. **Deploy** deploys the site to GitHub Pages, which serves it at https://nexus.drevops.com.

A tag that isn't a version, such as `v1.2.3`, or a tag on a commit that isn't on `main` fails the workflow before anything is built. Releases are immutable, so a published release keeps its files and its tag. Publish a release only by pushing its tag. A release published with the draft's **Publish release** button can't take files afterward, so it ships without them, though the site still deploys. [`SECURITY.md`](SECURITY.md#verify-a-release) shows how to verify a release's files.

Pushes to `main` never touch GitHub Pages: they run the tests and update the Netlify project's main address.

GitHub Pages needs setting up once, under **Settings → Pages**: choose "GitHub Actions" as the source, enter `nexus.drevops.com` as the custom domain, and tick **Enforce HTTPS** once GitHub has issued the certificate. The domain resolves through a `CNAME` record for `nexus` in the `drevops.com` DNS zone that points at `drevops.github.io`. The repository has no `CNAME` file, because Pages ignores one when a workflow does the deploying. The old address, https://drevops.github.io/nexus/, redirects to the new one.

## Updating from the template

Nexus was created from the [Scaffold](https://getscaffold.dev/) project template. To pull the template's latest infrastructure into this project, ask Claude Code to "update scaffold" - see [`AGENTS.md`](AGENTS.md) for details.
