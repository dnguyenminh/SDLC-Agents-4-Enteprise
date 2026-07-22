import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SymbolResolver, ResolvedSymbol } from '../graph/symbol-resolver.js';
import { CallGraphService } from '../graph/call-graph-service.js';
import { TestDetector } from '../graph/test-detector.js';
import { GitService } from './git-service.js';
import {
  EditContextResult, CallerContext, TestContext, GitCommit, SiblingContext
} from './types.js';

export interface ResolvedSymbolFull extends ResolvedSymbol {
  endLine?: number;
  signature?: string;
}

export async function resolveSymbolInput(input: string, db: DatabaseAdapter, resolver: SymbolResolver): Promise<ResolvedSymbolFull | null> {
  if (input.includes(':') && /:\d+$/.test(input)) {
    const colonIdx = input.lastIndexOf(':');
    const file = input.substring(0, colonIdx);
    const line = parseInt(input.substring(colonIdx + 1));
    return findSymbolAtLine(file, line, db);
  }

  const resolved = await resolver.resolve(input);
  if (resolved.length === 0) return null;

  const sym = resolved[0];
  const extra = await db.getAsync<{ endLine: number; signature: string }>(
    `SELECT end_line as endLine, signature FROM symbols WHERE id = ?`,
    [sym.id],
  );

  return {
    ...sym,
    endLine: extra?.endLine,
    signature: extra?.signature || undefined
  };
}

export function findSymbolAtLine(file: string, line: number, db: DatabaseAdapter): ResolvedSymbolFull | null {
  const row = db.prepare(`
    SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as line,
           s.end_line as endLine, s.signature, s.parent_symbol_id as parentSymbolId
    FROM symbols s
    JOIN files f ON s.file_id = f.id
    WHERE f.relative_path LIKE ? AND s.start_line <= ? AND s.end_line >= ?
    ORDER BY (s.end_line - s.start_line) ASC
    LIMIT 1
  `).get(`%${file}`, line, line) as ResolvedSymbolFull | undefined;
  return row || null;
}

export function readSymbolSource(symbol: ResolvedSymbolFull, workspace: string): string {
  try {
    const fullPath = path.resolve(workspace, symbol.filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const start = symbol.line - 1;
    const end = symbol.endLine || start + 50;
    return lines.slice(start, end).join('\n');
  } catch {
    return '';
  }
}

export function getSignature(symbol: ResolvedSymbolFull, db: DatabaseAdapter): string | null {
  if (symbol.signature) return symbol.signature;
  const row = db.prepare(`SELECT signature FROM symbols WHERE id = ?`).get(symbol.id) as { signature: string | null } | undefined;
  return row?.signature || null;
}

export async function getCallerContext(symbol: ResolvedSymbolFull, depth: number, callGraph: CallGraphService, workspace: string): Promise<CallerContext[]> {
  const result = await callGraph.findCallers(symbol.name, depth, 10);
  return result.results.map(caller => {
    const context = getLineContext(caller.filePath, caller.callSiteLine, 2, workspace);
    return {
      symbol: caller.qualifiedName || caller.symbol,
      file: caller.filePath,
      line: caller.callSiteLine,
      context
    };
  });
}

export function getLineContext(file: string, line: number, surroundingLines: number, workspace: string): string {
  try {
    const fullPath = path.resolve(workspace, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, line - 1 - surroundingLines);
    const end = Math.min(lines.length, line + surroundingLines);
    return lines.slice(start, end).join('\n');
  } catch {
    return '';
  }
}

export async function getTestContext(symbol: ResolvedSymbolFull, testDetector: TestDetector, workspace: string): Promise<TestContext[]> {
  const testFiles = testDetector.findRelatedTests([symbol], []);
  const results: TestContext[] = [];

  for (const tf of testFiles.slice(0, 3)) {
    try {
      const fullPath = path.resolve(workspace, tf.file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const testBlocks = extractTestBlocks(content, symbol.name);
      for (const block of testBlocks.slice(0, 2)) {
        results.push({
          file: tf.file,
          testName: block.name,
          source: block.source
        });
      }
    } catch { /* skip unreadable files */ }
  }

  return results;
}

export function extractTestBlocks(content: string, symbolName: string): Array<{ name: string; source: string }> {
  const blocks: Array<{ name: string; source: string }> = [];
  const lines = content.split('\n');
  const testPattern = /(?:it|test|describe)\s*\(\s*['"`]([^'"`]*?)['"`]/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(testPattern);
    if (match && (lines[i].includes(symbolName) || (i + 10 < lines.length && lines.slice(i, i + 10).join('\n').includes(symbolName)))) {
      const name = match[1];
      const end = Math.min(i + 15, lines.length);
      const source = lines.slice(i, end).join('\n');
      blocks.push({ name, source });
    }
  }

  return blocks;
}

export async function getGitContext(symbol: ResolvedSymbolFull, gitService: GitService): Promise<GitCommit[]> {
  return gitService.getFileHistory(symbol.filePath, 5);
}

export async function getSiblingContext(symbol: ResolvedSymbolFull, db: DatabaseAdapter): Promise<SiblingContext[]> {
  const query = symbol.parentSymbolId
    ? `SELECT name, kind, signature, start_line as line FROM symbols WHERE parent_symbol_id = ? AND id != ? ORDER BY start_line`
    : `SELECT s.name, s.kind, s.signature, s.start_line as line FROM symbols s JOIN files f ON s.file_id = f.id WHERE f.relative_path = ? AND s.parent_symbol_id IS NULL AND s.id != ? ORDER BY s.start_line`;

  const params = symbol.parentSymbolId
    ? [symbol.parentSymbolId, symbol.id]
    : [symbol.filePath, symbol.id];

  return (db.prepare(query).all(...params) as any[]).map(r => ({
    name: r.name,
    kind: r.kind,
    signature: r.signature,
    line: r.line
  }));
}

export function symbolNotFoundResponse(symbol: string, budget: number, startTime: number): EditContextResult {
  return {
    symbol,
    file: '',
    line: 0,
    kind: 'unknown',
    source: '',
    signature: null,
    metadata: {
      tokenCount: 0,
      tokenBudget: budget,
      sectionsIncluded: [],
      sectionsExcluded: ['error: symbol not found'],
      queryTimeMs: Date.now() - startTime
    }
  };
}


