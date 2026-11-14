---
name: add-nexus-template
description: Use when adding a Drupal distribution, install profile, recipe set or site template to the landing screen of the Nexus repository as a ready-made content-model template - on "add <name> as a Nexus template", "add a template for <distribution>", "add this site template to Nexus" or a drupal.org or GitHub project link to turn into a template. Researches the upstream config folders, writes the TEMPLATES entry, builds the diagram with npm run update-templates, reviews what it draws and updates the tests and docs that list every template.
---

# Add a Nexus template

Nexus's landing screen offers ready-made content models, each drawn from the exported config of an exact upstream release. A template is 1 entry in `TEMPLATES` in `src/templates.js` plus the saved diagram `npm run update-templates` builds from it. This skill covers everything around that entry: finding the config, checking what it draws and updating the tests and docs that list every template.

The rules for an entry and the notes on each existing template live in the **Updating the templates** section of `CONTRIBUTING.md`. Read it first.

## Steps

1. **Research the upstream** (see [Find the config](#find-the-config)).
2. **Write the entry** (see [Write the entry](#write-the-entry)).
3. **Build the diagram** with `npm run update-templates -- <id>`.
4. **Review what it draws** (see [Review the diagram](#review-the-diagram)) and fix the sources until it draws the content model the upstream installs.
5. **Update the tests** that list every template (see [Update the tests](#update-the-tests)).
6. **Update the docs** that list every template (see [Update the docs](#update-the-docs)).
7. **Check** with `npm run test-unit`, `npm run lint` and the e2e specs (see [Check](#check)).
8. **Report** what the template draws, what it leaves out and why.

## Find the config

The template is only as good as the folders it reads. Work it out from the upstream repository, not from memory.

1. **Find the repository.** A drupal.org project lives at `https://git.drupalcode.org/project/<machine name>.git`. Many distributions develop on GitHub instead; take the repository the project page links as its source.
2. **Pick the tag.** List the tags with `git ls-remote --tags --refs <repo>` and take the highest stable one. The update workflow follows only tags shaped `X.Y.Z` or `vX.Y.Z`, so a project tagged only `8.x-1.0` or `1.0.0-beta1` can't follow its releases. Report it and leave the project out.
3. **Check the license.** Nexus is GPL-2.0-or-later, and so is everything on drupal.org. A project hosted elsewhere must be GPL-compatible, or it can't be drawn.
4. **List the config.** Clone the tag without its files and list every file the parser reads:

   ```bash
   git clone --quiet --depth 1 --filter=blob:none --no-checkout --branch <tag> <repo> .artifacts/tmp/<id>-source
   git -C .artifacts/tmp/<id>-source ls-tree -r --name-only HEAD | grep -E '/(node\.type|taxonomy\.vocabulary|media\.type|paragraphs\.paragraphs_type|block_content\.type|field\.storage|field\.field)\.[^/]+\.yml$'
   ```

   Those prefixes are `MODEL_PREFIXES` in `src/parser.js`. Each folder that holds a match is a candidate for `paths`: `config/install`, `config/optional`, `recipes/<recipe>/config` and the same folders in submodules.

5. **Choose the folders.** Keep a folder that ships a bundle or a field of a built-in entity type. Check each module in a folder's `dependencies.module` lists against what a site installing the distribution gets: Drupal core, the install profile and the recipes. Keep the folder when they install every module it lists, such as core's `menu_ui`. Leave it out when they don't, because the site doesn't get that config either. Leave out test modules, examples and demo content.
6. **Order the sources.** List the sources in the order Drupal installs them: a dependency's folders before the folders of what depends on it. When 2 folders ship the same file, the first copy wins. A template made of several projects, such as Drupal CMS, gets 1 source per project.
7. **Delete the clone** in `.artifacts/tmp/<id>-source` after you choose the folders.

## Write the entry

Add the entry at the end of `TEMPLATES` in `src/templates.js`. The order of `TEMPLATES` is the order of the landing rows, and the digit keys 1 to 9 open the first 9.

```js
  {
    id: 'example',
    label: 'Example',
    version: '1.2.3',
    summary: 'Publishing platform: articles, events, media',
    icon: 'newspaper',
    color: '#2f6f9f',
    counts: {},
    size: 0,
    sources: [
      {
        name: 'Example',
        repo: 'https://git.drupalcode.org/project/example.git',
        ref: '1.2.3',
        paths: ['config/install', 'config/optional'],
      },
    ],
  },
```

- `id` is the kebab-case name of `templates/<id>.nexus.json`, and comes first in the entry.
- `label` is the project's own name. Exactly 1 source has the same `name`, and its `ref` is the `version`.
- `summary` is a few words on what kind of site it is, then its main bundles, in the style of the other entries.
- `icon` names an icon in `src/icons.js`. To add one, copy its path data from [Lucide](https://lucide.dev), which the module already draws from, into `PATHS`.
- `color` is a 6-digit lowercase hex from the project's brand. The mark draws a white icon on it, so it needs a contrast of at least 3:1 with white; `tests/unit/templates.test.js` checks it.
- `counts: {}` and `size: 0` are placeholders. The update rewrites both lines and throws when either is missing.
- Each source has its own `ref` line, because the update rewrites them in order.

## Review the diagram

`npm run update-templates -- <id>` clones the sources, writes `templates/<id>.nexus.json` and fills in `counts` and `size`. Read its output: it prints each file a later folder shipped again and the entity count.

Then check what the diagram draws:

- `npm run check-diagram -- templates/<id>.nexus.json` reports no errors.
- The counts match the bundles the upstream installs. A missing bundle means a missing folder; a bundle from a module the distribution doesn't enable means an extra one.
- Open it in the app with `npm start` and click its row. Placeholder entities, those whose bundle is `*`, stand for a reference with no target bundles, and entities of types outside `ENTITY_TYPE_ORDER` in `src/entity-types.js` are only reference targets. Both are fine when the upstream config says so, and both go in the e2e test (see [Update the tests](#update-the-tests)).
- The Checks panel shows no errors.

When the parser misreads a config shape the upstream uses, fix `src/parser.js` with a test in `tests/unit/parser.test.js` and rebuild every template with `npm run update-templates`, because the fix can change the others.

## Update the tests

The unit tests read `TEMPLATES` and every diagram in `templates/` on their own. These 3 e2e specs list the templates by hand:

- `tests/e2e/templates.spec.js`: the row count and ids in `lists every template with its badge, its counts and a drawn mark` and a row in `dataProviderTemplateRows()`. Add a row to `dataProviderTemplates()` too. The row holds 1 entity id the diagram must draw, its placeholder ids in diagram order and the ids of its entities of other types.
- `tests/e2e/keyboard.spec.js`: a row in `dataProviderTemplateNumbers()` with the template's digit and a title pattern. Only the first 9 templates have a digit.
- `tests/e2e/shortcut-hints.spec.js`: the row's id and digit in `labels the landing screen's controls and none of the toolbar's behind it`.

## Update the docs

- `README.md`: the template in the **Templates** feature bullet, the count in "Nexus ships N ready-made content models" and the project in the **License** paragraph. Add a row to the **Templates** table with the project link, the version and what it draws, then a sentence after the table for anything the diagram leaves out.
- `CONTRIBUTING.md`: a sentence in **Updating the templates** on where the template keeps its content model and why each folder is in `paths`.
- `AGENTS.md`: the template in the list of the **Templates** bullet.

## Check

```bash
npm run test-unit
npm run lint
npm run test-e2e -- tests/e2e/templates.spec.js tests/e2e/keyboard.spec.js tests/e2e/shortcut-hints.spec.js
```

The unit tests check the new diagram everywhere every template goes: its schema, model checks, link length, Mermaid size and CSV round trip. A large template can exceed a limit there; report it and leave the limit as it is.

Commit the entry, the icon, the diagram, the tests and the docs together, with a message such as `Added Example 1.2.3 as a landing template.`

## Report back

Report the template's counts, the folders it reads and why, the folders left out and why, and any placeholder or other-type entities it draws.
