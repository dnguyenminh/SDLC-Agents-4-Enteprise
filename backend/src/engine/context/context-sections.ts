import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SymbolResolver, ResolvedSymbol } from '../graph/symbol-resolver.js';
import { CallGraphService } from '../graph/call-graph-service.js';
import { GitService } from './git-service.js';
import { SectionDef } from './intent-strategies.js';
import { AIContextResponse } from './types.js';

export async function fetchSection(
  section: SectionDef,
  symbol: ResolvedSymbol,
  callerDepth: number,
  db: DatabaseAdapter,
  callGraph: CallGraphService,
  resolver: SymbolResolver,
  gitService: GitService,
  workspace: string
): Promise<any> {
  try {
    switch (section.name) {
      case 'source': return await fetchSource(symbol, workspace, db);
      case 'callers': return await fetchCallers(symbol, callerDepth, section.format, callGraph);
      case 'callees': return await fetchCallees(symbol, callerDepth, callGraph);
      case 'siblings': return await fetchSiblings(symbol, db);
      case 'imports': return await fetchImports(symbol, db);
      case 'tests': return await fetchRelatedTests(symbol, db);
      case 'type_definitions': return await fetchTypeDefinitions(symbol, db);
      case 'doc_comment': return await fetchDocComment(symbol, db);
      case 'error_patterns': return await fetchErrorPatterns(symbol, db, workspace);
      case 'recent_changes': return fetchRecentChanges(symbol, gitService);
      case 'test_patterns': return await fetchTestPatterns(symbol, db);
      case 'mocks_needed': return await fetchMocksNeeded(symbol, callGraph);
      default: return null;
    }
  } catch {
    return null;
  }
}

export async function getSymbolEndLine(symbol: ResolvedSymbol, db: DatabaseAdapter): Promise<number | null> {
  const row = await db.getAsync<{ end_line: number }>(`SELECT end_line FROM symbols WHERE id = ?`, [symbol.id]);
  return row?.end_line || null;
}

export async function fetchSource(symbol: ResolvedSymbol, workspace: string, db: DatabaseAdapter): Promise<string | null> {
  try {
    const fullPath = path.resolve(workspace, symbol.filePath);
    if (!fs.existsSync(fullPath)) return null;
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const startLine = symbol.line - 1;
    const endLine = (await getSymbolEndLine(symbol, db)) || startLine + 50;
    return lines.slice(startLine, endLine).join('\n');
  } catch {
    return null;
  }
}

export async function fetchCallers(symbol: ResolvedSymbol, depth: number, format: string, callGraph: CallGraphService): Promise<any> {
  const result = await callGraph.findCallers(symbol.name, depth, 10);
  if (result.results.length === 0) return null;
  if (format === 'summary') {
    return result.results.map(r => `${r.symbol} (${r.filePath}:${r.callSiteLine})`);
  }
  return result.results.map(r => ({
    symbol: r.symbol, file: r.filePath, line: r.callSiteLine, kind: r.kind
  }));
}

export async function fetchCallees(symbol: ResolvedSymbol, depth: number, callGraph: CallGraphService): Promise<any> {
  const result = await callGraph.findCallees(symbol.name, depth, 10);
  if (result.results.length === 0) return null;
  return result.results.map(r => ({
    symbol: r.symbol, file: r.filePath, line: r.callSiteLine, kind: r.kind
  }));
}

export async function fetchSiblings(symbol: ResolvedSymbol, db: DatabaseAdapter): Promise<any> {
  const query = symbol.parentSymbolId
    ? `SELECT name, kind, signature, start_line as line FROM symbols WHERE parent_symbol_id = ? AND id != ? ORDER BY start_line`
    : `SELECT s.name, s.kind, s.signature, s.start_line as line FROM symbols s JOIN files f ON s.file_id = f.id WHERE f.relative_path = ? AND s.parent_symbol_id IS NULL AND s.id != ? ORDER BY s.start_line`;

  const params = symbol.parentSymbolId
    ? [symbol.parentSymbolId, symbol.id]
    : [symbol.filePath, symbol.id];

  const rows = await db.allAsync<any>(query, params);
  if (rows.length === 0) return null;
  return rows.map(r => ({ name: r.name, kind: r.kind, signature: r.signature, line: r.line }));
}

