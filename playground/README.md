# Playground

A quick way to see what the tool produces without wiring anything up.

```bash
playground/run.sh
```

This renders the bundled PBS example (`examples/pbs/config`) with its annotation overlay and writes a self-contained, timestamped HTML report to `playground/.output/` (git-ignored). Open the printed path in a browser.

Render a different configuration by passing a path (and, optionally, an annotation overlay):

```bash
playground/run.sh path/to/config
playground/run.sh path/to/config path/to/annotations.yml
```

Each run is stamped with a `YYYYMMDD-HHMMSS` timestamp, so repeated runs accumulate side by side instead of overwriting each other.
