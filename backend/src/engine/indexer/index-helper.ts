/**
 * Index Helper — Standalone file indexing and DB operations.
 * SA4E-41: all reads/writes are scoped by project_id (multi-tenant isolation).
 * SA4E-53: converted to async API for PostgreSQL compatibility.
 */

import type { DatabaseAdapter, PreparedStatement } from '../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../database/dialect/DialectHelper.js';
import * as fs from 'fs';
import type { Logger } from 'pino';
import type { ScannedFile } from '../scanner/file-scanner.js';
import { extractSymbols } from '../scanner/signature-extractor.js';
import { detectModule } from './module-helper.js';

/**
 * Check if file content hash matches the database (unchanged) within a tenant.
 * SA4E-53: async for PostgreSQL compatibility.
 */
export async function isFileUnchanged(adapter: DatabaseAdapter, file: ScannedFile, projectId: string): Promise<boolean> {
  const row = await adapter.getAsync<{ content_hash: string }>(
    'SELECT content_hash FROM files WHERE relative_path = ? AND project_id = ?',
    [file.relativePath, projectId],
  );
  return row?.content_hash === file.contentHash;
}

/** Legacy regex-based symbol extraction (used when tree-sitter unavailable). */
export async function indexFileSymbolsRegex(
  file: ScannedFile, fileId: number, projectId: string, adapter: DatabaseAdapter, logger: Logger
): Promise<void> {
  try {
    const content = fs.readFileSync(file.absolutePath, 'utf-8');
    const symbols = extractSymbols(content, file.language);
    const sql = `INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    for (const sym of symbols) {
      await adapter.runAsync(sql, [
        projectId, fileId, sym.name, sym.kind, sym.signature,
        sym.startLine, sym.endLine, sym.parentSymbol,
        sym.visibility, sym.docComment,
      ]);
    }
  } catch (err) {
    logger.error({ err }, `[indexer] Error indexing ${file.relativePath}:`);
  }
}

/**
 * Upsert a file record in the database, stamped with the tenant scope.
 * SA4E-53: async for PostgreSQL compatibility.
 */
export async function upsertFileInDb(adapter: DatabaseAdapter, file: ScannedFile, projectId: string): Promise<void> {
  const module = detectModule(file.relativePath);
  const dialect = new DialectHelper(adapter.getEngine());
  const columns = ['project_id', 'path', 'relative_path', 'language', 'module', 'content_hash', 'size_bytes', 'line_count', 'last_indexed'];
  const updateCols = ['content_hash', 'size_bytes', 'line_count', 'last_indexed'];
  // Build upsert with engine-appropriate NOW() expression for last_indexed
  const sql = adapter.getEngine() === 'sqlite'
    ? `INSERT OR REPLACE INTO files (${columns.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    : `INSERT INTO files (${columns.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW()) ON CONFLICT (project_id, relative_path) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`;
  await adapter.runAsync(sql,
    [projectId, file.absolutePath, file.relativePath, file.language, module, file.contentHash, file.sizeBytes, file.lineCount],
  );
}

/**
 * Regex fallback for file upsert (delete + re-insert symbols), scoped by tenant.
 * SA4E-53: async for PostgreSQL compatibility.
 */
export async function upsertFileRegexFallback(adapter: DatabaseAdapter, file: ScannedFile, projectId: string, logger: Logger): Promise<void> {
  const fileRow = await adapter.getAsync<{ id: number }>(
    'SELECT id FROM files WHERE relative_path = ? AND project_id = ?',
    [file.relativePath, projectId],
  );
  if (!fileRow) return;

  await adapter.runAsync('DELETE FROM symbols WHERE file_id = ?', [fileRow.id]);
  await indexFileSymbolsRegex(file, fileRow.id, projectId, adapter, logger);
}
