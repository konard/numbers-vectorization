// Point counts for the four (auto vs fixed tolerance) under the corner span.
import { vectorizeRasterLine } from '../src/index.js';
import { fourRaster } from '../tests/helpers/issue-7-shapes.js';

const raster = fourRaster(30);
for (const simplifyTolerance of ['auto', 0.85]) {
  const r = vectorizeRasterLine(raster, { simplifyTolerance });
  console.log(
    simplifyTolerance,
    r.coverage.penWidth,
    r.path,
    JSON.stringify(r.simplification.shapes)
  );
}
