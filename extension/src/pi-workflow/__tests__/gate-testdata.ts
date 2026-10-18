/**
 * Test data loaders for the pi-workflow-gate suites (STC v1.2 testdata CSVs
 * under documents/SA4E-336/testdata). Shared by pi-workflow-gate.test.ts and
 * pi-workflow-gate-bash-content.test.ts.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTDATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../documents/SA4E-336/testdata');

export function loadCsv(file: string): Record<string, string>[] {
  const raw = fs.readFileSync(path.join(TESTDATA_DIR, file), 'utf8').trim();
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

/** Minimal CSV splitter honoring double-quoted cells. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
