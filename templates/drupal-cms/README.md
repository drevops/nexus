# Drupal CMS 2.2.2

The content model of [Drupal CMS](https://www.drupal.org/project/cms) 2.2.2, offered as a template on the Nexus landing screen.

`npm run update-templates -- drupal-cms` builds this folder from the sources below. To change it, edit the template in `src/templates.js` and run the command again rather than editing these files.

## Sources

| Source | Tag | Commit | Config folders |
|---|---|---|---|
| Drupal core | `11.4.8` | `610445080717` | `core/recipes/document_media_type/config`, `core/recipes/image_media_type/config`, `core/recipes/local_video_media_type/config`, `core/recipes/remote_video_media_type/config`, `core/recipes/user_picture/config` |
| Drupal CMS | `2.2.2` | `0ec04b6be82b` | `recipes/drupal_cms_site_template_base/config`, `recipes/drupal_cms_forms/config`, `recipes/drupal_cms_search/config` |
| Byte site template | `1.1.0` | `4ca173a3ac39` | `config` |

The YAML files of every folder listed are merged into `config/` in the order shown, and `manifest.json` lists them. When 2 folders ship the same file, the first copy wins, as it does when Drupal installs them in that order.

## Licence

These sources are released under GPL-2.0-or-later, the licence Nexus uses too.
