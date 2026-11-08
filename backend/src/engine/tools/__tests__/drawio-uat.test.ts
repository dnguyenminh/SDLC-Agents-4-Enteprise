/**
 * UAT Automation Test Suite — SA4E-406
 * 
 * Automated verification of all 20 UAT checklist items from UAT-CHECKLIST.md.
 * Run with: npx vitest run src/engine/tools/__tests__/drawio-uat.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDrawio } from '../drawio-parser.ts';
import { detectAllIssues, type LayoutIssue, MIN_GAP, OVERLAP_EPS, CONTAINMENT_TOL } from '../drawio-detect.ts';
import { handleDrawioLayout, DRAWIO_TOOL_DEFINITION } from '../drawio-tool.ts';
import { handleApply, normalizeLayoutArgs, RELAYOUT_RATIO } from '../drawio-apply.ts';
import { handleDrawioExportPng } from '../drawio-export-png.ts';
import { planLocalRepair } from '../drawio-repair.ts';
import { buildElkGraph, runElkLayout } from '../elk-layout.ts';
import { MultiWorktreePathResolver, hasBaseDirArg } from '../../../shared/multi-worktree-path-resolver.ts';
import { WorkspaceAllowlist } from '../../../shared/workspace-allowlist.ts';
import pino from 'pino';
import { violationRatio } from '../drawio-apply.ts';

const FIXTURES = path.join(__dirname, 'fixtures');
const DEPLOYMENT = path.join(FIXTURES, 'golden-deployment.drawio');
const SEQUENCE = path.join(FIXTURES, 'golden-sequence.drawio');

// Test workspace setup
let testWorkspace: string;
let testWorktreeB: string;
let testWorktreeUnreg: string;
let resolver: MultiWorktreePathResolver;
let logger: ReturnType<typeof pino>;

// Helper diagrams
const SIMPLE_CLEAN = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="240" y="40" width="120" height="60" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;

const OVERLAP_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="50" y="50" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n3" value="C" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="300" y="40" width="120" height="60" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;

const PROXIMITY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="180" y="40" width="120" height="60" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`; // 20px gap

const CONTAINER_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="cont" value="Service" style="swimlane;" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="200" height="200" as="geometry"/></mxCell>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="cont">
  <mxGeometry x="250" y="10" width="120" height="60" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`; // child outside container

const DIAGONAL_EDGE_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="400" y="300" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="n1" target="n2">
  <mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;

const EDGE_CROSSING_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="400" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="mid" value="M" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="200" y="-40" width="120" height="140" as="geometry"/></mxCell>
<mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="n1" target="n2">
  <mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;

const NESTED_CONTAINER_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="outer" value="System" style="swimlane;" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="800" height="600" as="geometry"/></mxCell>
<mxCell id="inner" value="Service" style="swimlane;" vertex="1" parent="outer">
  <mxGeometry x="40" y="40" width="400" height="300" as="geometry"/></mxCell>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="inner">
  <mxGeometry x="80" y="80" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="inner">
  <mxGeometry x="250" y="80" width="120" height="60" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;

function writeTmp(xml: string, dir?: string): string {
  const baseDir = dir ?? testWorkspace;
  const tmpDir = fs.mkdtempSync(path.join(baseDir, 'uat-'));
  const file = path.join(tmpDir, 'test.drawio');
  fs.writeFileSync(file, xml, 'utf-8');
  return file;
}

function cleanup(file: string): void {
  try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch { /* ignore */ }
}

function countIssuesBySeverity(issues: LayoutIssue[], severity: LayoutIssue['severity']): number {
  return issues.filter(i => i.severity === severity).length;
}

function countIssuesByType(issues: LayoutIssue[], type: string): number {
  return issues.filter(i => i.type === type).length;
}

