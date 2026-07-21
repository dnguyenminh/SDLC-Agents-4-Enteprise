import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SymbolResolver, ResolvedSymbol } from '../graph/symbol-resolver.js';
import { CallGraphService } from '../graph/call-graph-service.js';
import { GitService } from './git-service.js';
import { SectionDef } from './intent-strategies.js';
import { AIContextResponse } from './types.js';

export function fetchSection(
  section: SectionDef,
  symbol: ResolvedSymbol,
  callerDepth: number,
  db: DatabaseAdapter,
  callGraph: CallGraphService,
  resolver: SymbolResolver,
  gitService: GitService,
  workspace: string
): any {
  try {
    switch (section.name) {
      case 'source': return fetchSource(symbol, workspace, db);
      case 'callers': return fetchCallers(symbol, callerDepth, section.format, callGraph);
      case 'callees': return fetchCallees(symbol, callerDepth, callGraph);
      case 'siblings': return fetchSiblings(symbol, db);
      case 'imports': return fetchImports(symbol, db);
      case 'tests': return fetchRelatedTests(symbol, db);
      case 'type_definitions': return fetchTypeDefinitions(symbol, db);
      case 'doc_comment': return fetchDocComment(symbol, db);
      case 'error_patterns': return fetchErrorPatterns(symbol, db, workspace);
      case 'recent_changes': return fetchRecentChanges(symbol, gitService);
      case 'test_patterns': return fetchTestPatterns(symbol, db);
      case 'mocks_needed': return fetchMocksNeeded(symbol, callGraph);
      default: return null;
    }
  } catch {
    return null;
  }
}

export function getSymbolEndLine(symbol: ResolvedSymbol, db: DatabaseAdapter): number | null {
  const row = db.prepare(`SELECT end_line FROM symbols WHERE id = ?`).get(symbol.id) as { end_line: number } | undefined;
  return row?.end_line || null;
}

export function fetchSource(symbol: ResolvedSymbol, workspace: string, db: DatabaseAdapter): string | null {
  try {
    const fullPath = path.resolve(workspace, symbol.filePath);
    if (!fs.existsSync(fullPath)) return null;
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const startLine = symbol.line - 1;
    const endLine = getSymbolEndLine(symbol, db) || startLine + 50;
    return lines.slice(startLine, endLine).join('\n');
  } catch {
    return null;
  }
}

export function fetchCallers(symbol: ResolvedSymbol, depth: number, format: string, callGraph: CallGraphService): any {
  const result = callGraph.findCallers(symbol.name, depth, 10);
  if (result.results.length === 0) return null;
  if (format === 'summary') {
    return result.results.map(r => `${r.symbol} (${r.filePath}:${r.callSiteLine})`);
  }
  return result.results.map(r => ({
    symbol: r.symbol, file: r.filePath, line: r.callSiteLine, kind: r.kind
  }));
}

export function fetchCallees(symbol: ResolvedSymbol, depth: number, callGraph: CallGraphService): any {
  const result = callGraph.findCallees(symbol.name, depth, 10);
  if (result.results.length === 0) return null;
  return result.results.map(r => ({
    symbol: r.symbol, file: r.filePath, line: r.callSiteLine, kind: r.kind
  }));
}

export function fetchSiblings(symbol: ResolvedSymbol, db: DatabaseAdapter): any {
  const query = symbol.parentSymbolId
    ? `SELECT name, kind, signature, start_line as line FROM symbols WHERE parent_symbol_id = ? AND id != ? ORDER BY start_line`
    : `SELECT s.name, s.kind, s.signature, s.start_line as line FROM symbols s JOIN files f ON s.file_id = f.id WHERE f.relative_path = ? AND s.parent_symbol_id IS NULL AND s.id != ? ORDER BY s.start_line`;

  const params = symbol.parentSymbolId
    ? [symbol.parentSymbolId, symbol.id]
    : [symbol.filePath, symbol.id];

  const rows = db.prepare(query).all(...params) as any[];
  if (rows.length === 0) return null;
  return rows.map(r => ({ name: r.name, kind: r.kind, signature: r.signature, line: r.line }));
}

