import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';
import type { ParseResult } from '../types.js';

const logger = pino({ name: 'indexer-storage' });

/** Resolve the file row for a path within a tenant scope (SA4E-41). */
function findScopedFileId(adapter: DatabaseAdapter, filePath: string, projectId: string): number | undefined {
  const row = adapter.get<{ id: number }>('SELECT id FROM files WHERE relative_path = ? AND project_id = ?', [filePath, projectId]);
  return row?.id;
}

export function storeResults(
  adapter: DatabaseAdapter, filePath: string, result: ParseResult, projectId: string,
): Map<string, number> {
  const symbolIds = new Map<string, number>();
  adapter.transaction(() => {
    const fileId = findScopedFileId(adapter, filePath, projectId);
    if (!fileId) return;
    adapter.run('DELETE FROM symbols WHERE file_id = ?', [fileId]);
    try {
      adapter.run('DELETE FROM relationships WHERE file_path = ? AND project_id = ?', [filePath, projectId]);
    } catch (err) {
      logger.warn({ err, filePath, projectId }, '[storage] Failed to clear prior relationships (continuing)');
    }
    const insertSym = adapter.prepare('INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const sym of result.symbols) {
      const info = insertSym.run(projectId, fileId, sym.name, sym.kind, sym.signature, sym.startLine, sym.endLine, sym.parentName ?? null, sym.isExported ? 'export' : null, sym.docComment ?? null);
      symbolIds.set(sym.name, info.lastInsertRowid as number);
    }
    try {
      const insertRel = adapter.prepare('INSERT INTO relationships (project_id, source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const rel of result.relationships) {
        const sourceId = symbolIds.get(rel.sourceSymbol);
        if (!sourceId) continue;
        const targetId = symbolIds.get(rel.targetSymbol) ?? null;
        insertRel.run(projectId, sourceId, rel.targetSymbol, targetId, rel.kind, filePath, rel.line, rel.metadata ? JSON.stringify(rel.metadata) : null);
      }
    } catch (err) {
      logger.warn({ err, filePath, projectId }, '[storage] Failed to store relationships (symbols kept)');
    }
  });
  return symbolIds;
}

export function storeRegexResults(
  adapter: DatabaseAdapter, filePath: string,
  symbols: ReadonlyArray<{ name: string; kind: string; signature: string; startLine: number; endLine: number; parentSymbol: string | null; visibility: string | null; docComment: string | null }>,
  projectId: string,
): void {
  adapter.transaction(() => {
    const fileId = findScopedFileId(adapter, filePath, projectId);
    if (!fileId) return;
    adapter.run('DELETE FROM symbols WHERE file_id = ?', [fileId]);
    const insertSym = adapter.prepare('INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const sym of symbols) {
      insertSym.run(projectId, fileId, sym.name, sym.kind, sym.signature, sym.startLine, sym.endLine, sym.parentSymbol, sym.visibility, sym.docComment);
    }
  });
}

export function extractAndStoreBodies(
  adapter: DatabaseAdapter, filePath: string, source: string,
  result: ParseResult, symbolIds: Map<string, number>, projectId: string,
): void {
  try {
    const lines = source.split('\n');
    const functionKinds = new Set(['function', 'method', 'arrow_function', 'generator', 'function_declaration']);
    const minBodyLines = 3;
    const insertBody = adapter.prepare('INSERT OR REPLACE INTO body_embeddings (project_id, symbol_id, chunk_index, embedding, token_count) VALUES (?, ?, ?, ?, ?)');
    for (const sym of result.symbols) {
      if (!functionKinds.has(sym.kind)) continue;
      const symbolId = symbolIds.get(sym.name);
      if (!symbolId) continue;
      const bodyLines = lines.slice(sym.startLine - 1, sym.endLine);
      if (bodyLines.length < minBodyLines) continue;
      const bodyText = bodyLines.join('\n');
      const tokenCount = bodyText.split(/\s+/).filter(Boolean).length;
      const textBuffer = Buffer.from(bodyText, 'utf-8');
      insertBody.run(projectId, symbolId, 0, textBuffer, tokenCount);
    }
  } catch (err) {
    logger.warn({ err, filePath, projectId }, '[storage] Failed to extract/store bodies (continuing)');
  }
}
