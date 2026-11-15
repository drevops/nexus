# Annotation overlay

An annotation overlay is a YAML file that adds events, APIs, callbacks, Notes and calculated fields to a diagram you import from a config folder. This page shows the file's format and every key it reads.

## Write an overlay

An annotation overlay draws the parts of a site that Drupal configuration leaves out, such as domain events, external APIs and integration callbacks. It's a YAML file named `annotations.yml` or `nexus.annotations.yml`, anywhere in the config folder you import. Nexus reads 1 overlay per import, so keep 1 in the folder. This one describes a conference site:

```yaml
title: 'Example content model'
nodes:
  - id: ticketing_api
    kind: api
    label: 'Ticketing API'
  - id: sync_registrations
    kind: callback
    label: 'Sync registrations'
    method: POST
    attach: node.event
  - id: session_published
    kind: event
    label: SessionPublished
    attach: node.session
edges:
  - { from: session_published, to: ticketing_api, label: notifies }
computed_fields:
  node.session:
    - { name: duration, label: 'Duration' }
```

## Keys

Every key is optional. The following table lists what each key draws:

| Key | What it draws |
|-----|---------------|
| `title` | The diagram's title, in place of `Content model` |
| `nodes` | 1 Event, API, Callback or Note node per item |
| `nodes[].id` | The node's id, which `attach` and `edges` refer to. An item without an `id` draws nothing |
| `nodes[].kind` | The node's symbol: `event` (diamond), `api` (hexagon), `callback` (rounded rectangle) or `note` (a [Note](notes.md)). A missing or unknown kind draws an Event |
| `nodes[].label` | The text in the node. Defaults to its `id`. A Note doesn't draw it |
| `nodes[].attach` | An edge to the node from the node with this id, such as `node.event` |
| `nodes[].method` | A second line of text in the node, such as an HTTP verb |
| `nodes[].note` | A note badge that shows this text. A Note draws this text as its Markdown instead |
| `edges` | 1 edge between 2 nodes per item |
| `edges[].from`, `edges[].to` | The ids of the edge's start and end nodes. An item without both draws nothing |
| `edges[].label` | The text on the edge. Defaults to none |
| `computed_fields` | Calculated fields, listed under the id of the entity they belong to, such as `node.session` |
| `computed_fields.<id>[].name` | The field's machine name. An item without a `name` draws nothing |
| `computed_fields.<id>[].label` | The field's label. Defaults to its `name` |

## Ids

`attach`, `edges` and `computed_fields` find nodes by id:

- An entity's id is its entity type and bundle, joined by a dot: `node.session`.
- A field's id is `field:`, its entity's id, a colon and the field's machine name: `field:node.session:field_speakers`.
- An annotation's id is the `id` it's given in `nodes`. Give each annotation an `id` that no other node has.

An `attach`, an edge or a `computed_fields` entry that names an id the diagram doesn't have draws nothing. `computed_fields` takes entity ids only.

The overlay applies only when you import a config folder, including a folder you [compare](comparing.md) with. To add annotations to an open diagram, use the **Add** bar in Edit mode. See [Building a model](building.md#add-an-annotation).
