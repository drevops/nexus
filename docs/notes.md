# Notes

Nexus has 2 kinds of notes: a Note, which holds formatted text anywhere on the diagram, and a note badge, which attaches plain text to 1 entity, field or annotation. This page covers adding both and the Markdown a Note reads.

## Add a Note

A Note holds text anywhere on the diagram. To add one, switch to **Edit**, click **Note** in the **Add** bar (`Shift`+`N`) and click the canvas. Write the text in the **Text** box of the Inspector. The Note grows to fit it and wraps lines at 240 pixels.

To change a Note later, select it in Edit mode. To remove it, click **Delete note** in the Inspector.

## Format a Note

A Note reads this Markdown:

| Markdown | Draws |
|----------|-------|
| `# Heading`, `## Heading`, `### Heading` | A heading. Levels 4 to 6 draw as level 3 |
| `**bold**` | **Bold** text |
| `*italic*` or `_italic_` | *Italic* text |
| `__underline__` | Underlined text |
| `~~strikethrough~~` | ~~Struck-through~~ text |
| `` `code` `` | Code |
| `[label](https://example.com)` | A link. Hover over it to see its address |
| A blank line | A new paragraph |

A backslash keeps the next punctuation mark as written, so `\*` draws `*`. An underscore inside a word stays as written, so `field_tags_more` draws as typed. HTML shows as written, and a link never opens a page. PNG and SVG exports show each Note's text without formatting.

## Attach a note to a node

Every entity, field and annotation has a **Note** box in the Inspector. Text you write there shows as a note badge at the node's top-right corner. Rest the pointer on the badge to read the note.

A note badge shows its text as written, without formatting. Badges hide when you zoom far out, and while their node is faded.

The [Markdown](exporting.md#markdown) and [HTML](exporting.md#html) exports include the note of every entity and field, and the bundles CSV includes each bundle's note. The saved diagram keeps every note, including Notes on the canvas and the notes of annotations.
