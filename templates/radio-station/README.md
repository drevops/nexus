# Example

A real exported Drupal configuration used to demonstrate Nexus.

- `config/` - the exported configuration directory (the input).
- `annotations.yml` - an optional overlay adding the Event / API / Callback flow and calculated fields that are not expressed in configuration.
- `manifest.json` - the list of `config/` filenames, so the app's "Try the example" button can fetch and parse them.

Open the app and click **Try the example**, or choose or drop this folder yourself. Choosing `config/` on its own loads the model without the overlay.
