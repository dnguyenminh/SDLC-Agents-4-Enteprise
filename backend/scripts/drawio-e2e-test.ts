/**
 * Manual end-to-end test: copy a diagram, run handleDrawioLayout, verify output.
 */
import * as fs from 'fs';
import * as path from 'path';
import { handleDrawioLayout } from '../src/engine/tools/drawio-tool.js';

async function main(): Promise<void> {
  const fixture = path.resolve(import.meta.dirname ?? process.cwd(), '..', '..', 'documents', 'SA4E-ENRICHMENT', 'diagrams', 'deployment.drawio');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? '/tmp'), 'e2e-'));
  const file = path.join(tmpDir, 'deployment.drawio');
  fs.copyFileSync(fixture, file);
  console.log('Working on:', file);
  const result = await handleDrawioLayout({ file_path: file, algorithm: 'layered' }, tmpDir);
  const parsed = JSON.parse(result);
  console.log('Result:', JSON.stringify(parsed, null, 2));
  if (!parsed.error) {
    const after = fs.readFileSync(file, 'utf-8');
    console.log('--- OUTPUT (first 3000 chars) ---');
    console.log(after.substring(0, 3000));
  }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

void main();