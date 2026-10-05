# Radio station

A real exported Drupal configuration, offered as the example template on the Nexus landing screen.

- `config/` - the exported configuration directory (the input).
- `annotations.yml` - an optional overlay adding the Event / API / Callback flow and calculated fields that are not expressed in configuration.
- `manifest.json` - the list of `config/` filenames the app fetches when you pick the template. `npm run update-templates -- radio-station` rebuilds it from `config/`.

Open the app and pick **Radio station** under "Start from a template", or choose or drop this folder yourself. Choosing `config/` on its own loads the model without the overlay.
