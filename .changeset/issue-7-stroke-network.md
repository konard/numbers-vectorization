---
'@link-foundation/example-package-name': minor
---

Issue 7: no zig-zags, crosses as two strokes, fewest points per shape, and settings that are automatic or manual.

- Loops fused by thick ink are explained as loops, not zig-zags. Small jogs
  of the centerline are dropped.
- Where lines cross or meet straight (`+`, `x`, `T`, the bar of a `7`), the
  pen lifts instead of retracing (`penLifts`, `penLiftCost`). A stroke goes
  straight through the stroke that crosses it.
- Each shape gets the fewest points that still explain its ink
  (`simplifyTolerance: 'auto'`, `pointCost`), or a budget down to one point
  per shape (`maxPoints`).
- "Graph" is now "stroke network" (`result.network`; `result.graph` is kept
  as an alias). Links Notation output is indented.
- Pen recordings (`x y t pressure` samples) are supported:
  - kept, saved as Links Notation or JSON, parsed and rasterized
    (`parsePenRecording`, `rasterizePenRecording`, …);
  - accepted by the CLI and the HTTP API;
  - recorded, replayed, saved and loaded in the web app.
- Every option can be set by hand or chosen automatically:
  - `foreground: 'auto'` gives an Otsu threshold, and a single-color ink on a
    transparent canvas is kept whole;
  - `result.thresholding` and `result.settings` report what was used;
  - the web app has an Auto switch for every setting.
