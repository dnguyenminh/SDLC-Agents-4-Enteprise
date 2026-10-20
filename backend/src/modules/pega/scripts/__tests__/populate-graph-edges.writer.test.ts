/**
 * SA4E-87 — Tests for populate-graph-edges script (writer/batch insertion).
 * Verifies batch insertion against a fake GraphEdgeWriter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { populateGraphEdges, type GraphEdgeWriter } from '../populate-graph-edges.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('populateGraphEdges', () => {
  const testDir = join(tmpdir(), `pega-edges-test-${Date.now()}`);
  let writer: GraphEdgeWriter;
  let addEdgeCalls: Array<{ source: string; target: string; weight: number; relType: string }>;

  beforeEach(async () => {
    addEdgeCalls = [];
    writer = {
      addEdge: vi.fn(async (source, target, weight, relType) => {
        addEdgeCalls.push({ source, target, weight, relType });
      }),
    };
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('processes .pega.json files and inserts edges', async () => {
    const rule = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Claim',
      pyActivityName: 'Validate',
      steps: [{ pyMethod: 'Call', pyMethodParameters: 'CheckData' }],
    };
    await writeFile(join(testDir, 'validate.pega.json'), JSON.stringify(rule));

    const stats = await populateGraphEdges({ rulesDir: testDir }, writer);
    expect(stats.nodesProcessed).toBe(1);
    expect(stats.edgesCreated).toBeGreaterThan(0);
    expect(stats.errors).toBe(0);
  });

  it('skips malformed JSON files', async () => {
    await writeFile(join(testDir, 'bad.pega.json'), '{ invalid json!!!');

    const stats = await populateGraphEdges({ rulesDir: testDir }, writer);
    expect(stats.skipped).toBe(1);
    expect(stats.nodesProcessed).toBe(0);
  });

  it('dryRun mode does not call writer', async () => {
    const rule = {
      pxObjClass: 'Rule-Obj-Class',
      pyClassName: 'Work-Auto',
      pySuperClass: 'Work-',
    };
    await writeFile(join(testDir, 'class.pega.json'), JSON.stringify(rule));

    const stats = await populateGraphEdges({ rulesDir: testDir, dryRun: true }, writer);
    expect(stats.edgesCreated).toBeGreaterThan(0);
    expect(addEdgeCalls).toHaveLength(0);
  });

  it('is idempotent — duplicate edges handled gracefully', async () => {
    const rule = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Claim',
      pyActivityName: 'Process',
      steps: [{ pyMethod: 'Call', pyMethodParameters: 'Sub' }],
    };
    await writeFile(join(testDir, 'proc.pega.json'), JSON.stringify(rule));

    // First run
    await populateGraphEdges({ rulesDir: testDir }, writer);
    const firstCount = addEdgeCalls.length;

    // Second run — same edges, writer accepts without error
    addEdgeCalls = [];
    await populateGraphEdges({ rulesDir: testDir }, writer);
    expect(addEdgeCalls.length).toBe(firstCount);
  });

  it('handles nested directories', async () => {
    const subDir = join(testDir, 'sub');
    await mkdir(subDir, { recursive: true });
    const rule = {
      pxObjClass: 'Rule-Obj-Flow',
      pyClassName: 'Work-Case',
      pyFlowName: 'MainFlow',
      pyShapes: [{ pyActivityName: 'Start' }],
    };
    await writeFile(join(subDir, 'flow.pega.json'), JSON.stringify(rule));

    const stats = await populateGraphEdges({ rulesDir: testDir }, writer);
    expect(stats.nodesProcessed).toBe(1);
    expect(stats.edgesCreated).toBeGreaterThan(0);
  });
});
