/**
 * KSA-157: Traverse helpers - extracted from GraphTraverser.
 * Pure functions for neighbor resolution and source snippet extraction.
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { GraphNode, TraverseConfig } from './traverser.js';

export function getNeighbors(nodeId: number, config: TraverseConfig, db: Database.Database): GraphNode[] {
  const edgeFilter = config.edgeTypes.length > 0
    ? `AND r.kind IN (${config.edgeTypes.map(e => `'${e}'`).join(',')})`
    : '';
  let rows: any[] = [];
  switch (config.direction) {
    case 'outgoing':
      rows = db.prepare(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as startLine, r.kind as _incomingEdgeType
        FROM relationships r
        JOIN symbols s ON s.id = r.target_symbol_id
        JOIN files f ON s.file_id = f.id
        WHERE r.source_symbol_id = ? ${edgeFilter}
        LIMIT 100
      `).all(nodeId);
      break;
    case 'incoming':
      rows = db.prepare(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as startLine, r.kind as _incomingEdgeType
        FROM relationships r
        JOIN symbols s ON s.id = r.source_symbol_id
        JOIN files f ON s.file_id = f.id
        WHERE r.target_symbol_id = ? ${edgeFilter}
        LIMIT 100
      `).all(nodeId);
      break;
    case 'both': {
      const outgoing = db.prepare(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as startLine, r.kind as _incomingEdgeType
        FROM relationships r
        JOIN symbols s ON s.id = r.target_symbol_id
        JOIN files f ON s.file_id = f.id
        WHERE r.source_symbol_id = ? ${edgeFilter}
        LIMIT 50
      `).all(nodeId);
      const incoming = db.prepare(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as startLine, r.kind as _incomingEdgeType
        FROM relationships r
        JOIN symbols s ON s.id = r.source_symbol_id
        JOIN files f ON s.file_id = f.id
        WHERE r.target_symbol_id = ? ${edgeFilter}
        LIMIT 50
      `).all(nodeId);
      rows = [...outgoing, ...incoming];
      break;
    }
  }
  return rows as GraphNode[];
}

export function getSourceSnippet(filePath: string, startLine: number, contextLines: number, workspace: string): string | null {
  try {
    const fullPath = path.resolve(workspace, filePath);
    if (!fs.existsSync(fullPath)) return null;
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, start + contextLines);
    return lines.slice(start, end).join('\n');
  } catch {
    return null;
  }
}
