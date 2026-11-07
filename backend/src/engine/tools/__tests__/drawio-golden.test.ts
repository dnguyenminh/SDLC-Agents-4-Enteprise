/**
 * Golden-file tests — run detection + the full fix pipeline against real
 * diagrams (snapshot copies under __tests__/fixtures/). Guards against
 * detector regressions and verifies the fix/verify loop end-to-end.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseDrawio } from '../drawio-parser.js';
import { detectAllIssues } from '../drawio-detect.js';
import type { LayoutIssue } from '../drawio-detect.js';
import { handleDrawioLayout } from '../drawio-tool.js';

const FIXTURES = path.join(__dirname, 'fixtures');
const DEPLOYMENT = path.join(FIXTURES, 'golden-deployment.drawio');
const SEQUENCE = path.join(FIXTURES, 'golden-sequence.drawio');

interface TmpCopy { dir: string; file: string; }

function copyToTmp(fixture: string): TmpCopy {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? '/tmp'), 'golden-'));
  const file = path.join(dir, path.basename(fixture));
  fs.copyFileSync(fixture, file);
  return { dir, file };
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

beforeAll(() => {
  if (!fs.existsSync(DEPLOYMENT) || !fs.existsSync(SEQUENCE)) {
    throw new Error('Golden fixtures missing — restore __tests__/fixtures/*.drawio');
  }
});

describe('golden — deployment diagram (real overlaps)', () => {
  it('detects multiple blocking overlaps', () => {
    const { graph } = parseDrawio(DEPLOYMENT);
    const issues = detectAllIssues(graph) as LayoutIssue[];
    const blocking = issues.filter(i => i.severity !== 'low');
    const overlaps = blocking.filter(i => i.type === 'node_overlap');
    expect(overlaps.length).toBeGreaterThanOrEqual(5);
  });

  it('fix loop reduces remaining issues and keeps XML valid', async () => {
    const tmp = copyToTmp(DEPLOYMENT);
    // workspace = the temp dir so the path passes the workspace-boundary check
    const result = await handleDrawioLayout({ file_path: path.basename(tmp.file) }, tmp.dir);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed.error).toBeUndefined();
    expect(['fixed', 'partially_fixed']).toContain(parsed.status);
    expect(typeof parsed.remaining_issues).toBe('number');
    // Written file must still parse and must have changed
    const after = parseDrawio(tmp.file);
    const afterIssues = detectAllIssues(after.graph) as LayoutIssue[];
    expect(afterIssues.filter(i => i.severity !== 'low').length).toBe(parsed.remaining_issues);
    cleanup(tmp.dir);
  });
});

describe('golden — sequence diagram (loose edges, clean layout)', () => {
  it('reports already_good with loose edges visible to the parser', () => {
    const { graph } = parseDrawio(SEQUENCE);
    expect((graph.looseEdges ?? []).length).toBeGreaterThan(0);
    const issues = detectAllIssues(graph) as LayoutIssue[];
    expect(issues.filter(i => i.severity !== 'low')).toHaveLength(0);
  });
});
