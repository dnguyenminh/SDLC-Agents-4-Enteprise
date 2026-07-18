/**
 * Index Helper — Standalone file indexing and DB operations.
 * SA4E-41: all reads/writes are scoped by project_id (multi-tenant isolation).
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { PreparedStatement } from '../../database/adapters/DatabaseAdapter.js';
import * as fs from 'fs';
import type { Logger } from 'pino';
import type { ScannedFile } from '../scanner/file-scanner.js';
import { extractSymbols } from '../scanner/signature-extractor.js';
import { detectModule } from './module-helper.js';

/** Check if file content hash matches the database (unchanged) within a tenant. */
export function isFileUnchanged(adapter: DatabaseAdapter, file: ScannedFile, projectId: string): boolean {
  const row = adapter.get<{ content_hash: string }>(
    'SELECT content_hash FROM files WHERE relative_path = ? AND project_id = ?',
    [file.relativePath, projectId],
  );
  return row?.content_hash === file.contentHash;
}

/** Legacy regex-based symbol extraction (used when tree-sitter unavailable). */
export function indexFileSymbolsRegex(
  file: ScannedFile, fileId: number, projectId: string, insertStmt: PreparedStatement, logger: Logger
): void {
  try {
    const content = fs.readFileSync(file.absolutePath, 'utf-8');
    const symbols = extractSymbols(content, file.language);
    for (const sym of symbols) {
      insertStmt.run(
        projectId, fileId, sym.name, sym.kind, sym.signature,
        sym.startLine, sym.endLine, sym.parentSymbol,
        sym.visibility, sym.docComment
      );
    }
  } catch (err) {
    logger.error({ err }, `[indexer] Error indexing ${file.relativePath}:`);
  }
}

/** Upsert a file record in the database, stamped with the tenant scope. */
export function upsertFileInDb(adapter: DatabaseAdapter, file: ScannedFile, projectId: string): void {
  const module = detectModule(file.relativePath);
  adapter.run(
    `INSERT OR REPLACE INTO files (project_id, path, relative_path, language, module, content_hash, size_bytes, line_count, last_indexed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [projectId, file.absolutePath, file.relativePath, file.language, module, file.contentHash, file.sizeBytes, file.lineCount],
  );
}

/** Regex fallback for file upsert (delete + re-insert symbols), scoped by tenant. */
export function upsertFileRegexFallback(adapter: DatabaseAdapter, file: ScannedFile, projectId: string, logger: Logger): void {
  const fileRow = adapter.get<{ id: number }>(
    'SELECT id FROM files WHERE relative_path = ? AND project_id = ?',
    [file.relativePath, projectId],
  );
  if (!fileRow) return;

  adapter.run('DELETE FROM symbols WHERE file_id = ?', [fileRow.id]);
  const insertSymbol = adapter.prepare(`
    INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  indexFileSymbolsRegex(file, fileRow.id, projectId, insertSymbol, logger);
}
