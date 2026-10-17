// Checks how the `links-notation` parser reads the indented stroke network
// document (issue 7: prefer the indented structured form).
import { Parser } from 'links-notation';

const sample = `vectorization:
  raster 28 28
  pen 2.5
  network:
    p1: point 9.5 4.5
    p2: point 14.5 20.5
    l3: link p1 p2
      points (9.5 4.5) (12 9) (14.5 20.5)
  strokes:
    stroke1:
      l3 p1 p2
      l3 p2 p1 retrace
    stroke2:
      p1
`;
const parser = new Parser();
const show = (group, depth = 0) => {
  console.log(`${'  '.repeat(depth)}${group.element.toString()}`);
  group.children.forEach((child) => show(child, depth + 1));
};

parser.parseGroups(sample).forEach((group) => show(group));
console.log('--- parse()');
console.log(
  parser
    .parse(sample)
    .map((link) => link.toString())
    .join('\n')
);
