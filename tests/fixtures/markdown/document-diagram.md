# Event site

## Contents

- [Diagram](#diagram)
- [Content types](#content-types)
  - [Contents](#contents-1)
  - [Page](#page)
  - [Session \| Talk](#session--talk)
- [Vocabularies](#vocabularies)
  - [Tags](#tags)
- [Paragraph types](#paragraph-types)
  - [Page](#page-1)
- [Gadget](#gadget)
  - [Any Gadget](#any-gadget)
  - [Beacon](#beacon)
- [Widget](#widget)
  - [Dial](#dial)

## Diagram

```mermaid
flowchart LR
  subgraph t1["Content types"]
    e1["Contents"]
    e2["Page"]
    e3["Session #124; Talk"]
  end
  subgraph t2["Vocabularies"]
    e4["Tags"]
  end
  subgraph t3["Paragraph types"]
    e5["Page"]
  end
  subgraph t4["Gadget"]
    e6["Any Gadget"]
    e7["Beacon"]
  end
  subgraph t5["Widget"]
    e8["Dial"]
  end
  x1["taxonomy_term.topics"]
  x2["Any Media"]
  e2 -->|"Sessions (1..n)"| e3
  e2 -->|"Gadget (1)"| e6
  e3 -->|"Tags (1..3)"| e4
  e3 -->|"Tags (1..3)"| x1
  e3 -->|"Media (1)"| x2
  e5 -->|"Items (1..n)"| e5
```

## Content types

### Contents

Machine name: `contents`

No fields.

### Page

Machine name: `page`

| Field | Machine name | Type | Cardinality | Required | References | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Sessions | `field_sessions` | `entity_reference` | 1..n | Yes | [Session \| Talk](#session--talk) |  |
| Gadget | `field_gadget` | `entity_reference` | 1 | No | [Any Gadget](#any-gadget) |  |

### Session \| Talk

Machine name: `session`

> Talks and \*workshops\*.<br>
> \- Run on day 2
>
> 1\. Keep under 45 minutes

| Field | Machine name | Type | Cardinality | Required | References | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Title (base field) | `title` | `string` | 1 | Yes |  |  |
| Tags | `field_tags` | `entity_reference` | 1..3 | No | [Tags](#tags), `taxonomy_term.topics` | Pick \`up to\` 3.<br>Use \$ prices & \<b\>bold\</b\> sparingly. |
| Media | `field_media` | `entity_reference` | 1 | No | Any Media |  |
| Pipe name | `field_a\|b` | `string` | 1 | No |  |  |

Referenced by: Sessions on [Page](#page).

## Vocabularies

### Tags

Machine name: `tags`

| Field | Machine name | Type | Cardinality | Required | References | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Name (base field) | `name` | `string` | 1 | Yes |  |  |

Referenced by: Tags on [Session \| Talk](#session--talk).

## Paragraph types

### Page

Machine name: `page`

| Field | Machine name | Type | Cardinality | Required | References | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Items | `field_items` | `entity_reference_revisions` | 1..n | No | [Page](#page-1) |  |

Referenced by: Items on [Page](#page-1).

## Gadget

### Any Gadget

Machine name: `*`

No fields.

Referenced by: Gadget on [Page](#page).

### Beacon

Machine name: `beacon`

No fields.

## Widget

### Dial

Machine name: `dial`

No fields.
