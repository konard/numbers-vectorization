// Checks which Links Notation shapes the `links-notation` parser accepts.
import { Parser } from 'links-notation';

const parser = new Parser();
const sample = `(n1: node 3.5 4.5)
(n2: node 7 8.25)
(e3: edge n1 n2)
(e3points: points (3.5 4.5) (5 6) (7 8.25))
(stroke1: stroke (e3 n1 n2) (e3 n2 n1 retrace))`;
const links = parser.parse(sample);
console.log(JSON.stringify(links, null, 1).slice(0, 1500));
console.log(links.map((link) => link.toString()).join('\n'));