export async function fetchImports(symbol: ResolvedSymbol, db: DatabaseAdapter): Promise<any> {
  const rows = await db.allAsync<any>(`
    SELECT DISTINCT r.target_symbol as name, r.file_path
    FROM relationships r
    WHERE r.source_symbol_id = ? AND r.kind = 'imports'
  `, [symbol.id]);
  if (rows.length === 0) return null;
  return rows.map(r => r.name);
}

export async function fetchRelatedTests(symbol: ResolvedSymbol, db: DatabaseAdapter): Promise<any> {
  const rows = await db.allAsync<any>(`
    SELECT DISTINCT f.relative_path as file_path
    FROM relationships r
    JOIN files f ON r.file_path = f.relative_path
    WHERE r.target_symbol LIKE ?
    AND (f.relative_path LIKE '%test%' OR f.relative_path LIKE '%spec%')
    LIMIT 5
  `, [`%${symbol.name}%`]);
  if (rows.length === 0) return null;
  return rows.map(r => r.file_path);
}

export async function fetchTypeDefinitions(symbol: ResolvedSymbol, db: DatabaseAdapter): Promise<any> {
  const rows = await db.allAsync<any>(`
    SELECT DISTINCT s.name, s.kind, s.signature, f.relative_path as file
    FROM relationships r
    JOIN symbols s ON s.id = r.target_symbol_id
    JOIN files f ON s.file_id = f.id
    WHERE r.source_symbol_id = ? AND s.kind IN ('interface', 'type_alias', 'enum', 'class')
    LIMIT 10
  `, [symbol.id]);
  if (rows.length === 0) return null;
  return rows;
}

export async function fetchDocComment(symbol: ResolvedSymbol, db: DatabaseAdapter): Promise<string | null> {
  const row = await db.getAsync<{ doc_comment: string | null }>(`SELECT doc_comment FROM symbols WHERE id = ?`, [symbol.id]);
  return row?.doc_comment || null;
}

export async function fetchErrorPatterns(symbol: ResolvedSymbol, db: DatabaseAdapter, workspace: string): Promise<any> {
  const source = await fetchSource(symbol, workspace, db);
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

export async function fetchTestPatterns(symbol: ResolvedSymbol, db: DatabaseAdapter): Promise<any> {
  const rows = await db.allAsync<any>(`
    SELECT DISTINCT s.name, s.signature
    FROM symbols s
    JOIN files f ON s.file_id = f.id
    WHERE (f.relative_path LIKE '%test%' OR f.relative_path LIKE '%spec%')
    AND s.kind = 'function'
    AND f.module = (SELECT module FROM files WHERE relative_path = ?)
    LIMIT 10
  `, [symbol.filePath]);
  if (rows.length === 0) return null;
  return rows.map(r => r.name);
}

export async function fetchMocksNeeded(symbol: ResolvedSymbol, callGraph: CallGraphService): Promise<any> {
  const result = await callGraph.findCallees(symbol.name, 1, 20);
  if (result.results.length === 0) return null;
  const externalDeps = result.results
    .filter(r => r.filePath !== symbol.filePath && r.filePath !== '(external)')
    .map(r => ({ symbol: r.symbol, file: r.filePath }));
  return externalDeps.length > 0 ? externalDeps : null;
}

export async function notFoundResponse(
  symbol: string,
  intent: string,
  budget: number,
  startTime: number,
  resolver: SymbolResolver
): Promise<AIContextResponse> {
  const suggestions = await resolver.suggest(symbol);
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




