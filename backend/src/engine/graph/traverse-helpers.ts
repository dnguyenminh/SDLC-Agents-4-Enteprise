/**
 * KSA-157: Traverse helpers - extracted from GraphTraverser.
 * Pure functions for neighbor resolution and source snippet extraction.
 * SA4E-45: Refactored to use DatabaseAdapter abstraction.
 */

import * as fs from 'fs';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { GraphNode, TraverseConfig } from './traverser.js';
import { resolveWithinWorkspace } from '../../shared/path-safety.js';
import { buildCodeScopeFilter } from '../query/code-intel-isolation.js';

/** Allowed edge types for traversal queries (SEC-01: allowlist prevents SQL injection). */
const ALLOWED_EDGE_TYPES = new Set([
  'calls', 'imports', 'inherits', 'implements', 'uses',
  'decorates', 'overrides', 'extends', 'references', 'type_of',
]);

/** Retrieve neighbor nodes from the graph within a tenant scope. */
export function getNeighbors(nodeId: number, config: TraverseConfig, adapter: DatabaseAdapter, projectId?: string): GraphNode[] {
  // SEC-01 fix: validate edgeTypes against allowlist, use parameterized placeholders
  const validEdgeTypes = config.edgeTypes.filter(e => ALLOWED_EDGE_TYPES.has(e));
  const edgeFilter = validEdgeTypes.length > 0
    ? `AND r.kind IN (${validEdgeTypes.map(() => '?').join(',')})`
    : '';
  const edgeParams = validEdgeTypes;
  const scope = buildCodeScopeFilter(projectId, 's');
  let rows: any[] = [];
  switch (config.direction) {
    case 'outgoing':
      rows = adapter.all(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as startLine, r.kind as _incomingEdgeType
        FROM relationships r
        JOIN symbols s ON s.id = r.target_symbol_id
        JOIN files f ON s.file_id = f.id
        WHERE r.source_symbol_id = ? AND ${scope.clause} ${edgeFilter}
        LIMIT 100
      `, [nodeId, ...scope.params, ...edgeParams]);
      break;
    case 'incoming':
      rows = adapter.all(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as startLine, r.kind as _incomingEdgeType
        FROM relationships r
        JOIN symbols s ON s.id = r.source_symbol_id
        JOIN files f ON s.file_id = f.id
        WHERE r.target_symbol_id = ? AND ${scope.clause} ${edgeFilter}
        LIMIT 100
      `, [nodeId, ...scope.params, ...edgeParams]);
      break;
    case 'both': {
      const outgoing = adapter.all(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as startLine, r.kind as _incomingEdgeType
        FROM relationships r
        JOIN symbols s ON s.id = r.target_symbol_id
        JOIN files f ON s.file_id = f.id
        WHERE r.source_symbol_id = ? AND ${scope.clause} ${edgeFilter}
        LIMIT 50
      `, [nodeId, ...scope.params, ...edgeParams]);
      const incoming = adapter.all(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as startLine, r.kind as _incomingEdgeType
        FROM relationships r
        JOIN symbols s ON s.id = r.source_symbol_id
        JOIN files f ON s.file_id = f.id
        WHERE r.target_symbol_id = ? AND ${scope.clause} ${edgeFilter}
        LIMIT 50
      `, [nodeId, ...scope.params, ...edgeParams]);
      rows = [...outgoing, ...incoming];
      break;
    }
  }
  return rows as GraphNode[];
}

/** Extract source snippet from a file for display in traversal results. */
export function getSourceSnippet(filePath: string, startLine: number, contextLines: number, workspace: string): string | null {
  try {
    const fullPath = resolveWithinWorkspace(workspace, filePath);
    if (!fullPath || !fs.existsSync(fullPath)) return null;
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, start + contextLines);
    return lines.slice(start, end).join('\n');
  } catch {
    return null;
  }
}