export function fetchImports(symbol: ResolvedSymbol, db: DatabaseAdapter): any {
  const rows = db.prepare(`
    SELECT DISTINCT r.target_symbol as name, r.file_path
    FROM relationships r
    WHERE r.source_symbol_id = ? AND r.kind = 'imports'
  `).all(symbol.id) as any[];
  if (rows.length === 0) return null;
  return rows.map(r => r.name);
}

export function fetchRelatedTests(symbol: ResolvedSymbol, db: DatabaseAdapter): any {
  const rows = db.prepare(`
    SELECT DISTINCT f.relative_path as file_path
    FROM relationships r
    JOIN files f ON r.file_path = f.relative_path
    WHERE r.target_symbol LIKE ?
    AND (f.relative_path LIKE '%test%' OR f.relative_path LIKE '%spec%')
    LIMIT 5
  `).all(`%${symbol.name}%`) as any[];
  if (rows.length === 0) return null;
  return rows.map(r => r.file_path);
}

export function fetchTypeDefinitions(symbol: ResolvedSymbol, db: DatabaseAdapter): any {
  const rows = db.prepare(`
    SELECT DISTINCT s.name, s.kind, s.signature, f.relative_path as file
    FROM relationships r
    JOIN symbols s ON s.id = r.target_symbol_id
    JOIN files f ON s.file_id = f.id
    WHERE r.source_symbol_id = ? AND s.kind IN ('interface', 'type_alias', 'enum', 'class')
    LIMIT 10
  `).all(symbol.id) as any[];
  if (rows.length === 0) return null;
  return rows;
}

export function fetchDocComment(symbol: ResolvedSymbol, db: DatabaseAdapter): string | null {
  const row = db.prepare(`SELECT doc_comment FROM symbols WHERE id = ?`).get(symbol.id) as { doc_comment: string | null } | undefined;
  return row?.doc_comment || null;
}

export function fetchErrorPatterns(symbol: ResolvedSymbol, db: DatabaseAdapter, workspace: string): any {
  const source = fetchSource(symbol, workspace, db);
  if (!source) return null;
  const patterns: any[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('throw ')) patterns.push({ type: 'throw', line: i + 1, text: line });
    if (line.startsWith('catch')) patterns.push({ type: 'catch', line: i + 1, text: line });
    if (line.includes('.catch(')) patterns.push({ type: 'promise-catch', line: i + 1, text: line });
  }
  return patterns.length > 0 ? patterns : null;
}

export function fetchRecentChanges(symbol: ResolvedSymbol, gitService: GitService): any {
  const commits = gitService.getFileHistory(symbol.filePath, 5);
  return commits.length > 0 ? commits : null;
}

export function fetchTestPatterns(symbol: ResolvedSymbol, db: DatabaseAdapter): any {
  const rows = db.prepare(`
    SELECT DISTINCT s.name, s.signature
    FROM symbols s
    JOIN files f ON s.file_id = f.id
    WHERE (f.relative_path LIKE '%test%' OR f.relative_path LIKE '%spec%')
    AND s.kind = 'function'
    AND f.module = (SELECT module FROM files WHERE relative_path = ?)
    LIMIT 10
  `).all(symbol.filePath) as any[];
  if (rows.length === 0) return null;
  return rows.map(r => r.name);
}

export function fetchMocksNeeded(symbol: ResolvedSymbol, callGraph: CallGraphService): any {
  const result = callGraph.findCallees(symbol.name, 1, 20);
  if (result.results.length === 0) return null;
  const externalDeps = result.results
    .filter(r => r.filePath !== symbol.filePath && r.filePath !== '(external)')
    .map(r => ({ symbol: r.symbol, file: r.filePath }));
  return externalDeps.length > 0 ? externalDeps : null;
}

export function notFoundResponse(
  symbol: string,
  intent: string,
  budget: number,
  startTime: number,
  resolver: SymbolResolver
): AIContextResponse {
  const suggestions = resolver.suggest(symbol);
  return {
    symbol,
    file_path: '',
    kind: 'unknown',
    intent,
    context: { error: `Symbol "${symbol}" not found`, suggestions },
    metadata: {
      budget_used: 0,
      budget_total: budget,
      sections_included: [],
      sections_omitted: [],
      query_time_ms: Date.now() - startTime
    }
  };
}
