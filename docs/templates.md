# Templates

Nexus ships the content models of 5 Drupal distributions and themes, and each one opens in 1 click. Use a template to try Nexus, to study how a distribution models its content or as a starting point for your own model.

## Open a template

The **Start from a template** column of the landing screen lists 1 row per template. Each row shows the template's name, its version, a 1-line summary and the bundles it draws, such as `3 content types · 31 paragraph types · 6 media types`.

To open a template, click its row, or press its number from `1` to `5` on the landing screen. The diagram replaces any open diagram, and its history starts over.

Nexus downloads the templates in the background while the landing screen is open, and a bar along the bottom of each row fills as its download arrives. When a download fails, the row's title says so, and a click on the row tries again.

A template opens like a saved diagram without a layout, so Nexus lays it out with your settings on the **New diagrams** tab of [Settings](settings.md#new-diagrams).

## The templates

The following table lists what each template draws:

| Template | What it draws |
|----------|---------------|
| [Drupal CMS](https://www.drupal.org/project/cms) | Drupal CMS with its Byte site template: a utility page, a blog post, tags and 5 media types |
| [CivicTheme](https://www.drupal.org/project/civictheme) | The government design system: 3 content types built from 31 paragraph types, plus its media types, vocabularies and blocks |
| [Umami](https://www.drupal.org/docs/umami-drupal-demonstration-installation-profile) | Drupal core's food magazine demo: articles, recipes, pages, 2 vocabularies, 5 media types and 4 block types |
| [Thunder](https://www.thunder.org) | The Drupal distribution for professional publishers: 3 content types built from 9 paragraph types, plus 7 media types, channels and tags |
| [Open Social](https://www.drupal.org/project/social) | The community and intranet distribution: topics, events, pages, albums, landing pages and courses, with 20 paragraph types, 11 vocabularies, 1 media type and 9 block types |

Each template is drawn from the configuration of an exact release, and the badge on its row names that release. Drupal CMS builds its landing pages with Canvas, so its diagram has no landing page content type. Umami ships with Drupal core, so its version is the core release it comes from. Open Social keeps groups, profiles and posts in entity types that Nexus doesn't draw, so the diagram leaves out their fields. A field that references a group points to a placeholder entity.

## Suggest a template

To ask for another theme or distribution, click **Suggest a template** under the template list. The link opens the Nexus issue queue on GitHub in a new tab.
