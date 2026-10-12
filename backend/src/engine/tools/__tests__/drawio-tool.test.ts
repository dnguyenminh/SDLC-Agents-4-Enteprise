/**
 * SA4E-84 — Unit tests for drawio_auto_layout (FIX mode).
 * Tests: input validation, issue detection, auto-fix via ELK, file write.
 */

import { describe, it, expect } from 'vitest';
import { handleDrawioLayout, DRAWIO_TOOL_DEFINITION, detectAllIssues } from '../drawio-tool.js';
import { normalizeLayoutArgs } from '../drawio-apply.js';
import { parseDrawio } from '../drawio-parser.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Clean diagram — no issues expected
const SIMPLE_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="240" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="n1" target="n2">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;

// Bad layout — overlapping nodes
const BAD_LAYOUT_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="50" y="50" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n3" value="C" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="240" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="n1" target="n3">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;

describe('DRAWIO_TOOL_DEFINITION', () => {
  it('has correct tool name', () => {
    expect(DRAWIO_TOOL_DEFINITION.name).toBe('drawio_auto_layout');
  });

  it('requires file_path', () => {
    expect(DRAWIO_TOOL_DEFINITION.inputSchema.required).toContain('file_path');
  });

  it('does not have mode property (always fix)', () => {
    const props = DRAWIO_TOOL_DEFINITION.inputSchema.properties as Record<string, unknown>;
    expect(props.mode).toBeUndefined();
  });

  it('has algorithm, spacing, direction optional params', () => {
    const props = DRAWIO_TOOL_DEFINITION.inputSchema.properties as Record<string, unknown>;
    expect(props.algorithm).toBeDefined();
    expect(props.spacing).toBeDefined();
    expect(props.direction).toBeDefined();
  });
});

describe('detectAllIssues', () => {
  it('detects node overlaps', () => {
    const tmp = writeTmp(BAD_LAYOUT_DIAGRAM);
    const { graph } = parseDrawio(tmp);
    const issues = detectAllIssues(graph) as Array<{ type: string }>;
    const overlaps = issues.filter(i => i.type === 'node_overlap');
    expect(overlaps.length).toBeGreaterThan(0);
    cleanup(tmp);
  });

  it('returns no issues for clean diagram', () => {
    const tmp = writeTmp(SIMPLE_DIAGRAM);
    const { graph } = parseDrawio(tmp);
    const issues = detectAllIssues(graph);
    expect(issues.length).toBe(0);
    cleanup(tmp);
  });
});

describe('handleDrawioLayout — input validation', () => {
  it('returns error when file_path missing', async () => {
    const result = await handleDrawioLayout({}, os.tmpdir());
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('file_path is required');
  });

  it('returns error when file_path is blank', async () => {
    for (const blank of ['', '   ']) {
      const result = await handleDrawioLayout({ file_path: blank }, os.tmpdir());
      expect(JSON.parse(result).error).toContain('file_path is required');
    }
  });

  // STC: UT-10 branch (b) — path present but rejected (escape / workspace
  // mismatch) yields the disambiguated message, not "file_path is required".
  it('returns a Path-rejected error when the path escapes the workspace', async () => {
    const result = await handleDrawioLayout({ file_path: '../escape.drawio' }, os.tmpdir());
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('Path rejected:');
    expect(parsed.error).toContain('outside backend workspace');
    expect(parsed.error).toContain('route file-content tools through the extension proxy');
    expect(parsed.error).not.toContain('file_path is required');
  });

  it('returns error when file does not exist', async () => {
    const result = await handleDrawioLayout({ file_path: path.join(os.tmpdir(), 'nonexistent-xyz.drawio') }, os.tmpdir());
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('File not found');
  });
});

