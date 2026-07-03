# PBS example

A real exported Drupal configuration used to demonstrate Nexus.

- `config/` - the exported configuration directory (the input).
- `annotations.yml` - an optional overlay adding the Event / API / Callback flow and calculated fields that are not expressed in configuration.
- `content-model.html` - the generated, self-contained diagram. Open it directly in a browser.

Regenerate it with:

```bash
vendor/bin/nexus examples/pbs/config -a examples/pbs/annotations.yml -o examples/pbs/content-model.html
```
