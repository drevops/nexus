# Vendored front-end libraries

These files are bundled so the generated diagram is a single, self-contained HTML file that renders offline with no network access at view time. `HtmlRenderer` inlines them into the output.

| File | Library | Version | License | Source |
|------|---------|---------|---------|--------|
| `cytoscape.min.js` | Cytoscape.js | 3.30.4 | MIT | https://unpkg.com/cytoscape@3.30.4/dist/cytoscape.min.js |
| `dagre.min.js` | Dagre | 0.8.5 | MIT | https://unpkg.com/dagre@0.8.5/dist/dagre.min.js |
| `cytoscape-dagre.js` | cytoscape-dagre | 2.5.0 | MIT | https://unpkg.com/cytoscape-dagre@2.5.0/cytoscape-dagre.js |

`cytoscape-dagre` is the layout adapter that lets Cytoscape.js lay the graph out with Dagre's layered (left-to-right) algorithm, which produces the tree-like content-model layout.

To refresh, re-download the same URLs at the pinned versions and keep this table in sync.
