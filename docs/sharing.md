# Shared links

**Copy link** puts the whole diagram inside a link, so anyone who opens the link sees the same model with nothing to download or upload. This page covers copying a link, opening one, how Nexus protects a link and how much diagram a link holds.

## Copy a link

Click the caret beside **Save** in the toolbar, then **Copy link**. **Copy link** puts the whole diagram inside the link, after `#doc=`. The diagram travels in the link itself. Anyone who opens the link sees the same model, layout and colors.

The **Copy link** dialog shows the link and copies it to your clipboard. When your browser doesn't allow the copy, the dialog selects the link so you can copy it yourself, and **Copy link** in the dialog tries again. The dialog's **How links are protected** and **Link limits** links open [Link protection](#link-protection) and [Link limits](#link-limits).

The link leaves out your panel places, so whoever opens it keeps their own. The link can also name 1 entity, so it opens centered on that entity. It names the entity the Inspector shows, or the entity you've focused in View mode. When that's a field, the link names the field's entity.

To center the diagram on 1 bundle yourself, add `&focus=<entity id>`, such as `&focus=node.event`, to the end of the link.

## Open a link

Open the link in a browser. Nexus reads the diagram from the link and draws it, and it sends no request for the diagram. The link stays in the address bar, so reloading the page opens the diagram again.

When a link can't be opened, the landing screen shows `Could not open that diagram:` and the reason.

## Link protection

Nexus compresses the diagram with `deflate`, which ends the data with an Adler-32 checksum of the diagram. A chat app or a bad copy can change a character of the link, and the checksum then stops matching. Nexus shows "Could not open that diagram: The link is incomplete or damaged." and opens nothing.

The checksum catches only accidental damage, because anyone can write a new link with a matching checksum. Treat a link like a file from the person who sent it. Nexus reads every link's diagram as data and runs none of it:

- Labels, notes and descriptions are drawn as text, so markup in them shows as written. A Note formats only its [Markdown](notes.md#format-a-note).
- An entity type's color, symbol and name go through the checks listed under [Security](privacy-and-security.md#security). Any other value falls back to the default.
- The Content Security Policy runs only Nexus's own scripts, so a link can't run code in your browser.
- Unpacking stops at 5 MB, so a crafted link can't fill the page's memory.
- A `focus` that names anything but an entity is ignored.
- Opening a link changes none of your stored settings, and the link carries no panel layout.

## Link limits

A link has these limits:

- Copy link hands out links of up to 32,000 characters, counting the page address. For a bigger diagram, the dialog shows the link's length and offers **Save .nexus.json** instead.
- Each character of a link holds about 10 bytes of diagram, and each node's position adds about 17 characters. The CivicTheme template, with 49 entities and 270 fields, makes a link of about 14,000 characters with its layout.
- Chat apps, ticket trackers and email clients can cut or wrap a long link. If a link fails to open, send the `.nexus.json` file.
- A link someone else built can be longer than 32,000 characters and still opens. Its diagram can unpack to at most 5 MB.
