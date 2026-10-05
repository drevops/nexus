# CivicTheme 1.13.0

The content model of [CivicTheme](https://www.drupal.org/project/civictheme) 1.13.0, offered as a template on the Nexus landing screen.

`npm run update-templates -- civictheme` builds this folder from the sources below. To change it, edit the template in `src/templates.js` and run the command again rather than editing these files.

## Sources

| Source | Tag | Commit | Config folders |
|---|---|---|---|
| CivicTheme | `1.13.0` | `e079dbb0a036` | `config/install`, `config/optional` |

The YAML files of every folder listed are merged into `config/` in the order shown, and `manifest.json` lists them. When 2 folders ship the same file, the first copy wins, as it does when Drupal installs them in that order.

## Licence

These sources are released under GPL-2.0-or-later, the licence Nexus uses too.
