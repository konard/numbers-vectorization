# Issue 1: Single Raster Line Vectorization

## Issue Summary

Issue #1 asks for a first implementation of raster-to-SVG vectorization for
single handwritten numeric strokes. The goal is not digit recognition. The goal
is to reconstruct a simple SVG path from raster data, then demonstrate the
algorithm with MNIST examples and live pencil input in the GitHub Pages app.

## Requirements

| Requirement                                                      | Implementation in this PR                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Construct an SVG path that closely matches a raster image        | Added `vectorizeRasterLine`, which emits simplified SVG path data and a standalone SVG document.                              |
| Use MNIST data to build and test the approach                    | Added a reproducible generator and a compact 50-sample MNIST module for the demo.                                             |
| Do not classify digits in the first phase                        | The package exposes vectorization only; labels are displayed only as sample metadata.                                         |
| Treat handwritten text as a simple single SVG line               | The algorithm extracts a one-pixel skeleton and chooses the longest endpoint path as the centerline.                          |
| Find stroke endpoints and preserve right-angle direction changes | Endpoint graph traversal, endpoint extension back to the raster mask, and corner-preserving simplification are implemented.   |
| Provide a website demo with 50 MNIST examples                    | The universal React app now has a 50-sample MNIST picker and raster/skeleton/SVG views.                                       |
| Allow iPad + Apple Pencil drawing in the browser                 | The app uses pointer events and pressure-aware canvas drawing.                                                                |
| Do not cheat with pointer coordinates                            | The drawing canvas is read with `getImageData`; only raster pixels are passed to the vectorizer.                              |
| Run efficiently on CPU only                                      | The implementation is dependency-free JavaScript: thresholding, Zhang-Suen thinning, graph traversal, and RDP simplification. |
| Collect issue research under `docs/case-studies/issue-1`         | This file records sources, options, requirements, and the selected plan.                                                      |

## Source Notes

- MNIST is the right smoke-test dataset because the source images are small
  28x28 grayscale handwritten digits. The original dataset page is Yann LeCun's
  MNIST page: <https://yann.lecun.com/exdb/mnist/>.
- The local generator uses the commonly mirrored IDX gzip files at
  <https://storage.googleapis.com/cvdf-datasets/mnist/> because the LeCun host
  was not reachable over HTTPS from this environment during implementation.
- Potrace is a mature bitmap tracing tool that converts bitmap images into
  smooth vector outputs such as SVG: <https://potrace.sourceforge.net/>.
- Peter Selinger's Potrace paper describes an outline-based tracing algorithm:
  <https://potrace.sourceforge.net/potrace.pdf>.
- ImageTracer.js is a JavaScript raster image tracer and vectorizer:
  <https://github.com/jankovicsandras/imagetracerjs>.
- Zhang and Suen's thinning algorithm is the standard reference for the
  two-subiteration skeletonization approach used here:
  <https://doi.org/10.1145/357994.358023>.

## Library and Component Evaluation

Potrace and ImageTracer.js are useful references for outline vectorization.
They trace filled foreground regions and are good candidates for future exact
outline matching. They do not directly solve the phase-one requirement to infer
a single centerline stroke for handwriting.

The selected implementation uses skeletonization instead:

1. Convert grayscale, binary, or RGBA pixels to a foreground mask.
2. Apply Zhang-Suen thinning to reduce the mask to a one-pixel skeleton.
3. Build an 8-neighbor graph over skeleton pixels.
4. Pick the longest endpoint-to-endpoint path as the primary stroke.
5. Extend path endpoints back to the foreground mask extent.
6. Preserve sharp direction changes and simplify the remaining polyline.
7. Estimate stroke width from foreground area divided by raw path length.
8. Emit SVG path data and standalone SVG markup.

## Tradeoffs

This PR targets single connected strokes. It intentionally ignores secondary
branches when choosing the longest endpoint path, which is appropriate for the
first phase but not enough for multi-stroke digits, cursive text, or exact
outline preservation.

The generated SVG is a centerline path with a round stroke. That closely matches
single-line handwriting and keeps the path simple. Pixel-perfect filled-region
matching would require an additional outline tracing mode, likely inspired by
Potrace or ImageTracer.js, and can be layered on top of the existing mask output.

## Verification Plan

- Unit tests cover diagonal strokes, right-angle strokes, RGBA canvas data,
  blank rasters, and SVG document generation.
- The universal app test verifies that the demo imports the vectorizer, ships 50
  MNIST samples, and reads pointer input from canvas image data.
- Local verification should include `npm test`, `npm run check`, and
  `npm run example:web:build`.
