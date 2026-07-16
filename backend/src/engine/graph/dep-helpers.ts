/**
 * KSA-155: Dependency Graph helpers - extracted from DependencyGraphService.
 * Pure functions for BFS traversal, module extraction, and result merging.
 */

import * as path from 'path';
import Database from 'better-sqlite3';
import { FileResolver } from './file-resolver.js';
import { buildCodeScopeFilter } from '../query/code-intel-isolation.js';

export interface DependencyNode {
  file: string;
  depth: number;
  importedSymbols: string[];
  isExternal: boolean;
}

export interface DependencyResult {
  root: string;
  direction: string;
  results: DependencyNode[];
  cycles: string[][];
  metadata: {
    totalNodes: number;
    maxDepthReached: number;
    truncated: boolean;
    queryTimeMs: number;
    externalCount: number;
  };
}

export function bfsTraversal(
  root: string,
  direction: 'incoming' | 'outgoing',
  maxDepth: number,
  includeExternal: boolean,
  limit: number,
  kinds: string[] | undefined,
  fileResolver: FileResolver,
  db: Database.Database,
  projectId?: string
): { results: DependencyNode[]; cycles: string[][] } {
  const visited = new Set<string>([root]);
  const results: DependencyNode[] = [];
  const cycles: string[][] = [];
  const queue: Array<{ file: string; depth: number; path: string[] }> = [
    { file: root, depth: 0, path: [root] },
  ];
  while (queue.length > 0 && results.length < limit) {
    const { file: current, depth: currentDepth, path: currentPath } = queue.shift()!;
    if (currentDepth >= maxDepth) continue;
    const deps = direction === 'outgoing'
      ? getOutgoingDeps(current, kinds, db, projectId)
      : getIncomingDeps(current, kinds, db, projectId);
    for (const dep of deps) {
      const isExternal = fileResolver.isExternal(dep.target);
      if (isExternal && !includeExternal) continue;
      const resolvedTarget = isExternal
        ? dep.target
        : fileResolver.resolveImportTarget(current, dep.target);
      if (!resolvedTarget) continue;
      if (currentPath.includes(resolvedTarget)) {
        cycles.push([...currentPath, resolvedTarget]);
        continue;
      }
      if (!visited.has(resolvedTarget)) {
        visited.add(resolvedTarget);
        results.push({
          file: resolvedTarget,
          depth: currentDepth + 1,
          importedSymbols: dep.symbols,
          isExternal,
        });
        if (!isExternal && currentDepth + 1 < maxDepth) {
          queue.push({
            file: resolvedTarget,
            depth: currentDepth + 1,
            path: [...currentPath, resolvedTarget],
          });
        }
      }
    }
  }
  return { results, cycles };
}

export function getOutgoingDeps(filePath: string, kinds: string[] | undefined, db: Database.Database, projectId?: string): Array<{ target: string; symbols: string[] }> {
  const queryKinds = kinds ?? ['imports', 'trigger-on', 'soql', 'dml', 'wire', 'flow-action', 'flow-object', 'apex-import', 'calls', 'inherits', 'implements'];
  const placeholders = queryKinds.map(() => '?').join(',');
  const scope = buildCodeScopeFilter(projectId, 'relationships'); // fail-closed
  const rows = db.prepare(`
    SELECT target_symbol, metadata, kind
    FROM relationships
    WHERE file_path = ? AND kind IN (${placeholders}) AND ${scope.clause}
    ORDER BY line
  `).all(filePath, ...queryKinds, ...scope.params) as { target_symbol: string; metadata: string | null; kind: string }[];
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const module = extractModule(row.target_symbol);
    if (!grouped.has(module)) grouped.set(module, []);
    const symbol = extractSymbolName(row.target_symbol);
    if (symbol) grouped.get(module)!.push(symbol);
  }
  return Array.from(grouped.entries()).map(([target, symbols]) => ({ target, symbols }));
}

export function getIncomingDeps(filePath: string, kinds: string[] | undefined, db: Database.Database, projectId?: string): Array<{ target: string; symbols: string[] }> {
  const basename = path.basename(filePath, path.extname(filePath));
  const queryKinds = kinds ?? ['imports', 'trigger-on', 'soql', 'dml', 'wire', 'flow-action', 'flow-object', 'apex-import', 'calls', 'inherits', 'implements'];
  const placeholders = queryKinds.map(() => '?').join(',');
  const scope = buildCodeScopeFilter(projectId, 'relationships'); // fail-closed
  const rows = db.prepare(`
    SELECT DISTINCT file_path, target_symbol
    FROM relationships
    WHERE kind IN (${placeholders})
      AND (target_symbol LIKE ? OR target_symbol LIKE ? OR target_symbol LIKE ?)
      AND ${scope.clause}
  `).all(...queryKinds, `%/${basename}`, `%${basename}%`, filePath, ...scope.params) as { file_path: string; target_symbol: string }[];
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    if (row.file_path === filePath) continue;
    if (!grouped.has(row.file_path)) grouped.set(row.file_path, []);
    grouped.get(row.file_path)!.push(extractSymbolName(row.target_symbol) || '*');
  }
  return Array.from(grouped.entries()).map(([target, symbols]) => ({ target, symbols }));
}

export function extractModule(targetSymbol: string): string {
  const lastDot = targetSymbol.lastIndexOf('.');
  if (lastDot > 0 && !targetSymbol.includes('/')) return targetSymbol;
  if (lastDot > 0) return targetSymbol.substring(0, lastDot);
  return targetSymbol;
}

export function extractSymbolName(targetSymbol: string): string {
  const lastDot = targetSymbol.lastIndexOf('.');
  if (lastDot > 0 && lastDot < targetSymbol.length - 1) {
    return targetSymbol.substring(lastDot + 1);
  }
  return path.basename(targetSymbol);
}

export function mergeResults(outgoing: DependencyNode[], incoming: DependencyNode[]): DependencyNode[] {
  const seen = new Set<string>();
  const merged: DependencyNode[] = [];
  for (const node of [...outgoing, ...incoming]) {
    if (!seen.has(node.file)) {
      seen.add(node.file);
      merged.push(node);
    }
  }
  return merged;
}

export function fileNotFoundResponse(file: string): DependencyResult {
  return {
    root: file,
    direction: 'outgoing',
    results: [],
    cycles: [],
    metadata: { totalNodes: 0, maxDepthReached: 0, truncated: false, queryTimeMs: 0, externalCount: 0 },
  };
}
