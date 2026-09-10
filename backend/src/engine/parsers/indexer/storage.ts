/**
 * Indexer storage — persists parse results (symbols, relationships) to DB.
 * SA4E-45: Uses async DatabaseAdapter methods for cross-engine support.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import pino from 'pino';
import type { ParseResult } from '../types.js';
import { scrubSecretValues } from '../languages/salesforce-meta/helpers.js';

const logger = pino({ name: 'indexer-storage' });

/** Resolve the file row for a path within a tenant scope (SA4E-41). */
async function findScopedFileId(
  adapter: DatabaseAdapter, filePath: string, projectId: string,
): Promise<number | undefined> {
  const row = await adapter.getAsync<{ id: number }>(
    'SELECT id FROM files WHERE relative_path = ? AND project_id = ?',
    [filePath, projectId],
  );
  return row?.id;
}

export async function storeResults(
  adapter: DatabaseAdapter, filePath: string, result: ParseResult, projectId: string,
): Promise<Map<string, number>> {
  const symbolIds = new Map<string, number>();
  await adapter.transactionAsync(async () => {
    const fileId = await findScopedFileId(adapter, filePath, projectId);
    if (!fileId) return;
    await adapter.runAsync('DELETE FROM symbols WHERE file_id = ?', [fileId]);
    // SA4E-104: DELETE relationships outside try/catch — PG aborts tx on any error.
    // Safe: relationships table always exists after migrations. If it somehow doesn't,
    // the error propagates → transaction rolls back → file re-indexed next cycle.
    await adapter.runAsync(
      'DELETE FROM relationships WHERE file_path = ? AND project_id = ?',
      [filePath, projectId],
    );
    const insertSymSql = 'INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id';
    for (const sym of result.symbols) {
      const info = await adapter.getAsync<{ id: number }>(insertSymSql, [
        projectId, fileId, sym.name, sym.kind, sym.signature,
        sym.startLine, sym.endLine, sym.parentName ?? null,
        sym.isExported ? 'export' : null, sym.docComment ?? null,
      ]);
      symbolIds.set(sym.name, info?.id ?? 0);
    }
    // SA4E-104: Store relationships without try/catch — let errors propagate.
    // If a relationship INSERT fails, entire tx rolls back (symbols re-inserted next cycle).
    const insertRelSql = 'INSERT INTO relationships (project_id, source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    for (const rel of result.relationships) {
      const sourceId = symbolIds.get(rel.sourceSymbol);
      if (!sourceId) continue;
      const targetId = symbolIds.get(rel.targetSymbol) ?? null;
      await adapter.runAsync(insertRelSql, [
        projectId, sourceId, rel.targetSymbol, targetId,
        rel.kind, filePath, rel.line,
        rel.metadata ? JSON.stringify(rel.metadata) : null,
      ]);
    }
  });
  return symbolIds;
}

export async function storeRegexResults(
  adapter: DatabaseAdapter, filePath: string,
  symbols: ReadonlyArray<{ name: string; kind: string; signature: string; startLine: number; endLine: number; parentSymbol: string | null; visibility: string | null; docComment: string | null }>,
  projectId: string,
): Promise<void> {
  await adapter.transactionAsync(async () => {
    const fileId = await findScopedFileId(adapter, filePath, projectId);
    if (!fileId) return;
    await adapter.runAsync('DELETE FROM symbols WHERE file_id = ?', [fileId]);
    const insertSymSql = 'INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    for (const sym of symbols) {
      await adapter.runAsync(insertSymSql, [
        projectId, fileId, sym.name, sym.kind, sym.signature,
        sym.startLine, sym.endLine, sym.parentSymbol, sym.visibility, sym.docComment,
      ]);
    }
  });
}

export async function extractAndStoreBodies(
  adapter: DatabaseAdapter, filePath: string, source: string,
  result: ParseResult, symbolIds: Map<string, number>, projectId: string,
): Promise<void> {
  try {
    const lines = source.split('\n');
    // Store bodies for function-like AND class-like kinds so LLM enrichment can
    // generate pseudo code for classes (JS class, Apex class, interface, enum) too.
    const bodyKinds = new Set([
      'function', 'method', 'arrow_function', 'generator', 'function_declaration',
      'constructor', 'trigger',
      'class', 'apex_class', 'interface', 'enum',
    ]);
    const minBodyLines = 3;
    // SA4E-104 debug: log symbolIds state
    const validIds = Array.from(symbolIds.values()).filter(v => v > 0);
    if (validIds.length === 0) {
      logger.warn({ filePath, projectId, mapSize: symbolIds.size }, '[storage] extractAndStoreBodies: symbolIds all zero or empty — skipping');
      return;
    }
    const dialect = new DialectHelper(adapter.getEngine());
    const insertSql = dialect.upsert(
      'body_embeddings',
      ['project_id', 'symbol_id', 'chunk_index', 'embedding', 'token_count'],
      'project_id, symbol_id, chunk_index',
      ['embedding', 'token_count'],
    );
    for (const sym of result.symbols) {
      if (!bodyKinds.has(sym.kind)) continue;
      const symbolId = symbolIds.get(sym.name);
      if (!symbolId) continue;
      const bodyLines = lines.slice(sym.startLine - 1, sym.endLine);
      if (bodyLines.length < minBodyLines) continue;
      // F-03: redact secret element values before persisting body/source.
      const bodyText = scrubSecretValues(bodyLines.join('\n'));
      const tokenCount = bodyText.split(/\s+/).filter(Boolean).length;
      const textBuffer = Buffer.from(bodyText, 'utf-8');
      await adapter.runAsync(insertSql, [projectId, symbolId, 0, textBuffer, tokenCount]);
    }
  } catch (err) {
    logger.warn({ err, filePath, projectId }, '[storage] Failed to extract/store bodies (continuing)');
  }
}