describe('resolveFilePath win32 fold (STC UT-15, SEC-04)', () => {
  it('accepts drive-letter casing variants on win32', async () => {
    if (process.platform !== 'win32') return;
    const { resolveFilePath } = await import('../drawio-tool.js');
    const ws = 'c:\\be-ws';
    expect(resolveFilePath('C:\\BE-WS\\diagram.drawio', ws)).not.toBeNull();
    expect(resolveFilePath('c:\\be-ws\\diagram.drawio', 'C:\\BE-WS')).not.toBeNull();
  });

  it('still rejects genuine outside paths on win32 (no loosening)', async () => {
    if (process.platform !== 'win32') return;
    const { resolveFilePath } = await import('../drawio-tool.js');
    expect(resolveFilePath('C:\\outside\\evil.drawio', 'c:\\be-ws')).toBeNull();
  });

  it('compares strictly on posix (safe direction)', async () => {
    if (process.platform === 'win32') return;
    const { resolveFilePath } = await import('../drawio-tool.js');
    expect(resolveFilePath('/BE-WS/diagram.drawio', '/be-ws')).toBeNull();
    expect(resolveFilePath('/be-ws/diagram.drawio', '/be-ws')).not.toBeNull();
  });
});

describe('handleDrawioLayout — already_good', () => {
  it('returns already_good for clean diagram', async () => {
    const tmp = writeTmp(SIMPLE_DIAGRAM);
    const workspace = path.dirname(path.dirname(tmp)); // parent of temp dir
    const result = await handleDrawioLayout({ file_path: tmp }, workspace);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('already_good');
    expect(parsed.message).toBeDefined();
    // No extra fields (token saving)
    expect(parsed.nodes).toBeUndefined();
    expect(parsed.edges).toBeUndefined();
    expect(parsed.issues).toBeUndefined();
    // File should NOT be modified
    const after = fs.readFileSync(tmp, 'utf-8');
    expect(after).toBe(SIMPLE_DIAGRAM);
    cleanup(tmp);
  });
});

describe('handleDrawioLayout — auto-fix', () => {
  it('fixes overlapping diagram and writes to file', async () => {
    const tmp = writeTmp(BAD_LAYOUT_DIAGRAM);
    const workspace = path.dirname(path.dirname(tmp));
    const result = await handleDrawioLayout({ file_path: tmp, algorithm: 'layered', direction: 'DOWN' }, workspace);
    const parsed = JSON.parse(result);
    if (parsed.error) throw new Error(`Unexpected error: ${parsed.error}`);
    expect(parsed.status).toBe('fixed');
    expect(parsed.message).toContain('nodes repositioned');
    // Minimal response — no extra fields
    expect(parsed.repositioned_nodes).toBeUndefined();
    expect(parsed.content_base64).toBeUndefined();
    expect(parsed.issues).toBeUndefined();
    // File should be modified
    const after = fs.readFileSync(tmp, 'utf-8');
    expect(after).not.toBe(BAD_LAYOUT_DIAGRAM);
    expect(after).toContain('<mxCell');
    cleanup(tmp);
  });
});

describe('normalizeLayoutArgs', () => {
  it('returns defaults for empty args', () => {
    const result = normalizeLayoutArgs({});
    expect(result.algorithm).toBe('layered');
    expect(result.spacing).toBe(80);
    expect(result.direction).toBe('DOWN');
  });

  it('normalizes direction to uppercase', () => {
    const result = normalizeLayoutArgs({ direction: 'right' });
    expect(result.direction).toBe('RIGHT');
  });

  it('falls back invalid algorithm to layered', () => {
    const result = normalizeLayoutArgs({ algorithm: 'invalid' });
    expect(result.algorithm).toBe('layered');
  });

  it('falls back negative spacing to 80', () => {
    const result = normalizeLayoutArgs({ spacing: -10 });
    expect(result.spacing).toBe(80);
  });
});

function writeTmp(xml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-test-'));
  const file = path.join(dir, 'test.drawio');
  fs.writeFileSync(file, xml, 'utf-8');
  return file;
}

function cleanup(file: string): void {
  try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch { /* ignore */ }
}
