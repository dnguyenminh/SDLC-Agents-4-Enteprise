/**
 * SA4E-88 — Shared fixtures/mocks for the PegaIndexerTool test suites.
 * Extracted verbatim from the original PegaIndexerTool.test.ts header.
 */

import { vi } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { GraphWriter } from '../PegaIndexerTool.js';

/** Fake GraphWriter tracking all operations (Spy pattern). */
export class FakeGraphWriter implements GraphWriter {
  public nodes: Array<{ id: string; label: string; type: string }> = [];
  public edges: Array<{ source: string; target: string; rel: string }> = [];
  public removedPrefixes: string[] = [];

  async addNode(entryId: string, label: string, type: string): Promise<void> {
    this.nodes.push({ id: entryId, label, type });
  }

  async addEdge(source: string, target: string, _w: number, relType: string): Promise<void> {
    this.edges.push({ source, target, rel: relType });
  }

  async removeNodesByPrefix(prefix: string): Promise<void> {
    this.removedPrefixes.push(prefix);
    this.nodes = this.nodes.filter(n => !n.id.startsWith(prefix));
    this.edges = [];
  }
}

/** Minimal Pega Activity rule fixture. */
export const ACTIVITY_RULE = {
  pxObjClass: 'Rule-Obj-Activity',
  pyClassName: 'Work-Cover-Jira',
  pyRuleName: 'ResolveTicket',
  pyActivityName: 'ResolveTicket',
  steps: [{ pyMethod: 'Call', pyMethodParameters: 'ValidateData' }],
};

/** Minimal Flow rule fixture. */
export const FLOW_RULE = {
  pxObjClass: 'Rule-Obj-Flow',
  pyClassName: 'Work-Cover-Jira',
  pyFlowName: 'ProcessClaim',
  pyRuleName: 'ProcessClaim',
  pyShapes: [{ pyActivityName: 'ResolveTicket' }],
};

export function createFakeLogger(): any {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
}

/** Helper: create a temp workspace with rules/ subdirectory. */
export function createTempWorkspace(): { root: string; rulesDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'pega-idx-'));
  const rulesDir = join(root, 'rules');
  mkdirSync(rulesDir, { recursive: true });
  return { root, rulesDir };
}