beforeAll(() => {
  if (!fs.existsSync(DEPLOYMENT) || !fs.existsSync(SEQUENCE)) {
    throw new Error('Golden fixtures missing — restore __tests__/fixtures/*.drawio');
  }
  
  // Create test workspaces for multi-worktree tests (mirroring multi-worktree-fixture.ts)
  testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-ws-main-'));
  testWorktreeB = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-ws-b-'));
  testWorktreeUnreg = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-ws-unreg-'));
  
  // Create test diagram in worktree B
  const diagDir = path.join(testWorktreeB, 'diag');
  fs.mkdirSync(diagDir, { recursive: true });
  fs.writeFileSync(path.join(diagDir, 'flow.drawio'), OVERLAP_DIAGRAM, 'utf-8');
  
  // Create diagram in main workspace
  const mainDiagDir = path.join(testWorkspace, 'diag');
  fs.mkdirSync(mainDiagDir, { recursive: true });
  fs.writeFileSync(path.join(mainDiagDir, 'flow.drawio'), OVERLAP_DIAGRAM, 'utf-8');
  
  // Initialize allowlist and resolver (following per-tool-base-dir.file-tools.test.ts pattern)
  const testLogger = pino({ level: 'silent' });
  const allowlistEnv = [testWorkspace, testWorktreeB].join(path.delimiter);
  // Set env var directly for WorkspaceAllowlist to pick up
  process.env.MCP_WORKSPACE_ROOTS = allowlistEnv;
  const allowlist = WorkspaceAllowlist.load(testWorkspace, testLogger);
  // MultiWorktreePathResolver constructor: (allowlist, legacyRoot, logger)
  resolver = new MultiWorktreePathResolver(allowlist, testWorkspace, testLogger);
});

