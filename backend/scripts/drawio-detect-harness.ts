/**
 * Quick harness: run detectAllIssues against real diagrams in documents/.
 * Usage: npx tsx scripts/drawio-detect-harness.ts
 */
import * as fs from 'fs';
import * as path from 'path';

function walkDrawio(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkDrawio(full));
    else if (entry.name.endsWith('.drawio')) out.push(full);
  }
  return out;
}

async function main(): Promise<void> {
  const { parseDrawio } = await import('../src/engine/tools/drawio-parser.js');
  const { detectAllIssues } = await import('../src/engine/tools/drawio-detect.js');
  const root = path.resolve(import.meta.dirname ?? process.cwd(), '..', '..');
  const files = walkDrawio(path.join(root, 'documents'));
  const totals: Record<string, number> = {};
  let filesWithBlocking = 0;
  for (const file of files) {
    try {
      const { graph } = parseDrawio(file);
      const issues = detectAllIssues(graph) as Array<{ type: string; severity: string }>;
      const blocking = issues.filter(i => i.severity !== 'low');
      if (blocking.length > 0) filesWithBlocking++;
      for (const i of issues) totals[i.type] = (totals[i.type] ?? 0) + 1;
    } catch (e) {
      console.log(`PARSE FAIL: ${path.relative(root, file)}: ${e}`);
    }
  }
  console.log(`Scanned ${files.length} diagrams; ${filesWithBlocking} have blocking issues`);
  console.log('Issue totals:', JSON.stringify(totals, null, 2));
}

void main();
