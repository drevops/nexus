# Privacy and security

Nexus runs entirely in your browser, so your configuration and diagrams never reach a server. This page covers what Nexus stores, when your data leaves the browser and how Nexus handles files from other people.

## Privacy

Nexus has no backend. The configuration you import and the diagrams you build stay in your browser's memory. They leave it only when you save or export a file, or copy a link, which carries the diagram inside it.

Your preferences stay in the browser's `localStorage`, under 3 keys:

| Key | What it holds |
|-----|---------------|
| `nexusTheme` | The light or dark theme |
| `nexusSettings` | The [settings](settings.md), such as the entity colors, and the line style |
| `nexusLayout` | The places and sizes of the panels |

The page sets no cookies. To remove every preference, clear the site's data in your browser.

Nexus is provided as is, without warranty of any kind, and the authors accept no responsibility or liability for any data you load into it or create with it.

## Security

Nexus opens files from anywhere: config folders, `.nexus.json` documents, links and replies pasted into **Create with AI**. It reads each one as data and runs none of it:

- Text from a file is drawn as text, so markup in a label shows as written.
- An entity type's color must be a 6- or 8-digit hex value, its symbol 1 of the listed shapes and its name a machine name. Any other value falls back to the default. The same checks apply to the settings stored in your browser.
- A Content Security Policy lets the page run only its own scripts and fetch only its own files and the `data:` icons Shoelace draws.

Help text and bundle descriptions show only basic formatting, such as bold, italics, lists and links. Nexus drops every other tag, and drops scripts and styles with their content. A link in help text, a description or a Note never opens a page.

[Shared links](sharing.md#link-protection) covers the checks on a link's content.

## Report a vulnerability

The [Nexus security policy](https://github.com/drevops/nexus/blob/main/SECURITY.md) explains how to report a vulnerability and how to verify a release.
