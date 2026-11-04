/**
 * Debug harness: print detailed issues for specific diagrams.
 */
import * as path from 'path';
import { parseDrawio } from '../src/engine/tools/drawio-parser.js';
import { detectAllIssues } from '../src/engine/tools/drawio-detect.js';

const root = path.resolve(import.meta.dirname ?? process.cwd(), '..', '..');
const targets = process.argv.slice(2);
for (const t of targets) {
  const file = path.join(root, t);
  try {
    const { graph } = parseDrawio(file);
    const issues = detectAllIssues(graph) as Array<Record<string, unknown>>;
    const blocking = issues.filter(i => i.severity !== 'low');
    console.log(`\n=== ${t} (nodes=${graph.nodes.length}, containers=${graph.containers.length}, edges=${graph.edges.length}) — blocking: ${blocking.length}`);
    for (const i of blocking.slice(0, 12)) console.log(' ', JSON.stringify(i));
    if (blocking.length > 12) console.log(`  ... ${blocking.length - 12} more`);
  } catch (e) {
    console.log(`FAIL ${t}: ${e}`);
  }
}