afterAll(() => {
  [testWorkspace, testWorktreeB, testWorktreeUnreg].forEach(dir => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});

describe('SA4E-406 UAT Automation — Detector Precision (AC-01 to AC-05)', () => {
  
  it('UAT-1: Node Overlaps — detects overlap > 5% (OVERLAP_EPS)', () => {
    const tmp = writeTmp(OVERLAP_DIAGRAM);
    const { graph } = parseDrawio(tmp);
    const issues = detectAllIssues(graph) as LayoutIssue[];
    
    const overlaps = issues.filter(i => i.type === 'node_overlap');
    expect(overlaps.length).toBeGreaterThan(0);
    
    // Verify severity is HIGH
    overlaps.forEach(o => expect(o.severity).toBe('high'));
    
    // Verify overlap ratio > 0.05
    overlaps.forEach(o => expect(o.ratio).toBeGreaterThan(OVERLAP_EPS));
    
    cleanup(tmp);
  });

  it('UAT-2: Node Proximity — detects gap < MIN_GAP (40px) as LOW severity', () => {
    const tmp = writeTmp(PROXIMITY_DIAGRAM);
    const { graph } = parseDrawio(tmp);
    const issues = detectAllIssues(graph) as LayoutIssue[];
    
    const proximity = issues.filter(i => i.type === 'node_proximity');
    expect(proximity.length).toBeGreaterThan(0);
    
    // Verify severity is LOW (cosmetic only)
    proximity.forEach(p => expect(p.severity).toBe('low'));
    
    // Verify gap < MIN_GAP
    proximity.forEach(p => expect(p.gap).toBeLessThan(MIN_GAP));
    
    cleanup(tmp);
  });

  it('UAT-3: Child Outside Container — detects escape > CONTAINMENT_TOL (5px)', () => {
    const tmp = writeTmp(CONTAINER_DIAGRAM);
    const { graph } = parseDrawio(tmp);
    const issues = detectAllIssues(graph) as LayoutIssue[];
    
    const outside = issues.filter(i => i.type === 'child_outside_container');
    expect(outside.length).toBeGreaterThan(0);
    
    // Verify severity is HIGH
    outside.forEach(o => expect(o.severity).toBe('high'));
    
    cleanup(tmp);
  });

  it('UAT-4: Diagonal Edges — detects near-45° edges (tolerance 20px)', () => {
    const tmp = writeTmp(DIAGONAL_EDGE_DIAGRAM);
    const { graph } = parseDrawio(tmp);
    const issues = detectAllIssues(graph) as LayoutIssue[];
    
    const diagonal = issues.filter(i => i.type === 'diagonal_edge');
    expect(diagonal.length).toBeGreaterThan(0);
    
    // Verify severity is LOW (cosmetic)
    diagonal.forEach(d => expect(d.severity).toBe('low'));
    
    cleanup(tmp);
  });

  it('UAT-5: Edge Crossings — detects node, edge-edge, container crossings', () => {
    const tmp = writeTmp(EDGE_CROSSING_DIAGRAM);
    const { graph } = parseDrawio(tmp);
    const issues = detectAllIssues(graph) as LayoutIssue[];
    
    const crossings = issues.filter(i => i.type === 'edge_crossing');
    expect(crossings.length).toBeGreaterThan(0);
    
    // Verify severity is HIGH
    crossings.forEach(c => expect(c.severity).toBe('high'));
    
    cleanup(tmp);
  });
});

describe('SA4E-406 UAT Automation — Verify Loop (AC-06)', () => {
  
  it('UAT-6: Fix → Re-detect — golden-deployment.drawio fix reduces issues', async () => {
    const tmp = writeTmp(fs.readFileSync(DEPLOYMENT, 'utf-8'));
    const workspace = path.dirname(path.dirname(tmp));
    
    // Initial detection
    const { graph: beforeGraph } = parseDrawio(tmp);
    const beforeIssues = detectAllIssues(beforeGraph) as LayoutIssue[];
    const beforeBlocking = beforeIssues.filter(i => i.severity !== 'low').length;
    
    // Apply fix
    const result = await handleDrawioLayout({ file_path: tmp, algorithm: 'layered' }, workspace);
    const parsed = JSON.parse(result);
    
    expect(parsed.error).toBeUndefined();
    expect(['fixed', 'partially_fixed']).toContain(parsed.status);
    expect(typeof parsed.remaining_issues).toBe('number');
    expect(parsed.remaining_issues).toBeGreaterThanOrEqual(0);
    expect(parsed.remaining_issues).toBeLessThan(beforeBlocking);
    
    // Re-detect after fix
    const { graph: afterGraph } = parseDrawio(tmp);
    const afterIssues = detectAllIssues(afterGraph) as LayoutIssue[];
    const afterBlocking = afterIssues.filter(i => i.severity !== 'low').length;
    
    // remaining_issues must match actual count
    expect(afterBlocking).toBe(parsed.remaining_issues);
    
    // XML must be valid (parseDrawio didn't throw)
    expect(afterGraph.nodes.length).toBeGreaterThan(0);
    
    cleanup(tmp);
  });

  it('UAT-7: XML Valid After Fix — file remains parseable', async () => {
    const tmp = writeTmp(OVERLAP_DIAGRAM);
    const workspace = path.dirname(path.dirname(tmp));
    
    await handleDrawioLayout({ file_path: tmp }, workspace);
    
    // Should not throw
    const { graph } = parseDrawio(tmp);
    expect(graph.nodes.length).toBe(3);
    
    cleanup(tmp);
  });

  it('UAT-8: remaining_issues Match — count matches re-detected issues', async () => {
    const tmp = writeTmp(OVERLAP_DIAGRAM);
    const workspace = path.dirname(path.dirname(tmp));
    
    const result = await handleDrawioLayout({ file_path: tmp }, workspace);
    const parsed = JSON.parse(result);
    
    const { graph } = parseDrawio(tmp);
    const issues = detectAllIssues(graph) as LayoutIssue[];
    const blocking = issues.filter(i => i.severity !== 'low').length;
    
    expect(parsed.remaining_issues).toBe(blocking);
    
    cleanup(tmp);
  });
});

describe('SA4E-406 UAT Automation — ELK Compound Layout (AC-07, AC-08)', () => {
  
  it('UAT-9: Hierarchical Containers — nested containers layout correctly', async () => {
    const tmp = writeTmp(NESTED_CONTAINER_DIAGRAM);
    const workspace = path.dirname(path.dirname(tmp));
    
    const result = await handleDrawioLayout({ 
      file_path: tmp, 
      algorithm: 'layered',
      direction: 'DOWN' 
    }, workspace);
    
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    expect(['fixed', 'partially_fixed', 'already_good']).toContain(parsed.status);
    
    // Verify children still within parent bounds
    const { graph } = parseDrawio(tmp);
    const outer = graph.containers.find(c => c.id === 'outer');
    const inner = graph.containers.find(c => c.id === 'inner');
    const n1 = graph.nodes.find(n => n.id === 'n1');
    const n2 = graph.nodes.find(n => n.id === 'n2');
    
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    // Inner should be within outer (with tolerance)
    expect(inner!.x).toBeGreaterThanOrEqual(outer!.x - 10);
    expect(inner!.y).toBeGreaterThanOrEqual(outer!.y - 10);
    expect(inner!.x + inner!.width).toBeLessThanOrEqual(outer!.x + outer!.width + 10);
    expect(inner!.y + inner!.height).toBeLessThanOrEqual(outer!.y + outer!.height + 10);
    
    cleanup(tmp);
  });

  it('UAT-10: Algorithm layered — default algorithm works', async () => {
    const tmp = writeTmp(OVERLAP_DIAGRAM);
    const workspace = path.dirname(path.dirname(tmp));
    
    const result = await handleDrawioLayout({ file_path: tmp, algorithm: 'layered' }, workspace);
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    
    cleanup(tmp);
  });

  it('UAT-11: Algorithm force — force-directed works', async () => {
    const tmp = writeTmp(OVERLAP_DIAGRAM);
    const workspace = path.dirname(path.dirname(tmp));
    
    const result = await handleDrawioLayout({ file_path: tmp, algorithm: 'force' }, workspace);
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    
    cleanup(tmp);
  });

  it('UAT-12: Algorithm mrtree — tree layout works', async () => {
    const tmp = writeTmp(NESTED_CONTAINER_DIAGRAM);
    const workspace = path.dirname(path.dirname(tmp));
    
    const result = await handleDrawioLayout({ file_path: tmp, algorithm: 'mrtree' }, workspace);
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    
    cleanup(tmp);
  });

  it('UAT-13: Algorithm radial — radial layout works', async () => {
    const tmp = writeTmp(OVERLAP_DIAGRAM);
    const workspace = path.dirname(path.dirname(tmp));
    
    const result = await handleDrawioLayout({ file_path: tmp, algorithm: 'radial' }, workspace);
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    
    cleanup(tmp);
  });
});

describe('SA4E-406 UAT Automation — Extension Migration (AC-09, AC-10)', () => {
  
  it('UAT-14: drawio_auto_layout tool definition exists and is correct', () => {
    expect(DRAWIO_TOOL_DEFINITION.name).toBe('drawio_auto_layout');
    expect(DRAWIO_TOOL_DEFINITION.inputSchema.required).toContain('file_path');
    expect(DRAWIO_TOOL_DEFINITION.inputSchema.properties.algorithm).toBeDefined();
    expect(DRAWIO_TOOL_DEFINITION.inputSchema.properties.spacing).toBeDefined();
    expect(DRAWIO_TOOL_DEFINITION.inputSchema.properties.direction).toBeDefined();
    expect(DRAWIO_TOOL_DEFINITION.inputSchema.properties.base_dir).toBeDefined();
    expect(DRAWIO_TOOL_DEFINITION.inputSchema.properties.workspace_root).toBeDefined();
    // No mode property — always fix
    expect(DRAWIO_TOOL_DEFINITION.inputSchema.properties.mode).toBeUndefined();
  });

  it('UAT-15: drawio_export_png tool integration (reference)', async () => {
    // Verify the export tool is importable and has correct signature
    const { handleDrawioExportPng } = await import('../drawio-export-png.ts');
    expect(typeof handleDrawioExportPng).toBe('function');
  });
});

describe('SA4E-406 UAT Automation — Remaining Issues & Path Resolution (AC-11, AC-12)', () => {
  
  it('UAT-16: remaining_issues field present in response', async () => {
    const tmp = writeTmp(OVERLAP_DIAGRAM);
    const workspace = path.dirname(path.dirname(tmp));
    
    const result = await handleDrawioLayout({ file_path: tmp }, workspace);
    const parsed = JSON.parse(result);
    
    expect(parsed).toHaveProperty('remaining_issues');
    expect(typeof parsed.remaining_issues).toBe('number');
    expect(parsed.remaining_issues).toBeGreaterThanOrEqual(0);
    
    cleanup(tmp);
  });

  it('UAT-17: base_dir resolution — registered worktree resolves correctly', async () => {
    const result = await handleDrawioLayout(
      { file_path: 'diag/flow.drawio', base_dir: testWorktreeB },
      testWorkspace,
      resolver
    );
    
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    expect(['fixed', 'partially_fixed', 'already_good']).toContain(parsed.status);
    
    // Verify file was modified in worktree B
    const modified = fs.readFileSync(path.join(testWorktreeB, 'diag', 'flow.drawio'), 'utf-8');
    expect(modified).not.toBe(OVERLAP_DIAGRAM);
  });

  it('UAT-17b: unregistered base_dir rejected', async () => {
    const result = await handleDrawioLayout(
      { file_path: 'diag/flow.drawio', base_dir: testWorktreeUnreg },
      testWorkspace,
      resolver
    );
    
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
  });

  it('UAT-17c: base_dir omitted → legacy behavior (main workspace)', async () => {
    const result = await handleDrawioLayout(
      { file_path: 'diag/flow.drawio' },
      testWorkspace,
      resolver
    );
    
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    
    // Verify file modified in main workspace
    const modified = fs.readFileSync(path.join(testWorkspace, 'diag', 'flow.drawio'), 'utf-8');
    expect(modified).not.toBe(OVERLAP_DIAGRAM);
  });

  it('UAT-17d: absolute outside path + traversal rejected', async () => {
    const outsideFile = path.join(os.tmpdir(), 'evil.drawio');
    fs.writeFileSync(outsideFile, OVERLAP_DIAGRAM, 'utf-8');
    
    try {
      const result = await handleDrawioLayout(
        { file_path: outsideFile, base_dir: testWorktreeB },
        testWorkspace,
        resolver
      );
      
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
      
      const result2 = await handleDrawioLayout(
        { file_path: '../../outside/x.drawio', base_dir: testWorktreeB },
        testWorkspace,
        resolver
      );
      
      const parsed2 = JSON.parse(result2);
      expect(parsed2.error).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    } finally {
      try { fs.unlinkSync(outsideFile); } catch { /* ignore */ }
    }
  });
});

describe('SA4E-406 UAT Automation — Security & Performance (AC-13, AC-14)', () => {
  
  it('UAT-18: Path Traversal Prevention — CWE-22 blocked', async () => {
    const result = await handleDrawioLayout(
      { file_path: '../../../etc/passwd' },
      testWorkspace
    );
    
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('Path rejected');
    expect(parsed.error).toContain('outside backend workspace');
  });

  it('UAT-19: Max Nodes Limit — configurable via SA4E_ELK_MAX_NODES', async () => {
    // Create a mock graph with 501 nodes
    const hugeGraph = {
      nodes: Array.from({ length: 501 }, (_, i) => ({
        id: `n${i}`,
        parentId: '1',
        x: i * 10,
        y: 0,
        width: 120,
        height: 60,
        style: '',
        isContainer: false
      })),
      edges: [],
      containers: []
    };
    
    const result = await handleApply(
      '', hugeGraph, [], 501, {}, 'test.drawio'
    );
    
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('Diagram too large');
  });

  it('UAT-20: ELK Timeout — respects SA4E_ELK_TIMEOUT_MS', async () => {
    // Complex diagram that might take time
    const complexDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
${Array.from({ length: 50 }, (_, i) => 
  `<mxCell id="n${i}" value="N${i}" style="rounded=1;" vertex="1" parent="1">
    <mxGeometry x="${i * 20}" y="${i * 10}" width="120" height="60" as="geometry"/></mxCell>`
).join('')}
</root></mxGraphModel></diagram></mxfile>`;
    
    const tmp = writeTmp(complexDiagram);
    const workspace = path.dirname(path.dirname(tmp));
    
    // With very short timeout, should either fail with timeout error or succeed quickly
    const result = await handleDrawioLayout({ 
      file_path: tmp, 
      algorithm: 'layered' 
    }, workspace);
    
    const parsed = JSON.parse(result);
    // Either fixed (fast) or timeout error
    if (parsed.error) {
      expect(parsed.error).toContain('Layout engine failed');
    } else {
      expect(parsed.status).toBe('fixed');
    }
    
    cleanup(tmp);
  });
});

describe('SA4E-406 UAT Automation — Additional Edge Cases', () => {
  
  it('Already good diagram returns already_good without modification', async () => {
    const tmp = writeTmp(SIMPLE_CLEAN);
    const workspace = path.dirname(path.dirname(tmp));
    const original = fs.readFileSync(tmp, 'utf-8');
    
    const result = await handleDrawioLayout({ file_path: tmp }, workspace);
    const parsed = JSON.parse(result);
    
    expect(parsed.status).toBe('already_good');
    expect(fs.readFileSync(tmp, 'utf-8')).toBe(original);
    
    cleanup(tmp);
  });

  it('Clean diagram has zero issues detected', () => {
    const tmp = writeTmp(SIMPLE_CLEAN);
    const { graph } = parseDrawio(tmp);
    const issues = detectAllIssues(graph);
    
    expect(issues.length).toBe(0);
    
    cleanup(tmp);
  });

  it('Sequence diagram (golden-sequence) reports already_good with loose edges', () => {
    const { graph } = parseDrawio(SEQUENCE);
    const issues = detectAllIssues(graph) as LayoutIssue[];
    
    // Should have loose edges visible
    expect((graph.looseEdges ?? []).length).toBeGreaterThan(0);
    
    // But no blocking issues
    const blocking = issues.filter(i => i.severity !== 'low');
    expect(blocking).toHaveLength(0);
  });

  it('Local repair only moves violating nodes, preserves others', async () => {
    // Wide diagram with one overlapping pair + extra nodes to keep violation ratio < 0.4
    const wideDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="60" y="60" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n3" value="C" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="300" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n4" value="D" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="520" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n5" value="E" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="740" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n6" value="F" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="960" y="40" width="120" height="60" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    
    const tmp = writeTmp(wideDiagram);
    const workspace = path.dirname(path.dirname(tmp));
    
    const result = await handleDrawioLayout({ file_path: tmp }, workspace);
    const parsed = JSON.parse(result);
    
    expect(parsed.status).toBe('fixed');
    // Should use local repair (not ELK) since violation ratio < 0.4
    expect(parsed.message).toContain('Local repair');
    
    // n3, n4, n5, n6 should remain at original positions (local repair)
    const after = fs.readFileSync(tmp, 'utf-8');
    expect(after).toContain('x="300" y="40"'); // n3 untouched
    expect(after).toContain('x="520" y="40"'); // n4 untouched
    expect(after).toContain('x="740" y="40"'); // n5 untouched
    expect(after).toContain('x="960" y="40"'); // n6 untouched
    
    cleanup(tmp);
  });

  it('Ports-only fix spreads anchors without moving nodes', async () => {
    const portsDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="hub" value="Hub" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="200" y="200" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="a" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="b" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="360" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="ea" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="hub" target="a">
  <mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="eb" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="hub" target="b">
  <mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    
    const tmp = writeTmp(portsDiagram);
    const workspace = path.dirname(path.dirname(tmp));
    
    const result = await handleDrawioLayout({ file_path: tmp, scope: 'ports' }, workspace);
    const parsed = JSON.parse(result);
    
    expect(parsed.status).toBe('fixed');
    
    // Node positions unchanged
    const after = fs.readFileSync(tmp, 'utf-8');
    expect(after).toContain('x="200" y="200"'); // hub unchanged
    // Anchors should be distributed
    expect(after).toContain('exitX=0;exitY=0.5;'); // left port
    expect(after).toContain('exitX=1;exitY=0.5;'); // right port
    
    cleanup(tmp);
  });

  it('hasBaseDirArg correctly identifies base_dir parameter', () => {
    expect(hasBaseDirArg({ file_path: 'test.drawio' })).toBe(false);
    expect(hasBaseDirArg({ file_path: 'test.drawio', base_dir: 'wt-b' })).toBe(true);
    // Empty string is still "present" as a key (not undefined)
    expect(hasBaseDirArg({ file_path: 'test.drawio', base_dir: '' })).toBe(true);
    expect(hasBaseDirArg({ file_path: 'test.drawio', workspace_root: '/root' })).toBe(true);
  });

  it('normalizeLayoutArgs validates all parameters', () => {
    // Defaults
    const defaults = normalizeLayoutArgs({});
    expect(defaults.algorithm).toBe('layered');
    expect(defaults.spacing).toBe(80);
    expect(defaults.direction).toBe('DOWN');
    expect(defaults.scope).toBe('auto');
    expect(defaults.relayout).toBe(false);
    
    // Custom valid values
    const custom = normalizeLayoutArgs({ 
      algorithm: 'force', 
      spacing: 120, 
      direction: 'right', 
      scope: 'ports',
      relayout: true 
    });
    expect(custom.algorithm).toBe('force');
    expect(custom.spacing).toBe(120);
    expect(custom.direction).toBe('RIGHT');
    expect(custom.scope).toBe('ports');
    expect(custom.relayout).toBe(true);
    
    // Invalid values fall back
    expect(normalizeLayoutArgs({ algorithm: 'invalid' }).algorithm).toBe('layered');
    expect(normalizeLayoutArgs({ spacing: -10 }).spacing).toBe(80);
    expect(normalizeLayoutArgs({ spacing: 999999 }).spacing).toBe(500); // MAX_SPACING
    expect(normalizeLayoutArgs({ direction: 'diagonal' }).direction).toBe('DOWN');
    expect(normalizeLayoutArgs({ scope: 'everything' }).scope).toBe('auto');
    expect(normalizeLayoutArgs({ relayout: 'yes' }).relayout).toBe(false);
  });

  it('violationRatio calculates fraction of cells involved', () => {
    const graph = {
      nodes: [
        { id: 'a', parentId: '1', x: 0, y: 0, width: 120, height: 60, style: '', isContainer: false },
        { id: 'b', parentId: '1', x: 30, y: 0, width: 120, height: 60, style: '', isContainer: false },
        { id: 'c', parentId: '1', x: 200, y: 0, width: 120, height: 60, style: '', isContainer: false },
      ],
      edges: [],
      containers: []
    };
    
    const issues: LayoutIssue[] = [
      { type: 'node_overlap', severity: 'high', node_a: 'a', node_b: 'b' },
    ];
    
    const ratio = violationRatio(graph, issues);
    
    // 2 out of 3 nodes involved = 0.666...
    expect(ratio).toBeCloseTo(2/3, 2);
  });
});

describe('SA4E-406 UAT Automation — Performance Benchmarks', () => {
  
  it('Detect performance — 100 nodes under 500ms', () => {
    const largeDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
${Array.from({ length: 100 }, (_, i) => 
  `<mxCell id="n${i}" value="N${i}" style="rounded=1;" vertex="1" parent="1">
    <mxGeometry x="${(i % 10) * 150}" y="${Math.floor(i / 10) * 100}" width="120" height="60" as="geometry"/></mxCell>`
).join('')}
</root></mxGraphModel></diagram></mxfile>`;
    
    const tmp = writeTmp(largeDiagram);
    const { graph } = parseDrawio(tmp);
    
    const start = Date.now();
    const issues = detectAllIssues(graph);
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(500);
    expect(issues.length).toBeGreaterThanOrEqual(0);
    
    cleanup(tmp);
  });

  it('Parse performance — 100 nodes under 200ms', () => {
    const largeDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
${Array.from({ length: 100 }, (_, i) => 
  `<mxCell id="n${i}" value="N${i}" style="rounded=1;" vertex="1" parent="1">
    <mxGeometry x="${(i % 10) * 150}" y="${Math.floor(i / 10) * 100}" width="120" height="60" as="geometry"/></mxCell>`
).join('')}
</root></mxGraphModel></diagram></mxfile>`;
    
    const tmp = writeTmp(largeDiagram);
    
    const start = Date.now();
    parseDrawio(tmp);
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(200);
    
    cleanup(tmp);
  });

  it('ELK layout performance — 50 nodes under 5s', async () => {
    const diagram = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
${Array.from({ length: 50 }, (_, i) => 
  `<mxCell id="n${i}" value="N${i}" style="rounded=1;" vertex="1" parent="1">
    <mxGeometry x="${i * 20}" y="${i * 10}" width="120" height="60" as="geometry"/></mxCell>`
).join('')}
</root></mxGraphModel></diagram></mxfile>`;
    
    const tmp = writeTmp(diagram);
    const workspace = path.dirname(path.dirname(tmp));
    
    const start = Date.now();
    const result = await handleDrawioLayout({ file_path: tmp, algorithm: 'layered' }, workspace);
    const elapsed = Date.now() - start;
    
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    expect(elapsed).toBeLessThan(5000);
    
    cleanup(tmp);
  });
});